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
