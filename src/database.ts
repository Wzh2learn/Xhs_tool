/**
 * 数据库操作模块 (JSON 文件存储)
 */
import * as fs from 'fs';
import * as path from 'path';
import { NoteInfo, QuestionItem, SaveResult, SyncBundle } from './types';
import { logger } from './logger';
import { atomicWriteJsonSync } from './utils';

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
  
  atomicWriteJsonSync(dbPath, existingData);
  
  return {
    total: existingData.length,
    newCount,
    skipped,
  };
}

/** 
 * 生成 AlgoQuest 兼容的同步数据包 
 */
export function generateSyncBundle(dbPath: string): SyncBundle | null {
  if (!fs.existsSync(dbPath)) return null;

  try {
    const questions: QuestionItem[] = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
    
    // 1. 提取热点话题 (基于标签和关键词)
    const topicMap = new Map<string, number>();
    questions.forEach(q => {
      q.tags.forEach(tag => {
        const cleanTag = tag.replace('#', '').trim();
        if (cleanTag.length > 1) {
          topicMap.set(cleanTag, (topicMap.get(cleanTag) || 0) + 1);
        }
      });
    });
    const hotTopics = Array.from(topicMap.entries())
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // 2. 提取公司情报
    const companyIntel: Record<string, string[]> = {};
    const companies = ['字节', '阿里', '腾讯', '百度', '美团', '快手', '小红书', '京东', '拼多多', 'Shopee'];
    
    questions.forEach(q => {
      const foundCompany = companies.find(c => q.title.includes(c) || q.full_text.includes(c));
      if (foundCompany) {
        if (!companyIntel[foundCompany]) companyIntel[foundCompany] = [];
        // 提取摘要作为情报点
        const intelPoint = q.summary.split('\n')[0].substring(0, 100);
        if (intelPoint && !companyIntel[foundCompany].includes(intelPoint)) {
          companyIntel[foundCompany].push(intelPoint);
        }
      }
    });

    return {
      timestamp: new Date().toISOString(),
      questions: questions.slice(-20), // 仅带上最近20条，避免数据过载
      hotTopics,
      companyIntel
    };
  } catch (err) {
    logger.error('生成同步数据包失败', err);
    return null;
  }
}
