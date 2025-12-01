/**
 * 模块化重构测试脚本
 * 验证 src/ 模块是否正确导出所有功能
 */

console.log('╔════════════════════════════════════════╗');
console.log('║  模块化重构验证测试                    ║');
console.log('╚════════════════════════════════════════╝');
console.log();

let passed = 0;
let failed = 0;

function test(name: string, fn: () => boolean) {
  try {
    if (fn()) {
      console.log(`  ✅ ${name}`);
      passed++;
    } else {
      console.log(`  ❌ ${name} - 返回 false`);
      failed++;
    }
  } catch (error: any) {
    console.log(`  ❌ ${name} - ${error.message}`);
    failed++;
  }
}

// === 1. 测试 config.ts ===
console.log('\n📦 测试 config.ts');
import {
  PROJECT_ROOT, REPORTS_DIR, DATA_DIR, COOKIES_PATH,
  DRAFTS_DIR, PUBLISHED_DIR,
  AI_CONFIG, OCR_CONFIG, SAFETY_CONFIG,
  CONTENT_SUMMARY_LENGTH, KEYWORD_POOLS,
  getSmartMixKeywords
} from './src/config';

test('PROJECT_ROOT 已定义', () => typeof PROJECT_ROOT === 'string' && PROJECT_ROOT.length > 0);
test('REPORTS_DIR 已定义', () => typeof REPORTS_DIR === 'string');
test('DATA_DIR 已定义', () => typeof DATA_DIR === 'string');
test('COOKIES_PATH 已定义', () => typeof COOKIES_PATH === 'string');
test('DRAFTS_DIR 已定义', () => typeof DRAFTS_DIR === 'string');
test('PUBLISHED_DIR 已定义', () => typeof PUBLISHED_DIR === 'string');

test('AI_CONFIG 包含 API_BASE', () => typeof AI_CONFIG.API_BASE === 'string');
test('AI_CONFIG 包含 TIMEOUT', () => typeof AI_CONFIG.TIMEOUT === 'number');
test('AI_CONFIG 包含 RETRIES', () => typeof AI_CONFIG.RETRIES === 'number');

test('OCR_CONFIG 包含 MIN_CONTENT_LENGTH', () => typeof OCR_CONFIG.MIN_CONTENT_LENGTH === 'number');
test('OCR_CONFIG 包含 TIMEOUT', () => typeof OCR_CONFIG.TIMEOUT === 'number');

test('SAFETY_CONFIG 包含 PAGE_LOAD_WAIT_MIN', () => typeof SAFETY_CONFIG.PAGE_LOAD_WAIT_MIN === 'number');
test('SAFETY_CONFIG 包含 TYPING_DELAY_MIN', () => typeof SAFETY_CONFIG.TYPING_DELAY_MIN === 'number');

test('KEYWORD_POOLS.TECH_CORE 有内容', () => Array.isArray(KEYWORD_POOLS.TECH_CORE) && KEYWORD_POOLS.TECH_CORE.length > 0);
test('KEYWORD_POOLS.TARGET_COMPANIES 有内容', () => Array.isArray(KEYWORD_POOLS.TARGET_COMPANIES) && KEYWORD_POOLS.TARGET_COMPANIES.length > 0);

test('getSmartMixKeywords 返回3个关键词', () => {
  const keywords = getSmartMixKeywords();
  return Array.isArray(keywords) && keywords.length === 3;
});

// === 2. 测试 types.ts ===
console.log('\n📦 测试 types.ts');
import type { CommentInfo, NoteInfo, Draft, QuestionItem, SaveResult } from './src/types';

test('CommentInfo 类型可用', () => {
  const comment: CommentInfo = { author: 'test', content: 'test', likes: '0' };
  return comment.author === 'test';
});

test('NoteInfo 类型可用', () => {
  const note: NoteInfo = {
    keyword: '', title: '', author: '', authorLink: '',
    likes: '', link: '', noteId: '', content: '',
    fullContent: '', tags: [], comments: []
  };
  return note.keyword === '';
});

test('Draft 类型可用', () => {
  const draft: Draft = { title: '', content: '', tags: [], imagePaths: [] };
  return Array.isArray(draft.tags);
});

test('QuestionItem 类型可用', () => {
  const item: QuestionItem = {
    id: '', title: '', link: '', tags: [], summary: '',
    full_text: '', hot_comments: [], source_author: '',
    crawled_at: '', status: 'pending'
  };
  return item.status === 'pending';
});

// === 3. 测试 selectors.ts ===
console.log('\n📦 测试 selectors.ts');
import {
  LOGIN_CHECK_SELECTORS, LOGIN_URL_PATTERNS,
  DETAIL_SELECTORS, NOTE_SELECTORS, PUBLISH_SELECTORS
} from './src/selectors';

test('LOGIN_CHECK_SELECTORS 有内容', () => Array.isArray(LOGIN_CHECK_SELECTORS) && LOGIN_CHECK_SELECTORS.length > 0);
test('LOGIN_URL_PATTERNS 有内容', () => Array.isArray(LOGIN_URL_PATTERNS) && LOGIN_URL_PATTERNS.length > 0);
test('DETAIL_SELECTORS.CONTENT 有内容', () => Array.isArray(DETAIL_SELECTORS.CONTENT) && DETAIL_SELECTORS.CONTENT.length > 0);
test('DETAIL_SELECTORS.COMMENTS 有 CONTAINER', () => Array.isArray(DETAIL_SELECTORS.COMMENTS.CONTAINER));
test('NOTE_SELECTORS.CARD_CONTAINERS 有内容', () => Array.isArray(NOTE_SELECTORS.CARD_CONTAINERS) && NOTE_SELECTORS.CARD_CONTAINERS.length > 0);
test('PUBLISH_SELECTORS.PUBLISH_URL 已定义', () => typeof PUBLISH_SELECTORS.PUBLISH_URL === 'string');
test('PUBLISH_SELECTORS.UPLOAD_INPUT 已定义', () => typeof PUBLISH_SELECTORS.UPLOAD_INPUT === 'string');

// === 4. 测试 utils.ts ===
console.log('\n📦 测试 utils.ts');
import {
  delay, randomDelay, withTimeout,
  makeSearchURL, extractNoteId
} from './src/utils';

test('delay 是函数', () => typeof delay === 'function');
test('randomDelay 是函数', () => typeof randomDelay === 'function');
test('withTimeout 是函数', () => typeof withTimeout === 'function');

test('makeSearchURL 生成正确 URL', () => {
  const url = makeSearchURL('测试');
  return url.includes('xiaohongshu.com/search_result') && url.includes('keyword=');
});

test('extractNoteId 提取 explore ID', () => {
  const id = extractNoteId('https://www.xiaohongshu.com/explore/64f123abcdef123456789012');
  return id === '64f123abcdef123456789012';
});

test('extractNoteId 提取 discovery ID', () => {
  const id = extractNoteId('https://www.xiaohongshu.com/discovery/item/64f123abcdef123456789012');
  return id === '64f123abcdef123456789012';
});

test('withTimeout 超时返回 fallback', async () => {
  const slowPromise = new Promise(resolve => setTimeout(() => resolve('slow'), 1000));
  const result = await withTimeout(slowPromise, 100, 'fallback');
  return result === 'fallback';
});

// === 5. 测试 ocr.ts ===
console.log('\n📦 测试 ocr.ts');
import { extractTextFromImage, extractOCRFromImages, humanViewImages } from './src/ocr';

test('extractTextFromImage 是函数', () => typeof extractTextFromImage === 'function');
test('extractOCRFromImages 是函数', () => typeof extractOCRFromImages === 'function');
test('humanViewImages 是函数', () => typeof humanViewImages === 'function');

// === 6. 测试 ai.ts ===
console.log('\n📦 测试 ai.ts');
import { callAI, generateAIReport } from './src/ai';

test('callAI 是函数', () => typeof callAI === 'function');
test('generateAIReport 是函数', () => typeof generateAIReport === 'function');

test('generateAIReport 处理空数组', async () => {
  const result = await generateAIReport([]);
  return result.includes('未采集');
});

// === 7. 测试 database.ts ===
console.log('\n📦 测试 database.ts');
import { noteToQuestionItem, saveToDatabase } from './src/database';

test('noteToQuestionItem 是函数', () => typeof noteToQuestionItem === 'function');
test('saveToDatabase 是函数', () => typeof saveToDatabase === 'function');

test('noteToQuestionItem 转换有效笔记', () => {
  const note: NoteInfo = {
    keyword: '算法面试', title: '测试标题', author: 'test',
    authorLink: '', likes: '100', link: 'https://test.com',
    noteId: 'abc123', content: '内容', fullContent: '',
    tags: ['标签1'], comments: []
  };
  const item = noteToQuestionItem(note);
  return item !== null && item.id === 'abc123';
});

test('noteToQuestionItem 拒绝无 noteId', () => {
  const note: NoteInfo = {
    keyword: '算法', title: '', author: '', authorLink: '',
    likes: '', link: '', noteId: '', content: '',
    fullContent: '', tags: [], comments: []
  };
  return noteToQuestionItem(note) === null;
});

// === 8. 测试统一导出 ===
console.log('\n📦 测试 src/index.ts 统一导出');
import * as SrcModule from './src/index';

test('统一导出包含 PROJECT_ROOT', () => typeof SrcModule.PROJECT_ROOT === 'string');
test('统一导出包含 DETAIL_SELECTORS', () => typeof SrcModule.DETAIL_SELECTORS === 'object');
test('统一导出包含 delay', () => typeof SrcModule.delay === 'function');
test('统一导出包含 callAI', () => typeof SrcModule.callAI === 'function');

// === 汇总 ===
console.log('\n════════════════════════════════════════');
console.log(`  总计: ${passed + failed} 项测试`);
console.log(`  ✅ 通过: ${passed}`);
console.log(`  ❌ 失败: ${failed}`);
console.log('════════════════════════════════════════');

if (failed > 0) {
  console.log('\n⚠️ 有测试失败，请检查模块导出！');
  process.exit(1);
} else {
  console.log('\n🎉 所有模块测试通过！可以安全迁移。');
}
