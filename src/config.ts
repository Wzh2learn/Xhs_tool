/**
 * 项目配置常量
 */
import * as path from 'path';
import * as fs from 'fs';

// === 项目路径 (动态获取) ===
// 优先使用环境变量，否则使用当前工作目录
export const PROJECT_ROOT = process.env.PROJECT_ROOT || process.cwd();
export const COOKIES_PATH = path.join(PROJECT_ROOT, 'xhs_cookies.json');
export const REPORTS_DIR = path.join(PROJECT_ROOT, 'reports');
export const DATA_DIR = path.join(PROJECT_ROOT, 'data');
export const DRAFTS_DIR = path.join(PROJECT_ROOT, 'content/drafts');
export const PUBLISHED_DIR = path.join(PROJECT_ROOT, 'content/published');

// 确保必要目录存在
[REPORTS_DIR, DATA_DIR, DRAFTS_DIR, PUBLISHED_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// === AI API 配置 (DeepSeek) ===
export const AI_CONFIG = {
  API_BASE: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
  API_KEY: process.env.DEEPSEEK_API_KEY || '',
  MODEL: process.env.DEEPSEEK_MODEL || 'deepseek-reasoner',
  TIMEOUT: 60000,  // reasoner 模型可能需要更长时间
  RETRIES: 2,
  get isConfigured(): boolean {
    return !!this.API_KEY;
  }
};

// === OCR 配置 ===
export const OCR_CONFIG = {
  MIN_CONTENT_LENGTH: 50,
  MAX_IMAGES: 3,
  LANG: 'chi_sim+eng',
  TIMEOUT: 10000,
};

// === 安全配置 (模拟真实用户行为) ===
// 核心原则：像真人一样操作，不要太快也不要太慢
export const SAFETY_CONFIG = {
  // 页面加载等待 (2-4秒，模拟真人等待加载)
  PAGE_LOAD_WAIT_MIN: 2000,
  PAGE_LOAD_WAIT_MAX: 4000,
  
  // 滚动行为 (0.8-2秒一次，模拟阅读)
  SCROLL_INTERVAL_MIN: 800,
  SCROLL_INTERVAL_MAX: 2000,
  SCROLL_TIMES_MIN: 2,
  SCROLL_TIMES_MAX: 4,
  
  // 详情页阅读时间 (15-30秒，模拟真人阅读)
  DETAIL_READ_MIN: 15000,
  DETAIL_READ_MAX: 30000,
  
  // === Engagement-Aware 配置 ===
  // 基础阅读时间 (对于极短或无赞笔记)
  BASE_READ_TIME_MIN: 5000,
  BASE_READ_TIME_MAX: 8000,
  // 每条评论增加的时间 (毫秒)
  TIME_PER_COMMENT: 1500,
  // 每个字符增加的时间 (毫秒)
  TIME_PER_CHAR: 8,
  // 翻页概率 (如果有图片)
  PAGINATION_PROBABILITY: 0.7,
  // 最大阅读时间上限 (80秒，深读可能较长)
  MAX_READ_TIME: 80000,
  
  // 关键词搜索间隔 (20-40秒)
  KEYWORD_INTERVAL_MIN: 20000,
  KEYWORD_INTERVAL_MAX: 40000,
  
  // 笔记间隔 (5-10秒，模拟翻阅)
  NOTE_INTERVAL_MIN: 5000,
  NOTE_INTERVAL_MAX: 10000,
  
  // 打字速度 (50-150ms，模拟真人打字)
  TYPING_DELAY_MIN: 50,
  TYPING_DELAY_MAX: 150,
  
  // 每日采集上限 (不要贪心)
  MAX_NOTES_PER_KEYWORD: 3,
  MAX_KEYWORDS_PER_SESSION: 5,
};

// === 内容配置 ===
export const CONTENT_SUMMARY_LENGTH = 500;

// === 专家词库 ===
export const KEYWORD_POOLS = {
  TECH_CORE: [
    '推荐系统 召回', '双塔模型 负采样', '粗排 精排 策略', '重排 多样性', 
    'DeepFM 面试', 'MMoE 多目标', 'DIN 模型',
    '搜索算法 面试', '倒排索引 优化', 'Query理解', '语义搜索', 'Elasticsearch 面试',
    '广告算法 策略', 'CTR预估 模型', 'OCPC 竞价', '广告召回', '流量分配',
    '生成式推荐', 'LLM 推荐系统'
  ],
  TARGET_COMPANIES: [
    '字节 算法实习', '美团 搜推面经', '阿里妈妈 面试', '腾讯 广告算法', 
    '百度 搜索算法', '快手 推荐算法', '小红书 算法实习', '滴滴 算法校招',
    '京东 推荐搜索', '拼多多 算法', '米哈游 算法', 'Shopee 算法'
  ],
  CODING_CHALLENGE: [
    '算法岗 手撕', '推荐系统 代码题', 'LeetCode Hot100', 
    'Auc 计算 代码', 'IoU 计算 手撕', 'NMS 实现', 'K-Means 手写', 
    '二叉树 遍历', 'TopK 问题'
  ],
  HOT_TRENDS: [
    '大模型 面试', 'DeepSeek 部署', 'Gemini 应用', 'RAG 知识库', 
    'LangChain 实战', 'Transformer 源码', 'LoRA 微调', 
    'Prompt Engineering', '大模型 推理加速'
  ]
};

/** 智能混合轮询: 1技术 + 1大厂 + 1热点 */
export function getSmartMixKeywords(): string[] {
  const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
  const mixPool = [...KEYWORD_POOLS.CODING_CHALLENGE, ...KEYWORD_POOLS.HOT_TRENDS];
  return [pick(KEYWORD_POOLS.TECH_CORE), pick(KEYWORD_POOLS.TARGET_COMPANIES), pick(mixPool)];
}
