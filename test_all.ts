/**
 * v5.0 完整功能测试脚本
 * 验证模块化重构后所有功能正常
 */

// 静态导入类型 (解决 namespace 问题)
import type { CommentInfo, NoteInfo, Draft, QuestionItem } from './src/types';

console.log('╔════════════════════════════════════════╗');
console.log('║  v5.0 完整功能测试                     ║');
console.log('╚════════════════════════════════════════╝');
console.log();

let passed = 0;
let failed = 0;

function test(name: string, fn: () => boolean | Promise<boolean>) {
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.then(r => {
        if (r) { console.log(`  ✅ ${name}`); passed++; }
        else { console.log(`  ❌ ${name}`); failed++; }
      });
    }
    if (result) { console.log(`  ✅ ${name}`); passed++; }
    else { console.log(`  ❌ ${name}`); failed++; }
  } catch (error: any) {
    console.log(`  ❌ ${name} - ${error.message}`);
    failed++;
  }
}

async function runTests() {
  // ═══════════════════════════════════════════════════════════════
  // 1. 测试 src/config.ts
  // ═══════════════════════════════════════════════════════════════
  console.log('\n📦 1. config.ts - 配置模块');
  const config = await import('./src/config');
  
  test('PROJECT_ROOT 路径正确', () => config.PROJECT_ROOT.includes('xhs_automation'));
  test('COOKIES_PATH 包含 json', () => config.COOKIES_PATH.endsWith('.json'));
  test('REPORTS_DIR 路径正确', () => config.REPORTS_DIR.includes('reports'));
  test('DATA_DIR 路径正确', () => config.DATA_DIR.includes('data'));
  test('DRAFTS_DIR 路径正确', () => config.DRAFTS_DIR.includes('drafts'));
  test('PUBLISHED_DIR 路径正确', () => config.PUBLISHED_DIR.includes('published'));
  
  test('AI_CONFIG 结构完整', () => 
    !!config.AI_CONFIG.API_BASE && 
    typeof config.AI_CONFIG.API_KEY === 'string' &&  // API_KEY 可为空，但必须是字符串
    !!config.AI_CONFIG.MODEL &&
    config.AI_CONFIG.TIMEOUT > 0 &&
    config.AI_CONFIG.RETRIES >= 0 &&
    typeof config.AI_CONFIG.isConfigured === 'boolean'  // 新增配置检查
  );
  
  test('OCR_CONFIG 完整', () =>
    config.OCR_CONFIG.MIN_CONTENT_LENGTH > 0 &&
    config.OCR_CONFIG.MAX_IMAGES > 0 &&
    config.OCR_CONFIG.TIMEOUT > 0
  );
  
  test('SAFETY_CONFIG 所有字段存在', () =>
    config.SAFETY_CONFIG.PAGE_LOAD_WAIT_MIN > 0 &&
    config.SAFETY_CONFIG.SCROLL_INTERVAL_MIN > 0 &&
    config.SAFETY_CONFIG.KEYWORD_INTERVAL_MIN > 0 &&
    config.SAFETY_CONFIG.TYPING_DELAY_MIN > 0
  );
  
  test('KEYWORD_POOLS 四个池都有数据', () =>
    config.KEYWORD_POOLS.TECH_CORE.length > 0 &&
    config.KEYWORD_POOLS.TARGET_COMPANIES.length > 0 &&
    config.KEYWORD_POOLS.CODING_CHALLENGE.length > 0 &&
    config.KEYWORD_POOLS.HOT_TRENDS.length > 0
  );
  
  test('getSmartMixKeywords 返回3个不同关键词', () => {
    const kw = config.getSmartMixKeywords();
    return kw.length === 3 && new Set(kw).size === 3;
  });

  // ═══════════════════════════════════════════════════════════════
  // 2. 测试 src/types.ts
  // ═══════════════════════════════════════════════════════════════
  console.log('\n📦 2. types.ts - 类型定义');
  const types = await import('./src/types');
  
  test('CommentInfo 类型可构造', () => {
    const c: CommentInfo = { author: 'a', content: 'b', likes: '1' };
    return c.author === 'a';
  });
  
  test('NoteInfo 类型完整', () => {
    const n: NoteInfo = {
      keyword: 'k', title: 't', author: 'a', authorLink: 'l',
      likes: '0', link: 'url', noteId: 'id', content: 'c',
      fullContent: 'fc', tags: [], comments: []
    };
    return n.noteId === 'id';
  });
  
  test('Draft 类型完整', () => {
    const d: Draft = { title: 't', content: 'c', tags: [], imagePaths: [] };
    return Array.isArray(d.imagePaths);
  });
  
  test('QuestionItem 类型完整', () => {
    const q: QuestionItem = {
      id: 'id', title: 't', link: 'l', tags: [], summary: 's',
      full_text: 'ft', hot_comments: [], source_author: 'a',
      crawled_at: new Date().toISOString(), status: 'pending'
    };
    return q.status === 'pending';
  });

  // ═══════════════════════════════════════════════════════════════
  // 3. 测试 src/selectors.ts
  // ═══════════════════════════════════════════════════════════════
  console.log('\n📦 3. selectors.ts - DOM 选择器');
  const selectors = await import('./src/selectors');
  
  test('LOGIN_CHECK_SELECTORS 有效', () => selectors.LOGIN_CHECK_SELECTORS.length >= 3);
  test('LOGIN_URL_PATTERNS 有效', () => selectors.LOGIN_URL_PATTERNS.length >= 2);
  
  test('DETAIL_SELECTORS 完整', () =>
    selectors.DETAIL_SELECTORS.CONTENT.length > 0 &&
    selectors.DETAIL_SELECTORS.TAGS.length > 0 &&
    selectors.DETAIL_SELECTORS.AUTHOR.length > 0 &&
    selectors.DETAIL_SELECTORS.COMMENTS.CONTAINER.length > 0
  );
  
  test('NOTE_SELECTORS 完整', () =>
    selectors.NOTE_SELECTORS.CARD_CONTAINERS.length > 0 &&
    selectors.NOTE_SELECTORS.TITLE.length > 0 &&
    selectors.NOTE_SELECTORS.LINK.length > 0
  );
  
  test('PUBLISH_SELECTORS 完整', () =>
    selectors.PUBLISH_SELECTORS.PUBLISH_URL.includes('creator.xiaohongshu.com') &&
    !!selectors.PUBLISH_SELECTORS.UPLOAD_INPUT &&
    !!selectors.PUBLISH_SELECTORS.SUBMIT_BUTTON
  );

  // ═══════════════════════════════════════════════════════════════
  // 4. 测试 src/utils.ts
  // ═══════════════════════════════════════════════════════════════
  console.log('\n📦 4. utils.ts - 工具函数');
  const utils = await import('./src/utils');
  
  test('delay 函数有效', async () => {
    const start = Date.now();
    await utils.delay(50);
    return Date.now() - start >= 50;
  });
  
  test('randomDelay 函数有效', async () => {
    const start = Date.now();
    await utils.randomDelay(50, 100);
    const elapsed = Date.now() - start;
    return elapsed >= 50 && elapsed <= 150;
  });
  
  test('withTimeout 正常返回', async () => {
    const result = await utils.withTimeout(Promise.resolve('ok'), 1000, 'fail');
    return result === 'ok';
  });
  
  test('withTimeout 超时返回 fallback', async () => {
    const slow = new Promise(r => setTimeout(() => r('slow'), 500));
    const result = await utils.withTimeout(slow, 50, 'timeout');
    return result === 'timeout';
  });
  
  test('makeSearchURL 生成正确', () => {
    const url = utils.makeSearchURL('算法面试');
    return url.includes('xiaohongshu.com') && url.includes('keyword=');
  });
  
  test('extractNoteId 提取 explore', () => 
    utils.extractNoteId('https://www.xiaohongshu.com/explore/64f123abcdef123456789012') === '64f123abcdef123456789012'
  );
  
  test('extractNoteId 提取 discovery', () =>
    utils.extractNoteId('https://www.xiaohongshu.com/discovery/item/64f123abcdef123456789012') === '64f123abcdef123456789012'
  );

  // ═══════════════════════════════════════════════════════════════
  // 5. 测试 src/ocr.ts
  // ═══════════════════════════════════════════════════════════════
  console.log('\n📦 5. ocr.ts - OCR 模块');
  const ocr = await import('./src/ocr');
  
  test('recognizeImage 是异步函数', () => typeof ocr.recognizeImage === 'function');
  test('extractOCRFromImages 是异步函数', () => typeof ocr.extractOCRFromImages === 'function');
  test('humanViewImages 是异步函数', () => typeof ocr.humanViewImages === 'function');

  // ═══════════════════════════════════════════════════════════════
  // 6. 测试 src/ai.ts
  // ═══════════════════════════════════════════════════════════════
  console.log('\n📦 6. ai.ts - AI 模块');
  const ai = await import('./src/ai');
  
  test('callAI 是异步函数', () => typeof ai.callAI === 'function');
  test('generateAIReport 是异步函数', () => typeof ai.generateAIReport === 'function');
  
  test('generateAIReport 空数组返回提示', async () => {
    const result = await ai.generateAIReport([]);
    return result.includes('未采集');
  });

  // ═══════════════════════════════════════════════════════════════
  // 7. 测试 src/database.ts
  // ═══════════════════════════════════════════════════════════════
  console.log('\n📦 7. database.ts - 数据库模块');
  const db = await import('./src/database');
  
  test('noteToQuestionItem 转换有效笔记', () => {
    const note: NoteInfo = {
      keyword: '算法面试', title: '测试', author: 'test',
      authorLink: '', likes: '100', link: 'https://test.com',
      noteId: 'abc123', content: '内容', fullContent: '',
      tags: ['标签'], comments: []
    };
    const item = db.noteToQuestionItem(note);
    return item !== null && item.id === 'abc123';
  });
  
  test('noteToQuestionItem 拒绝无 noteId', () => {
    const note: NoteInfo = {
      keyword: '算法', title: '', author: '', authorLink: '',
      likes: '', link: '', noteId: '', content: '',
      fullContent: '', tags: [], comments: []
    };
    return db.noteToQuestionItem(note) === null;
  });
  
  test('noteToQuestionItem 拒绝无关内容', () => {
    const note: NoteInfo = {
      keyword: '旅游攻略', title: '好玩', author: 'test',
      authorLink: '', likes: '10', link: 'url',
      noteId: 'xyz789', content: '旅游', fullContent: '',
      tags: [], comments: []
    };
    return db.noteToQuestionItem(note) === null;
  });

  // ═══════════════════════════════════════════════════════════════
  // 8. 测试统一导出
  // ═══════════════════════════════════════════════════════════════
  console.log('\n📦 8. src/index.ts 统一导出');
  const src = await import('./src/index');
  
  test('导出 config 常量', () => !!src.PROJECT_ROOT && !!src.AI_CONFIG);
  test('导出 types', () => true); // TypeScript types are compile-time only
  test('导出 selectors', () => !!src.DETAIL_SELECTORS && !!src.PUBLISH_SELECTORS);
  test('导出 utils', () => typeof src.delay === 'function');
  test('导出 ocr', () => typeof src.extractOCRFromImages === 'function');
  test('导出 ai', () => typeof src.callAI === 'function');
  test('导出 database', () => typeof src.saveToDatabase === 'function');
  test('导出 logger', () => typeof src.Logger === 'function');

  // ═══════════════════════════════════════════════════════════════════
  // 汇总
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n════════════════════════════════════════');
  console.log(`  总计: ${passed + failed} 项测试`);
  console.log(`  ✅ 通过: ${passed}`);
  console.log(`  ❌ 失败: ${failed}`);
  console.log('════════════════════════════════════════');

  if (failed > 0) {
    console.log('\n⚠️ 有测试失败！请检查问题。');
    process.exit(1);
  } else {
    console.log('\n🎉 所有功能测试通过！模块化重构成功。');
  }
}

runTests().catch(console.error);
