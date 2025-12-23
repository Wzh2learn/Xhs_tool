import { Page } from 'puppeteer';
import {
  SAFETY_CONFIG,
  CONTENT_SUMMARY_LENGTH,
  OCR_CONFIG,
  makeSearchURL,
  delay,
  randomDelay,
  humanScroll,
  humanClick,
  extractNoteId,
  recognizeImage,
  Logger,
  NoteInfo,
  extractSearchFeeds,
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

export async function searchNotes(page: Page, keyword: string, opts: AgentContext = {}): Promise<NoteInfo[]> {
  const logger = opts.logger || defaultLogger;

  logger.info(`开始搜索: "${keyword}"`);
  const searchUrl = makeSearchURL(keyword);

  await delay(1000 + Math.random() * 2000);
  await page.goto(searchUrl, { waitUntil: 'networkidle2' });
  await randomDelay(SAFETY_CONFIG.PAGE_LOAD_WAIT_MIN, SAFETY_CONFIG.PAGE_LOAD_WAIT_MAX);

  // 模拟真人浏览行为
  await humanScroll(page);
  await page.mouse.move(300 + Math.random() * 600, 200 + Math.random() * 400);

  // 尝试使用 __INITIAL_STATE__（更稳定、更快）
  try {
    const feedsFromState = await extractSearchFeeds(page);
    if (feedsFromState && feedsFromState.length > 0) {
      logger.info(`✅ 使用 __INITIAL_STATE__ 抽取搜索结果 (${feedsFromState.length} 条)`);
      const limited = feedsFromState.slice(0, SAFETY_CONFIG.MAX_NOTES_PER_KEYWORD || 3);
      const notes: NoteInfo[] = [];

      for (let i = 0; i < limited.length; i++) {
        const feed = limited[i];
        const note = await collectByDetail(page, feed, { logger });
        if (note) notes.push(note);
        await randomDelay(SAFETY_CONFIG.DETAIL_READ_MIN, SAFETY_CONFIG.DETAIL_READ_MAX);
      }

      if (notes.length > 0) return notes;
      logger.warn('⚠️ __INITIAL_STATE__ 解析未得到有效详情，回退 DOM 方案');
    }
  } catch (err: any) {
    logger.warn(`⚠️ __INITIAL_STATE__ 解析失败，回退 DOM 方案: ${err?.message || err}`);
  }

  // 回退：保留原有 DOM 点击 + 弹窗采集流程
  return await collectByDom(page, keyword, logger);
}

function buildDetailUrl(feedId: string, xsecToken?: string) {
  if (!feedId) return '';
  if (xsecToken) return `https://www.xiaohongshu.com/explore/${feedId}?xsec_token=${xsecToken}&xsec_source=pc_feed`;
  return `https://www.xiaohongshu.com/explore/${feedId}`;
}

async function collectByDetail(page: Page, feed: XhsFeed, ctx: { logger: AgentLogger; keyword?: string }): Promise<NoteInfo | null> {
  const { logger, keyword = '' } = ctx;
  const feedId = feed.id;
  const xsecToken = feed.xsecToken;
  if (!feedId) return null;

  const titleHint = feed.noteCard?.displayTitle || `笔记${feedId.slice(-4)}`;
  const detailUrl = buildDetailUrl(feedId, xsecToken);

  try {
    logger.info(`👆 进入详情（state）：${titleHint.substring(0, 30)}...`);
    await page.goto(detailUrl, { waitUntil: 'networkidle2' });
    await randomDelay(SAFETY_CONFIG.PAGE_LOAD_WAIT_MIN, SAFETY_CONFIG.PAGE_LOAD_WAIT_MAX);

    const detail = await extractFeedDetail(page, feedId);
    if (!detail) {
      logger.warn('⚠️ state 详情为空，尝试 DOM fallback');
      return await collectFromDomDetail(page, feedId, { logger, keyword, titleHint, xsecToken });
    }

    const note = mapDetailToNote(detail, feed, keyword);
    if (note) return note;

    logger.warn('⚠️ state 详情映射失败，尝试 DOM fallback');
    return await collectFromDomDetail(page, feedId, { logger, keyword, titleHint, xsecToken });
  } catch (err: any) {
    logger.warn(`⚠️ 详情采集异常，回退 DOM: ${err?.message || err}`);
    return await collectFromDomDetail(page, feedId, { logger, keyword, titleHint, xsecToken });
  }
}

function mapDetailToNote(detail: XhsFeedDetailResponse, feed: XhsFeed, keyword: string): NoteInfo | null {
  const base = detail.note;
  if (!base?.noteId) return null;

  const title = base.title || feed.noteCard?.displayTitle || `笔记${base.noteId.slice(-4)}`;
  const fullContent = base.desc && base.desc.trim().length > 0 ? base.desc.trim() : `[图片笔记] ${title}`;
  const user = base.user || feed.noteCard?.user;

  const comments =
    (detail.comments?.list || [])
      .slice(0, 3)
      .map((c) => ({
        author: c.userInfo?.nickName || c.userInfo?.nickname || c.userInfo?.redId || '未知',
        content: (c.content || '').substring(0, 200),
        likes: c.likeCount || '0',
      })) || [];

  return {
    keyword: keyword || '[Search]',
    title,
    author: user?.nickName || user?.nickname || user?.redId || '未知作者',
    authorLink: user?.redId ? `https://www.xiaohongshu.com/user/profile/${user.redId}` : '',
    authorId: user?.userId,
    authorRedId: user?.redId,
    likes: base.interactInfo?.likedCount || feed.noteCard?.interactInfo?.likedCount || '0',
    link: `https://www.xiaohongshu.com/explore/${base.noteId}`,
    noteId: base.noteId,
    xsecToken: base.xsecToken || feed.xsecToken,
    content: fullContent.substring(0, CONTENT_SUMMARY_LENGTH),
    fullContent,
    tags: [], // __INITIAL_STATE__ 中暂无标签，保持空
    comments,
  };
}

async function collectFromDomDetail(
  page: Page,
  feedId: string,
  ctx: { logger: AgentLogger; keyword: string; titleHint: string; xsecToken?: string },
): Promise<NoteInfo | null> {
  const { logger, keyword, titleHint, xsecToken } = ctx;

  const detailUrl = buildDetailUrl(feedId, xsecToken);
  await page.goto(detailUrl, { waitUntil: 'networkidle2' });
  await randomDelay(1500, 2500);

  // 复用原 DOM 详情提取逻辑（弹窗版本改为整页选择器）
  const containerSelector = '.note-detail-mask, [class*="note-detail"], [class*="noteDetail"], .interaction-container';
  try {
    await page.waitForSelector(containerSelector, { timeout: 8000, visible: true });
  } catch {
    logger.warn('⚠️ DOM 详情未出现，跳过');
    return null;
  }

  const content = await page
    .evaluate((sel) => {
      const container = document.querySelector(sel);
      if (!container) return '';
      const descSelectors = ['#detail-desc', '.desc', '[class*="desc"]', '.note-text', '[class*="content"]'];
      for (const s of descSelectors) {
        const el = container.querySelector(s);
        if (el) {
          const t = el.textContent?.trim() || '';
          if (t.length > 20 && !t.includes('沪ICP备')) return t.substring(0, 2000);
        }
      }
      return '';
    }, containerSelector)
    .catch(() => '');

  const author = await page
    .evaluate((sel) => {
      const container = document.querySelector(sel);
      const el = container?.querySelector('.author-wrapper .name, .user-name, .nickname, [class*="author"] [class*="name"]');
      return el?.textContent?.trim() || '未知作者';
    }, containerSelector)
    .catch(() => '未知作者');

  const likes = await page
    .evaluate((sel) => {
      const container = document.querySelector(sel);
      const el = container?.querySelector('.like-wrapper .count, [class*="like"] .count, [class*="like-count"]');
      return el?.textContent?.trim() || '0';
    }, containerSelector)
    .catch(() => '0');

  const tags = await page
    .evaluate((sel) => {
      const container = document.querySelector(sel);
      const els = container?.querySelectorAll('a.tag, .hash-tag, a[href*="/search_result"]') || [];
      return Array.from(els)
        .map((el) => el.textContent?.trim() || '')
        .filter((t) => t.startsWith('#'))
        .slice(0, 5);
    }, containerSelector)
    .catch(() => []);

  const comments = await page
    .evaluate((sel) => {
      const container = document.querySelector(sel);
      if (!container) return [];
      const items = container.querySelectorAll('.comment-item, [class*="comment-item"]');
      const result: { author: string; content: string; likes: string }[] = [];
      items.forEach((item, idx) => {
        if (idx >= 3) return;
        const author = item.querySelector('.name, .nickname, [class*="name"]')?.textContent?.trim() || '';
        const content = item.querySelector('.content, .note-text, [class*="content"]')?.textContent?.trim() || '';
        const likes = item.querySelector('.like .count, [class*="like"] .count')?.textContent?.trim() || '0';
        if (author && content) {
          result.push({ author, content: content.substring(0, 100), likes });
        }
      });
      return result;
    }, containerSelector)
    .catch(() => []);

  const fullContent = content || `[图片笔记] ${titleHint}`;

  return {
    keyword: keyword || '[Search]',
    title: titleHint,
    author,
    authorLink: '',
    likes,
    link: `https://www.xiaohongshu.com/explore/${feedId}`,
    noteId: feedId,
    xsecToken,
    content: fullContent.substring(0, CONTENT_SUMMARY_LENGTH),
    fullContent,
    tags,
    comments,
  };
}

async function collectByDom(page: Page, keyword: string, logger: AgentLogger): Promise<NoteInfo[]> {
  const cardSelectors = [
    'section.note-item',
    '.note-item',
    'div[data-note-id]',
    '.feeds-page section',
    'a[href*="/explore/"]',
  ];

  let noteCards = await page.$$(cardSelectors.join(', '));
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

      const title = await card.$eval(
        '.title, .title span, a.title, [class*="title"]',
        el => el.textContent?.trim() || ''
      ).catch(() => `笔记${i + 1}`);

      let link = await card.$eval(
        'a[href*="/explore/"], a[href*="/discovery/"]',
        el => (el as HTMLAnchorElement).href
      ).catch(() => '');

      if (!link) {
        link = await card.evaluate((el) => {
          if (el.tagName === 'A') return (el as HTMLAnchorElement).href;
          const a = el.querySelector('a');
          return a ? a.href : '';
        }).catch(() => '');
      }

      if (!link) {
        logger.warn(`笔记 ${i + 1} 无链接，跳过`);
        continue;
      }

      const noteId = extractNoteId(link);
      if (!noteId) {
        logger.warn(`笔记 ${i + 1} 无法提取ID: ${link}`);
        continue;
      }

      await card.evaluate((el) => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      await delay(500);

      logger.info(`👆 [${i + 1}/${maxNotes}] 点击进入: ${title.substring(0, 25)}...`);
      try {
        await humanClick(page, card);
      } catch {
        const linkEl = await card.$('a[href*="/explore/"]');
        if (linkEl) {
          await linkEl.click();
        } else {
          await card.click();
        }
      }

      try {
        await page.waitForSelector('.note-detail-mask, [class*="note-detail"], [class*="noteDetail"]', {
          timeout: 8000,
          visible: true
        });
        logger.info('✅ 详情弹窗已打开');
      } catch {
        logger.warn('⚠️ 详情弹窗未出现，尝试继续...');
      }

      await delay(2000);

      const content = await page.evaluate(() => {
        const detailContainer = document.querySelector('.note-detail-mask') ||
          document.querySelector('[class*="note-detail"]') ||
          document.querySelector('[class*="noteDetail"]');

        if (!detailContainer) return '';

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
            if (text.length > 20 && !text.includes('沪ICP备') && !text.includes('营业执照')) {
              contentText = text;
              break;
            }
          }
        }

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

      let fullContent = content;
      if (!content || content.length < 20) {
        logger.info('📷 图片笔记，内容较少，将保存图片链接');
        fullContent = `[图片笔记] ${title}`;

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

      const author = await page.evaluate(() => {
        const container = document.querySelector('.note-detail-mask, [class*="note-detail"]');
        if (!container) return '未知作者';
        const authorEl = container.querySelector('.author-wrapper .name, .user-name, .nickname, [class*="author"] [class*="name"]');
        return authorEl?.textContent?.trim() || '未知作者';
      }).catch(() => '未知作者');

      const likes = await page.evaluate(() => {
        const container = document.querySelector('.note-detail-mask, [class*="note-detail"]');
        if (!container) return '0';
        const likeEl = container.querySelector('.like-wrapper .count, [class*="like"] .count, [class*="like-count"]');
        return likeEl?.textContent?.trim() || '0';
      }).catch(() => '0');

      const tags = await page.evaluate(() => {
        const container = document.querySelector('.note-detail-mask, [class*="note-detail"]');
        if (!container) return [];
        const tagEls = container.querySelectorAll('a.tag, .hash-tag, a[href*="/search_result"]');
        return Array.from(tagEls).map(el => el.textContent?.trim() || '').filter(t => t && t.startsWith('#')).slice(0, 5);
      }).catch(() => []);

      const comments = await page.evaluate(() => {
        const container = document.querySelector('.note-detail-mask, [class*="note-detail"]');
        if (!container) return [];
        const commentItems = container.querySelectorAll('.comment-item, [class*="comment-item"]');
        const result: { author: string; content: string; likes: string }[] = [];
        commentItems.forEach((item, idx) => {
          if (idx >= 3) return;
          const author = item.querySelector('.name, .nickname, [class*="name"]')?.textContent?.trim() || '';
          const content = item.querySelector('.content, .note-text, [class*="content"]')?.textContent?.trim() || '';
          const likes = item.querySelector('.like .count, [class*="like"] .count')?.textContent?.trim() || '0';
          if (author && content) {
            result.push({ author, content: content.substring(0, 100), likes });
          }
        });
        return result;
      }).catch(() => []);

      try {
        const hasNextBtn = await page.$('.note-detail-mask .swiper-button-next, [class*="note-detail"] .swiper-button-next');
        if (hasNextBtn) {
          const browseCount = 1 + Math.floor(Math.random() * 2);
          logger.info(`🖐️ 模拟翻看图片 (${browseCount} 张)...`);
          for (let k = 0; k < browseCount; k++) {
            await hasNextBtn.click();
            await delay(1500 + Math.random() * 1000);
          }
        }
      } catch {
        // ignore
      }

      if (Math.random() < 0.4) {
        try {
          const likeBtn = await page.$('.note-detail-mask .like-wrapper, [class*="note-detail"] .interact-container .like');
          if (likeBtn) {
            logger.info('👍 发现优质笔记，自动点赞...');
            await humanClick(page, likeBtn);
            await delay(500);
          }
        } catch {
          logger.warn('点赞失败，跳过');
        }
      }

      if (fullContent.length < OCR_CONFIG.MIN_CONTENT_LENGTH) {
        logger.info('👁️ 正文过短，尝试 OCR 识别图片...');

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
            } catch {
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

      await randomDelay(SAFETY_CONFIG.DETAIL_READ_MIN, SAFETY_CONFIG.DETAIL_READ_MAX);
      await page.keyboard.press('Escape');
      await delay(1000 + Math.random() * 1000);

    } catch (error) {
      logger.error('采集笔记失败:', error);
      await page.keyboard.press('Escape').catch(() => {});
      await delay(1000);
    }
  }

  return notes;
}
