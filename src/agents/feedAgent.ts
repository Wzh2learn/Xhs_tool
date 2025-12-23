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
  extractFeedList,
  extractFeedDetail,
  XhsFeed,
  XhsFeedDetailResponse,
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

  // 优先使用 __INITIAL_STATE__ 获取 feed 列表
  try {
    const feeds = await extractFeedList(page);
    if (feeds && feeds.length > 0) {
      const feedCount = Math.min(1 + Math.floor(Math.random() * 2), feeds.length);
      logger.info(`📱 Feed 流（state）：准备采集 ${feedCount} 篇笔记`);
      const notes: NoteInfo[] = [];
      const startIdx = Math.floor(Math.random() * Math.min(5, feeds.length));

      for (let i = 0; i < feedCount && startIdx + i < feeds.length; i++) {
        const feed = feeds[startIdx + i];
        const note = await collectFeedDetail(page, feed, { logger });
        if (note) notes.push(note);
        await randomDelay(SAFETY_CONFIG.DETAIL_READ_MIN, SAFETY_CONFIG.DETAIL_READ_MAX);
      }

      if (notes.length > 0) {
        logger.info(`📱 Feed 流采集完成(state): ${notes.length} 篇`);
        return notes;
      }
      logger.warn('⚠️ state feed 采集为空，回退 DOM 流程');
    }
  } catch (err: any) {
    logger.warn(`⚠️ state feed 解析失败，回退 DOM: ${err?.message || err}`);
  }

  // 回退：原有 DOM 点击流程
  return await collectFeedByDom(page, logger);
}

async function collectFeedDetail(page: Page, feed: XhsFeed, ctx: { logger: AgentLogger }): Promise<NoteInfo | null> {
  const { logger } = ctx;
  const feedId = feed.id;
  if (!feedId) return null;

  const xsecToken = feed.xsecToken;
  const titleHint = feed.noteCard?.displayTitle || `Feed笔记${feedId.slice(-4)}`;
  const url = xsecToken
    ? `https://www.xiaohongshu.com/explore/${feedId}?xsec_token=${xsecToken}&xsec_source=pc_feed`
    : `https://www.xiaohongshu.com/explore/${feedId}`;

  try {
    logger.info(`📱 Feed 详情（state）：${titleHint.substring(0, 25)}...`);
    await page.goto(url, { waitUntil: 'networkidle2' });
    await randomDelay(1500, 2500);

    const detail = await extractFeedDetail(page, feedId);
    if (detail) {
      const note = mapFeedDetail(detail, feed);
      if (note) return note;
    }
    logger.warn('⚠️ state feedDetail 为空，尝试 DOM fallback');
    return await collectFeedDetailByDom(page, feedId, { logger, titleHint, xsecToken });
  } catch (err: any) {
    logger.warn(`⚠️ Feed 详情采集失败，回退 DOM: ${err?.message || err}`);
    return await collectFeedDetailByDom(page, feedId, { logger, titleHint, xsecToken });
  }
}

function mapFeedDetail(detail: XhsFeedDetailResponse, feed: XhsFeed): NoteInfo | null {
  const base = detail.note;
  if (!base?.noteId) return null;
  const user = base.user || feed.noteCard?.user;
  const title = base.title || feed.noteCard?.displayTitle || `Feed笔记${base.noteId.slice(-4)}`;
  const fullContent = base.desc && base.desc.trim().length > 0 ? base.desc.trim() : `[图片笔记] ${title}`;
  const comments =
    (detail.comments?.list || [])
      .slice(0, 2)
      .map((c) => ({
        author: c.userInfo?.nickName || c.userInfo?.nickname || c.userInfo?.redId || '未知',
        content: (c.content || '').substring(0, 120),
        likes: c.likeCount || '0',
      })) || [];

  return {
    keyword: '[Feed流]',
    title,
    author: user?.nickName || user?.nickname || user?.redId || '未知作者',
    authorLink: user?.redId ? `https://www.xiaohongshu.com/user/profile/${user.redId}` : '',
    authorId: user?.userId,
    authorRedId: user?.redId,
    likes: base.interactInfo?.likedCount || feed.noteCard?.interactInfo?.likedCount || '0',
    link: `https://www.xiaohongshu.com/explore/${base.noteId}`,
    noteId: base.noteId,
    xsecToken: base.xsecToken || feed.xsecToken,
    content: fullContent.substring(0, 500),
    fullContent,
    tags: [],
    comments,
  };
}

async function collectFeedDetailByDom(
  page: Page,
  feedId: string,
  ctx: { logger: AgentLogger; titleHint: string; xsecToken?: string },
): Promise<NoteInfo | null> {
  const { logger, titleHint, xsecToken } = ctx;
  const url = xsecToken
    ? `https://www.xiaohongshu.com/explore/${feedId}?xsec_token=${xsecToken}&xsec_source=pc_feed`
    : `https://www.xiaohongshu.com/explore/${feedId}`;

  await page.goto(url, { waitUntil: 'networkidle2' });
  await randomDelay(1600, 2400);

  const containerSelector = '.note-detail-mask, [class*="note-detail"], [class*="noteDetail"], .interaction-container';
  try {
    await page.waitForSelector(containerSelector, { timeout: 8000, visible: true });
  } catch {
    logger.warn('📱 Feed DOM 详情未出现');
    return null;
  }

  const content = await page
    .evaluate((sel) => {
      const container = document.querySelector(sel);
      if (!container) return '';
      const descSelectors = ['#detail-desc', '.desc', '[class*="desc"]', '.note-text'];
      for (const s of descSelectors) {
        const el = container.querySelector(s);
        if (el) {
          const text = el.textContent?.trim() || '';
          if (text.length > 20 && !text.includes('沪ICP备')) return text.substring(0, 2000);
        }
      }
      return '';
    }, containerSelector)
    .catch(() => '');

  const author = await page
    .evaluate((sel) => {
      const container = document.querySelector(sel);
      const el = container?.querySelector('.author-wrapper .name, .user-name, .nickname');
      return el?.textContent?.trim() || '未知作者';
    }, containerSelector)
    .catch(() => '未知作者');

  const likes = await page
    .evaluate((sel) => {
      const container = document.querySelector(sel);
      const el = container?.querySelector('.like-wrapper .count, [class*="like"] .count');
      return el?.textContent?.trim() || '0';
    }, containerSelector)
    .catch(() => '0');

  const tags = await page
    .evaluate((sel) => {
      const container = document.querySelector(sel);
      const els = container?.querySelectorAll('a.tag, .hash-tag') || [];
      return Array.from(els)
        .map((el) => el.textContent?.trim() || '')
        .filter((t) => t.startsWith('#'))
        .slice(0, 5);
    }, containerSelector)
    .catch(() => []);

  const fullContent = content || `[图片笔记] ${titleHint}`;

  return {
    keyword: '[Feed流]',
    title: titleHint,
    author,
    authorLink: '',
    likes,
    link: `https://www.xiaohongshu.com/explore/${feedId}`,
    noteId: feedId,
    xsecToken,
    content: fullContent.substring(0, 500),
    fullContent,
    tags,
    comments: [],
  };
}

async function collectFeedByDom(page: Page, logger: AgentLogger): Promise<NoteInfo[]> {
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

  const feedCount = 1 + Math.floor(Math.random() * 2);
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
