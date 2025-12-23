/**
 * 类型定义
 */

// === 笔记相关 ===

export interface CommentInfo {
  author: string;
  content: string;
  likes: string;
}

export interface NoteInfo {
  keyword: string;
  title: string;
  author: string;
  authorLink: string;
  authorId?: string;
  authorRedId?: string;
  likes: string;
  link: string;
  noteId: string;
  xsecToken?: string;
  content: string;
  fullContent: string;
  tags: string[];
  comments: CommentInfo[];
}

// === 发布相关 ===

export interface Draft {
  title: string;
  content: string;
  tags: string[];
  imagePaths: string[];
}

// === 数据库相关 ===

export interface QuestionItem {
  id: string;
  title: string;
  link: string;
  tags: string[];
  summary: string;
  full_text: string;
  hot_comments: string[];
  source_author: string;
  crawled_at: string;
  status: 'pending' | 'imported';
}

export interface SaveResult {
  total: number;
  newCount: number;
  skipped: number;
}
