import { Page } from 'puppeteer';
import {
  SAFETY_CONFIG,
  delay,
  randomDelay,
  humanScroll,
  humanClick,
  extractNoteId,
  Logger,
  NoteInfo,
} from '..';

type AgentLogger = Logger | { info: Function; warn: Function; error: Function; debug?: Function };

interface AgentContext {
  page: Page;
  logger?: AgentLogger;
}

const defaultLogger = new Logger('Agent');

export async function browseFeed(page: Page, opts: AgentContext = {}): Promise<NoteInfo[]> {
  const logger = opts.logger || defaultLogger;

  logger.info('📱 开始浏览 Feed 流...');

  await page.goto('https://www.xiaohongshu.com/explore', { waitUntil: 'networkidle2' });
  await randomDelay(1800, 2600);

  await humanScroll(page);
  await randomDelay(900, 1300);
  await humanScroll(page);

  const feedCount = 1 + Math.floor(Math.random() * 2);
  logger.info(`📱 Feed 流：准备采集 ${feedCount} 篇笔记`);

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

  const startIdx = Math.floor(Math.random() * Math.min(5, noteCards.length));
  const notes: NoteInfo[] = [];

  for (let i = 0; i < feedCount && (startIdx + i) < noteCards.length; i++) {
    try {
      const card = noteCards[startIdx + i];

      const title = await card.$eval(
        '.title, .title span, [class*="title"]',
        el => el.textContent?.trim() || ''
      ).catch(() => `Feed笔记${i + 1}`);

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

      await card.evaluate((el) => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      await randomDelay(400, 700);

      logger.info(`📱 Feed 点击: ${title.substring(0, 25)}...`);
      try {
        await humanClick(page, card);
      } catch {
        await card.click();
      }

      try {
        await page.waitForSelector('.note-detail-mask, [class*="note-detail"]', {
          timeout: 8000, visible: true
        });
      } catch {
        logger.warn('📱 Feed 弹窗未出现');
        await page.keyboard.press('Escape').catch(() => {});
        continue;
      }

      await randomDelay(1600, 2400);

      const isVideo = await page.evaluate(() => {
        const container = document.querySelector('.note-detail-mask, [class*="note-detail"]');
        if (!container) return false;
        return !!(
          container.querySelector('video') ||
          container.querySelector('[class*="video-player"]') ||
          container.querySelector('[class*="xg-video"]') ||
          container.querySelector('.player-container')
        );
      }).catch(() => false);

      if (isVideo) {
        logger.info(`🎬 Feed 视频笔记，模拟观看中...`);
        await randomDelay(SAFETY_CONFIG.DETAIL_READ_MIN, SAFETY_CONFIG.DETAIL_READ_MAX);
        await page.keyboard.press('Escape');
        await randomDelay(900, 1300);
        continue;
      }

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

      const fullContent = content || `[图片笔记] ${title}`;

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

      await randomDelay(SAFETY_CONFIG.DETAIL_READ_MIN, SAFETY_CONFIG.DETAIL_READ_MAX);

      if (Math.random() < 0.4) {
        try {
          const likeBtn = await page.$('.note-detail-mask .like-wrapper, [class*="note-detail"] .interact-container .like');
          if (likeBtn) {
            logger.info('👍 Feed流互动：自动点赞...');
            await humanClick(page, likeBtn);
            await randomDelay(400, 700);
          }
        } catch {
          logger.warn('点赞失败，跳过');
        }
      }

      await page.keyboard.press('Escape');
      await randomDelay(900, 1300);

    } catch (error) {
      logger.error('📱 Feed 采集失败:', error);
      await page.keyboard.press('Escape').catch(() => {});
      await randomDelay(400, 700);
    }
  }

  logger.info(`📱 Feed 流采集完成: ${notes.length} 篇`);
  return notes;
}
