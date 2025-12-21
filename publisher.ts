/**
 * XHS Publisher - 发布系统
 * @see README.md
 */
import puppeteer, { Page, ElementHandle, Browser } from 'puppeteer';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as fs from 'fs';
import * as path from 'path';

// 从模块导入
import { DRAFTS_DIR, PUBLISHED_DIR, PROJECT_ROOT, SAFETY_CONFIG } from './src/config';
import { PUBLISH_SELECTORS } from './src/selectors';
import { Draft } from './src/types';
import { delay, randomDelay, applyStealthProfile, humanType, loadCookies } from './src/utils';
import { Logger } from './src/logger';

puppeteerExtra.use(StealthPlugin());
const logger = new Logger('Publisher');

// 选择器别名 (兼容旧代码)
const SELECTORS = PUBLISH_SELECTORS

/** 移除弹窗遮挡层 (publish.go:79-98) */
export async function removePopCover(page: Page): Promise<void> {
  try {
    // 检测并移除弹窗
    const popover = await page.$(SELECTORS.POPOVER);
    if (popover) {
      await page.evaluate((selector) => {
        const elem = document.querySelector(selector);
        if (elem) elem.remove();
      }, SELECTORS.POPOVER);
      logger.info('[removePopCover] 已移除弹窗遮挡层');
    }

    // 兜底：点击空白区域 (publish.go:94-98)
    // Go 源码: x := 380 + rand.Intn(100), y := 20 + rand.Intn(60)
    await clickEmptyPosition(page);
  } catch (error) {
    logger.warn('[removePopCover] 处理弹窗时出错:', error);
  }
}

/** 点击空白区域 (publish.go:94-98) */
async function clickEmptyPosition(page: Page): Promise<void> {
  const x = 380 + Math.floor(Math.random() * 100);  // 380-480
  const y = 20 + Math.floor(Math.random() * 60);    // 20-80
  await page.mouse.click(x, y);
}

/** 检测元素是否被遮挡 (publish.go:168-184) */
export async function isElementBlocked(page: Page, element: ElementHandle): Promise<boolean> {
  return await page.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return true;
    }
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const target = document.elementFromPoint(x, y);
    return !(target === el || el.contains(target));
  }, element);
}

/** 等待图片上传完成 (publish.go:212-240) */
export async function waitForUploadComplete(
  page: Page,
  expectedCount: number,
  maxWaitMs: number = 60000,
  checkIntervalMs: number = 500
): Promise<void> {
  logger.info(`[waitForUploadComplete] 开始等待图片上传完成, 期望数量: ${expectedCount}`);

  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    try {
      // 获取已上传图片的数量 (publish.go:221)
      const uploadedImages = await page.$$(SELECTORS.UPLOAD_COMPLETE_ITEM);
      const currentCount = uploadedImages.length;

      logger.info(`[waitForUploadComplete] 当前已上传: ${currentCount}/${expectedCount}`);

      if (currentCount >= expectedCount) {
        logger.info(`[waitForUploadComplete] 所有图片上传完成, 数量: ${currentCount}`);
        return;
      }
    } catch (error) {
      logger.debug?.('[waitForUploadComplete] 未找到已上传图片元素');
    }

    await randomDelay(checkIntervalMs, checkIntervalMs + 150);
  }

  throw new Error(`上传超时 (${maxWaitMs}ms)，请检查网络连接和图片大小`);
}

/** 获取正文编辑器 (publish.go:269-292, Race 双策略) */
export async function getContentEditor(page: Page): Promise<ElementHandle<Element>> {
  logger.info('[getContentEditor] 开始查找正文编辑器...');

  // 方案一: Quill 编辑器 (publish.go:274)
  const qlEditor = await page.$(SELECTORS.CONTENT_EDITOR_V1);
  if (qlEditor) {
    const visible = await isElementVisible(page, qlEditor);
    if (visible) {
      logger.info('[getContentEditor] 找到 Quill 编辑器 (div.ql-editor)');
      return qlEditor;
    }
  }

  // 方案二: Textbox (publish.go:278-284, 354-410)
  const textboxEditor = await findTextboxByPlaceholder(page);
  if (textboxEditor) {
    logger.info('[getContentEditor] 找到 Textbox 编辑器 (role=textbox)');
    return textboxEditor;
  }

  throw new Error('没有找到内容输入框 (两种策略均失败)');
}

/** 通过 placeholder 查找 textbox (publish.go:354-410) */
async function findTextboxByPlaceholder(page: Page): Promise<ElementHandle<Element> | null> {
  try {
    // 查找带有特定 placeholder 的 <p> 元素
    const placeholderElem = await page.$(SELECTORS.CONTENT_EDITOR_V2_PLACEHOLDER);
    if (!placeholderElem) {
      return null;
    }

    // 向上查找 role="textbox" 的父级 (publish.go:389-410)
    const textbox = await page.evaluateHandle((elem) => {
      let current: Element | null = elem;
      for (let i = 0; i < 5; i++) {
        const parent: Element | null = current?.parentElement ?? null;
        if (!parent) break;

        if (parent.getAttribute('role') === 'textbox') {
          return parent;
        }
        current = parent;
      }
      return null;
    }, placeholderElem);

    // 检查是否找到了有效的 textbox
    const element = textbox.asElement() as ElementHandle<Element> | null;
    if (element) {
      return element;
    }

    return null;
  } catch (error) {
    logger.debug?.('[findTextboxByPlaceholder] 查找失败:', error);
    return null;
  }
}

/** 检查元素是否可见 (publish.go:412-436) */
async function isElementVisible(page: Page, element: ElementHandle): Promise<boolean> {
  try {
    return await page.evaluate((el) => {
      // 检查隐藏样式 (publish.go:416-427)
      const style = el.getAttribute('style');
      if (style) {
        if (
          style.includes('left: -9999px') ||
          style.includes('top: -9999px') ||
          style.includes('display: none') ||
          style.includes('visibility: hidden')
        ) {
          return false;
        }
      }

      // 检查元素尺寸和可见性
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }, element);
  } catch {
    return true;  // 出错时假设可见 (publish.go:430-432)
  }
}

/** 点击发布 Tab (publish.go:100-134) */
export async function clickPublishTab(page: Page, tabName: string): Promise<void> {
  logger.info(`[clickPublishTab] 尝试点击 Tab: "${tabName}"`);

  // 等待容器 (publish.go:101)
  await page.waitForSelector(SELECTORS.UPLOAD_CONTAINER, { visible: true });

  const deadline = Date.now() + 15000;  // 15 秒超时

  while (Date.now() < deadline) {
    // 获取所有 Tab 按钮 (publish.go:137)
    const tabs = await page.$$(SELECTORS.TAB_BUTTON);

    for (const tab of tabs) {
      // 检查可见性 (publish.go:143-145)
      const visible = await isElementVisible(page, tab);
      if (!visible) continue;

      // 检查文本 (publish.go:147-155)
      const text = await page.evaluate(el => el.textContent?.trim(), tab);
      if (text !== tabName) continue;

      // 检查是否被遮挡 (publish.go:157-162)
      const blocked = await isElementBlocked(page, tab);
      if (blocked) {
        logger.info('[clickPublishTab] Tab 被遮挡，尝试移除遮挡');
        await removePopCover(page);
        await randomDelay(180, 360);
        continue;
      }

      // 点击 Tab (publish.go:124)
      await tab.click();
      logger.info(`[clickPublishTab] 成功点击 Tab: "${tabName}"`);
      return;
    }

    await randomDelay(180, 360);
  }

  throw new Error(`没有找到发布 Tab: "${tabName}"`);
}

// Draft 类型已从 src/types 导入

// === 内容格式化 ===

/** 将 Markdown 转换为小红书风格
 * 
 * 转换规则:
 * - **加粗** -> 【加粗】
 * - ## 标题 -> 📝 标题
 * - ### 标题 -> 💡 标题
 * - - 列表项 -> ✅ 列表项
 * - * 列表项 -> 🔹 列表项
 * - --- 分隔线 -> ─────────────
 * - > 引用 -> 💬 引用
 */
export function formatContentForXHS(content: string): string {
  let formatted = content;

  // 1. 处理加粗: **text** -> 【text】
  formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '【$1】');

  // 2. 处理二级标题: ## title -> 📝 title
  formatted = formatted.replace(/^##\s+(.+)$/gm, '📝 $1');

  // 3. 处理三级标题: ### title -> 💡 title
  formatted = formatted.replace(/^###\s+(.+)$/gm, '💡 $1');

  // 4. 处理无序列表: - item -> ✅ item
  formatted = formatted.replace(/^-\s+(.+)$/gm, '✅ $1');

  // 5. 处理无序列表: * item -> 🔹 item
  formatted = formatted.replace(/^\*\s+(.+)$/gm, '🔹 $1');

  // 6. 处理分隔线: --- -> ─────────────
  formatted = formatted.replace(/^---+$/gm, '─────────────');

  // 7. 处理引用: > text -> 💬 text
  formatted = formatted.replace(/^>\s+(.+)$/gm, '💬 $1');

  // 8. 处理行内代码: `code` -> 「code」
  formatted = formatted.replace(/`([^`]+)`/g, '「$1」');

  // 9. 清理多余的空行 (保留最多2个连续空行)
  formatted = formatted.replace(/\n{4,}/g, '\n\n\n');

  return formatted;
}

/**
 * 逐行输入内容到编辑器 (解决空行被吞的问题)
 * 
 * 关键：富文本编辑器不认 \n，必须模拟 Enter 键
 */
async function typeContentLineByLine(
  page: Page,
  contentEditor: ElementHandle<Element>,
  content: string
): Promise<void> {
  // 先格式化内容
  const formattedContent = formatContentForXHS(content);
  const lines = formattedContent.split('\n');

  logger.info(`[typeContentLineByLine] 开始逐行输入, 共 ${lines.length} 行`);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim() === '') {
      await page.keyboard.press('Enter');
    } else {
      for (const char of line) {
        await contentEditor.type(char, { delay: SAFETY_CONFIG.TYPING_DELAY_MIN + Math.random() * (SAFETY_CONFIG.TYPING_DELAY_MAX - SAFETY_CONFIG.TYPING_DELAY_MIN) });
      }
      if (i < lines.length - 1) {
        await page.keyboard.press('Enter');
      }
    }

    await randomDelay(40, 140);
  }

  logger.info('[typeContentLineByLine] 正文输入完成');
}

// === 核心业务逻辑 ===

/** 输入标签 (publish.go:294-351) */
export async function inputTags(
  page: Page,
  contentEditor: ElementHandle<Element>,
  tags: string[]
): Promise<void> {
  if (tags.length === 0) {
    return;
  }

  // 限制标签数量 (publish.go:65-68)
  const limitedTags = tags.slice(0, 10);
  if (tags.length > 10) {
    console.warn('[inputTags] 标签数量超过10，已截取前10个');
  }

  logger.info(`[inputTags] 开始输入 ${limitedTags.length} 个标签`);

  // Step 1: 按 20 次 ArrowDown 确保光标在末尾 (publish.go:301-306)
  await contentEditor.click();
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('ArrowDown');
    await randomDelay(35, 120);
  }

  // Step 2: 按 2 次 Enter 换行 (publish.go:308-311)
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await randomDelay(800, 1300);

  // Step 3: 逐个输入标签 (publish.go:315-318)
  for (const tag of limitedTags) {
    await inputSingleTag(page, contentEditor, tag);
  }
}

/** 输入单个标签 (publish.go:321-351) */
async function inputSingleTag(
  page: Page,
  contentEditor: ElementHandle<Element>,
  tag: string
): Promise<void> {
  // 去除标签前的 # (publish.go:322)
  const cleanTag = tag.replace(/^#/, '');

  logger.info(`[inputSingleTag] 输入标签: "${cleanTag}"`);

  // 输入 "#" (publish.go:323)
  await contentEditor.type('#');
  await randomDelay(180, 320);

  // 逐字符输入标签名 (publish.go:326-329)
  for (const char of cleanTag) {
    await contentEditor.type(char, { delay: SAFETY_CONFIG.TYPING_DELAY_MIN + Math.random() * (SAFETY_CONFIG.TYPING_DELAY_MAX - SAFETY_CONFIG.TYPING_DELAY_MIN) });
    await randomDelay(30, 90);
  }

  // 等待联想菜单出现 (publish.go:330)
  await randomDelay(800, 1300);

  // 尝试点击联想结果 (publish.go:332-349)
  try {
    const tagItem = await page.$(SELECTORS.TAG_ITEM);
    if (tagItem) {
      await tagItem.click();
      logger.info(`[inputSingleTag] 成功点击标签联想: "${cleanTag}"`);
      await randomDelay(180, 320);
    } else {
      // 无联想，输入空格结束 (publish.go:341-343)
      logger.warn(`[inputSingleTag] 未找到联想选项，输入空格结束: "${cleanTag}"`);
      await contentEditor.type(' ');
    }
  } catch (error) {
    // 查找失败，输入空格结束 (publish.go:345-348)
    logger.warn(`[inputSingleTag] 联想查找失败，输入空格结束: "${cleanTag}"`);
    await contentEditor.type(' ');
  }

  await randomDelay(420, 680);
}

/** 发布笔记主流程 (publish.go:53-77) */
export async function publishNote(page: Page, draft: Draft): Promise<void> {
  logger.info('========================================');
  logger.info(`[publishNote] 开始发布: "${draft.title}"`);
  logger.info(`[publishNote] 图片数量: ${draft.imagePaths.length}`);
  logger.info(`[publishNote] 标签: ${draft.tags.join(', ')}`);
  logger.info('========================================');

  // 验证图片 (publish.go:54-56)
  if (draft.imagePaths.length === 0) {
    throw new Error('图片不能为空');
  }

  // Step 1: 导航到发布页 (publish.go:38)
  logger.info('[publishNote] Step 1: 导航到发布页...');
  await page.goto(SELECTORS.PUBLISH_URL, { waitUntil: 'networkidle2' });
  await randomDelay(SAFETY_CONFIG.PAGE_LOAD_WAIT_MIN, SAFETY_CONFIG.PAGE_LOAD_WAIT_MAX);

  // Step 2: 处理弹窗 + 点击 Tab (publish.go:41-46)
  logger.info('[publishNote] Step 2: 点击上传图文 Tab...');
  await clickPublishTab(page, '上传图文');
  await randomDelay(800, 1300);

  // Step 3: 上传图片 (publish.go:60-62)
  logger.info('[publishNote] Step 3: 上传图片...');
  const uploadInput = await page.$(SELECTORS.UPLOAD_INPUT);
  if (!uploadInput) {
    throw new Error('未找到图片上传输入框');
  }
  // Puppeteer 的 uploadFile 直接支持本地文件路径
  await (uploadInput as ElementHandle<HTMLInputElement>).uploadFile(...draft.imagePaths);

  // Step 4: 等待上传完成 (publish.go:60-62 调用 uploadImages)
  logger.info('[publishNote] Step 4: 等待图片上传完成...');
  await waitForUploadComplete(page, draft.imagePaths.length);

  // Step 5: 输入标题 (v4.1 - 人类打字速度)
  logger.info('[publishNote] Step 5: 输入标题...');
  await page.waitForSelector(SELECTORS.TITLE_INPUT);
  await page.click(SELECTORS.TITLE_INPUT);
  await randomDelay(260, 520);
  await humanType(page, SELECTORS.TITLE_INPUT, draft.title);
  await randomDelay(800, 1400);

  // Step 6: 输入正文 (使用逐行输入模式，解决空行问题)
  logger.info('[publishNote] Step 6: 输入正文...');
  const contentEditor = await getContentEditor(page);
  await contentEditor.click();
  // 使用逐行输入，确保换行正确显示
  await typeContentLineByLine(page, contentEditor, draft.content);

  // Step 7: 输入标签 (publish.go:252)
  logger.info('[publishNote] Step 7: 输入标签...');
  await inputTags(page, contentEditor, draft.tags);
  await randomDelay(800, 1300);

  // Step 8: 点击发布按钮 (publish.go:260-261)
  logger.info('[publishNote] Step 8: 点击发布按钮...');
  await page.click(SELECTORS.SUBMIT_BUTTON);
  await randomDelay(2600, 3600);

  logger.info('========================================');
  logger.info(`[publishNote] 发布完成: "${draft.title}"`);
  logger.info('========================================');
}

// === Markdown 解析 ===
// 路径常量已从 src/config 导入

/** 解析 Markdown 文件为 Draft 对象 */
export function parseMarkdown(mdFilePath: string): Draft {
  logger.info(`[parseMarkdown] 解析文件: ${mdFilePath}`);

  const content = fs.readFileSync(mdFilePath, 'utf-8');
  const lines = content.split('\n');
  const dir = path.dirname(mdFilePath);
  const baseName = path.basename(mdFilePath, '.md');

  let title = '';
  const tags: string[] = [];
  const contentLines: string[] = [];

  for (const line of lines) {
    const trimmedLine = line.trim();

    // 规则1: 第一行以 "# " 开头 -> Title
    if (!title && trimmedLine.startsWith('# ')) {
      title = trimmedLine.substring(2).trim();
      continue;
    }

    // 规则2: 提取标签 (匹配 #xxx 格式，排除标题行)
    const tagMatches = trimmedLine.match(/#[\u4e00-\u9fa5a-zA-Z0-9_]+/g);
    if (tagMatches && tagMatches.length > 0) {
      // 如果整行都是标签（标签行），则不加入 content
      const isTagOnlyLine = trimmedLine.replace(/#[\u4e00-\u9fa5a-zA-Z0-9_]+/g, '').trim() === '';
      tags.push(...tagMatches);
      if (isTagOnlyLine) {
        continue;
      }
    }

    // 规则3: 其余内容
    contentLines.push(line);
  }

  // 规则4: 查找同名图片
  const imagePaths: string[] = [];
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  
  // 方式1: 查找同名图片 (note1.md -> note1.jpg)
  for (const ext of imageExtensions) {
    const imagePath = path.join(dir, baseName + ext);
    if (fs.existsSync(imagePath)) {
      imagePaths.push(imagePath);
      break;  // 找到一个就够了
    }
  }

  // 方式2: 查找目录下所有图片 (如果没找到同名图片)
  if (imagePaths.length === 0) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (imageExtensions.includes(ext)) {
        imagePaths.push(path.join(dir, file));
      }
    }
  }

  // 去重标签
  const uniqueTags = [...new Set(tags)];

  const draft: Draft = {
    title: title || baseName,  // 如果没有标题，用文件名
    content: contentLines.join('\n').trim(),
    tags: uniqueTags,
    imagePaths: imagePaths,
  };

  logger.info(`[parseMarkdown] 解析结果:`);
  logger.info(`  - 标题: ${draft.title}`);
  logger.info(`  - 标签: ${draft.tags.join(', ')}`);
  logger.info(`  - 图片: ${draft.imagePaths.length} 张`);
  logger.info(`  - 正文长度: ${draft.content.length} 字符`);

  return draft;
}

/** 归档已发布的文件 */
function archivePublishedFiles(draft: Draft, mdFilePath: string): void {
  // 确保 published 目录存在
  if (!fs.existsSync(PUBLISHED_DIR)) {
    fs.mkdirSync(PUBLISHED_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseName = path.basename(mdFilePath, '.md');

  // 移动 .md 文件
  const newMdPath = path.join(PUBLISHED_DIR, `${baseName}_${timestamp}.md`);
  fs.renameSync(mdFilePath, newMdPath);
  logger.info(`[archive] 已归档: ${mdFilePath} -> ${newMdPath}`);

  // 移动图片文件
  for (const imagePath of draft.imagePaths) {
    if (fs.existsSync(imagePath)) {
      const imageExt = path.extname(imagePath);
      const newImagePath = path.join(PUBLISHED_DIR, `${baseName}_${timestamp}${imageExt}`);
      fs.renameSync(imagePath, newImagePath);
      logger.info(`[archive] 已归档: ${imagePath} -> ${newImagePath}`);
    }
  }
}

// === 程序入口 ===

async function main(): Promise<void> {
  logger.info('╔════════════════════════════════════════╗');
  logger.info('║   XHS Publisher - 小红书自动发布系统   ║');
  logger.info('║   Based on xiaohongshu-mcp (Go)        ║');
  logger.info('╚════════════════════════════════════════╝');
  logger.info('');

  let browser: Browser | null = null;

  try {
    // Step 1: 查找待发布文件
    logger.info('[main] Step 1: 扫描 drafts 目录...');
    const mdFilePath = findFirstDraft();
    if (!mdFilePath) {
      logger.warn(`[main] 没有找到待发布的 .md 文件`);
      logger.warn(`[main] 请将 Markdown 文件放入: ${DRAFTS_DIR}`);
      return;
    }
    logger.info(`[main] 找到待发布文件: ${mdFilePath}`);

    // Step 2: 解析 Markdown
    logger.info('[main] Step 2: 解析 Markdown 文件...');
    const draft = parseMarkdown(mdFilePath);

    // 验证图片
    if (draft.imagePaths.length === 0) {
      throw new Error(`没有找到图片文件，请确保图片与 .md 文件放在同一目录`);
    }

    // Step 3: 启动浏览器 (v4.1 安全加固)
    logger.info('[main] Step 3: 启动浏览器...');
    
    browser = await puppeteerExtra.launch({
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--lang=zh-CN',
      ],
    });

    const page = await browser.newPage();
    await applyStealthProfile(page);

    // Step 4: 加载 Cookie
    logger.info('[main] Step 4: 加载 Cookie...');
    const cookiesOk = await loadCookies(page);
    if (!cookiesOk) {
      logger.error('[main] Cookie 加载失败，请先运行 login.ts');
      return;
    }

    // Step 5: 执行发布
    logger.info('[main] Step 5: 开始发布流程...');
    await publishNote(page, draft);

    // Step 6: 归档文件
    logger.info('[main] Step 6: 归档已发布文件...');
    archivePublishedFiles(draft, mdFilePath);

    logger.info('');
    logger.info('╔════════════════════════════════════════╗');
    logger.info('║         ✅ 发布成功！                  ║');
    logger.info('╚════════════════════════════════════════╝');

  } catch (error) {
    logger.error('');
    logger.error('╔════════════════════════════════════════╗');
    logger.error('║         ❌ 发布失败！                  ║');
    logger.error('╚════════════════════════════════════════╝');
    logger.error('错误信息:', error);

    // 截图保存
    if (browser) {
      try {
        const pages = await browser.pages();
        if (pages.length > 0) {
          const screenshotPath = path.join(PROJECT_ROOT, 'error_screenshot.png');
          await pages[0].screenshot({ path: screenshotPath, fullPage: true });
          logger.error(`[main] 错误截图已保存: ${screenshotPath}`);
        }
      } catch (screenshotError) {
        logger.error('[main] 截图保存失败:', screenshotError);
      }
    }

    throw error;

  } finally {
    // 等待用户查看结果
    if (browser) {
      logger.info('');
      logger.info('[main] 浏览器将在 10 秒后关闭...');
      await randomDelay(9000, 12000);
      await browser.close();
    }
  }
}

main().catch(err => logger.error('[main] 异常', err));
