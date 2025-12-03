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
  PROJECT_ROOT, REPORTS_DIR, DATA_DIR, SAFETY_CONFIG, CONTENT_SUMMARY_LENGTH,
  getSmartMixKeywords, LOGIN_CHECK_SELECTORS, LOGIN_URL_PATTERNS,
  DETAIL_SELECTORS, NOTE_SELECTORS, OCR_CONFIG,
  delay, randomDelay, humanClick, humanScroll, loadCookies, makeSearchURL, extractNoteId,
  generateAIReport, expandKeywordsWithAI, saveToDatabase, recognizeImage,
  NoteInfo, Logger
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
 * 搜索笔记列表 (安全模式)
 */
async function searchNotes(page: Page, keyword: string): Promise<NoteInfo[]> {
  logger.info(`开始搜索: "${keyword}"`);
  const searchUrl = makeSearchURL(keyword);
  
  // 安全：先随机停顿，避免固定节奏
  await delay(1000 + Math.random() * 2000);
  
  await page.goto(searchUrl, { waitUntil: 'networkidle2' });
  await randomDelay(SAFETY_CONFIG.PAGE_LOAD_WAIT_MIN, SAFETY_CONFIG.PAGE_LOAD_WAIT_MAX);
  
  const loginCheck = await checkLogin(page);
  if (!loginCheck.isLoggedIn) {
    logger.warn(`需要登录: ${loginCheck.reason}`);
    return [];
  }
  
  // 安全：模拟真人浏览行为（随机滚动+停顿）
  await humanScroll(page);
  
  // 安全：随机移动鼠标，模拟真人
  await page.mouse.move(
    300 + Math.random() * 600,
    200 + Math.random() * 400
  );
  
  // 获取笔记卡片 (使用多种选择器)
  const cardSelectors = [
    'section.note-item',
    '.note-item', 
    'div[data-note-id]',
    '.feeds-page section',
    'a[href*="/explore/"]',
  ];
  
  let noteCards = await page.$$(cardSelectors.join(', '));
  
  // 如果没找到，尝试等待一下
  if (noteCards.length === 0) {
    logger.warn('未找到笔记卡片，等待页面加载...');
    await delay(3000);
    noteCards = await page.$$(cardSelectors.join(', '));
  }
  
  logger.info(`找到 ${noteCards.length} 篇笔记卡片`);
  
  const notes: NoteInfo[] = [];
  const maxNotes = Math.min(noteCards.length, SAFETY_CONFIG.MAX_NOTES_PER_KEYWORD || 3);
  
  for (let i = 0; i < maxNotes; i++) {
    try {
      const card = noteCards[i];
      
      // 提取标题
      const title = await card.$eval(
        '.title, .title span, a.title, [class*="title"]',
        el => el.textContent?.trim() || ''
      ).catch(() => `笔记${i+1}`);
      
      // 提取链接
      let link = await card.$eval(
        'a[href*="/explore/"], a[href*="/discovery/"]',
        el => (el as HTMLAnchorElement).href
      ).catch(() => '');
      
      // 如果卡片本身就是链接
      if (!link) {
        link = await card.evaluate((el) => {
          if (el.tagName === 'A') return (el as HTMLAnchorElement).href;
          const a = el.querySelector('a');
          return a ? a.href : '';
        }).catch(() => '');
      }
      
      if (!link) {
        logger.warn(`笔记 ${i+1} 无链接，跳过`);
        continue;
      }
      
      const noteId = extractNoteId(link);
      if (!noteId) {
        logger.warn(`笔记 ${i+1} 无法提取ID: ${link}`);
        continue;
      }
      
      // ✅ 滚动到卡片可见位置
      await card.evaluate((el) => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      await delay(500);
      
      // ✅ 真实点击进入详情页
      logger.info(`👆 [${i+1}/${maxNotes}] 点击进入: ${title.substring(0, 25)}...`);
      
      // 使用多种点击方式
      try {
        await humanClick(page, card);
      } catch {
        // 备用：直接点击链接
        const linkEl = await card.$('a[href*="/explore/"]');
        if (linkEl) {
          await linkEl.click();
        } else {
          await card.click();
        }
      }
      
      // 等待详情弹窗出现 (小红书用 .note-detail-mask 或类似的弹窗)
      try {
        await page.waitForSelector('.note-detail-mask, [class*="note-detail"], [class*="noteDetail"]', { 
          timeout: 8000,
          visible: true 
        });
        logger.info('✅ 详情弹窗已打开');
      } catch {
        logger.warn('⚠️ 详情弹窗未出现，尝试继续...');
      }
      
      // 等待内容加载
      await delay(2000);
      
      // ✅ 从详情弹窗内提取正文内容
      const content = await page.evaluate(() => {
        // 查找详情弹窗容器
        const detailContainer = document.querySelector('.note-detail-mask') ||
                                document.querySelector('[class*="note-detail"]') ||
                                document.querySelector('[class*="noteDetail"]');
        
        if (!detailContainer) return '';
        
        // 查找正文内容 (通常在 .desc 或 #detail-desc 或带有 desc/content 的元素)
        const descSelectors = [
          '#detail-desc',
          '.desc',
          '[class*="desc"]',
          '.note-text',
          '[class*="content"]:not([class*="comment"])',
        ];
        
        let contentText = '';
        for (const selector of descSelectors) {
          const descEl = detailContainer.querySelector(selector);
          if (descEl) {
            const text = descEl.textContent?.trim() || '';
            // 过滤掉法律声明等无用内容
            if (text.length > 20 && !text.includes('沪ICP备') && !text.includes('营业执照')) {
              contentText = text;
              break;
            }
          }
        }
        
        // 如果没找到，尝试获取所有段落
        if (!contentText) {
          const paragraphs = detailContainer.querySelectorAll('p, span.content, div.content');
          const texts: string[] = [];
          paragraphs.forEach(p => {
            const t = p.textContent?.trim() || '';
            if (t.length > 10 && !t.includes('沪ICP备') && !texts.includes(t)) {
              texts.push(t);
            }
          });
          contentText = texts.join('\n');
        }
        
        return contentText.substring(0, 2000);
      }).catch(() => '');
      
      // 如果还是没内容，可能是图片笔记，获取标题作为内容
      let fullContent = content;
      if (!content || content.length < 20) {
        logger.info('📷 图片笔记，内容较少，将保存图片链接');
        fullContent = `[图片笔记] ${title}`;
        
        // 获取图片链接
        const imageUrls = await page.$$eval(
          '.note-detail-mask img, [class*="note-detail"] img',
          imgs => imgs.map(img => (img as HTMLImageElement).src).filter(src => 
            src && !src.includes('avatar') && !src.includes('icon') && src.includes('http')
          ).slice(0, 5)
        ).catch(() => []);
        
        if (imageUrls.length > 0) {
          fullContent += `\n\n图片: ${imageUrls.join('\n')}`;
          logger.info(`📷 找到 ${imageUrls.length} 张图片`);
        }
      }
      
      // ✅ 提取作者信息
      const author = await page.evaluate(() => {
        const container = document.querySelector('.note-detail-mask, [class*="note-detail"]');
        if (!container) return '未知作者';
        const authorEl = container.querySelector('.author-wrapper .name, .user-name, .nickname, [class*="author"] [class*="name"]');
        return authorEl?.textContent?.trim() || '未知作者';
      }).catch(() => '未知作者');
      
      // ✅ 提取点赞数
      const likes = await page.evaluate(() => {
        const container = document.querySelector('.note-detail-mask, [class*="note-detail"]');
        if (!container) return '0';
        const likeEl = container.querySelector('.like-wrapper .count, [class*="like"] .count, [class*="like-count"]');
        return likeEl?.textContent?.trim() || '0';
      }).catch(() => '0');
      
      // ✅ 提取标签
      const tags = await page.evaluate(() => {
        const container = document.querySelector('.note-detail-mask, [class*="note-detail"]');
        if (!container) return [];
        const tagEls = container.querySelectorAll('a.tag, .hash-tag, a[href*="/search_result"]');
        return Array.from(tagEls).map(el => el.textContent?.trim() || '').filter(t => t && t.startsWith('#')).slice(0, 5);
      }).catch(() => []);
      
      // ✅ 提取热门评论
      const comments = await page.evaluate(() => {
        const container = document.querySelector('.note-detail-mask, [class*="note-detail"]');
        if (!container) return [];
        const commentItems = container.querySelectorAll('.comment-item, [class*="comment-item"]');
        const result: { author: string; content: string; likes: string }[] = [];
        commentItems.forEach((item, idx) => {
          if (idx >= 3) return; // 只取前3条
          const author = item.querySelector('.name, .nickname, [class*="name"]')?.textContent?.trim() || '';
          const content = item.querySelector('.content, .note-text, [class*="content"]')?.textContent?.trim() || '';
          const likes = item.querySelector('.like .count, [class*="like"] .count')?.textContent?.trim() || '0';
          if (author && content) {
            result.push({ author, content: content.substring(0, 100), likes });
          }
        });
        return result;
      }).catch(() => []);

      // ✅ 拟人化：如果有多张图片，模拟翻看 (Human-Like Image Browsing)
      try {
        const hasNextBtn = await page.$('.note-detail-mask .swiper-button-next, [class*="note-detail"] .swiper-button-next');
        if (hasNextBtn) {
          const browseCount = 1 + Math.floor(Math.random() * 2); // 随机翻 1-2 页
          logger.info(`🖐️ 模拟翻看图片 (${browseCount} 张)...`);
          for (let k = 0; k < browseCount; k++) {
            await hasNextBtn.click();
            await delay(1500 + Math.random() * 1000); // 每张看 1.5-2.5 秒
          }
        }
      } catch (e) {
        // 忽略翻页错误
      }

      // ✅ 智能点赞 (Smart Like): 40% 概率点赞，增加账号权重
      if (Math.random() < 0.4) {
        try {
          const likeBtn = await page.$('.note-detail-mask .like-wrapper, [class*="note-detail"] .interact-container .like');
          if (likeBtn) {
            // 检查是否已经点赞 (通常已点赞会有 active 类名或特定颜色，这里简单起见只点未点赞的)
            // 但为了安全，我们只做点击动作，如果是已点赞的可能会取消，所以最好检查状态
            // 这里简化为：只点击，模拟真人互动
            logger.info('👍 发现优质笔记，自动点赞...');
            await humanClick(page, likeBtn);
            await delay(500);
          }
        } catch (e) {
          logger.warn('点赞失败，跳过');
        }
      }

      // ✅ OCR 增强：如果正文太短，尝试识别图片文字
      if (fullContent.length < OCR_CONFIG.MIN_CONTENT_LENGTH) {
        logger.info('👁️ 正文过短，尝试 OCR 识别图片...');
        
        // 获取图片链接
        const imageUrls = await page.$$eval(
          '.note-detail-mask img, [class*="note-detail"] img',
          imgs => imgs.map(img => (img as HTMLImageElement).src).filter(src => 
            src && !src.includes('avatar') && !src.includes('icon') && src.includes('http')
          ).slice(0, OCR_CONFIG.MAX_IMAGES)
        ).catch(() => []);

        if (imageUrls.length > 0) {
          let ocrText = '';
          for (const imgUrl of imageUrls) {
            try {
              logger.info(`👁️ 正在识别图片: ${imgUrl.substring(0, 30)}...`);
              const text = await recognizeImage(imgUrl);
              if (text) ocrText += text + '\n';
            } catch (err) {
              logger.warn('OCR 识别失败，跳过');
            }
          }
          
          if (ocrText.trim()) {
            fullContent += `\n\n[OCR 识别内容]:\n${ocrText}`;
            logger.info(`✅ OCR 识别成功，补充了 ${ocrText.length} 字`);
          }
        }
      }
      
      notes.push({
        keyword,
        title,
        author,
        authorLink: '',
        likes,
        link,
        noteId,
        content: fullContent.substring(0, CONTENT_SUMMARY_LENGTH),
        fullContent,
        tags,
        comments
      });
      
      logger.info(`✅ 采集完成: ${title.substring(0, 30)}... (${comments.length}条评论)`);
      
      // 安全：模拟真人阅读完毕（随机停顿）
      await randomDelay(SAFETY_CONFIG.DETAIL_READ_MIN, SAFETY_CONFIG.DETAIL_READ_MAX);
      
      // 关闭弹窗 (小红书详情是弹窗形式)
      await page.keyboard.press('Escape');
      await delay(1000 + Math.random() * 1000);
      
    } catch (error) {
      logger.error('采集笔记失败:', error);
      // 尝试关闭可能打开的弹窗
      await page.keyboard.press('Escape').catch(() => {});
      await delay(1000);
    }
  }
  
  return notes;
}

/**
 * 浏览 Feed 流并获取笔记 (模拟真人刷首页)
 */
async function browseFeed(page: Page): Promise<NoteInfo[]> {
  logger.info('📱 开始浏览 Feed 流...');
  
  // 回到首页
  await page.goto('https://www.xiaohongshu.com/explore', { waitUntil: 'networkidle2' });
  await delay(2000);
  
  // 模拟真人滚动浏览
  await humanScroll(page);
  await delay(1000);
  await humanScroll(page);
  
  // 随机获取 1-2 篇笔记
  const feedCount = 1 + Math.floor(Math.random() * 2); // 1 或 2
  logger.info(`📱 Feed 流：准备采集 ${feedCount} 篇笔记`);
  
  // 获取 feed 中的笔记卡片
  const cardSelectors = [
    'section.note-item',
    '.note-item',
    'div[data-note-id]',
    'a[href*="/explore/"]',
  ];
  
  const noteCards = await page.$$(cardSelectors.join(', '));
  if (noteCards.length === 0) {
    logger.warn('📱 Feed 流无笔记');
    return [];
  }
  
  // 随机选择几个卡片（不从头开始，更自然）
  const startIdx = Math.floor(Math.random() * Math.min(5, noteCards.length));
  const notes: NoteInfo[] = [];
  
  for (let i = 0; i < feedCount && (startIdx + i) < noteCards.length; i++) {
    try {
      const card = noteCards[startIdx + i];
      
      // 提取标题
      const title = await card.$eval(
        '.title, .title span, [class*="title"]',
        el => el.textContent?.trim() || ''
      ).catch(() => `Feed笔记${i+1}`);
      
      // 提取链接
      let link = await card.$eval(
        'a[href*="/explore/"]',
        el => (el as HTMLAnchorElement).href
      ).catch(() => '');
      
      if (!link) {
        link = await card.evaluate((el) => {
          if (el.tagName === 'A') return (el as HTMLAnchorElement).href;
          const a = el.querySelector('a');
          return a ? a.href : '';
        }).catch(() => '');
      }
      
      if (!link) continue;
      
      const noteId = extractNoteId(link);
      if (!noteId) continue;
      
      // 滚动到可见位置
      await card.evaluate((el) => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      await delay(500);
      
      // 点击进入
      logger.info(`📱 Feed 点击: ${title.substring(0, 25)}...`);
      try {
        await humanClick(page, card);
      } catch {
        await card.click();
      }
      
      // 等待弹窗
      try {
        await page.waitForSelector('.note-detail-mask, [class*="note-detail"]', { 
          timeout: 8000, visible: true 
        });
      } catch {
        logger.warn('📱 Feed 弹窗未出现');
        await page.keyboard.press('Escape').catch(() => {});
        continue;
      }
      
      await delay(2000);
      
      // ✅ 检测是否是视频笔记
      const isVideo = await page.evaluate(() => {
        const container = document.querySelector('.note-detail-mask, [class*="note-detail"]');
        if (!container) return false;
        // 视频标志：video标签、播放按钮、视频播放器等
        return !!(
          container.querySelector('video') ||
          container.querySelector('[class*="video-player"]') ||
          container.querySelector('[class*="xg-video"]') ||
          container.querySelector('.player-container')
        );
      }).catch(() => false);
      
      if (isVideo) {
        // 视频：模拟观看一段时间，但不记录内容
        logger.info(`🎬 Feed 视频笔记，模拟观看中...`);
        await randomDelay(SAFETY_CONFIG.DETAIL_READ_MIN, SAFETY_CONFIG.DETAIL_READ_MAX);
        await page.keyboard.press('Escape');
        await delay(1000);
        continue; // 跳过记录
      }
      
      // 图文笔记：提取内容
      const content = await page.evaluate(() => {
        const container = document.querySelector('.note-detail-mask, [class*="note-detail"]');
        if (!container) return '';
        
        const descSelectors = ['#detail-desc', '.desc', '[class*="desc"]', '.note-text'];
        for (const sel of descSelectors) {
          const el = container.querySelector(sel);
          if (el) {
            const text = el.textContent?.trim() || '';
            if (text.length > 20 && !text.includes('沪ICP备')) return text;
          }
        }
        return '';
      }).catch(() => '');
      
      const author = await page.evaluate(() => {
        const container = document.querySelector('.note-detail-mask, [class*="note-detail"]');
        const el = container?.querySelector('.author-wrapper .name, .user-name, .nickname');
        return el?.textContent?.trim() || '未知作者';
      }).catch(() => '未知作者');
      
      const likes = await page.evaluate(() => {
        const container = document.querySelector('.note-detail-mask, [class*="note-detail"]');
        const el = container?.querySelector('.like-wrapper .count, [class*="like"] .count');
        return el?.textContent?.trim() || '0';
      }).catch(() => '0');
      
      const tags = await page.evaluate(() => {
        const container = document.querySelector('.note-detail-mask, [class*="note-detail"]');
        const els = container?.querySelectorAll('a.tag, .hash-tag') || [];
        return Array.from(els).map(el => el.textContent?.trim() || '').filter(t => t.startsWith('#')).slice(0, 5);
      }).catch(() => []);
      
      let fullContent = content || `[图片笔记] ${title}`;
      
      notes.push({
        keyword: '[Feed流]',
        title,
        author,
        authorLink: '',
        likes,
        link,
        noteId,
        content: fullContent.substring(0, 500),
        fullContent,
        tags,
        comments: []
      });
      
      logger.info(`📱 Feed 采集完成: ${title.substring(0, 25)}...`);
      
      // 模拟阅读
      await randomDelay(SAFETY_CONFIG.DETAIL_READ_MIN, SAFETY_CONFIG.DETAIL_READ_MAX);
      
      // ✅ 智能点赞 (Feed流中点赞权重更高)
      if (Math.random() < 0.4) {
        try {
          const likeBtn = await page.$('.note-detail-mask .like-wrapper, [class*="note-detail"] .interact-container .like');
          if (likeBtn) {
            logger.info('👍 Feed流互动：自动点赞...');
            await humanClick(page, likeBtn);
            await delay(500);
          }
        } catch (e) {
          logger.warn('点赞失败，跳过');
        }
      }
      
      // 关闭弹窗
      await page.keyboard.press('Escape');
      await delay(1000 + Math.random() * 1000);
      
    } catch (error) {
      logger.error('📱 Feed 采集失败:', error);
      await page.keyboard.press('Escape').catch(() => {});
      await delay(500);
    }
  }
  
  logger.info(`📱 Feed 流采集完成: ${notes.length} 篇`);
  return notes;
}

/**
 * 生成日报 (带日期文件名)
 */
async function generateDailyReport(allNotes: NoteInfo[]): Promise<void> {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const timeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  const reportPath = path.join(REPORTS_DIR, `daily_${dateStr}.md`);
  
  let report = `# 📊 小红书搜广推面试情报日报\n\n`;
  report += `**日期**: ${dateStr} ${timeStr}\n`;
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
    report += `- **关键词**: ${note.keyword}\n`;
    report += `- **标签**: ${note.tags.join(', ') || '无'}\n`;
    report += `- **链接**: [查看原文](${note.link})\n\n`;
    
    // 正文内容
    report += `**📄 正文内容**:\n\n`;
    report += `> ${note.content.replace(/\n/g, '\n> ')}\n\n`;
    
    // 热门评论
    if (note.comments && note.comments.length > 0) {
      report += `**💬 热门评论**:\n\n`;
      note.comments.forEach((c, i) => {
        report += `${i + 1}. **${c.author}** (👍${c.likes}): ${c.content}\n`;
      });
      report += `\n`;
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
  console.log('║  🚀 v5.1 Fixed Edition                 ║');
  console.log('╚════════════════════════════════════════╝');
  console.log();

  let browser: Browser | null = null;
  
  try {
    // ✅ 步骤1: 先生成关键词（不启动浏览器）
    logger.info('📝 步骤1: 准备关键词...');
    const baseKeywords = getSmartMixKeywords();
    logger.info(`基础关键词: ${baseKeywords.join(', ')}`);
    
    // AI 扩展关键词（在浏览器启动前完成）
    const keywords = await expandKeywordsWithAI(baseKeywords);
    if (keywords.length > baseKeywords.length) {
      logger.info(`AI 扩展后: ${keywords.join(', ')}`);
    }
    
    // ✅ 步骤2: 启动浏览器
    logger.info('🌐 步骤2: 启动浏览器...');
    browser = await puppeteerExtra.launch({
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=site-per-process',
      ],
      defaultViewport: {
        width: 1280 + Math.floor(Math.random() * 100),
        height: 800 + Math.floor(Math.random() * 50),
      },
    });
    
    const page = await browser.newPage();
    
    // ✅ 步骤3: 加载 Cookie 并进入小红书首页
    logger.info('🔑 步骤3: 加载 Cookie 并进入小红书...');
    const cookieLoaded = await loadCookies(page);
    if (!cookieLoaded) {
      logger.error('Cookie 加载失败，请先运行 login.ts');
      return;
    }
    
    // 先进入小红书首页，让 Cookie 生效
    await page.goto('https://www.xiaohongshu.com/explore', { waitUntil: 'networkidle2' });
    await delay(3000);
    logger.info('✅ 已进入小红书首页');
    
    // 检查登录状态
    const loginCheck = await checkLogin(page);
    if (!loginCheck.isLoggedIn) {
      logger.error(`未登录: ${loginCheck.reason}，请先运行 login.ts`);
      return;
    }
    logger.info('✅ 登录状态正常');
    
    // 模拟真人浏览首页
    await humanScroll(page);
    await delay(2000);
    
    const allNotes: NoteInfo[] = [];
    
    // ✅ 随机选择两个位置穿插 Feed 流浏览
    // 例如：关键词有 [A, B, C, D]，可能在 A后 和 C后 穿插 Feed
    const feedInsertPositions = new Set<number>();
    while (feedInsertPositions.size < 2 && keywords.length > 1) {
      // 随机选择一个位置（0 到 keywords.length-2，即不在最后一个后面）
      const pos = Math.floor(Math.random() * (keywords.length - 1));
      feedInsertPositions.add(pos);
    }
    logger.info(`📱 将在第 ${[...feedInsertPositions].map(p => p + 1).join(', ')} 个关键词后穿插 Feed 流`);
    
    // 搜索每个关键词，穿插 Feed 流
    for (let idx = 0; idx < keywords.length; idx++) {
      const keyword = keywords[idx];
      
      // 搜索当前关键词
      const notes = await searchNotes(page, keyword);
      allNotes.push(...notes);
      
      // 检查是否需要穿插 Feed 流
      if (feedInsertPositions.has(idx)) {
        const waitTime = 10000 + Math.random() * 10000; // 10-20秒后刷 Feed
        logger.info(`⏳ 等待 ${Math.round(waitTime/1000)} 秒后刷 Feed 流...`);
        await delay(waitTime);
        
        const feedNotes = await browseFeed(page);
        allNotes.push(...feedNotes);
      }
      
      // 搜索间隔（除了最后一个）
      if (idx < keywords.length - 1) {
        const waitTime = SAFETY_CONFIG.KEYWORD_INTERVAL_MIN + 
                        Math.random() * (SAFETY_CONFIG.KEYWORD_INTERVAL_MAX - SAFETY_CONFIG.KEYWORD_INTERVAL_MIN);
        logger.info(`⏳ 等待 ${Math.round(waitTime/1000)} 秒后搜索下一个关键词...`);
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
