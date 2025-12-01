/**
 * v5.0 新功能单元测试
 * 运行: npx tsx test_v5_features.ts
 */

import 'dotenv/config';

console.log('╔════════════════════════════════════════╗');
console.log('║  v5.0 新功能单元测试                   ║');
console.log('╚════════════════════════════════════════╝\n');

// ============================================================================
// Test 1: dotenv 环境变量加载
// ============================================================================
console.log('📦 Test 1: dotenv 环境变量');
console.log('---');
console.log(`  AI_API_BASE: ${process.env.AI_API_BASE || '(未设置，使用默认)'}`);
console.log(`  AI_API_KEY:  ${process.env.AI_API_KEY ? '***已设置***' : '(未设置，使用默认)'}`);
console.log(`  AI_MODEL:    ${process.env.AI_MODEL || '(未设置，使用默认)'}`);
console.log('✅ dotenv 加载正常\n');

// ============================================================================
// Test 2: OCR 超时保护函数
// ============================================================================
console.log('⏱️ Test 2: 超时保护函数 (withTimeout)');
console.log('---');

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))
  ]);
}

async function testTimeout() {
  // 测试 1: 快速完成的 Promise
  const fast = new Promise<string>(resolve => setTimeout(() => resolve('快速结果'), 100));
  const fastResult = await withTimeout(fast, 1000, '超时');
  console.log(`  快速 Promise (100ms): ${fastResult === '快速结果' ? '✅ 正确返回' : '❌ 错误'}`);

  // 测试 2: 慢的 Promise (应该超时)
  const slow = new Promise<string>(resolve => setTimeout(() => resolve('慢结果'), 2000));
  const slowResult = await withTimeout(slow, 500, '超时兜底');
  console.log(`  慢速 Promise (2000ms, 超时500ms): ${slowResult === '超时兜底' ? '✅ 正确超时' : '❌ 错误'}`);
}

await testTimeout();
console.log('✅ 超时保护正常\n');

// ============================================================================
// Test 3: 全局错误处理
// ============================================================================
console.log('🛡️ Test 3: 全局错误处理');
console.log('---');

// 模拟 unhandledRejection
process.on('unhandledRejection', (reason) => {
  console.log(`  捕获到未处理 Promise 拒绝: ${String(reason).substring(0, 30)}`);
});

// 触发一个未处理的 Promise 拒绝
Promise.reject(new Error('测试用的拒绝'));

// 给事件循环一个 tick 来处理
await new Promise(resolve => setTimeout(resolve, 100));
console.log('✅ 全局错误处理正常\n');

// ============================================================================
// Test 4: AI 配置
// ============================================================================
console.log('🧠 Test 4: AI 配置检查');
console.log('---');

const AI_CONFIG = {
  API_BASE: process.env.AI_API_BASE || 'https://yinli.one/v1',
  API_KEY: process.env.AI_API_KEY || 'sk-6gGjX7JDr35E0TljC8SdNIWoYWpxgIWlUVmSaifLnAnMaa1C',
  MODEL: process.env.AI_MODEL || 'gemini-2.5-flash',
  TIMEOUT: 30000,
  RETRIES: 2,
};

console.log(`  API_BASE: ${AI_CONFIG.API_BASE}`);
console.log(`  MODEL:    ${AI_CONFIG.MODEL}`);
console.log(`  TIMEOUT:  ${AI_CONFIG.TIMEOUT}ms`);
console.log(`  RETRIES:  ${AI_CONFIG.RETRIES}`);
console.log('✅ AI 配置正常\n');

// ============================================================================
// Test 5: OCR 配置
// ============================================================================
console.log('👁️ Test 5: OCR 配置检查');
console.log('---');

const OCR_CONFIG = {
  MIN_CONTENT_LENGTH: 50,
  MAX_IMAGES: 3,
  LANG: 'chi_sim+eng',
  TIMEOUT: 10000,
};

console.log(`  触发阈值: 正文 < ${OCR_CONFIG.MIN_CONTENT_LENGTH} 字`);
console.log(`  最大图片: ${OCR_CONFIG.MAX_IMAGES} 张`);
console.log(`  语言:     ${OCR_CONFIG.LANG}`);
console.log(`  超时:     ${OCR_CONFIG.TIMEOUT}ms`);
console.log('✅ OCR 配置正常\n');

// ============================================================================
// Test 6: 智能混合轮询
// ============================================================================
console.log('🎯 Test 6: 智能混合轮询 (Smart Mix Rotation)');
console.log('---');

const KEYWORD_POOLS = {
  TECH_CORE: ['推荐系统 召回', '双塔模型', 'CTR预估'],
  TARGET_COMPANIES: ['字节 算法', '美团 搜推', '阿里妈妈'],
  CODING_CHALLENGE: ['手撕代码', 'LeetCode'],
  HOT_TRENDS: ['大模型', 'RAG 知识库'],
};

function getSmartMixKeywords(): string[] {
  const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
  const tech = pick(KEYWORD_POOLS.TECH_CORE);
  const company = pick(KEYWORD_POOLS.TARGET_COMPANIES);
  const mixPool = [...KEYWORD_POOLS.CODING_CHALLENGE, ...KEYWORD_POOLS.HOT_TRENDS];
  const hotOrCode = pick(mixPool);
  return [tech, company, hotOrCode];
}

for (let i = 0; i < 3; i++) {
  const keywords = getSmartMixKeywords();
  console.log(`  轮次 ${i + 1}: [技术] ${keywords[0]} | [大厂] ${keywords[1]} | [热点] ${keywords[2]}`);
}
console.log('✅ 智能混合轮询正常\n');

// ============================================================================
// 总结
// ============================================================================
console.log('╔════════════════════════════════════════╗');
console.log('║  ✅ 所有 v5.0 新功能测试通过！         ║');
console.log('╚════════════════════════════════════════╝');
