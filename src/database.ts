/**
 * 数据库操作模块 (JSON 文件存储)
 */
import * as fs from 'fs';
import * as path from 'path';
import { NoteInfo, QuestionItem, SaveResult } from './types';
import { logger } from './logger';

/** NoteInfo 转 QuestionItem */
export function noteToQuestionItem(note: NoteInfo): QuestionItem | null {
  if (!note.noteId) {
    return null;
  }
  
  const isRelevant = note.keyword.includes('搜索') || 
                     note.keyword.includes('算法') || 
                     note.keyword.includes('推荐') ||
                     note.keyword.includes('广告') ||
                     note.keyword.includes('面试') ||
                     note.keyword.includes('面经') ||
                     note.keyword.includes('实习') ||
                     note.keyword.includes('Feed') ||
                     note.keyword.includes('模型') ||
                     note.keyword.includes('大厂');
  
  if (!isRelevant) {
    return null;
  }
  
  return {
    id: note.noteId,
    title: note.title,
    link: note.link || `https://www.xiaohongshu.com/explore/${note.noteId}`,
    tags: note.tags.length > 0 ? note.tags : [note.keyword],
    summary: note.content.substring(0, 300),
    full_text: note.fullContent || note.content,
    hot_comments: note.comments.map(c => `[👍${c.likes}] ${c.author}: ${c.content}`).slice(0, 5),
    source_author: note.author,
    crawled_at: new Date().toISOString(),
    status: 'pending',
  };
}

/** 增量保存到数据库 (去重) */
export function saveToDatabase(notes: NoteInfo[], dbPath: string): SaveResult {
  // 确保目录存在
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  let existingData: QuestionItem[] = [];
  
  if (fs.existsSync(dbPath)) {
    try {
      const content = fs.readFileSync(dbPath, 'utf-8');
      existingData = JSON.parse(content);
      if (!Array.isArray(existingData)) {
        logger.warn('[saveToDatabase] 数据格式错误，重置为空数组');
        existingData = [];
      }
    } catch {
      logger.warn('[saveToDatabase] 无法读取现有数据，将创建新文件');
    }
  }
  
  const existingIds = new Set(existingData.map(item => item.id));
  
  let newCount = 0;
  let skipped = 0;
  
  for (const note of notes) {
    const item = noteToQuestionItem(note);
    if (!item) continue;
    
    if (existingIds.has(item.id)) {
      skipped++;
      continue;
    }
    
    existingData.push(item);
    existingIds.add(item.id);
    newCount++;
    logger.info(`   ✅ 新增: ${item.title.substring(0, 30)}...`);
  }
  
  fs.writeFileSync(dbPath, JSON.stringify(existingData, null, 2), 'utf-8');
  
  return {
    total: existingData.length,
    newCount,
    skipped,
  };
}
