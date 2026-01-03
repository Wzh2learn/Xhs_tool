/**
 * XHS Intelligence Agent v5.0 - 情报搜集系统
 * 生产化入口：轻 orchestrator + Agents
 */
import 'dotenv/config';
import * as path from 'path';
import * as fs from 'fs';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, Page } from 'puppeteer';

import {
  REPORTS_DIR,
  DATA_DIR,
  SAFETY_CONFIG,
  getSmartMixKeywords,
  LOGIN_CHECK_SELECTORS,
  LOGIN_URL_PATTERNS,
  delay,
  randomDelay,
  loadCookies,
  generateAIReport,
  expandKeywordsWithAI,
  saveToDatabase,
  generateSyncBundle,
  NoteInfo,
  Logger,
  applyStealthProfile,
  searchNotes,
  browseFeed,
} from './src';

puppeteerExtra.use(StealthPlugin());
const logger = new Logger('Intelligence');

process.on('unhandledRejection', (reason: any) => {
  logger.warn(`⚠️ Promise 拒绝: ${String(reason).slice(0, 120)}`);
});
process.on('uncaughtException', (error: any) => {
  if (error?.message?.includes('fetch failed')) {
    logger.warn(`⚠️ fetch failed: ${error.message}`);
    return;
  }
  logger.error('未捕获异常:', error);
});

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
          const rect = (el as HTMLElement).getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        }, element);
        if (isVisible) {
          return { isLoggedIn: false, reason: `发现登录元素: ${selector}` };
        }
      }
    } catch {
      continue;
    }
  }
  return { isLoggedIn: true };
}

async function generateDailyReport(allNotes: NoteInfo[]): Promise<void> {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  const reportPath = path.join(REPORTS_DIR, `daily_${dateStr}.md`);

  let report = `# 📊 小红书搜广推面试情报日报\n\n`;
  report += `**日期**: ${dateStr} ${timeStr}\n`;
  report += `**采集数量**: ${allNotes.length} 篇笔记\n\n`;
  report += `---\n\n`;

  const aiReport = await generateAIReport(allNotes);
  if (aiReport) {
    report += `## 🧠 AI 智能分析\n\n${aiReport}\n\n---\n\n`;
  }

  report += `## 📝 笔记详情\n\n`;
  allNotes.forEach((note, index) => {
    report += `### ${index + 1}. ${note.title}\n\n`;
    report += `- **作者**: ${note.author}\n`;
    report += `- **点赞**: ${note.likes}\n`;
    report += `- **关键词**: ${note.keyword}\n`;
    report += `- **标签**: ${note.tags.join(', ') || '无'}\n`;
    report += `- **链接**: [查看原文](${note.link})\n\n`;
    report += `**📄 正文内容**:\n\n`;
    report += `> ${note.content.replace(/\n/g, '\n> ')}\n\n`;
    if (note.comments && note.comments.length > 0) {
      report += `**💬 热门评论**:\n\n`;
      note.comments.forEach((c, i) => {
        report += `${i + 1}. **${c.author}** (👍${c.likes}): ${c.content}\n`;
      });
      report += `\n`;
    }
    report += `---\n\n`;
  });

  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }
  fs.writeFileSync(reportPath, report, 'utf-8');
  logger.info(`📊 日报已生成: ${reportPath}`);
}

async function main(): Promise<void> {
  logger.info('╔════════════════════════════════════════╗');
  logger.info('║  XHS Intelligence - 情报搜集系统       ║');
  logger.info('║  🚀 v5.1 Productionized                ║');
  logger.info('╚════════════════════════════════════════╝');

  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    logger.info('📝 步骤1: 准备关键词...');
    const baseKeywords = getSmartMixKeywords();
    logger.info(`基础关键词: ${baseKeywords.join(', ')}`);
    const keywords = await expandKeywordsWithAI(baseKeywords);
    if (keywords.length > baseKeywords.length) {
      logger.info(`AI 扩展后: ${keywords.join(', ')}`);
    }

    logger.info('🌐 步骤2: 启动浏览器...');
    browser = await puppeteerExtra.launch({
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=site-per-process',
      ],
    });
    page = await browser.newPage();
    await applyStealthProfile(page);

    logger.info('🔑 步骤3: 加载 Cookie 并进入小红书...');
    const cookieLoaded = await loadCookies(page);
    if (!cookieLoaded) {
      logger.error('Cookie 加载失败，请先运行 login.ts');
      return;
    }
    await page.goto('https://www.xiaohongshu.com/explore', { waitUntil: 'networkidle2' });
    await randomDelay(2200, 3600);

    const loginCheck = await checkLogin(page);
    if (!loginCheck.isLoggedIn) {
      logger.error(`未登录: ${loginCheck.reason}，请先运行 login.ts`);
      return;
    }
    logger.info('✅ 登录状态正常');
    await randomDelay(1200, 2000);

    const allNotes: NoteInfo[] = [];
    const feedInsertPositions = new Set<number>();
    while (feedInsertPositions.size < 2 && keywords.length > 1) {
      const pos = Math.floor(Math.random() * (keywords.length - 1));
      feedInsertPositions.add(pos);
    }
    logger.info(`📱 将在第 ${[...feedInsertPositions].map(p => p + 1).join(', ')} 个关键词后穿插 Feed 流`);

    for (let idx = 0; idx < keywords.length; idx++) {
      const keyword = keywords[idx];
      const notes = await searchNotes(page, keyword, { logger });
      allNotes.push(...notes);

      if (feedInsertPositions.has(idx)) {
        const waitTime = SAFETY_CONFIG.NOTE_INTERVAL_MIN + Math.random() * (SAFETY_CONFIG.NOTE_INTERVAL_MAX - SAFETY_CONFIG.NOTE_INTERVAL_MIN);
        logger.info(`⏳ 等待 ${Math.round(waitTime / 1000)} 秒后刷 Feed 流...`);
        await delay(waitTime);
        const feedNotes = await browseFeed(page, { logger });
        allNotes.push(...feedNotes);
      }

      if (idx < keywords.length - 1) {
        const waitTime = SAFETY_CONFIG.KEYWORD_INTERVAL_MIN +
          Math.random() * (SAFETY_CONFIG.KEYWORD_INTERVAL_MAX - SAFETY_CONFIG.KEYWORD_INTERVAL_MIN);
        logger.info(`⏳ 等待 ${Math.round(waitTime / 1000)} 秒后搜索下一个关键词...`);
        await delay(waitTime);
      }
    }

    if (allNotes.length > 0) {
      const dbPath = path.join(DATA_DIR, 'interview_questions.json');
      const result = saveToDatabase(allNotes, dbPath);
      logger.info(`📊 数据库更新: 总计 ${result.total} 条, 新增 ${result.newCount} 条, 跳过 ${result.skipped} 条`);
      
      logger.info('🔄 正在生成 AlgoQuest 同步数据包...');
      const bundle = generateSyncBundle(dbPath);
      if (bundle) {
        const bundlePath = path.join(DATA_DIR, 'algoquest_sync.json');
        fs.writeFileSync(bundlePath, JSON.stringify(bundle, null, 2));
        logger.info(`✅ 同步数据包已生成: ${bundlePath}`);
        logger.info('💡 请在 AlgoQuest3 中导入此文件以同步情报。');
      }

      await generateDailyReport(allNotes);
    }

    logger.info('✅ 情报搜集完成！');
  } catch (error) {
    logger.error('程序出错:', error);
  } finally {
    if (page) {
      await page.close().catch(() => {});
    }
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

main().catch(err => logger.error('主程序异常:', err));
