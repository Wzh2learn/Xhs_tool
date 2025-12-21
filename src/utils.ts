/**
 * 通用工具函数
 */
import { Page } from 'puppeteer';
import * as fs from 'fs';
import { SAFETY_CONFIG, COOKIES_PATH } from './config';
import { logger } from './logger';
import UserAgent from 'user-agents';

// === 延时函数 ===

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function randomDelay(min: number, max: number): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return delay(ms);
}

// === Stealth / 指纹伪装 ===

const VIEWPORT_PRESETS = [
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1536, height: 864 },
  { width: 1600, height: 900 },
  { width: 1920, height: 1080 },
];

function getRandomViewport() {
  const preset = VIEWPORT_PRESETS[Math.floor(Math.random() * VIEWPORT_PRESETS.length)];
  const jitter = () => Math.floor(Math.random() * 80) - 40; // ±40 抖动
  return {
    width: preset.width + jitter(),
    height: preset.height + jitter(),
  };
}

export async function applyStealthProfile(page: Page, opts?: { userAgent?: string; viewport?: { width: number; height: number } }): Promise<void> {
  const ua = opts?.userAgent || new UserAgent({ deviceCategory: 'desktop' }).toString();
  await page.setUserAgent(ua);

  const viewport = opts?.viewport || getRandomViewport();
  // puppeteer-extra 默认 newPage 会有 viewport，覆盖为随机桌面尺寸
  await page.setViewport(viewport);

  // 进一步隐藏 webdriver 特征
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    (window as any).chrome = { runtime: {} };
  });
}

/** 带超时的 Promise 包装器 */
export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))
  ]);
}

// === 拟人化操作 ===

/** 模拟人类鼠标移动 (贝塞尔曲线) */
export async function humanMouseMove(page: Page, targetX: number, targetY: number): Promise<void> {
  const mouse = page.mouse;
  
  const startX = 100 + Math.random() * 400;
  const startY = 100 + Math.random() * 300;
  
  const cp1X = startX + (targetX - startX) * 0.3 + (Math.random() - 0.5) * 100;
  const cp1Y = startY + (targetY - startY) * 0.3 + (Math.random() - 0.5) * 80;
  const cp2X = startX + (targetX - startX) * 0.7 + (Math.random() - 0.5) * 100;
  const cp2Y = startY + (targetY - startY) * 0.7 + (Math.random() - 0.5) * 80;
  
  const steps = 15 + Math.floor(Math.random() * 10);
  
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const t2 = t * t;
    const t3 = t2 * t;
    const mt = 1 - t;
    const mt2 = mt * mt;
    const mt3 = mt2 * mt;
    
    const x = mt3 * startX + 3 * mt2 * t * cp1X + 3 * mt * t2 * cp2X + t3 * targetX;
    const y = mt3 * startY + 3 * mt2 * t * cp1Y + 3 * mt * t2 * cp2Y + t3 * targetY;
    
    await mouse.move(x, y);
    await delay(10 + Math.random() * 20);
  }
}

/** 模拟人类点击 */
export async function humanClick(page: Page, element: { boundingBox: () => Promise<{ x: number; y: number; width: number; height: number } | null>; click: () => Promise<void> }): Promise<void> {
  try {
    const box = await element.boundingBox();
    if (!box) {
      await element.click();
      return;
    }
    
    const offsetX = (Math.random() - 0.5) * box.width * 0.6;
    const offsetY = (Math.random() - 0.5) * box.height * 0.6;
    const targetX = box.x + box.width / 2 + offsetX;
    const targetY = box.y + box.height / 2 + offsetY;
    
    await humanMouseMove(page, targetX, targetY);
    await delay(100 + Math.random() * 200);
    
    await page.mouse.down();
    await delay(50 + Math.random() * 100);
    await page.mouse.up();
    
  } catch {
    await element.click();
  }
}

/** 模拟人类打字 */
export async function humanType(page: Page, selector: string, text: string): Promise<void> {
  await page.click(selector);
  await delay(200 + Math.random() * 300);
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    
    let charDelay = SAFETY_CONFIG.TYPING_DELAY_MIN + 
                    Math.random() * (SAFETY_CONFIG.TYPING_DELAY_MAX - SAFETY_CONFIG.TYPING_DELAY_MIN);
    
    if (['。', '，', '！', '？', '.', ',', '!', '?'].includes(char)) {
      charDelay += 100 + Math.random() * 200;
    }
    
    if (Math.random() < 0.05) {
      await delay(500 + Math.random() * 800);
    }
    
    await page.keyboard.type(char);
    await delay(charDelay);
  }
}

/** 模拟人类滚动浏览 */
export async function humanScroll(page: Page): Promise<void> {
  logger.debug('[humanScroll] 模拟浏览行为...');

  const scrollTimes = SAFETY_CONFIG.SCROLL_TIMES_MIN + 
                      Math.floor(Math.random() * (SAFETY_CONFIG.SCROLL_TIMES_MAX - SAFETY_CONFIG.SCROLL_TIMES_MIN + 1));

  for (let i = 0; i < scrollTimes; i++) {
    const scrollDistance = 150 + Math.floor(Math.random() * 450);
    
    await page.evaluate((dist) => {
      window.scrollBy({ top: dist, behavior: 'smooth' });
    }, scrollDistance);

    if (Math.random() < 0.2 && i > 0) {
      await delay(500 + Math.random() * 500);
      const backScroll = 50 + Math.floor(Math.random() * 100);
      await page.evaluate((dist) => {
        window.scrollBy({ top: -dist, behavior: 'smooth' });
      }, backScroll);
    }

    await randomDelay(SAFETY_CONFIG.SCROLL_INTERVAL_MIN, SAFETY_CONFIG.SCROLL_INTERVAL_MAX);
  }

  if (Math.random() < 0.5) {
    await page.evaluate(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    await delay(800 + Math.random() * 500);
  }
}

// === Cookie 操作 ===

export async function loadCookies(page: Page): Promise<boolean> {
  if (!fs.existsSync(COOKIES_PATH)) {
    logger.warn('[loadCookies] Cookie 文件不存在，请先运行 login.ts');
    return false;
  }

  try {
    const cookiesData = fs.readFileSync(COOKIES_PATH, 'utf-8');
    if (!cookiesData.trim()) {
      logger.warn('[loadCookies] Cookie 文件为空');
      return false;
    }

    const cookies = JSON.parse(cookiesData);
    if (!Array.isArray(cookies) || cookies.length === 0) {
      logger.warn('[loadCookies] Cookie 数据格式不正确或为空数组');
      return false;
    }

    await page.setCookie(...cookies);
    logger.info(`[loadCookies] 已加载 ${cookies.length} 个 Cookie`);
    return true;
  } catch (err: any) {
    logger.error(`[loadCookies] Cookie 解析/加载失败: ${err?.message || err}`);
    return false;
  }
}

// === URL 工具 ===

export function makeSearchURL(keyword: string): string {
  const params = new URLSearchParams({
    keyword: keyword,
    source: 'web_explore_feed',
  });
  return `https://www.xiaohongshu.com/search_result?${params.toString()}`;
}

/** 从 URL 提取笔记 ID */
export function extractNoteId(url: string): string {
  if (!url) return '';
  
  const patterns = [
    /\/explore\/([a-f0-9]{24})/i,
    /\/discovery\/item\/([a-f0-9]{24})/i,
    /\/search_result\/([a-f0-9]{24})/i,
    /\/note\/([a-f0-9]{24})/i,
    /[?&]noteId=([a-f0-9]{24})/i,
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  const fallbackMatch = url.match(/\/([a-f0-9]{20,})/i);
  return fallbackMatch ? fallbackMatch[1] : '';
}

// === 选择器工具 ===

/** 尝试多个选择器，返回第一个匹配的 */
export async function trySelectors(page: Page, selectors: string[]): Promise<string | null> {
  for (const selector of selectors) {
    try {
      const element = await page.$(selector);
      if (element) {
        return selector;
      }
    } catch {
      continue;
    }
  }
  return null;
}
