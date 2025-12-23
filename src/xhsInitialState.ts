/**
 * __INITIAL_STATE__ 解析工具（更稳的列表/详情抽取）
 * 只做解析，不做导航；调用方负责 page.goto 与登录态。
 */
import { Page } from 'puppeteer';

// 基础类型（来自 xiaohongshu-mcp Go 版的结构）
export interface XhsUser {
  userId?: string;
  nickName?: string;
  nickname?: string;
  avatar?: string;
  redId?: string;
}

export interface XhsInteractInfo {
  liked?: boolean;
  likedCount?: string;
  collected?: boolean;
  collectedCount?: string;
  sharedCount?: string;
  commentCount?: string;
}

export interface XhsCover {
  url?: string;
  urlDefault?: string;
  urlPre?: string;
  fileId?: string;
}

export interface XhsFeed {
  id: string;
  xsecToken?: string;
  modelType?: string;
  noteCard?: {
    type?: string;
    displayTitle?: string;
    user?: XhsUser;
    interactInfo?: XhsInteractInfo;
    cover?: XhsCover;
    video?: { url?: string };
  };
  index?: number;
}

export interface XhsComment {
  id?: string;
  noteId?: string;
  content?: string;
  likeCount?: string;
  createTime?: number;
  ipLocation?: string;
  userInfo?: XhsUser;
  subComments?: XhsComment[];
}

export interface XhsFeedDetail {
  noteId: string;
  xsecToken?: string;
  title?: string;
  desc?: string;
  type?: string;
  time?: number;
  ipLocation?: string;
  user?: XhsUser;
  interactInfo?: XhsInteractInfo;
  imageList?: Array<{ width?: number; height?: number; urlDefault?: string; urlPre?: string }>;
}

export interface XhsFeedDetailResponse {
  note: XhsFeedDetail;
  comments: {
    list: XhsComment[];
    cursor?: string;
    hasMore?: boolean;
  };
}

export interface XhsUserProfileResponse {
  userBasicInfo?: {
    gender?: number;
    ipLocation?: string;
    desc?: string;
    imageb?: string;
    nickname?: string;
    images?: string;
    redId?: string;
  };
  interactions?: Array<{ type?: string; name?: string; count?: string }>;
  feeds?: XhsFeed[];
}

function safeJSONParse<T>(raw: string): T | undefined {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

/**
 * 抽取首页推荐 feed 列表：window.__INITIAL_STATE__.feed.feeds
 */
export async function extractFeedList(page: Page): Promise<XhsFeed[] | undefined> {
  const raw = await page
    .evaluate(() => {
      // @ts-expect-error: page context
      const state = (window as any).__INITIAL_STATE__;
      const feeds = state?.feed?.feeds;
      const value = feeds?.value !== undefined ? feeds.value : feeds?._value;
      if (value) return JSON.stringify(value);
      return '';
    })
    .catch(() => '');
  return raw ? safeJSONParse<XhsFeed[]>(raw) : undefined;
}

/**
 * 抽取搜索结果 feed 列表：window.__INITIAL_STATE__.search.feeds
 */
export async function extractSearchFeeds(page: Page): Promise<XhsFeed[] | undefined> {
  const raw = await page
    .evaluate(() => {
      // @ts-expect-error: page context
      const state = (window as any).__INITIAL_STATE__;
      const feeds = state?.search?.feeds;
      const value = feeds?.value !== undefined ? feeds.value : feeds?._value;
      if (value) return JSON.stringify(value);
      return '';
    })
    .catch(() => '');
  return raw ? safeJSONParse<XhsFeed[]>(raw) : undefined;
}

/**
 * 抽取详情页：window.__INITIAL_STATE__.note.noteDetailMap[feedId]
 * 需要传入 feedId，避免 map 为空时返回错误数据。
 */
export async function extractFeedDetail(page: Page, feedId: string): Promise<XhsFeedDetailResponse | undefined> {
  if (!feedId) return undefined;
  const raw = await page
    .evaluate((id) => {
      // @ts-expect-error: page context
      const state = (window as any).__INITIAL_STATE__;
      const noteDetailMap = state?.note?.noteDetailMap;
      if (!noteDetailMap) return '';
      const json = JSON.stringify(noteDetailMap);
      return json || '';
    }, feedId)
    .catch(() => '');

  if (!raw) return undefined;
  const parsed = safeJSONParse<Record<string, { note: XhsFeedDetail; comments: { list: XhsComment[]; cursor?: string; hasMore?: boolean } }>>(raw);
  if (!parsed) return undefined;
  const entry = parsed[feedId];
  if (!entry?.note) return undefined;
  return { note: entry.note, comments: entry.comments || { list: [] } };
}

/**
 * 抽取用户主页：window.__INITIAL_STATE__.user.userPageData / user.notes
 */
export async function extractUserProfile(page: Page): Promise<XhsUserProfileResponse | undefined> {
  const [userRaw, notesRaw] = await Promise.all([
    page
      .evaluate(() => {
        // @ts-expect-error: page context
        const state = (window as any).__INITIAL_STATE__;
        const userPageData = state?.user?.userPageData;
        const value = userPageData?.value !== undefined ? userPageData.value : userPageData?._value;
        if (value) return JSON.stringify(value);
        return '';
      })
      .catch(() => ''),
    page
      .evaluate(() => {
        // @ts-expect-error: page context
        const state = (window as any).__INITIAL_STATE__;
        const notes = state?.user?.notes;
        const value = notes?.value !== undefined ? notes.value : notes?._value;
        if (value) return JSON.stringify(value);
        return '';
      })
      .catch(() => ''),
  ]);

  if (!userRaw || !notesRaw) return undefined;

  const profile = safeJSONParse<Pick<XhsUserProfileResponse, 'userBasicInfo' | 'interactions'>>(userRaw);
  const notes = safeJSONParse<XhsFeed[][]>(notesRaw);

  if (!profile) return undefined;
  const feeds: XhsFeed[] = [];
  if (Array.isArray(notes)) {
    for (const group of notes) {
      if (Array.isArray(group)) feeds.push(...group);
    }
  }

  return {
    userBasicInfo: profile.userBasicInfo,
    interactions: profile.interactions,
    feeds,
  };
}
