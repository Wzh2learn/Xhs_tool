/**
 * 工具式入口：以单次命令调用 listFeeds / searchFeeds / getFeedDetail / userProfile
 * 运行方式：
 *   npx tsx tool.ts search '{"keyword":"推荐系统"}'
 */
import 'dotenv/config';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, Page } from 'puppeteer';
import {
  applyStealthProfile,
  loadCookies,
  extractFeedList,
  extractSearchFeeds,
  extractFeedDetail,
  extractUserProfile,
} from './src';

puppeteerExtra.use(StealthPlugin());

type Action = 'listFeeds' | 'searchFeeds' | 'getFeedDetail' | 'userProfile';

interface SearchParams {
  keyword: string;
}

interface DetailParams {
  feedId: string;
  xsecToken?: string;
}

interface ProfileParams {
  userId: string;
  xsecToken?: string;
}

async function withBrowser<T>(fn: (page: Page) => Promise<T>): Promise<T> {
  let browser: Browser | null = null;
  let page: Page | null = null;
  try {
    browser = await puppeteerExtra.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
    });
    page = await browser.newPage();
    await applyStealthProfile(page);
    const cookiesLoaded = await loadCookies(page);
    if (!cookiesLoaded) {
      throw new Error('Cookie 未加载，请先运行 login.ts');
    }
    return await fn(page);
  } finally {
    await page?.close().catch(() => {});
    await browser?.close().catch(() => {});
  }
}

async function run(action: Action, rawParams?: string) {
  const params = rawParams ? JSON.parse(rawParams) : {};

  switch (action) {
    case 'listFeeds':
      return await withBrowser(async (page) => {
        await page.goto('https://www.xiaohongshu.com/explore', { waitUntil: 'networkidle2' });
        const feeds = await extractFeedList(page);
        return feeds || [];
      });
    case 'searchFeeds':
      return await withBrowser(async (page) => {
        const { keyword } = params as SearchParams;
        if (!keyword) throw new Error('keyword is required');
        const searchUrl = `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword)}&source=web_explore_feed`;
        await page.goto(searchUrl, { waitUntil: 'networkidle2' });
        const feeds = await extractSearchFeeds(page);
        return feeds || [];
      });
    case 'getFeedDetail':
      return await withBrowser(async (page) => {
        const { feedId, xsecToken } = params as DetailParams;
        if (!feedId) throw new Error('feedId is required');
        const url = xsecToken
          ? `https://www.xiaohongshu.com/explore/${feedId}?xsec_token=${xsecToken}&xsec_source=pc_feed`
          : `https://www.xiaohongshu.com/explore/${feedId}`;
        await page.goto(url, { waitUntil: 'networkidle2' });
        const detail = await extractFeedDetail(page, feedId);
        if (!detail) throw new Error('feed detail not found');
        return detail;
      });
    case 'userProfile':
      return await withBrowser(async (page) => {
        const { userId, xsecToken } = params as ProfileParams;
        if (!userId) throw new Error('userId is required');
        const url = xsecToken
          ? `https://www.xiaohongshu.com/user/profile/${userId}?xsec_token=${xsecToken}&xsec_source=pc_note`
          : `https://www.xiaohongshu.com/user/profile/${userId}`;
        await page.goto(url, { waitUntil: 'networkidle2' });
        const profile = await extractUserProfile(page);
        if (!profile) throw new Error('user profile not found');
        return profile;
      });
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

async function main() {
  const action = process.argv[2] as Action;
  const rawParams = process.argv[3];

  if (!action) {
    console.error('Usage: npx tsx tool.ts <action> <paramsJSON>');
    process.exit(1);
  }

  try {
    const result = await run(action, rawParams);
    console.log(JSON.stringify({ success: true, action, result }, null, 2));
  } catch (err: any) {
    console.error(JSON.stringify({ success: false, action, error: err?.message || String(err) }));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ success: false, error: err?.message || String(err) }));
  process.exit(1);
});
