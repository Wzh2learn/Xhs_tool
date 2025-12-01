/**
 * XHS Intelligence Agent v5.0 - 情报搜集系统
 * @see README.md 完整功能说明
 */
import 'dotenv/config';

// 全局错误处理
process.on('unhandledRejection', (reason) => {
  console.log('   ⚠️ [全局] Promise 拒绝:', String(reason).substring(0, 50));
});
process.on('uncaughtException', (error) => {
  if (error.message?.includes('fetch failed')) return;
  throw error;
});

import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Page, Browser } from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

// 从模块导入所有需要的功能
import {
  PROJECT_ROOT, REPORTS_DIR, DATA_DIR, SAFETY_CONFIG, OCR_CONFIG, CONTENT_SUMMARY_LENGTH,
  getSmartMixKeywords, LOGIN_CHECK_SELECTORS, LOGIN_URL_PATTERNS,
  DETAIL_SELECTORS, NOTE_SELECTORS,
  delay, randomDelay, humanClick, humanScroll, loadCookies, makeSearchURL, extractNoteId,
  extractOCRFromImages, humanViewImages,
  generateAIReport, saveToDatabase,
  NoteInfo, CommentInfo, Logger
} from './src';

puppeteerExtra.use(StealthPlugin());
const logger = new Logger('Intelligence');

/**
 * 检查是否需要登录
 */
async function checkLogin(page: Page): Promise<{ isLoggedIn: boolean; reason?: string }> {
  const url = page.url();
  
  for (const pattern of LOGIN_URL_PATTERNS) {
    if (url.includes(pattern)) {
      return { isLoggedIn: false, reason: `URL包含登录关键词: ${pattern}` };
    }
  }
  
  for (const selector of LOGIN_CHECK_SELECTORS) {
    try {
      const element = await page.$(selector);
      if (element) {
        const isVisible = await page.evaluate((el) => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        }, element);
        if (isVisible) {
          return { isLoggedIn: false, reason: `发现登录元素: ${selector}` };
        }
      }
    } catch {
      // 继续检查下一个
    }
  }
  
  return { isLoggedIn: true };
}

/**
 * 搜索笔记列表
 */
async function searchNotes(page: Page, keyword: string): Promise<NoteInfo[]> {
  logger.info(`开始搜索: "${keyword}"`);
  const searchUrl = makeSearchURL(keyword);
  
  await page.goto(searchUrl, { waitUntil: 'networkidle2' });
  await randomDelay(SAFETY_CONFIG.PAGE_LOAD_WAIT_MIN, SAFETY_CONFIG.PAGE_LOAD_WAIT_MAX);
  
  const loginCheck = await checkLogin(page);
  if (!loginCheck.isLoggedIn) {
    logger.warn(`需要登录: ${loginCheck.reason}`);
    return [];
  }
  
  await humanScroll(page);
  
  // 获取笔记卡片
  const noteCards = await page.$$(NOTE_SELECTORS.CARD_CONTAINERS.join(', '));
  logger.info(`找到 ${noteCards.length} 篇笔记`);
  
  const notes: NoteInfo[] = [];
  const maxNotes = Math.min(noteCards.length, 3);
  
  for (let i = 0; i < maxNotes; i++) {
    try {
      const card = noteCards[i];
      
      // 提取基本信息
      const title = await card.$eval(
        NOTE_SELECTORS.TITLE.join(', '),
        el => el.textContent?.trim() || ''
      ).catch(() => '');
      
      const link = await card.$eval(
        NOTE_SELECTORS.LINK.join(', '),
        el => (el as HTMLAnchorElement).href
      ).catch(() => '');
      
      if (!title || !link) continue;
      
      const noteId = extractNoteId(link);
      if (!noteId) continue;
      
      // 点击进入详情页
      await humanClick(page, card);
      await randomDelay(SAFETY_CONFIG.NOTE_INTERVAL_MIN, SAFETY_CONFIG.NOTE_INTERVAL_MAX);
      
      // 等待详情页加载
      await page.waitForSelector(DETAIL_SELECTORS.CONTENT.join(', '), { timeout: 10000 });
      
      // 提取详情内容
      const content = await page.$eval(
        DETAIL_SELECTORS.CONTENT.join(', '),
        el => el.textContent?.trim() || ''
      ).catch(() => '');
      
      // OCR 和看图并行
      const [ocrContent] = await Promise.all([
        content.length < OCR_CONFIG.MIN_CONTENT_LENGTH ? extractOCRFromImages(page) : Promise.resolve(''),
        humanViewImages(page)
      ]);
      
      const fullContent = content + ocrContent;
      
      // 提取其他信息
      const author = await page.$eval(
        DETAIL_SELECTORS.AUTHOR.join(', '),
        el => el.textContent?.trim() || ''
      ).catch(() => '未知作者');
      
      const likes = await page.$eval(
        DETAIL_SELECTORS.LIKES.join(', '),
        el => el.textContent?.trim() || '0'
      ).catch(() => '0');
      
      const tags = await page.$$eval(
        DETAIL_SELECTORS.TAGS.join(', '),
        elements => elements.map(el => el.textContent?.trim() || '').filter(Boolean).slice(0, 5)
      ).catch(() => []);
      
      notes.push({
        keyword,
        title,
        author,
        authorLink: '',
        likes,
        link,
        noteId,
        content: content.substring(0, CONTENT_SUMMARY_LENGTH),
        fullContent,
        tags,
        comments: []
      });
      
      logger.info(`✅ 采集完成: ${title.substring(0, 30)}...`);
      
      // 返回列表页
      await page.goBack();
      await delay(2000);
      
    } catch (error) {
      logger.error('采集笔记失败:', error);
    }
  }
  
  return notes;
}

/**
 * 生成日报
 */
async function generateDailyReport(allNotes: NoteInfo[]): Promise<void> {
  const today = new Date().toLocaleDateString('zh-CN');
  const reportPath = path.join(REPORTS_DIR, 'daily_trends.md');
  
  let report = `# 📊 小红书搜广推面试情报日报\n\n`;
  report += `**日期**: ${today}\n`;
  report += `**采集数量**: ${allNotes.length} 篇笔记\n\n`;
  report += `---\n\n`;
  
  // AI 分析
  const aiReport = await generateAIReport(allNotes);
  if (aiReport) {
    report += `## 🧠 AI 智能分析\n\n${aiReport}\n\n---\n\n`;
  }
  
  // 笔记详情
  report += `## 📝 笔记详情\n\n`;
  allNotes.forEach((note, index) => {
    report += `### ${index + 1}. ${note.title}\n\n`;
    report += `- **作者**: ${note.author}\n`;
    report += `- **点赞**: ${note.likes}\n`;
    report += `- **标签**: ${note.tags.join(', ') || '无'}\n`;
    report += `- **链接**: [查看原文](${note.link})\n`;
    report += `- **内容摘要**:\n\n> ${note.content}\n\n`;
    
    if (note.fullContent.includes('[OCR Content]')) {
      const ocrText = note.fullContent.split('[OCR Content]')[1]?.substring(0, 200);
      if (ocrText) {
        report += `- **图片文字** (OCR):\n\n> ${ocrText}...\n\n`;
      }
    }
    
    report += `---\n\n`;
  });
  
  // 确保目录存在
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }
  
  fs.writeFileSync(reportPath, report, 'utf-8');
  logger.info(`📊 日报已生成: ${reportPath}`);
}

/**
 * 主程序
 */
async function main(): Promise<void> {
  console.log('╔════════════════════════════════════════╗');
  console.log('║  XHS Intelligence - 情报搜集系统       ║');
  console.log('║  🚀 v5.0 Ultimate Edition              ║');
  console.log('║  👁️ OCR + 🖐️ 看图 + 🧠 AI 分析        ║');
  console.log('╚════════════════════════════════════════╝');
  console.log();

  let browser: Browser | null = null;
  
  try {
    // 启动浏览器
    browser = await puppeteerExtra.launch({
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=site-per-process',
      ],
      defaultViewport: {
        width: 1200 + Math.floor(Math.random() * 200),
        height: 800 + Math.floor(Math.random() * 100),
      },
    });
    
    const page = await browser.newPage();
    
    // 加载 Cookie
    const cookieLoaded = await loadCookies(page);
    if (!cookieLoaded) {
      logger.error('Cookie 加载失败，请先运行 login.ts');
      return;
    }
    
    // 智能关键词轮询
    const keywords = getSmartMixKeywords();
    logger.info(`今日关键词: ${keywords.join(', ')}`);
    
    const allNotes: NoteInfo[] = [];
    
    // 搜索每个关键词
    for (const keyword of keywords) {
      const notes = await searchNotes(page, keyword);
      allNotes.push(...notes);
      
      if (keyword !== keywords[keywords.length - 1]) {
        const waitTime = SAFETY_CONFIG.KEYWORD_INTERVAL_MIN + 
                        Math.random() * (SAFETY_CONFIG.KEYWORD_INTERVAL_MAX - SAFETY_CONFIG.KEYWORD_INTERVAL_MIN);
        logger.info(`等待 ${Math.round(waitTime/1000)} 秒后搜索下一个关键词...`);
        await delay(waitTime);
      }
    }
    
    // 保存到数据库
    if (allNotes.length > 0) {
      const dbPath = path.join(DATA_DIR, 'interview_questions.json');
      const result = saveToDatabase(allNotes, dbPath);
      logger.info(`📊 数据库更新: 总计 ${result.total} 条, 新增 ${result.newCount} 条, 跳过 ${result.skipped} 条`);
      
      // 生成日报
      await generateDailyReport(allNotes);
    }
    
    logger.info('✅ 情报搜集完成！');
    
  } catch (error) {
    logger.error('程序出错:', error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// 运行主程序
main().catch(console.error);
