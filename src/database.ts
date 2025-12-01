/**
 * 数据库操作模块 (JSON 文件存储)
 */
import * as fs from 'fs';
import { NoteInfo, QuestionItem, SaveResult } from './types';

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
                     note.keyword.includes('实习');
  
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
    hot_comments: note.comments.map(c => `${c.author}: ${c.content}`).slice(0, 5),
    source_author: note.author,
    crawled_at: new Date().toISOString(),
    status: 'pending',
  };
}

/** 增量保存到数据库 (去重) */
export function saveToDatabase(notes: NoteInfo[], dbPath: string): SaveResult {
  let existingData: QuestionItem[] = [];
  
  if (fs.existsSync(dbPath)) {
    try {
      const content = fs.readFileSync(dbPath, 'utf-8');
      existingData = JSON.parse(content);
    } catch {
      console.warn('[saveToDatabase] 无法读取现有数据，将创建新文件');
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
    console.log(`   ✅ 新增: ${item.title.substring(0, 30)}...`);
  }
  
  fs.writeFileSync(dbPath, JSON.stringify(existingData, null, 2), 'utf-8');
  
  return {
    total: existingData.length,
    newCount,
    skipped,
  };
}
