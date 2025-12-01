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

// === AI API 配置 ===
// ⚠️ API Key 必须通过环境变量配置，不在代码中硬编码
export const AI_CONFIG = {
  API_BASE: process.env.AI_API_BASE || 'https://yinli.one/v1',
  API_KEY: process.env.AI_API_KEY || '',  // 必须在 .env 中配置
  MODEL: process.env.AI_MODEL || 'gemini-2.5-flash',
  TIMEOUT: 30000,
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

// === 安全配置 (模拟慢用户) ===
export const SAFETY_CONFIG = {
  PAGE_LOAD_WAIT_MIN: 3000,
  PAGE_LOAD_WAIT_MAX: 6000,
  SCROLL_INTERVAL_MIN: 1200,
  SCROLL_INTERVAL_MAX: 2500,
  SCROLL_TIMES_MIN: 2,
  SCROLL_TIMES_MAX: 4,
  DETAIL_READ_MIN: 8000,
  DETAIL_READ_MAX: 15000,
  KEYWORD_INTERVAL_MIN: 90000,
  KEYWORD_INTERVAL_MAX: 180000,
  NOTE_INTERVAL_MIN: 8000,
  NOTE_INTERVAL_MAX: 15000,
  TYPING_DELAY_MIN: 80,
  TYPING_DELAY_MAX: 200,
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
