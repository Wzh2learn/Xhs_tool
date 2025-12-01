/**
 * XHS Intelligence Agent - 情报搜集系统 (Phase 2)
 * 
 * 🚀 v5.0 Ultimate Edition
 * - 👁️ OCR 图片识别 (tesseract.js)
 * - 🖐️ 拟人化看图 (模拟翻页)
 * - 🧠 AI 智能分析 (容错增强)
 * - 📚 全明星专家词库 + 智能混合轮询
 * - 增量写入 + 去重 (note_id)
 * 
 * 🛡️ 安全加固 (Anti-Detection):
 * - 贝塞尔曲线鼠标轨迹
 * - 变速打字 (80-200ms/字)
 * - 关键词间隔 90-180 秒
 * - 随机视口尺寸
 * - 隐藏 webdriver 特征
 */

import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Page, Browser } from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';
import Tesseract from 'tesseract.js';

// 启用 Stealth 插件 (防检测)
puppeteerExtra.use(StealthPlugin());

// ============================================================================
// CONFIGURATION - 配置
// ============================================================================

const PROJECT_ROOT = 'd:/AIlearn/xhs_automation';
const COOKIES_PATH = path.join(PROJECT_ROOT, 'xhs_cookies.json');
const REPORTS_DIR = path.join(PROJECT_ROOT, 'reports');
const DATA_DIR = path.join(PROJECT_ROOT, 'data');  // v4.0: AlgoQuest 数据目录

// ============================================================================
// v5.0 AI API 配置 (可自定义代理)
// ============================================================================
const AI_CONFIG = {
  API_BASE: process.env.AI_API_BASE || 'https://yinli.one/v1',
  API_KEY: process.env.AI_API_KEY || 'sk-6gGjX7JDr35E0TljC8SdNIWoYWpxgIWlUVmSaifLnAnMaa1C',
  MODEL: process.env.AI_MODEL || 'gemini-2.5-flash',  // flash 更快更稳
  TIMEOUT: 30000,  // 30秒超时
  RETRIES: 2,      // 重试次数
};

// OCR 配置
const OCR_CONFIG = {
  MIN_CONTENT_LENGTH: 50,  // 正文少于50字时触发 OCR
  MAX_IMAGES: 3,           // 最多识别前3张图
  LANG: 'chi_sim+eng',     // 中英文混合识别
};

// ============================================================================
// v5.0 全明星专家词库 (Expert Knowledge Base)
// ============================================================================
const KEYWORD_POOLS = {
  // 场景 A: 硬核技术 (搜/广/推/生成式)
  TECH_CORE: [
    // 推荐
    '推荐系统 召回', '双塔模型 负采样', '粗排 精排 策略', '重排 多样性', 
    'DeepFM 面试', 'MMoE 多目标', 'DIN 模型',
    // 搜索
    '搜索算法 面试', '倒排索引 优化', 'Query理解', '语义搜索', 'Elasticsearch 面试',
    // 广告
    '广告算法 策略', 'CTR预估 模型', 'OCPC 竞价', '广告召回', '流量分配',
    // 新趋势
    '生成式推荐', 'LLM 推荐系统'
  ],

  // 场景 B: 目标大厂 (覆盖 BAT、TMD 及独角兽)
  TARGET_COMPANIES: [
    '字节 算法实习', '美团 搜推面经', '阿里妈妈 面试', '腾讯 广告算法', 
    '百度 搜索算法', '快手 推荐算法', '小红书 算法实习', '滴滴 算法校招',
    '京东 推荐搜索', '拼多多 算法', '米哈游 算法', 'Shopee 算法'
  ],

  // 场景 C: 手撕代码 (高频算法题)
  CODING_CHALLENGE: [
    '算法岗 手撕', '推荐系统 代码题', 'LeetCode Hot100', 
    'Auc 计算 代码', 'IoU 计算 手撕', 'NMS 实现', 'K-Means 手写', 
    '二叉树 遍历', 'TopK 问题'
  ],

  // 场景 D: 前沿热点 (大模型/AIGC)
  HOT_TRENDS: [
    '大模型 面试', 'DeepSeek 部署', 'Gemini 应用', 'RAG 知识库', 
    'LangChain 实战', 'Transformer 源码', 'LoRA 微调', 
    'Prompt Engineering', '大模型 推理加速'
  ]
};

/**
 * v4.2 智能混合轮询 - 每次运行随机抽取 3 个关键词
 * 策略：1 技术 + 1 大厂 + 1 (手撕或热点)
 */
function getSmartMixKeywords(): string[] {
  const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
  
  // 1. 从 TECH_CORE 随机选 1 个
  const tech = pick(KEYWORD_POOLS.TECH_CORE);
  
  // 2. 从 TARGET_COMPANIES 随机选 1 个
  const company = pick(KEYWORD_POOLS.TARGET_COMPANIES);
  
  // 3. 从 CODING_CHALLENGE 和 HOT_TRENDS 混合池随机选 1 个
  const mixPool = [...KEYWORD_POOLS.CODING_CHALLENGE, ...KEYWORD_POOLS.HOT_TRENDS];
  const hotOrCode = pick(mixPool);
  
  return [tech, company, hotOrCode];
}

// 内容摘要长度
const CONTENT_SUMMARY_LENGTH = 500;

// 安全配置 (v4.1 Security Hardened - 模拟“慢用户”)
const SAFETY_CONFIG = {
  // 页面加载后等待 (毫秒) - 真人会看一下页面
  PAGE_LOAD_WAIT_MIN: 3000,
  PAGE_LOAD_WAIT_MAX: 6000,
  // 滚动间隔 (毫秒) - 模拟眉毛浏览
  SCROLL_INTERVAL_MIN: 1200,
  SCROLL_INTERVAL_MAX: 2500,
  // 滚动次数 (2-4次随机)
  SCROLL_TIMES_MIN: 2,
  SCROLL_TIMES_MAX: 4,
  // 详情页阅读时间 (毫秒) - 模拟认真阅读
  DETAIL_READ_MIN: 8000,
  DETAIL_READ_MAX: 15000,
  // 关键词间隔 (毫秒) - 90~180秒，真正的“慢用户”
  KEYWORD_INTERVAL_MIN: 90000,
  KEYWORD_INTERVAL_MAX: 180000,
  // 笔记间隔 (毫秒) - 每篇之间 8-15秒
  NOTE_INTERVAL_MIN: 8000,
  NOTE_INTERVAL_MAX: 15000,
  // 打字速度 (毫秒/字) - 模拟真人打字
  TYPING_DELAY_MIN: 80,
  TYPING_DELAY_MAX: 200,
};

// ============================================================================
// TYPES - 数据类型
// ============================================================================

// v4.0 新增：评论信息
interface CommentInfo {
  author: string;       // 评论者昵称
  content: string;      // 评论内容
  likes: string;        // 点赞数
}

interface NoteInfo {
  keyword: string;
  title: string;
  author: string;
  authorLink: string;   // v4.0: 作者主页链接
  likes: string;
  link: string;         // v4.1: 笔记链接
  noteId: string;       // v4.1: 笔记唯一ID (用于去重)
  // v3.0 新增：详情页内容
  content: string;      // 正文摘要 (前500字)
  fullContent: string;  // v4.1: 完整正文
  tags: string[];       // 标签列表
  // v4.0 新增：热门评论
  comments: CommentInfo[];  // Top 5 热评
}

// ============================================================================
// DOM SELECTORS - 容错性高的选择器 (纯视觉抓取)
// ============================================================================

// 登录状态检查选择器 - 精简版，避免误判
// 注意：不要用 img[src*="qr"]，因为搜索页也可能有二维码图片
const LOGIN_CHECK_SELECTORS = [
  '.login-container',        // 登录容器
  '.login-modal',            // 登录弹窗
  '.qrcode-login',           // 二维码登录区域
];

// 登录页 URL 特征
const LOGIN_URL_PATTERNS = [
  '/login',
  '/signin', 
];

// 详情页选择器 (小红书详情页通常是弹窗/侧边栏形式)
const DETAIL_SELECTORS = {
  // 正文内容 - 多种可能的选择器
  CONTENT: [
    '.note-content',                    // 笔记内容区
    '#detail-desc',                     // 详情描述
    '.content',                         // 通用内容
    '.desc',                            // 描述文本
    '[class*="noteDetail"] [class*="content"]',
    '[class*="note-detail"]',
    '.detail-content',
    'article',                          // 语义化文章
    '.text-content',
  ],
  // 标签
  TAGS: [
    'a.tag',
    '.hash-tag',
    'a[href*="/search_result"]',
    '[class*="tag"]',
  ],
  // 作者 - 详情页顶部
  AUTHOR: [
    '.author-wrapper .name',
    '.user-name',
    '.author .username',
    '.nickname',
    '[class*="author"] [class*="name"]',
  ],
  // 点赞数 - 底部互动栏
  LIKES: [
    '.like-wrapper .count',
    '.engage-bar-container .like .count',
    '[class*="like"] .count',
    '[class*="like-count"]',
  ],
  // 详情页容器 (用于判断是否弹窗打开)
  CONTAINER: [
    '.note-detail-mask',                // 弹窗遮罩
    '.note-container',                  // 笔记容器  
    '[class*="noteDetail"]',
    '.detail-container',
  ],
  // v4.0 新增：作者主页链接
  AUTHOR_LINK: [
    '.author-wrapper a[href*="/user/profile/"]',
    '.user-info a[href*="/user/"]',
    'a.author[href*="/user/"]',
    '[class*="author"] a[href*="/user/"]',
  ],
  // v4.0 新增：评论区选择器
  COMMENTS: {
    CONTAINER: [
      '.comments-container',
      '.comment-list',
      '[class*="comment-container"]',
      '[class*="comments"]',
    ],
    ITEM: [
      '.comment-item',
      '.comment-inner',
      '[class*="commentItem"]',
      '[class*="comment-item"]',
    ],
    AUTHOR: [
      '.comment-item .author-wrapper .name',
      '.comment-item .user-name',
      '.comment-item .nickname',
      '[class*="comment"] [class*="author"] [class*="name"]',
    ],
    CONTENT: [
      '.comment-item .content',
      '.comment-item .note-text',
      '[class*="comment"] [class*="content"]',
    ],
    LIKES: [
      '.comment-item .like .count',
      '.comment-item [class*="like"] .count',
    ],
  },
};

// 多套选择器备选，提高容错性
const NOTE_SELECTORS = {
  // 笔记卡片容器 (按优先级尝试)
  CARD_CONTAINERS: [
    'section.note-item',
    '.note-item',
    '.feed-card',
    '[data-note-id]',
    '.search-result-item',
  ],
  // 标题 (按优先级尝试)
  TITLE: [
    '.title span',
    '.title',
    '.note-title',
    'a.title',
    '[class*="title"]',
  ],
  // 作者 (按优先级尝试)
  AUTHOR: [
    '.author .name',
    '.user-name',
    '.nickname',
    '.author-name',
    '[class*="author"] [class*="name"]',
  ],
  // 点赞数 (按优先级尝试)
  LIKES: [
    '.like-wrapper .count',
    '.like .count',
    '.like-count',
    '[class*="like"] [class*="count"]',
    '.engagement .count',
  ],
  // 链接 (按优先级尝试)
  LINK: [
    'a[href*="/explore/"]',
    'a[href*="/discovery/"]',
    'a[href*="/search_result/"]',
    'a.cover',
    'a[href*="xiaohongshu"]',
  ],
};

// ============================================================================
// HELPER FUNCTIONS - 拟人化工具函数
// ============================================================================

/**
 * 固定延时
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 随机延时 (拟人化核心)
 */
function randomDelay(min: number, max: number): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return delay(ms);
}

/**
 * v4.1 安全加固：模拟人类鼠标移动轨迹
 * 使用贝塞尔曲线生成自然的移动路径
 */
async function humanMouseMove(page: Page, targetX: number, targetY: number): Promise<void> {
  const mouse = page.mouse;
  
  // 获取当前鼠标位置 (默认从随机位置开始)
  const startX = 100 + Math.random() * 400;
  const startY = 100 + Math.random() * 300;
  
  // 生成贝塞尔曲线控制点
  const cp1X = startX + (targetX - startX) * 0.3 + (Math.random() - 0.5) * 100;
  const cp1Y = startY + (targetY - startY) * 0.3 + (Math.random() - 0.5) * 80;
  const cp2X = startX + (targetX - startX) * 0.7 + (Math.random() - 0.5) * 100;
  const cp2Y = startY + (targetY - startY) * 0.7 + (Math.random() - 0.5) * 80;
  
  // 分 10-20 步移动
  const steps = 10 + Math.floor(Math.random() * 10);
  
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const t2 = t * t;
    const t3 = t2 * t;
    const mt = 1 - t;
    const mt2 = mt * mt;
    const mt3 = mt2 * mt;
    
    // 三次贝塞尔曲线公式
    const x = mt3 * startX + 3 * mt2 * t * cp1X + 3 * mt * t2 * cp2X + t3 * targetX;
    const y = mt3 * startY + 3 * mt2 * t * cp1Y + 3 * mt * t2 * cp2Y + t3 * targetY;
    
    await mouse.move(x, y);
    await delay(10 + Math.random() * 20); // 10-30ms 每步
  }
}

/**
 * v4.1 安全加固：模拟人类点击 (带鼠标移动 + 随机偏移)
 */
async function humanClick(page: Page, element: any): Promise<void> {
  try {
    // 获取元素位置
    const box = await element.boundingBox();
    if (!box) {
      await element.click();
      return;
    }
    
    // 点击位置加入随机偏移 (不总是点中心)
    const offsetX = (Math.random() - 0.5) * box.width * 0.6;
    const offsetY = (Math.random() - 0.5) * box.height * 0.6;
    const targetX = box.x + box.width / 2 + offsetX;
    const targetY = box.y + box.height / 2 + offsetY;
    
    // 移动鼠标
    await humanMouseMove(page, targetX, targetY);
    
    // 短暂停顿后点击 (真人不会立即点)
    await delay(100 + Math.random() * 200);
    
    // 点击 (随机按下时长)
    await page.mouse.down();
    await delay(50 + Math.random() * 100);
    await page.mouse.up();
    
  } catch {
    // 降级到普通点击
    await element.click();
  }
}

/**
 * v4.1 安全加固：模拟人类打字 (变速 + 偶尔停顿)
 */
async function humanType(page: Page, selector: string, text: string): Promise<void> {
  await page.click(selector);
  await delay(200 + Math.random() * 300);
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    
    // 基础延迟 + 随机波动
    let charDelay = SAFETY_CONFIG.TYPING_DELAY_MIN + 
                    Math.random() * (SAFETY_CONFIG.TYPING_DELAY_MAX - SAFETY_CONFIG.TYPING_DELAY_MIN);
    
    // 标点符号后稍微停顿
    if (['。', '，', '！', '？', '.', ',', '!', '?'].includes(char)) {
      charDelay += 100 + Math.random() * 200;
    }
    
    // 偶尔"思考"一下 (5% 概率)
    if (Math.random() < 0.05) {
      await delay(500 + Math.random() * 800);
    }
    
    await page.keyboard.type(char);
    await delay(charDelay);
  }
}

/**
 * v4.1: 从 URL 提取笔记 ID
 * 支持多种 URL 格式：
 * - https://www.xiaohongshu.com/explore/64f123abc
 * - https://www.xiaohongshu.com/discovery/item/64f123abc
 * - https://www.xiaohongshu.com/search_result/64f123abc
 */
function extractNoteId(url: string): string {
  if (!url) return '';
  
  // 匹配多种路径格式中的 ID (通常是 24 位十六进制)
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
  
  // 备用：尝试从 URL 末尾提取任意长度的 ID
  const fallbackMatch = url.match(/\/([a-f0-9]{20,})/i);
  return fallbackMatch ? fallbackMatch[1] : '';
}

/**
 * v4.1 安全加固：模拟人类滚动浏览 (随机次数 + 不规则距离)
 */
async function humanScroll(page: Page): Promise<void> {
  console.log('[humanScroll] 模拟浏览行为...');

  // 随机滚动次数
  const scrollTimes = SAFETY_CONFIG.SCROLL_TIMES_MIN + 
                      Math.floor(Math.random() * (SAFETY_CONFIG.SCROLL_TIMES_MAX - SAFETY_CONFIG.SCROLL_TIMES_MIN + 1));

  for (let i = 0; i < scrollTimes; i++) {
    // 随机滚动距离 (150-600px，更大范围)
    const scrollDistance = 150 + Math.floor(Math.random() * 450);
    
    await page.evaluate((dist) => {
      window.scrollBy({ top: dist, behavior: 'smooth' });
    }, scrollDistance);

    // 偶尔往回滚一点 (20% 概率，模拟真人"回看")
    if (Math.random() < 0.2 && i > 0) {
      await delay(500 + Math.random() * 500);
      const backScroll = 50 + Math.floor(Math.random() * 100);
      await page.evaluate((dist) => {
        window.scrollBy({ top: -dist, behavior: 'smooth' });
      }, backScroll);
    }

    // 随机等待 (间隔更长)
    await randomDelay(
      SAFETY_CONFIG.SCROLL_INTERVAL_MIN,
      SAFETY_CONFIG.SCROLL_INTERVAL_MAX
    );
  }

  // 50% 概率滚回顶部 (不总是回顶部)
  if (Math.random() < 0.5) {
    await page.evaluate(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    await delay(800 + Math.random() * 500);
  }
}

/**
 * 加载 Cookies
 */
async function loadCookies(page: Page): Promise<boolean> {
  if (!fs.existsSync(COOKIES_PATH)) {
    console.warn('[loadCookies] Cookie 文件不存在，请先运行 login.ts');
    return false;
  }

  const cookiesData = fs.readFileSync(COOKIES_PATH, 'utf-8');
  const cookies = JSON.parse(cookiesData);
  await page.setCookie(...cookies);
  console.log(`[loadCookies] 已加载 ${cookies.length} 个 Cookie`);
  return true;
}

/**
 * 构建搜索 URL
 */
function makeSearchURL(keyword: string): string {
  const params = new URLSearchParams({
    keyword: keyword,
    source: 'web_explore_feed',
  });
  return `https://www.xiaohongshu.com/search_result?${params.toString()}`;
}

// ============================================================================
// v5.0 OCR 图片识别 (The "Eye")
// ============================================================================

/**
 * 从图片 URL 提取文字 (OCR)
 */
async function extractTextFromImage(imageUrl: string): Promise<string> {
  try {
    console.log(`   👁️ [OCR] 识别图片: ${imageUrl.substring(0, 50)}...`);
    
    const result = await Tesseract.recognize(imageUrl, OCR_CONFIG.LANG, {
      logger: () => {} // 静默模式
    });
    
    const text = result.data.text.trim();
    if (text.length > 10) {
      console.log(`   👁️ [OCR] ✅ 识别到 ${text.length} 字`);
      return text;
    }
    return '';
  } catch (error: any) {
    console.log(`   👁️ [OCR] ⚠️ 识别失败: ${error.message || '未知错误'}`);
    return '';
  }
}

/**
 * v5.0: 从笔记图片中提取 OCR 内容
 */
async function extractOCRFromImages(page: Page): Promise<string> {
  console.log('   👁️ [OCR] 开始图片文字识别...');
  
  try {
    // 获取笔记中的图片 URL
    const imageUrls = await page.evaluate(() => {
      const images: string[] = [];
      
      // 尝试多种选择器
      const selectors = [
        '.note-slider img',
        '.carousel-image img',
        '.swiper-slide img',
        '[class*="image"] img',
        '.note-content img',
      ];
      
      for (const sel of selectors) {
        document.querySelectorAll(sel).forEach(img => {
          const src = (img as HTMLImageElement).src;
          if (src && src.startsWith('http') && !images.includes(src)) {
            images.push(src);
          }
        });
        if (images.length > 0) break;
      }
      
      return images;
    });
    
    if (imageUrls.length === 0) {
      console.log('   👁️ [OCR] 未找到可识别的图片');
      return '';
    }
    
    console.log(`   👁️ [OCR] 找到 ${imageUrls.length} 张图片，识别前 ${Math.min(imageUrls.length, OCR_CONFIG.MAX_IMAGES)} 张`);
    
    const ocrTexts: string[] = [];
    const imagesToProcess = imageUrls.slice(0, OCR_CONFIG.MAX_IMAGES);
    
    for (const url of imagesToProcess) {
      const text = await extractTextFromImage(url);
      if (text) {
        ocrTexts.push(text);
      }
    }
    
    if (ocrTexts.length > 0) {
      return '\n\n[OCR Content]\n' + ocrTexts.join('\n---\n');
    }
    
    return '';
  } catch (error: any) {
    console.log(`   👁️ [OCR] ⚠️ 批量识别失败: ${error.message || '未知错误'}`);
    return '';
  }
}

// ============================================================================
// v5.0 拟人化看图 (The "Hand")
// ============================================================================

/**
 * v5.0: 模拟真人翻看图片
 */
async function humanViewImages(page: Page): Promise<void> {
  console.log('   🖐️ [ViewImages] 模拟翻看图片...');
  
  try {
    // 图片轮播"下一张"按钮的可能选择器
    const nextButtonSelectors = [
      '.carousel-next',
      '.swiper-button-next',
      '[class*="next"]',
      '.image-viewer-next',
      '.note-slider-next',
      'button[aria-label="next"]',
      '.slider-arrow-right',
    ];
    
    let nextButton = null;
    for (const sel of nextButtonSelectors) {
      nextButton = await page.$(sel);
      if (nextButton) {
        console.log(`   🖐️ [ViewImages] 找到翻页按钮: ${sel}`);
        break;
      }
    }
    
    if (!nextButton) {
      // 尝试直接点击图片区域滑动
      const imageArea = await page.$('.note-slider, .carousel, .swiper-container, [class*="image"]');
      if (imageArea) {
        console.log('   🖐️ [ViewImages] 未找到按钮，尝试滑动图片区域');
        // 随机点击 1-2 次
        const clicks = 1 + Math.floor(Math.random() * 2);
        for (let i = 0; i < clicks; i++) {
          await imageArea.click();
          await delay(800 + Math.random() * 500);
        }
      }
      return;
    }
    
    // 随机点击 2-4 次 (模拟看多张图)
    const viewCount = 2 + Math.floor(Math.random() * 3);
    console.log(`   🖐️ [ViewImages] 将翻看 ${viewCount} 张图片`);
    
    for (let i = 0; i < viewCount; i++) {
      try {
        await nextButton.click();
        // 每张图看 1-2 秒
        const viewTime = 1000 + Math.random() * 1000;
        await delay(viewTime);
        console.log(`   🖐️ [ViewImages] 看第 ${i + 2} 张图 (${Math.round(viewTime/1000)}s)`);
      } catch {
        break; // 可能已经到最后一张
      }
    }
    
  } catch (error: any) {
    console.log(`   🖐️ [ViewImages] 翻图失败 (非致命): ${error.message || ''}`);
  }
}

// ============================================================================
// v5.0 AI 智能分析 (The "Brain") - 容错增强版
// ============================================================================

/**
 * 调用 AI API (带超时和重试，容错增强)
 */
async function callAI(prompt: string, systemPrompt?: string): Promise<string> {
  const messages = [
    ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
    { role: 'user', content: prompt }
  ];

  for (let attempt = 0; attempt <= AI_CONFIG.RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), AI_CONFIG.TIMEOUT);

      const response = await fetch(`${AI_CONFIG.API_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${AI_CONFIG.API_KEY}`
        },
        body: JSON.stringify({
          model: AI_CONFIG.MODEL,
          messages,
          stream: false,
          max_tokens: 1000,
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`API ${response.status}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || '';
    } catch (error: any) {
      const isLastAttempt = attempt === AI_CONFIG.RETRIES;
      if (isLastAttempt) {
        console.log(`   🧠 [AI] ⚠️ 调用失败: ${error.message || '网络错误'}`);
        return ''; // 返回空而不是抛异常
      }
      console.log(`   🧠 [AI] 重试 ${attempt + 1}/${AI_CONFIG.RETRIES}...`);
      await delay(2000);
    }
  }
  return '';
}

/**
 * v5.0: AI 生成智能报告 (容错版)
 */
async function generateAIReport(notes: NoteInfo[]): Promise<string> {
  if (notes.length === 0) {
    return '今日未采集到有效内容。';
  }

  console.log('[AI] 🧠 正在生成智能分析...');

  // 构建笔记摘要 (包含 OCR 内容)
  const noteSummaries = notes.slice(0, 6).map((n, i) => {
    let summary = `【${i + 1}】${n.title}\n`;
    summary += `内容: ${n.content.substring(0, 200)}`;
    // 如果有 OCR 内容，也包含进去
    if (n.fullContent && n.fullContent.includes('[OCR Content]')) {
      const ocrPart = n.fullContent.split('[OCR Content]')[1]?.substring(0, 200) || '';
      summary += `\n图片文字: ${ocrPart}`;
    }
    return summary;
  }).join('\n\n');

  const prompt = `分析以下 ${notes.length} 篇小红书面试笔记，生成简洁报告：

${noteSummaries}

请用 Markdown 格式输出：
1. **核心面试题** (提取2-3个具体问题)
2. **技术热点** (涉及的技术栈)
3. **复习建议** (1-2条)

控制在 200 字以内，直接输出内容。`;

  try {
    const report = await callAI(prompt);
    if (report) {
      console.log('[AI] 🧠 ✅ 分析完成');
      return report;
    }
  } catch (error: any) {
    console.log(`[AI] 🧠 ⚠️ 分析失败: ${error.message || '未知错误'}`);
  }

  // 失败兜底
  return `*[AI 分析待补充]*\n\n本次采集了 ${notes.length} 篇笔记，请人工查看 \`data/interview_questions.json\` 进行分析。`;
}

// 已读笔记标题集合 (用于去重)
const readNoteTitles = new Set<string>();

/**
 * 检查笔记是否已读 (去重)
 */
function isNoteAlreadyRead(title: string): boolean {
  const normalizedTitle = title.trim().toLowerCase();
  if (readNoteTitles.has(normalizedTitle)) {
    return true;
  }
  readNoteTitles.add(normalizedTitle);
  return false;
}

/**
 * 检查登录状态 (核心安全检查)
 */
async function checkLoginStatus(page: Page): Promise<{ isLoggedIn: boolean; reason?: string }> {
  const currentUrl = page.url();

  // 检查 1: URL 是否包含登录页特征
  for (const pattern of LOGIN_URL_PATTERNS) {
    if (currentUrl.includes(pattern)) {
      return { isLoggedIn: false, reason: `URL 包含登录特征: ${pattern}` };
    }
  }

  // 检查 2: 页面是否包含登录相关元素
  for (const selector of LOGIN_CHECK_SELECTORS) {
    try {
      const element = await page.$(selector);
      if (element) {
        // 检查元素是否可见
        const isVisible = await page.evaluate((el) => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        }, element);
        
        if (isVisible) {
          return { isLoggedIn: false, reason: `发现登录元素: ${selector}` };
        }
      }
    } catch {
      // 选择器无效，继续检查
    }
  }

  // 检查 3: 页面标题是否包含 "登录"
  try {
    const title = await page.title();
    if (title && title.includes('登录')) {
      return { isLoggedIn: false, reason: `页面标题包含"登录": ${title}` };
    }
  } catch {}

  return { isLoggedIn: true };
}

/**
 * 尝试多个选择器，返回第一个匹配的
 */
async function trySelectors(page: Page, selectors: string[]): Promise<string | null> {
  for (const selector of selectors) {
    try {
      const element = await page.$(selector);
      if (element) {
        return selector;
      }
    } catch {
      // 继续尝试下一个
    }
  }
  return null;
}

/**
 * 获取搜索结果中 Top 1 笔记的链接
 */
async function getTopNoteLink(page: Page): Promise<{ link: string; title: string } | null> {
  console.log('[getTopNoteLink] 查找 Top 1 笔记...');

  // 找到可用的卡片选择器
  const cardSelector = await trySelectors(page, NOTE_SELECTORS.CARD_CONTAINERS);
  if (!cardSelector) {
    console.warn('[getTopNoteLink] 未找到笔记卡片容器');
    return null;
  }

  // 获取第一个卡片的链接和标题
  const result = await page.evaluate((selector, linkSelectors, titleSelectors) => {
    const card = document.querySelector(selector);
    if (!card) return null;

    // 获取链接
    let link = '';
    for (const sel of linkSelectors) {
      const el = card.querySelector(sel) as HTMLAnchorElement;
      if (el && el.href) {
        link = el.href;
        break;
      }
    }

    // 获取标题
    let title = '';
    for (const sel of titleSelectors) {
      const el = card.querySelector(sel);
      if (el && el.textContent) {
        title = el.textContent.trim();
        break;
      }
    }

    return link ? { link, title } : null;
  }, cardSelector, NOTE_SELECTORS.LINK, NOTE_SELECTORS.TITLE);

  if (result) {
    console.log(`[getTopNoteLink] ✅ 找到: ${result.title.substring(0, 30)}...`);
  }
  return result;
}

/**
 * 从详情页提取完整内容 (Deep Reader 核心)
 * 支持两种模式：直接跳转页面 或 弹窗打开
 */
async function extractDetailContent(page: Page): Promise<{ content: string; tags: string[]; author: string; likes: string }> {
  console.log('[extractDetailContent] 📖 读取详情页内容...');

  // 等待内容加载 (详情页可能需要更长时间)
  await delay(3000);

  // 尝试用更通用的方式提取正文：直接获取页面主要文本
  let content = '';
  
  // 方案1：尝试具体选择器
  for (const selector of DETAIL_SELECTORS.CONTENT) {
    try {
      const element = await page.$(selector);
      if (element) {
        content = await page.evaluate(el => el.innerText || el.textContent || '', element);
        if (content.trim() && content.length > 20) {
          console.log(`[extractDetailContent] ✓ 选择器命中: ${selector}`);
          break;
        }
      }
    } catch {}
  }

  // 方案2：如果选择器失败，尝试通用提取
  if (!content || content.length < 20) {
    console.log('[extractDetailContent] 选择器未命中，尝试通用提取...');
    try {
      content = await page.evaluate(() => {
        // 尝试找包含大量文本的元素
        const candidates = document.querySelectorAll('div, article, section, p');
        let bestText = '';
        for (const el of candidates) {
          const text = el.innerText || '';
          // 找到文本最长且合理的元素
          if (text.length > bestText.length && text.length < 5000) {
            // 排除导航、侧边栏等
            const className = el.className || '';
            if (!className.includes('nav') && !className.includes('sidebar') && !className.includes('header')) {
              bestText = text;
            }
          }
        }
        return bestText;
      });
    } catch {}
  }

  // 提取标签 - 简化逻辑
  const tags: string[] = [];
  try {
    const allText = await page.evaluate(() => document.body.innerText || '');
    const hashTagMatches = allText.match(/#[\u4e00-\u9fa5a-zA-Z0-9]+/g);
    if (hashTagMatches) {
      tags.push(...hashTagMatches.slice(0, 5));
    }
  } catch {}

  // 提取作者
  let author = '';
  for (const selector of DETAIL_SELECTORS.AUTHOR) {
    try {
      const element = await page.$(selector);
      if (element) {
        author = await page.evaluate(el => el.textContent?.trim() || '', element);
        if (author && author.length < 30) break;
      }
    } catch {}
  }

  // 提取点赞数
  let likes = '0';
  for (const selector of DETAIL_SELECTORS.LIKES) {
    try {
      const element = await page.$(selector);
      if (element) {
        likes = await page.evaluate(el => el.textContent?.trim() || '0', element);
        if (likes && likes !== '0') break;
      }
    } catch {}
  }

  // 清理正文（去除多余空白）
  content = content.replace(/\s+/g, ' ').trim();

  console.log(`[extractDetailContent] 正文长度: ${content.length} 字`);
  console.log(`[extractDetailContent] 标签: ${tags.slice(0, 3).join(', ') || '(无)'}`);

  return { content, tags, author, likes };
}

/**
 * 获取搜索结果中前 N 个笔记的链接
 */
async function getTopNoteLinks(page: Page, count: number = 3): Promise<Array<{ link: string; title: string }>> {
  console.log(`[getTopNoteLinks] 查找 Top ${count} 笔记...`);

  const cardSelector = await trySelectors(page, NOTE_SELECTORS.CARD_CONTAINERS);
  if (!cardSelector) {
    console.warn('[getTopNoteLinks] 未找到笔记卡片容器');
    return [];
  }

  const results = await page.evaluate((selector, linkSelectors, titleSelectors, maxCount) => {
    const cards = document.querySelectorAll(selector);
    const notes: Array<{ link: string; title: string }> = [];

    for (let i = 0; i < Math.min(cards.length, maxCount); i++) {
      const card = cards[i];
      let link = '';
      let title = '';

      for (const sel of linkSelectors) {
        const el = card.querySelector(sel) as HTMLAnchorElement;
        if (el && el.href) {
          link = el.href;
          break;
        }
      }

      for (const sel of titleSelectors) {
        const el = card.querySelector(sel);
        if (el && el.textContent) {
          title = el.textContent.trim();
          break;
        }
      }

      if (link) {
        notes.push({ link, title: title || '(无标题)' });
      }
    }
    return notes;
  }, cardSelector, NOTE_SELECTORS.LINK, NOTE_SELECTORS.TITLE, count);

  console.log(`[getTopNoteLinks] 找到 ${results.length} 个链接`);
  return results;
}

/**
 * 从 Feed 流获取推荐笔记链接
 */
async function getFeedNoteLink(page: Page): Promise<{ link: string; title: string } | null> {
  console.log('[getFeedNote] 📱 从 Feed 流获取推荐...');

  // Feed 流的笔记选择器 (首页/explore)
  const feedSelectors = [
    'section.note-item',
    '.note-item',
    '.feeds-container .note-item',
    '[class*="feed"] section',
  ];

  const cardSelector = await trySelectors(page, feedSelectors);
  if (!cardSelector) {
    return null;
  }

  // 随机选择一个笔记 (前10个中随机)
  const result = await page.evaluate((selector, linkSelectors, titleSelectors) => {
    const cards = document.querySelectorAll(selector);
    if (cards.length === 0) return null;

    // 随机选一个 (前10个中)
    const randomIndex = Math.floor(Math.random() * Math.min(cards.length, 10));
    const card = cards[randomIndex];

    let link = '';
    let title = '';

    for (const sel of linkSelectors) {
      const el = card.querySelector(sel) as HTMLAnchorElement;
      if (el && el.href) {
        link = el.href;
        break;
      }
    }

    for (const sel of titleSelectors) {
      const el = card.querySelector(sel);
      if (el && el.textContent) {
        title = el.textContent.trim();
        break;
      }
    }

    return link ? { link, title: title || '(Feed推荐)' } : null;
  }, cardSelector, NOTE_SELECTORS.LINK, NOTE_SELECTORS.TITLE);

  if (result) {
    console.log(`[getFeedNote] ✅ 推荐: ${result.title.substring(0, 25)}...`);
  }
  return result;
}

/**
 * 检查卡片是否是视频 (视频没有正文，跳过)
 */
async function isVideoCard(page: Page, index: number): Promise<boolean> {
  const cardSelector = await trySelectors(page, NOTE_SELECTORS.CARD_CONTAINERS);
  if (!cardSelector) return false;

  try {
    const cards = await page.$$(cardSelector);
    if (index >= cards.length) return false;

    const card = cards[index];
    
    // 检查视频标识
    const isVideo = await card.evaluate(el => {
      // 视频卡片通常有播放图标或视频标签
      const hasPlayIcon = el.querySelector('[class*="play"]') !== null ||
                          el.querySelector('svg[class*="play"]') !== null ||
                          el.querySelector('.video-icon') !== null;
      const hasVideoTag = el.querySelector('[class*="video"]') !== null;
      const cardText = el.textContent || '';
      const hasVideoIndicator = cardText.includes('视频') || cardText.includes('播放');
      
      return hasPlayIcon || hasVideoTag || hasVideoIndicator;
    });

    return isVideo;
  } catch {
    return false;
  }
}

/**
 * 获取卡片标题 (用于去重检查)
 */
async function getCardTitle(page: Page, index: number): Promise<string> {
  const cardSelector = await trySelectors(page, NOTE_SELECTORS.CARD_CONTAINERS);
  if (!cardSelector) return '';

  try {
    const cards = await page.$$(cardSelector);
    if (index >= cards.length) return '';

    const card = cards[index];
    const title = await card.evaluate((el, titleSelectors) => {
      for (const sel of titleSelectors) {
        const titleEl = el.querySelector(sel);
        if (titleEl && titleEl.textContent) {
          return titleEl.textContent.trim();
        }
      }
      return '';
    }, NOTE_SELECTORS.TITLE);

    return title;
  } catch {
    return '';
  }
}

/**
 * 点击笔记卡片打开详情弹窗 (MCP 方式 - 避免触发验证码)
 */
async function clickNoteCard(page: Page, index: number): Promise<boolean> {
  const cardSelector = await trySelectors(page, NOTE_SELECTORS.CARD_CONTAINERS);
  if (!cardSelector) return false;

  try {
    // 重新获取卡片列表 (确保拿到最新的 DOM)
    const cards = await page.$$(cardSelector);
    if (index >= cards.length) {
      console.log(`   ⚠️ 卡片索引 ${index} 超出范围 (共 ${cards.length} 个)`);
      return false;
    }

    const card = cards[index];
    
    // 获取卡片的唯一标识 (用于验证)
    const cardText = await card.evaluate(el => el.textContent?.substring(0, 30) || '');
    
    // 先滚动到卡片位置
    await card.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    await delay(800);

    // 再次获取卡片确保位置正确 (DOM 可能已变化)
    const freshCards = await page.$$(cardSelector);
    const freshCard = freshCards[index];
    if (!freshCard) return false;

    // v4.1: 使用人类模拟点击 (带鼠标轨迹)
    await humanClick(page, freshCard);
    await randomDelay(2000, 3500); // 随机等待弹窗打开

    return true;
  } catch (error) {
    console.log(`   ⚠️ 点击卡片失败: ${error}`);
    return false;
  }
}

/**
 * 从详情弹窗提取内容 (小红书点击后是弹窗/侧边栏)
 * v4.0: 增加作者链接提取
 */
async function extractFromModal(page: Page): Promise<{ 
  content: string; 
  tags: string[]; 
  author: string; 
  authorLink: string;  // v4.0 新增
  likes: string; 
  title: string 
}> {
  // 等待弹窗加载
  await delay(2000);

  // 详情弹窗的选择器 (小红书点击后打开的弹窗)
  const modalSelectors = {
    container: [
      '.note-detail-mask',
      '[class*="note-detail"]',
      '.note-container',
      '.detail-wrapper',
    ],
    content: [
      '.note-content .note-text',
      '#detail-desc .note-text',
      '.note-text',
      '.desc',
      '[class*="content"]',
    ],
    title: [
      '.note-content .title',
      '#detail-title',
      '.title',
      'h1',
    ],
    author: [
      '.author-wrapper .username',
      '.user-info .name',
      '.username',
      '.author .name',
    ],
    authorLink: [
      '.author-wrapper a[href*="/user/profile/"]',
      '.user-info a[href*="/user/"]',
      'a.author[href*="/user/"]',
      '[class*="author"] a[href*="/user/"]',
      'a[href*="/user/profile/"]',
    ],
    likes: [
      '.engage-bar .like-wrapper .count',
      '.like-wrapper .count',
      '[class*="like"] .count',
    ],
  };

  // 提取内容
  const extractText = async (selectors: string[]): Promise<string> => {
    for (const sel of selectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          const text = await page.evaluate(e => e.innerText || e.textContent || '', el);
          if (text && text.trim().length > 0) {
            return text.trim();
          }
        }
      } catch {}
    }
    return '';
  };

  // v4.0: 提取链接
  const extractHref = async (selectors: string[]): Promise<string> => {
    for (const sel of selectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          const href = await page.evaluate(e => e.getAttribute('href') || '', el);
          if (href) {
            // 补全完整链接
            if (href.startsWith('/')) {
              return `https://www.xiaohongshu.com${href}`;
            }
            return href;
          }
        }
      } catch {}
    }
    return '';
  };

  const content = await extractText(modalSelectors.content);
  const title = await extractText(modalSelectors.title);
  const author = await extractText(modalSelectors.author);
  const authorLink = await extractHref(modalSelectors.authorLink);
  const likes = await extractText(modalSelectors.likes);

  // 提取标签
  const tags: string[] = [];
  try {
    const allText = await page.evaluate(() => document.body.innerText || '');
    const hashTags = allText.match(/#[\u4e00-\u9fa5a-zA-Z0-9]+/g);
    if (hashTags) {
      tags.push(...hashTags.slice(0, 5));
    }
  } catch {}

  return { content, tags, author, authorLink, likes, title };
}

/**
 * v4.0 新增：从详情弹窗提取热门评论
 * @param page Puppeteer Page
 * @param maxCount 最多提取几条评论
 * @returns 过滤后的有价值评论列表
 */
async function extractComments(page: Page, maxCount: number = 5): Promise<CommentInfo[]> {
  const comments: CommentInfo[] = [];
  
  // 无意义评论过滤词 (太短或常见水评)
  const meaninglessPatterns = [
    /^接$/,
    /^蹲$/,
    /^好$/,
    /^赞$/,
    /^mark$/i,
    /^m$/i,
    /^接好运/,
    /^加油/,
    /^厉害/,
    /^牛/,
    /^[.。，,！!？?]+$/,
    /^[0-9]+$/,
    /^[\u{1F300}-\u{1F9FF}]+$/u,  // 纯 emoji
  ];

  const isMeaningless = (text: string): boolean => {
    const trimmed = text.trim();
    if (trimmed.length <= 10) return true;  // 太短
    return meaninglessPatterns.some(p => p.test(trimmed));
  };

  try {
    // 尝试多种方式提取评论
    const commentData = await page.evaluate(() => {
      const results: { author: string; content: string; likes: string }[] = [];
      
      // 策略1: 直接查找评论容器
      const commentSelectors = [
        '.comment-item',
        '.parent-comment',
        '[class*="commentItem"]',
        '[class*="comment-item"]',
      ];
      
      for (const sel of commentSelectors) {
        const items = document.querySelectorAll(sel);
        if (items.length > 0) {
          items.forEach((item, idx) => {
            if (idx >= 10) return; // 最多取前10条
            
            // 提取评论者
            const authorEl = item.querySelector('.author-wrapper .name, .user-name, .nickname, [class*="name"]');
            const author = authorEl?.textContent?.trim() || '';
            
            // 提取内容
            const contentEl = item.querySelector('.content, .note-text, [class*="content"]');
            const content = contentEl?.textContent?.trim() || '';
            
            // 提取点赞
            const likesEl = item.querySelector('.like .count, [class*="like"] .count');
            const likes = likesEl?.textContent?.trim() || '0';
            
            if (content) {
              results.push({ author, content, likes });
            }
          });
          break;
        }
      }
      
      // 策略2: 从 __INITIAL_STATE__ 提取 (MCP 方式)
      if (results.length === 0) {
        try {
          const state = (window as any).__INITIAL_STATE__;
          if (state?.note?.noteDetailMap) {
            const noteId = Object.keys(state.note.noteDetailMap)[0];
            const noteData = state.note.noteDetailMap[noteId];
            if (noteData?.comments?.list) {
              noteData.comments.list.forEach((c: any, idx: number) => {
                if (idx >= 10) return;
                results.push({
                  author: c.userInfo?.nickname || c.userInfo?.nickName || '',
                  content: c.content || '',
                  likes: c.likeCount || '0',
                });
              });
            }
          }
        } catch {}
      }
      
      return results;
    });

    // 过滤无意义评论
    for (const c of commentData) {
      if (!isMeaningless(c.content) && comments.length < maxCount) {
        comments.push({
          author: c.author || '匿名用户',
          content: c.content,
          likes: c.likes,
        });
      }
    }
  } catch (err) {
    console.log(`   ⚠️ 评论提取失败: ${err}`);
  }

  return comments;
}

/**
 * v4.1 安全加固：模拟真人阅读弹窗内容
 * - 随机滚动距离和时机
 * - 偶尔回看
 * - 使用安全配置的阅读时间
 */
async function simulateReadingInModal(page: Page): Promise<void> {
  try {
    // 找到弹窗容器
    const scrollContainers = [
      '.note-detail-mask',
      '.note-container', 
      '[class*="note-detail"]',
      '.detail-wrapper',
      '.feeds-page',
    ];

    for (const selector of scrollContainers) {
      const container = await page.$(selector);
      if (container) {
        // 随机阅读时间 (使用安全配置)
        const readingTime = SAFETY_CONFIG.DETAIL_READ_MIN + 
                           Math.random() * (SAFETY_CONFIG.DETAIL_READ_MAX - SAFETY_CONFIG.DETAIL_READ_MIN);
        const startTime = Date.now();
        
        // 随机滚动次数 (3-6次)
        const scrollCount = 3 + Math.floor(Math.random() * 4);
        const scrollInterval = readingTime / scrollCount;
        
        for (let i = 0; i < scrollCount; i++) {
          // 随机滚动距离
          const scrollTo = 300 + i * 200 + Math.floor(Math.random() * 200);
          
          await container.evaluate((el, top) => {
            el.scrollTo({ top, behavior: 'smooth' });
          }, scrollTo);
          
          // 随机等待
          await delay(scrollInterval * (0.8 + Math.random() * 0.4));
          
          // 20% 概率回看
          if (Math.random() < 0.2 && i > 0) {
            const backTo = scrollTo - 100 - Math.floor(Math.random() * 150);
            await container.evaluate((el, top) => {
              el.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
            }, backTo);
            await delay(500 + Math.random() * 800);
          }
        }
        
        // 确保滚动到评论区
        await container.evaluate(el => {
          el.scrollTo({ top: 800, behavior: 'smooth' });
        });
        await delay(1000 + Math.random() * 500);
        
        break;
      }
    }
  } catch {
    // 降级到全局滚动
    await page.evaluate(() => {
      window.scrollBy({ top: 600, behavior: 'smooth' });
    });
    await delay(2000 + Math.random() * 1000);
    await page.evaluate(() => {
      window.scrollBy({ top: 300, behavior: 'smooth' });
    });
    await delay(1500);
  }
}

/**
 * 关闭详情弹窗并重置页面状态
 */
async function closeModal(page: Page): Promise<void> {
  try {
    // 方式1: 按 ESC 键 (多按几次确保关闭)
    await page.keyboard.press('Escape');
    await delay(300);
    await page.keyboard.press('Escape');
    await delay(500);

    // 方式2: 如果还有遮罩，点击关闭
    const closeSelectors = ['.close-circle', '.close-btn', '[class*="close"]'];
    for (const sel of closeSelectors) {
      try {
        const closeBtn = await page.$(sel);
        if (closeBtn) {
          await closeBtn.click();
          break;
        }
      } catch {}
    }
    
    // 等待弹窗完全关闭
    await delay(800);
    
    // 滚动页面回到顶部，重置视图状态
    await page.evaluate(() => {
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
    await delay(500);
  } catch {}
}

/**
 * 通过点击方式阅读笔记 (避免触发验证码)
 * v3.3: 增加视频过滤和去重
 */
async function readNoteByClick(page: Page, index: number, source: string, skipVideo: boolean = true): Promise<NoteInfo | null> {
  // 先检查是否是视频 (在点击前检查)
  if (skipVideo) {
    const isVideo = await isVideoCard(page, index);
    if (isVideo) {
      console.log(`   [${index + 1}] 🎬 是视频笔记，跳过`);
      return null;
    }
  }

  // 先检查是否已读 (去重)
  const cardTitle = await getCardTitle(page, index);
  if (cardTitle && isNoteAlreadyRead(cardTitle)) {
    console.log(`   [${index + 1}] 📄 "${cardTitle.substring(0, 20)}..." 已读，跳过`);
    return null;
  }

  console.log(`   [${index + 1}] 📖 点击卡片...`);

  // 点击打开详情
  const clicked = await clickNoteCard(page, index);
  if (!clicked) {
    console.log(`   ⚠️ 点击失败，跳过`);
    return null;
  }

  // 等待弹窗加载
  await randomDelay(2000, 3000);

  // 提取内容
  const detail = await extractFromModal(page);
  
  console.log(`   📝 标题: ${detail.title.substring(0, 30) || '(无)'}...`);
  console.log(`   📄 正文: ${detail.content.length} 字`);

  // 模拟真人阅读：滑动到评论区，触发评论懒加载
  console.log(`   👀 模拟阅读: 滑动看评论...`);
  await simulateReadingInModal(page);
  await randomDelay(2000, 3000);

  // v5.0: 模拟翻看图片 (The "Hand")
  await humanViewImages(page);
  await randomDelay(1000, 2000);

  // v5.0: 如果正文太短，触发 OCR (The "Eye")
  let finalContent = detail.content;
  if (detail.content.length < OCR_CONFIG.MIN_CONTENT_LENGTH) {
    console.log(`   👁️ 正文仅 ${detail.content.length} 字，触发 OCR 识别...`);
    const ocrContent = await extractOCRFromImages(page);
    if (ocrContent) {
      finalContent = detail.content + ocrContent;
      console.log(`   👁️ OCR 补充后共 ${finalContent.length} 字`);
    }
  }

  // v4.1: 从当前 URL 提取 note_id
  const currentUrl = page.url();
  const noteId = extractNoteId(currentUrl);
  const noteLink = noteId ? `https://www.xiaohongshu.com/explore/${noteId}` : '';
  
  // v4.0: 提取热门评论
  console.log(`   💬 提取热门评论...`);
  const comments = await extractComments(page, 5);
  if (comments.length > 0) {
    console.log(`   📝 获取 ${comments.length} 条有价值评论`);
  } else {
    console.log(`   📝 无热评`);
  }

  // 关闭弹窗
  await closeModal(page);
  await delay(1000);

  // v5.0: 放宽限制，即使正文短但有 OCR 内容也接受
  if (finalContent.length < 20) {
    console.log(`   ⚠️ 内容太短 (<20字) 且 OCR 无结果，跳过`);
    return null;
  }

  // 记录已读
  if (detail.title) {
    isNoteAlreadyRead(detail.title);
  }

  return {
    keyword: source,
    title: detail.title || '(无标题)',
    author: detail.author || '(未知)',
    authorLink: detail.authorLink || '',  // v4.0: 作者主页
    likes: detail.likes || '0',
    link: noteLink,                        // v4.1: 笔记链接
    noteId: noteId,                        // v4.1: 笔记ID (去重用)
    content: finalContent.substring(0, CONTENT_SUMMARY_LENGTH),
    fullContent: finalContent,             // v5.0: 完整正文 (含 OCR)
    tags: detail.tags,
    comments: comments,  // v4.0: 热评
  };
}

/**
 * 搜索关键词并通过点击方式阅读笔记 (v3.3 - 智能跳过视频和重复)
 */
async function searchAndDeepRead(page: Page, keyword: string): Promise<NoteInfo[]> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[Deep Reader] 🔍 关键词: "${keyword}"`);
  console.log('='.repeat(60));

  const collectedNotes: NoteInfo[] = [];

  // Step 1: 导航到搜索页
  console.log('[Step 1] 导航到搜索结果页...');
  const searchURL = makeSearchURL(keyword);
  await page.goto(searchURL, { waitUntil: 'networkidle2' });

  // Step 2: 拟人等待
  console.log('[Step 2] ⏳ 等待页面加载...');
  await randomDelay(SAFETY_CONFIG.PAGE_LOAD_WAIT_MIN, SAFETY_CONFIG.PAGE_LOAD_WAIT_MAX);

  // Step 3: 模拟浏览滚动
  await humanScroll(page);

  // Step 4: 随机选择 3 篇笔记 (避免重复)
  console.log('[Step 3] 📖 随机阅读 3 篇笔记 (跳过视频和重复)...');
  
  const targetNotes = 3;
  const maxTries = 12; // 最多尝试 12 个卡片
  const triedIndices = new Set<number>();

  while (collectedNotes.length < targetNotes && triedIndices.size < maxTries) {
    // 随机选择一个还没试过的卡片 (前 15 个中随机)
    let cardIndex;
    do {
      cardIndex = Math.floor(Math.random() * 15);
    } while (triedIndices.has(cardIndex) && triedIndices.size < 15);
    triedIndices.add(cardIndex);

    const noteInfo = await readNoteByClick(page, cardIndex, `搜索:${keyword}`);
    if (noteInfo) {
      collectedNotes.push(noteInfo);
      console.log(`   ✅ 获取第 ${collectedNotes.length} 篇`);
    }

    // 笔记之间短暂间隔
    if (collectedNotes.length < targetNotes && triedIndices.size < maxTries) {
      await randomDelay(1500, 3000);
    }
  }

  console.log(`\n[Step 4] ✅ 关键词 "${keyword}" 完成，获取 ${collectedNotes.length} 篇有效笔记`);
  return collectedNotes;
}

/**
 * 浏览 Feed 流并通过点击方式阅读推荐笔记 (v3.3 - 智能跳过视频)
 */
async function browseFeedAndRead(page: Page, count: number = 1): Promise<NoteInfo[]> {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`[Feed] 📱 刷 Feed 流，目标 ${count} 篇 (跳过视频)...`);
  console.log('─'.repeat(60));

  const collectedNotes: NoteInfo[] = [];

  // 导航到首页 Feed
  await page.goto('https://www.xiaohongshu.com/explore', { waitUntil: 'networkidle2' });
  await randomDelay(SAFETY_CONFIG.PAGE_LOAD_WAIT_MIN, SAFETY_CONFIG.PAGE_LOAD_WAIT_MAX);

  // 模拟滚动浏览 Feed
  await humanScroll(page);

  const maxTries = count * 3; // 尝试 3 倍数量以应对跳过
  let tries = 0;
  let lastIndex = -1;

  while (collectedNotes.length < count && tries < maxTries) {
    // 随机选择一个卡片索引 (避免重复选同一个)
    let randomIndex;
    do {
      randomIndex = Math.floor(Math.random() * 10);
    } while (randomIndex === lastIndex && tries < 3);
    lastIndex = randomIndex;
    
    console.log(`   [Feed 尝试${tries + 1}] 点击第 ${randomIndex + 1} 个卡片...`);
    const noteInfo = await readNoteByClick(page, randomIndex, 'Feed推荐');
    
    if (noteInfo) {
      collectedNotes.push(noteInfo);
      console.log(`   ✅ Feed 获取第 ${collectedNotes.length} 篇`);
    }
    tries++;

    // 如果还需要更多，滚动刷新
    if (collectedNotes.length < count && tries < maxTries) {
      await humanScroll(page);
      await randomDelay(1500, 3000);
    }
  }

  console.log(`[Feed] ✅ Feed 阅读完成，获取 ${collectedNotes.length} 篇`);
  return collectedNotes;
}

/**
 * 生成增强版日报 Markdown (v4.0 - 包含正文摘要 + 热评)
 */
function generateDailyReport(allNotes: NoteInfo[]): string {
  const today = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  let report = `# 📅 ${today} 搜广推情报日报\n\n`;
  report += `> 🕐 生成时间: ${new Date().toLocaleTimeString('zh-CN')}\n`;
  report += `> 🚀 v5.0 Ultimate Edition - OCR + 看图 + AI 分析\n`;
  report += `> 📊 共收录 ${allNotes.length} 篇笔记\n\n`;
  report += `---\n\n`;

  for (const note of allNotes) {
    report += `## 🔥 关键词: ${note.keyword}\n\n`;
    report += `### 📌 ${note.title}\n\n`;
    
    report += `| 项目 | 信息 |\n`;
    report += `|------|------|\n`;
    
    // v4.0: 作者名变成可点击链接
    if (note.authorLink) {
      report += `| 👤 作者 | [${note.author}](${note.authorLink}) |\n`;
    } else {
      report += `| 👤 作者 | ${note.author} |\n`;
    }
    report += `| 👍 点赞 | ${note.likes} |\n`;
    
    if (note.tags.length > 0) {
      report += `| 🏷️ 标签 | ${note.tags.join(' ')} |\n`;
    }
    report += `\n`;

    // 正文摘要 (核心情报)
    if (note.content) {
      report += `#### 📝 内容摘要\n\n`;
      report += `> ${note.content.replace(/\n/g, '\n> ')}\n\n`;
    }

    // v4.0 新增: 社区热议板块
    report += `#### 💬 社区热议 (Hot Comments)\n\n`;
    if (note.comments && note.comments.length > 0) {
      for (const comment of note.comments) {
        const likesInfo = comment.likes !== '0' ? ` (👍${comment.likes})` : '';
        report += `- **${comment.author}**${likesInfo}: ${comment.content}\n`;
      }
      report += `\n`;
    } else {
      report += `_暂无热评_\n\n`;
    }

    // 拆解建议
    report += `#### 💡 拆解角度\n\n`;
    report += `_结合评论区追问，思考: 大家最关心的细节是什么？可以针对性解答。_\n\n`;
    
    report += `---\n\n`;
  }

  report += `## 🎯 今日行动建议\n\n`;
  report += `1. **精读正文**: 仔细阅读内容摘要，提取核心知识点\n`;
  report += `2. **关注热评**: 评论区的追问往往是高价值的面试考点！\n`;
  report += `3. **拆题输出**: 用"实习生拆题"模板，针对评论区问题展开\n`;
  report += `4. **发布**: 运行 \`npx tsx publisher.ts\` 发布你的拆解\n\n`;
  report += `---\n`;
  report += `_Generated by XHS Intelligence Agent v5.0 (Ultimate Edition)_\n`;

  return report;
}

// ============================================================================
// AlgoQuest 生态联动 - JSON 数据导出 (v5.0 Ultimate Edition)
// ============================================================================

/**
 * v4.1: AlgoQuest 数据结构 (标准化 Schema)
 */
interface QuestionItem {
  id: string;              // 核心! 笔记唯一ID (用于去重)
  title: string;
  link: string;            // 笔记原链接
  tags: string[];
  summary: string;         // 简短摘要 (300字)
  full_text: string;       // 完整正文
  hot_comments: string[];  // 社区热评
  source_author: string;
  crawled_at: string;      // ISO Date
  status: 'pending' | 'imported';  // 处理状态
}

/**
 * v4.1: 将 NoteInfo 转换为 QuestionItem
 */
function noteToQuestionItem(note: NoteInfo): QuestionItem | null {
  // 必须有有效的 noteId
  if (!note.noteId) {
    return null;
  }
  
  // 过滤掉非面试相关内容
  const isRelevant = note.keyword.includes('搜索') || 
                     note.keyword.includes('算法') || 
                     note.keyword.includes('推荐') ||
                     note.keyword.includes('广告') ||
                     note.keyword.includes('面') ||
                     note.title.includes('面经') ||
                     note.title.includes('算法') ||
                     note.title.includes('实习');
  
  if (!isRelevant || note.fullContent.length < 50) {
    return null;
  }
  
  // 提取标签 (去掉 # 前缀)
  const cleanTags = note.tags.map(t => t.replace(/^#/, ''));
  
  // 提取评论中的追问 (过滤掉太短的)
  const hotComments = note.comments
    .filter(c => c.content.length > 15)
    .map(c => c.content)
    .slice(0, 5);
  
  return {
    id: note.noteId,
    title: note.title,
    link: note.link,
    tags: cleanTags.length > 0 ? cleanTags : ['搜广推', '面试'],
    summary: note.fullContent.substring(0, 300),
    full_text: note.fullContent,
    hot_comments: hotComments,
    source_author: note.author,
    crawled_at: new Date().toISOString().split('T')[0],
    status: 'pending',
  };
}

/**
 * v4.1 核心: 增量保存到数据库 (去重逻辑)
 * 
 * 规则：
 * 1. 先读取现有数据文件
 * 2. 使用 note_id 作为唯一键进行去重
 * 3. 只追加新数据，不覆盖已存在的记录
 * 4. 保留用户可能手动修改的 status 字段
 */
function saveToDatabase(allNotes: NoteInfo[], dbPath: string): { 
  total: number; 
  newCount: number; 
  skipped: number 
} {
  // Step 1: 读取现有数据
  let existingData: QuestionItem[] = [];
  if (fs.existsSync(dbPath)) {
    try {
      const content = fs.readFileSync(dbPath, 'utf-8');
      existingData = JSON.parse(content);
      console.log(`   📂 读取现有数据: ${existingData.length} 条`);
    } catch (err) {
      console.log(`   ⚠️ 读取现有数据失败，将创建新文件`);
      existingData = [];
    }
  }
  
  // Step 2: 构建已存在 ID 的 Set (O(1) 查找)
  const existingIds = new Set(existingData.map(item => item.id));
  
  // Step 3: 转换并去重
  let newCount = 0;
  let skipped = 0;
  
  for (const note of allNotes) {
    const item = noteToQuestionItem(note);
    
    if (!item) {
      continue; // 无效数据，跳过
    }
    
    if (existingIds.has(item.id)) {
      skipped++;
      console.log(`   ⏭️ 跳过已存在: ${item.title.substring(0, 20)}... (${item.id.substring(0, 8)})`);
      continue;
    }
    
    // 新数据，追加
    existingData.push(item);
    existingIds.add(item.id);
    newCount++;
    console.log(`   ✅ 新增: ${item.title.substring(0, 20)}... (${item.id.substring(0, 8)})`);
  }
  
  // Step 4: 保存
  fs.writeFileSync(dbPath, JSON.stringify(existingData, null, 2), 'utf-8');
  
  return {
    total: existingData.length,
    newCount,
    skipped,
  };
}

// ============================================================================
// MAIN - 主程序 (v5.0 Ultimate Edition)
// ============================================================================

async function main(): Promise<void> {
  console.log('╔════════════════════════════════════════╗');
  console.log('║  XHS Intelligence - 情报搜集系统       ║');
  console.log('║  🚀 v5.0 Ultimate Edition              ║');
  console.log('║  👁️ OCR + 🖐️ 看图 + 🧠 AI 分析        ║');
  console.log('╚════════════════════════════════════════╝');
  console.log();

  let browser: Browser | null = null;

  try {
    // Step 1: 启动浏览器 (v4.1 安全加固)
    console.log('[main] Step 1: 启动浏览器...');
    
    // 随机视口尺寸 (模拟不同显示器)
    const viewportWidth = 1280 + Math.floor(Math.random() * 200) - 100;  // 1180-1380
    const viewportHeight = 800 + Math.floor(Math.random() * 200) - 100;  // 700-900
    
    browser = await puppeteerExtra.launch({
      headless: false,
      defaultViewport: { width: viewportWidth, height: viewportHeight },
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--window-position=100,100',
        `--window-size=${viewportWidth + 20},${viewportHeight + 150}`,
        '--lang=zh-CN',
      ],
    });

    const page = await browser.newPage();

    // v4.1: 隐藏 webdriver 特征
    await page.evaluateOnNewDocument(() => {
      // 隐藏 navigator.webdriver
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      
      // 添加 Chrome 对象
      (window as any).chrome = { runtime: {} };
      
      // 隐藏 Puppeteer 特征
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters: any) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission } as PermissionStatus) :
          originalQuery(parameters)
      );
    });

    // 设置更真实的 User-Agent
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    
    // 设置语言和时区
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
    });

    // Step 2: 加载 Cookie
    console.log('[main] Step 2: 加载 Cookie...');
    const cookieLoaded = await loadCookies(page);
    if (!cookieLoaded) {
      throw new Error('请先运行 login.ts 获取 Cookie');
    }

    // Step 3: 先访问首页 (模拟正常用户行为 + 登录状态预检查)
    console.log('[main] Step 3: 访问首页热身...');
    await page.goto('https://www.xiaohongshu.com/explore', { waitUntil: 'networkidle2' });
    await randomDelay(2000, 4000);

    // 预检查登录状态 (早期发现问题)
    console.log('[main] 🔐 预检查登录状态...');
    const preCheck = await checkLoginStatus(page);
    if (!preCheck.isLoggedIn) {
      console.error();
      console.error('╔════════════════════════════════════════╗');
      console.error('║   ❌ Cookie 已失效！                     ║');
      console.error('╚════════════════════════════════════════╝');
      console.error();
      console.error(`   原因: ${preCheck.reason}`);
      console.error();
      console.error('   👉 请运行: npx tsx login.ts');
      console.error();
      throw new Error('COOKIE_EXPIRED: 请重新登录');
    }
    console.log('[main] ✅ 登录状态正常，开始搜集情报...');
    console.log();

    // Step 4: v4.2 智能混合轮询 - 从专家词库随机抽取
    console.log('[main] Step 4: 智能混合轮询 (Smart Mix Rotation)...');
    const keywords = getSmartMixKeywords();
    console.log('[main] 📋 本次关键词组合:');
    console.log(`   🔧 技术: ${keywords[0]}`);
    console.log(`   🏢 大厂: ${keywords[1]}`);
    console.log(`   🔥 热点: ${keywords[2]}`);
    console.log();

    // Step 5: 真人模式搜集
    console.log('[main] Step 5: 开始真人模式搜集...');
    console.log(`[main] 流程: 3个关键词 × 随机3篇 → 最后刷1篇Feed`);

    const allNotes: NoteInfo[] = [];

    // ===== Part A: 依次搜索各关键词 =====
    for (let i = 0; i < keywords.length; i++) {
      const keyword = keywords[i];

      try {
        const searchNotes = await searchAndDeepRead(page, keyword);
        allNotes.push(...searchNotes);
      } catch (error) {
        console.error(`[main] ❌ 搜索 "${keyword}" 失败:`, error);
      }

      // v4.1: 使用安全配置的关键词间隔 (90-180秒)
      if (i < keywords.length - 1) {
        const waitTime = SAFETY_CONFIG.KEYWORD_INTERVAL_MIN + 
                         Math.floor(Math.random() * (SAFETY_CONFIG.KEYWORD_INTERVAL_MAX - SAFETY_CONFIG.KEYWORD_INTERVAL_MIN));
        const waitSeconds = Math.ceil(waitTime / 1000);
        console.log();
        console.log(`[main] ☕ 切换到下一个关键词，休息 ${waitSeconds}s (模拟慢用户)...`);
        
        const startWait = Date.now();
        while (Date.now() - startWait < waitTime) {
          const remaining = Math.ceil((waitTime - (Date.now() - startWait)) / 1000);
          process.stdout.write(`\r   ⏳ 剩余: ${remaining}s   `);
          await delay(1000);
        }
        console.log();
      }
    }

    // ===== Part B: 最后刷 Feed 看 1 篇推荐 =====
    console.log('\n[main] 📱 搜索完毕，切换到 Feed 流...');
    await randomDelay(3000, 5000);
    
    try {
      const feedNotes = await browseFeedAndRead(page, 1);
      allNotes.push(...feedNotes);
    } catch (error) {
      console.error(`[main] ❌ Feed 阅读失败:`, error);
    }

    console.log(`\n[main] 📊 共阅读 ${allNotes.length} 篇有效笔记`);

    // Step 6: 生成日报
    console.log('[main] Step 6: 生成情报日报...');

    // 确保 reports 目录存在
    if (!fs.existsSync(REPORTS_DIR)) {
      fs.mkdirSync(REPORTS_DIR, { recursive: true });
    }

    // 生成基础报告
    let report = generateDailyReport(allNotes);
    
    // v5.0: AI 智能分析 (The "Brain")
    console.log('[main] Step 6b: AI 智能分析...');
    const aiSummary = await generateAIReport(allNotes);
    report += '\n\n---\n\n## 🧠 AI 智能分析\n\n' + aiSummary;

    const reportFileName = `daily_trends_${new Date().toISOString().split('T')[0]}.md`;
    const reportPath = path.join(REPORTS_DIR, reportFileName);

    fs.writeFileSync(reportPath, report, 'utf-8');

    // 同时保存到固定文件名
    const latestPath = path.join(REPORTS_DIR, 'daily_trends.md');
    fs.writeFileSync(latestPath, report, 'utf-8');

    // Step 7: 增量保存到 AlgoQuest 数据库
    console.log('[main] Step 7: 保存到 AlgoQuest 数据库 (增量去重)...');
    
    // 确保 data 目录存在
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    
    // 使用 saveToDatabase 进行增量写入
    const dbPath = path.join(DATA_DIR, 'interview_questions.json');
    const saveResult = saveToDatabase(allNotes, dbPath);

    console.log();
    console.log('╔════════════════════════════════════════╗');
    console.log('║   ✅ v5.0 情报搜集完成！               ║');
    console.log('╚════════════════════════════════════════╝');
    console.log();
    console.log(`  📊 共阅读: ${allNotes.length} 篇有效笔记`);
    console.log(`  👁️ OCR 图片识别已启用`);
    console.log(`  🧠 AI 智能分析已生成`);
    console.log(`  📁 日报: ${reportPath}`);
    console.log();
    console.log(`  🎯 AlgoQuest 数据库更新:`);
    console.log(`     - 新增: ${saveResult.newCount} 道题`);
    console.log(`     - 跳过 (已存在): ${saveResult.skipped} 道`);
    console.log(`     - 总计: ${saveResult.total} 道题`);
    console.log(`     - 路径: ${dbPath}`);
    console.log();
    console.log('  🚀 v5.0 Ultimate: Eye + Hand + Brain 全开');
    console.log('  💡 数据库使用 note_id 去重，可放心重复运行！');

  } catch (error) {
    console.error();
    console.error('╔════════════════════════════════════════╗');
    console.error('║       ❌ 情报搜集失败！                ║');
    console.error('╚════════════════════════════════════════╝');
    console.error('错误信息:', error);
    throw error;

  } finally {
    if (browser) {
      console.log();
      console.log('[main] 浏览器将在 3 秒后关闭...');
      await delay(3000);
      await browser.close();
    }
  }
}

// 运行
main().catch(console.error);
