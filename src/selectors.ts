/**
 * DOM 选择器
 */

// === 登录检查 ===

export const LOGIN_CHECK_SELECTORS = [
  '.login-container',
  '.login-modal',
  '.qrcode-login',
];

export const LOGIN_URL_PATTERNS = [
  '/login',
  '/signin', 
];

// === 详情页选择器 ===

export const DETAIL_SELECTORS = {
  CONTENT: [
    '.note-content',
    '#detail-desc',
    '.content',
    '.desc',
    '[class*="noteDetail"] [class*="content"]',
    '[class*="note-detail"]',
    '.detail-content',
    'article',
    '.text-content',
  ],
  TAGS: [
    'a.tag',
    '.hash-tag',
    'a[href*="/search_result"]',
    '[class*="tag"]',
  ],
  AUTHOR: [
    '.author-wrapper .name',
    '.user-name',
    '.author .username',
    '.nickname',
    '[class*="author"] [class*="name"]',
  ],
  LIKES: [
    '.like-wrapper .count',
    '.engage-bar-container .like .count',
    '[class*="like"] .count',
    '[class*="like-count"]',
  ],
  CONTAINER: [
    '.note-detail-mask',
    '.note-container',
    '[class*="noteDetail"]',
    '.detail-container',
  ],
  AUTHOR_LINK: [
    '.author-wrapper a[href*="/user/profile/"]',
    '.user-info a[href*="/user/"]',
    'a.author[href*="/user/"]',
    '[class*="author"] a[href*="/user/"]',
  ],
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

// === 笔记列表选择器 ===

export const NOTE_SELECTORS = {
  CARD_CONTAINERS: [
    'section.note-item',
    '.note-item',
    '.feed-card',
    '[data-note-id]',
    '.search-result-item',
  ],
  TITLE: [
    '.title span',
    '.title',
    '.note-title',
    'a.title',
    '[class*="title"]',
  ],
  AUTHOR: [
    '.author .name',
    '.user-name',
    '.nickname',
    '.author-name',
    '[class*="author"] [class*="name"]',
  ],
  LIKES: [
    '.like-wrapper .count',
    '.like .count',
    '.like-count',
    '[class*="like"] [class*="count"]',
    '.engagement .count',
  ],
  LINK: [
    'a[href*="/explore/"]',
    'a[href*="/discovery/"]',
    'a[href*="/search_result/"]',
    'a.cover',
    'a[href*="xiaohongshu"]',
  ],
};

// === 发布页选择器 (来自 xiaohongshu-mcp) ===

export const PUBLISH_SELECTORS = {
  PUBLISH_URL: 'https://creator.xiaohongshu.com/publish/publish?source=official',
  UPLOAD_CONTAINER: 'div.upload-content',
  TAB_BUTTON: 'div.creator-tab',
  UPLOAD_INPUT: '.upload-input',
  UPLOAD_COMPLETE_ITEM: '.img-preview-area .pr',
  TITLE_INPUT: 'div.d-input input',
  CONTENT_EDITOR_V1: 'div.ql-editor',
  CONTENT_EDITOR_V2_PLACEHOLDER: 'p[data-placeholder*="输入正文描述"]',
  TAG_CONTAINER: '#creator-editor-topic-container',
  TAG_ITEM: '#creator-editor-topic-container .item',
  SUBMIT_BUTTON: 'div.submit div.d-button-content',
  POPOVER: 'div.d-popover',
} as const;
