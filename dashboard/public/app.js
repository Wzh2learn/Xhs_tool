// XHS Dashboard - Modern Layout Controller
// Handles navigation, view switching, and all interactive features

// Debug mode
const DEBUG = true;
function log(...args) {
  if (DEBUG) console.log('[Dashboard]', ...args);
}
function error(...args) {
  console.error('[Dashboard Error]', ...args);
}

// Global error handler
window.addEventListener('error', (e) => {
  console.error('[Global Error]', e.message, 'at', e.filename, ':', e.lineno);
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('[Unhandled Promise Rejection]', e.reason);
});

// DOM Elements - with error checking
function getElement(id, name) {
  const el = document.getElementById(id);
  if (!el) error(`Element not found: #${id} (${name})`);
  else log(`Found element: #${id} (${name})`);
  return el;
}

const navItems = document.querySelectorAll('.nav-item');
const views = document.querySelectorAll('.view');
const pageTitle = getElement('page-title', 'Page Title');

// Status Elements
const connDot = getElement('conn-dot', 'Connection Dot');
const connStatus = getElement('conn-status', 'Connection Status');
const runStatus = getElement('run-status', 'Run Status');

// Action Buttons
const btnLogin = getElement('btn-login', 'Login Button');
const btnScout = getElement('btn-scout', 'Scout Button');
const btnPublish = getElement('btn-publish', 'Publish Button');
const btnRewriteNav = getElement('btn-rewrite-nav', 'Rewrite Nav Button');
const btnKill = getElement('btn-kill', 'Kill Button');
const btnClearLog = getElement('clear-log', 'Clear Log Button');

// Content Elements
const terminalEl = getElement('terminal', 'Terminal');
const reportEl = getElement('report', 'Report');
const databaseStatsEl = getElement('database-stats', 'Database Stats');
const databaseListEl = getElement('database-list', 'Database List');
const statNotesEl = getElement('stat-notes', 'Stat Notes');
const statDbEl = getElement('stat-db', 'Stat DB');
const statDraftsEl = getElement('stat-drafts', 'Stat Drafts');

// Rewrite Workshop Elements
const rewriteMaterial = getElement('rewrite-material', 'Rewrite Material');
const rewriteContent = getElement('rewrite-content', 'Rewrite Content');
const rewriteTitle = getElement('rewrite-title', 'Rewrite Title');
const rewriteTags = getElement('rewrite-tags', 'Rewrite Tags');
const rewriteSlug = getElement('rewrite-slug', 'Rewrite Slug');
const rewriteType = getElement('rewrite-type', 'Rewrite Type');
const rewriteHeadlines = getElement('rewrite-headlines', 'Rewrite Headlines');
const rewriteFile = getElement('rewrite-file', 'Rewrite File');
const rewriteRun = getElement('rewrite-run', 'Rewrite Run Button');
const rewriteExport = getElement('rewrite-export', 'Rewrite Export Button');
const rewriteClear = getElement('rewrite-clear', 'Rewrite Clear Button');
const rewriteWelcome = getElement('rewrite-welcome', 'Rewrite Welcome');
const rewriteExportResult = getElement('rewrite-export-result', 'Rewrite Export Result');
const btnRefreshReport = getElement('refresh-report', 'Refresh Report Button');
const btnRefreshDb = getElement('refresh-db', 'Refresh DB Button');
const btnRefreshTopics = getElement('refresh-topics', 'Refresh Topics Button');
const creatorTopicsEl = getElement('creator-topics', 'Creator Topics');
const btnRunPreflight = getElement('run-preflight', 'Run Preflight Button');
const preflightSummaryEl = getElement('preflight-summary', 'Preflight Summary');
const preflightListEl = getElement('preflight-list', 'Preflight List');
const btnBuildPublishPack = getElement('build-publish-pack', 'Build Publish Pack Button');
const btnCopyPublishPack = getElement('copy-publish-pack', 'Copy Publish Pack Button');
const publishPackEl = getElement('publish-pack', 'Publish Pack');
const btnSaveReview = getElement('save-review', 'Save Review Button');
const reviewTopicEl = getElement('review-topic', 'Review Topic Input');
const reviewUrlEl = getElement('review-url', 'Review URL Input');
const reviewImpressionsEl = getElement('review-impressions', 'Review Impressions Input');
const reviewLikesEl = getElement('review-likes', 'Review Likes Input');
const reviewSavesEl = getElement('review-saves', 'Review Saves Input');
const reviewCommentsEl = getElement('review-comments', 'Review Comments Input');
const reviewFollowsEl = getElement('review-follows', 'Review Follows Input');
const reviewReflectionEl = getElement('review-reflection', 'Review Reflection Input');
const reviewRecentEl = getElement('review-recent', 'Review Recent List');

// State
let currentView = 'dashboard';
let isRunning = false;
let socket = null;
let autoScroll = true;
let rewriteWelcomeLoaded = false;
let latestTopicSuggestions = [];

// View Titles
const viewTitles = {
  dashboard: '总览面板',
  report: '情报日报',
  database: '数据库',
  rewrite: '改写工坊'
};

// Initialize
function init() {
  try {
    log('Initializing Dashboard...');
    
    log('Binding navigation...');
    bindNavigation();
    
    log('Binding actions...');
    bindActions();
    
    log('Binding rewrite studio...');
    bindRewriteStudio();
    
    log('Initializing socket...');
    initSocket();
    
    log('Loading welcome banner...');
    loadWelcomeBanner();

    log('Loading quick stats...');
    loadDashboardStats();
    
    log('Dashboard initialized successfully!');
  } catch (err) {
    error('Failed to initialize dashboard:', err);
    alert('Dashboard initialization failed. Check console for details.');
  }
}

// Navigation
function bindNavigation() {
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const view = item.dataset.view;
      switchView(view);
    });
  });

  // Link items in dashboard
  document.querySelectorAll('.link-item').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const view = link.dataset.view;
      switchView(view);
    });
  });
}

function switchView(view) {
  currentView = view;
  
  // Update nav items
  navItems.forEach(item => {
    item.classList.toggle('active', item.dataset.view === view);
  });
  
  // Update views
  views.forEach(v => {
    v.classList.toggle('active', v.id === `view-${view}`);
  });
  
  // Update page title
  pageTitle.textContent = viewTitles[view];
  
  // Load content if needed
  if (view === 'report') fetchReport();
  if (view === 'database') fetchDatabase();
  if (view === 'rewrite') {
    if (!rewriteWelcomeLoaded) loadWelcomeBanner();
    fetchCreatorTopics();
    fetchRecentReviews();
  }
  if (view === 'dashboard') loadDashboardStats();
}

// Socket.IO
function initSocket() {
  try {
    socket = io();
    
    socket.on('connect', () => {
      setConnStatus(true, '已连接');
    });
    
    socket.on('disconnect', () => {
      setConnStatus(false, '已断开');
    });
    
    socket.on('log', (data) => {
      appendLog(data.line, data.source);
    });
    
    socket.on('status', (data) => {
      setRunStatus(data.running, data.script);
    });
    
  } catch (err) {
    console.error('Socket init failed:', err);
    setConnStatus(false, '连接失败');
  }
}

function setConnStatus(connected, text) {
  connDot.classList.toggle('connected', connected);
  connStatus.textContent = text;
}

function setRunStatus(running, script) {
  isRunning = running;
  runStatus.textContent = running ? (script || '运行中') : '就绪';
  runStatus.classList.toggle('running', running);
  
  // Disable/enable action buttons
  [btnLogin, btnScout, btnPublish].forEach(btn => {
    if (btn) btn.disabled = running;
  });
  if (btnKill) btnKill.disabled = !running;
}

// Log handling
function appendLog(line, source = 'stdout') {
  const div = document.createElement('div');
  div.className = `line ${source}`;
  div.textContent = line;
  terminalEl.appendChild(div);
  
  if (autoScroll) {
    terminalEl.scrollTop = terminalEl.scrollHeight;
  }
}

function clearLog() {
  terminalEl.innerHTML = '';
}

// Actions
function bindActions() {
  if (btnLogin) btnLogin.addEventListener('click', () => runScript('login'));
  if (btnScout) btnScout.addEventListener('click', () => runScript('scout'));
  if (btnPublish) btnPublish.addEventListener('click', () => runScript('publish'));
  if (btnRewriteNav) btnRewriteNav.addEventListener('click', () => switchView('rewrite'));
  if (btnKill) btnKill.addEventListener('click', killScript);
  if (btnClearLog) btnClearLog.addEventListener('click', clearLog);
  if (btnRefreshReport) btnRefreshReport.addEventListener('click', fetchReport);
  if (btnRefreshDb) btnRefreshDb.addEventListener('click', fetchDatabase);
  if (btnRefreshTopics) btnRefreshTopics.addEventListener('click', fetchCreatorTopics);
  if (btnRunPreflight) btnRunPreflight.addEventListener('click', runPreflightCheck);
  if (btnBuildPublishPack) btnBuildPublishPack.addEventListener('click', buildPublishPack);
  if (btnCopyPublishPack) btnCopyPublishPack.addEventListener('click', copyPublishPack);
  if (btnSaveReview) btnSaveReview.addEventListener('click', saveReview);
}

async function loadDashboardStats() {
  try {
    const res = await fetch('/api/stats');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '统计加载失败');
    if (statNotesEl) statNotesEl.textContent = String(data.notes || 0);
    if (statDbEl) statDbEl.textContent = String(data.notes || 0);
    if (statDraftsEl) statDraftsEl.textContent = String(data.drafts || 0);
  } catch (err) {
    log('Stats load failed:', err.message);
  }
}

async function runScript(script) {
  try {
    const res = await fetch(`/api/run/${script}`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '启动失败');
    appendLog(`[系统] 启动 ${script} 任务`, 'system');
  } catch (err) {
    appendLog(`[错误] ${err.message}`, 'stderr');
  }
}

async function killScript() {
  try {
    const res = await fetch('/api/kill', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '停止失败');
    appendLog('[系统] 已发送停止信号', 'system');
  } catch (err) {
    appendLog(`[错误] ${err.message}`, 'stderr');
  }
}

// Content fetching
async function fetchReport() {
  try {
    const res = await fetch('/api/report');
    const data = await res.json();
    const renderMarkdown = (md) => {
      if (typeof marked !== 'undefined' && marked?.parse) return marked.parse(md);
      return `<pre>${escapeHtml(md)}</pre>`;
    };
    const html = data.html || (data.content ? renderMarkdown(data.content) : '') || (data.markdown ? renderMarkdown(data.markdown) : '');
    if (html) {
      reportEl.innerHTML = html;
    } else {
      reportEl.innerHTML = '<p class="text-muted">暂无日报数据</p>';
    }
  } catch (err) {
    reportEl.innerHTML = `<p class="text-danger">加载失败: ${err.message}</p>`;
  }
}

async function fetchDatabase() {
  try {
    const res = await fetch('/api/database');
    const data = await res.json();
    renderDatabaseJson(data);
    loadDashboardStats();
  } catch (err) {
    if (databaseListEl) {
      databaseListEl.innerHTML = `<div class="db-empty"><div class="db-empty-icon">⚠️</div><div>加载失败: ${err.message}</div></div>`;
    }
  }
}

function renderDatabaseJson(data) {
  if (!databaseListEl) return;
  
  // Handle array or object with questions property
  const rawItems = Array.isArray(data) ? data : (data.questions || []);
  
  // 过滤掉网页备案相关内容
  const filterKeywords = ['备案', 'ICP', '工信部', '域名备案', '网站备案'];
  const items = rawItems.filter(item => {
    const textToCheck = `${item.title || ''} ${item.summary || ''} ${item.full_text || ''}`.toLowerCase();
    return !filterKeywords.some(keyword => textToCheck.includes(keyword.toLowerCase()));
  });
  
  // 显示过滤统计
  const filteredCount = rawItems.length - items.length;
  
  // 空数据提示
  if (!items || items.length === 0) {
    databaseListEl.innerHTML = `
      <div class="db-empty">
        <div class="db-empty-icon">🗄️</div>
        <div>暂无数据</div>
        <div style="font-size: 12px; color: #94a3b8; margin-top: 8px;">
          共 ${items.length || 0} 条记录
        </div>
      </div>
    `;
    return;
  }
  
  // 渲染统计栏
  const statsHtml = `
    <div style="padding: 16px 20px; background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%); border-radius: 12px; margin-bottom: 20px; display: flex; gap: 30px; align-items: center; flex-wrap: wrap;">
      <div>
        <span style="font-size: 24px; font-weight: 700; color: #3b82f6;">${items.length}</span>
        <span style="font-size: 13px; color: #64748b; margin-left: 6px;">显示记录</span>
      </div>
      ${filteredCount > 0 ? `
      <div>
        <span style="font-size: 24px; font-weight: 700; color: #f59e0b;">${filteredCount}</span>
        <span style="font-size: 13px; color: #64748b; margin-left: 6px;">已过滤</span>
      </div>
      ` : ''}
      <div style="font-size: 13px; color: #94a3b8;">
        过滤条件: 备案/ICP相关
      </div>
    </div>
  `;
  
  // 渲染条目列表 - 每个条目显示完整信息
  const itemsHtml = items.map((item, index) => {
    const tags = item.tags || [];
    const comments = item.hot_comments || [];
    const status = item.status || 'pending';
    const statusColor = status === 'imported' ? '#10b981' : '#f59e0b';
    const statusText = status === 'imported' ? '已导入' : '待录入';
    
    return `
      <div class="db-item" style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
        <div style="display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 12px;">
          <h4 style="margin: 0; font-size: 16px; font-weight: 600; color: #1e293b; line-height: 1.5; flex: 1; padding-right: 16px;">
            ${index + 1}. ${escapeHtml(item.title || '无标题')}
          </h4>
          <div style="display: flex; align-items: center; gap: 12px; flex-shrink: 0;">
            <span style="padding: 4px 12px; border-radius: 20px; background: ${statusColor}15; color: ${statusColor}; font-size: 12px; font-weight: 600;">${statusText}</span>
            <span style="font-size: 12px; color: #94a3b8;">${item.crawled_at ? (() => { try { return new Date(item.crawled_at).toLocaleString(); } catch(e) { return item.crawled_at; } })() : ''}</span>
          </div>
        </div>
        
        ${tags.length > 0 ? `
          <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px;">
            ${tags.map(tag => `<span style="padding: 4px 10px; border-radius: 16px; background: #eff6ff; color: #3b82f6; font-size: 12px; font-weight: 500;">${escapeHtml(tag)}</span>`).join('')}
          </div>
        ` : ''}
        
        ${item.summary ? `
          <div style="margin-bottom: 12px; padding: 12px; background: #f8fafc; border-radius: 8px; border-left: 3px solid #3b82f6;">
            <div style="font-size: 11px; color: #94a3b8; margin-bottom: 6px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">摘要</div>
            <div style="font-size: 14px; color: #475569; line-height: 1.7; white-space: pre-wrap;">${escapeHtml(item.summary)}</div>
          </div>
        ` : ''}
        
        ${item.full_text ? `
          <div style="margin-bottom: 12px;">
            <div style="font-size: 11px; color: #94a3b8; margin-bottom: 6px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">完整内容</div>
            <div style="font-size: 13px; color: #64748b; line-height: 1.8; white-space: pre-wrap; max-height: 300px; overflow-y: auto; padding: 12px; background: #f1f5f9; border-radius: 8px;">${escapeHtml(item.full_text)}</div>
          </div>
        ` : ''}
        
        <div style="display: flex; align-items: center; gap: 16px; font-size: 12px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 12px; margin-top: 12px;">
          <span>🔗 <a href="${(item.link || '#').replace(/"/g, '&quot;')}" target="_blank" style="color: #3b82f6; text-decoration: none;">查看原文</a></span>
          <span>ID: ${escapeHtml(item.id || 'N/A')}</span>
          <span>点赞: ${item.likes || 0}</span>
          <span>收藏: ${item.collects || 0}</span>
        </div>
        
        ${comments.length > 0 ? `
          <div style="margin-top: 16px; padding-top: 16px; border-top: 1px dashed #e2e8f0;">
            <div style="font-size: 12px; color: #64748b; margin-bottom: 10px; font-weight: 600;">
              💬 热门评论 (${comments.length}条)
            </div>
            <div style="display: flex; flex-direction: column; gap: 8px;">
              ${comments.map(c => `
                <div style="padding: 10px 14px; background: #fefce8; border-radius: 8px; font-size: 13px; color: #713f12; border-left: 3px solid #f59e0b;">
                  ${escapeHtml(c)}
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
  
  databaseListEl.innerHTML = statsHtml + `<div style="max-height: calc(100vh - 250px); overflow-y: auto; padding-right: 8px;">${itemsHtml}</div>`;
}

async function fetchCreatorTopics() {
  if (!creatorTopicsEl) return;
  try {
    creatorTopicsEl.innerHTML = '<div class="assistant-empty">正在生成选题建议...</div>';
    const res = await fetch('/api/creator/topics?limit=3');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '选题加载失败');
    latestTopicSuggestions = Array.isArray(data.items) ? data.items : [];
    renderCreatorTopics();
  } catch (err) {
    creatorTopicsEl.innerHTML = `<div class="assistant-empty">加载失败: ${escapeHtml(err.message)}</div>`;
  }
}

function renderCreatorTopics() {
  if (!creatorTopicsEl) return;
  if (!latestTopicSuggestions.length) {
    creatorTopicsEl.innerHTML = '<div class="assistant-empty">暂无可用选题，请先执行一次情报采集</div>';
    return;
  }

  creatorTopicsEl.innerHTML = latestTopicSuggestions.map((item, idx) => `
    <div class="topic-item">
      <div class="topic-head">
        <div class="topic-title">${escapeHtml(item.title || '未命名选题')}</div>
        <span class="topic-score">评分 ${Number(item.score || 0)}</span>
      </div>
      <div class="topic-meta">热度 ${Number(item.likes || 0)} · ${(item.reasons || []).map((r) => escapeHtml(r)).join(' / ')}</div>
      <div class="topic-angle">${escapeHtml(item.angle || '从你的实战经验切入，写可复用方法')}</div>
      <div class="topic-actions">
        <button class="btn btn-outline btn-sm topic-use-title" data-idx="${idx}">用作标题</button>
        <button class="btn btn-outline btn-sm topic-use-material" data-idx="${idx}">填入素材区</button>
      </div>
    </div>
  `).join('');

  creatorTopicsEl.querySelectorAll('.topic-use-title').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.idx);
      const item = latestTopicSuggestions[idx];
      if (!item) return;
      if (rewriteTitle) rewriteTitle.value = item.title || '';
      showToast('已将选题填入标题', 'success');
    });
  });

  creatorTopicsEl.querySelectorAll('.topic-use-material').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.idx);
      const item = latestTopicSuggestions[idx];
      if (!item) return;
      const material = [
        `选题：${item.title || ''}`,
        item.summary ? `背景：${item.summary}` : '',
        item.angle ? `建议切入：${item.angle}` : '',
      ].filter(Boolean).join('\n');
      if (rewriteMaterial) rewriteMaterial.value = material;
      if (rewriteType) rewriteType.textContent = '已填入选题素材';
      showToast('已填入素材区，可直接改写', 'success');
    });
  });
}

function runPreflightCheck() {
  const title = rewriteTitle?.value?.trim() || '';
  const content = rewriteContent?.value?.trim() || '';
  const tags = (rewriteTags?.value || '').split(/\s+/).filter(Boolean);
  const paragraphs = content.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

  const checks = [
    { ok: title.length >= 12 && title.length <= 24, weight: 20, message: '标题长度建议 12-24 字' },
    { ok: content.length >= 220, weight: 25, message: '正文建议至少 220 字，信息密度更稳定' },
    { ok: paragraphs.length >= 4, weight: 15, message: '段落建议不少于 4 段，阅读更友好' },
    { ok: tags.length >= 3 && tags.length <= 8, weight: 20, message: '标签建议 3-8 个' },
    { ok: /(我|自己|复盘|踩坑|实习|项目|经验)/.test(content), weight: 10, message: '建议加入“你自己的经历/观点”' },
    { ok: /(欢迎|评论区|私信|一起交流|你也可以|有问题)/.test(content), weight: 10, message: '结尾建议有互动引导（CTA）' },
  ];

  const score = checks.reduce((sum, item) => sum + (item.ok ? item.weight : 0), 0);
  if (preflightSummaryEl) {
    preflightSummaryEl.textContent = `检查完成: ${score}/100 ${score >= 80 ? '（可发布）' : '（建议优化后再发）'}`;
  }
  if (preflightListEl) {
    preflightListEl.innerHTML = checks.map((item) => `
      <div class="preflight-item ${item.ok ? 'ok' : 'warn'}">
        ${item.ok ? '✓' : '!'} ${item.message}
      </div>
    `).join('');
  }

  return { score, checks };
}

function buildPublishPack() {
  const title = rewriteTitle?.value?.trim() || '';
  const content = rewriteContent?.value?.trim() || '';
  const tags = (rewriteTags?.value || '').split(/\s+/).filter(Boolean);

  if (!title || !content) {
    showToast('请先完成标题和正文', 'error');
    return;
  }

  const firstComment = generateFirstComment(content, tags);
  const pack = [
    '【标题】',
    title,
    '',
    '【正文】',
    content,
    '',
    '【标签】',
    tags.join(' ') || '#小红书 #内容创作',
    '',
    '【首评建议】',
    firstComment,
  ].join('\n');

  if (publishPackEl) publishPackEl.value = pack;
  showToast('发布包已生成，可直接复制', 'success');
}

function generateFirstComment(content, tags) {
  const firstLine = content
    .split(/\r?\n/)
    .map((s) => s.trim())
    .find((s) => s.length > 0) || '';
  const shortLine = firstLine.length > 48 ? `${firstLine.slice(0, 48)}...` : firstLine;
  const tagHint = tags.slice(0, 2).join(' ');
  return `补充一句：${shortLine}\n如果你也在做类似方向，欢迎评论区交流。${tagHint}`.trim();
}

async function copyPublishPack() {
  const text = publishPackEl?.value?.trim() || '';
  if (!text) {
    showToast('先点击“生成”再复制', 'error');
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    showToast('发布包已复制', 'success');
  } catch (err) {
    showToast('复制失败，请手动复制', 'error');
  }
}

async function saveReview() {
  const topic = reviewTopicEl?.value?.trim() || '';
  if (!topic) {
    showToast('请先填写复盘主题', 'error');
    return;
  }

  const toNumber = (el) => {
    const val = Number(el?.value || 0);
    return Number.isFinite(val) ? Math.max(0, Math.round(val)) : 0;
  };

  const payload = {
    topic,
    noteUrl: reviewUrlEl?.value?.trim() || '',
    impressions: toNumber(reviewImpressionsEl),
    likes: toNumber(reviewLikesEl),
    saves: toNumber(reviewSavesEl),
    comments: toNumber(reviewCommentsEl),
    follows: toNumber(reviewFollowsEl),
    reflection: reviewReflectionEl?.value?.trim() || '',
  };

  try {
    const res = await fetch('/api/creator/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '保存失败');
    showToast(`复盘已保存，互动率 ${data.item?.engagementRate ?? 0}%`, 'success');
    fetchRecentReviews();
  } catch (err) {
    showToast(`保存失败: ${err.message}`, 'error');
  }
}

async function fetchRecentReviews() {
  if (!reviewRecentEl) return;
  try {
    const res = await fetch('/api/creator/reviews?limit=5');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '加载失败');
    const items = Array.isArray(data.items) ? data.items : [];
    if (!items.length) {
      reviewRecentEl.innerHTML = '<div class="assistant-empty">暂无复盘记录，建议每篇发布后记一条</div>';
      return;
    }
    reviewRecentEl.innerHTML = items.map((item) => `
      <div class="review-item">
        <strong>${escapeHtml(item.topic || '未命名')}</strong><br/>
        互动率: ${Number(item.engagementRate || 0)}% · 曝光: ${Number(item.impressions || 0)} · 点赞: ${Number(item.likes || 0)} · 收藏: ${Number(item.saves || 0)}<br/>
        ${item.reflection ? `复盘: ${escapeHtml(item.reflection)}` : ''}
      </div>
    `).join('');
  } catch (err) {
    reviewRecentEl.innerHTML = `<div class="assistant-empty">复盘加载失败: ${escapeHtml(err.message)}</div>`;
  }
}

// Rewrite Studio
function bindRewriteStudio() {
  if (!rewriteRun || !rewriteExport) return;
  
  rewriteRun.addEventListener('click', runRewrite);
  rewriteExport.addEventListener('click', exportRewrite);
  rewriteClear.addEventListener('click', clearRewrite);
  
  rewriteFile.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      rewriteMaterial.value = text;
      rewriteType.textContent = '文件已加载';
    } catch (err) {
      rewriteType.textContent = '文件读取失败';
    }
  });
  
  // Keyboard shortcuts
  rewriteMaterial.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      runRewrite();
    }
  });
  
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 's') {
      if (currentView === 'rewrite') {
        e.preventDefault();
        exportRewrite();
      }
    }
  });
}

async function loadWelcomeBanner() {
  try {
    const res = await fetch('/api/rewrite/welcome');
    const data = await res.json();
    if (data.message && rewriteWelcome) {
      rewriteWelcome.textContent = data.message;
      rewriteWelcome.classList.remove('hidden');
      rewriteWelcomeLoaded = true;
    }
  } catch (err) {
    console.log('Welcome banner not loaded');
  }
}

async function runRewrite() {
  const material = rewriteMaterial?.value?.trim();
  if (!material) {
    rewriteType.textContent = '请输入素材';
    return;
  }
  
  rewriteType.textContent = '改写中...';
  rewriteRun.disabled = true;
  rewriteExport.disabled = true;
  
  try {
    const res = await fetch('/api/rewrite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ material, maxHeadlines: 4 })
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '改写失败');
    
    // Update UI
    rewriteType.textContent = data.detectedType || '完成';
    rewriteContent.value = data.rewrite || '';
    rewriteTags.value = (data.tags || []).map(t => t.startsWith('#') ? t : `#${t}`).join(' ');
    
    // Render headlines
    renderHeadlines(data.headlines || []);
    runPreflightCheck();
    
  } catch (err) {
    rewriteType.textContent = err.message;
  } finally {
    rewriteRun.disabled = false;
    rewriteExport.disabled = false;
  }
}

function renderHeadlines(headlines) {
  if (!rewriteHeadlines) return;
  
  if (headlines.length === 0) {
    rewriteHeadlines.innerHTML = '<span class="headline-placeholder">暂无候选标题</span>';
    return;
  }
  
  rewriteHeadlines.innerHTML = headlines.map((h, i) => 
    `<span class="headline-item" data-title="${escapeHtml(h)}">${escapeHtml(h)}</span>`
  ).join('');
  
  // Add click handlers
  rewriteHeadlines.querySelectorAll('.headline-item').forEach(item => {
    item.addEventListener('click', () => {
      if (rewriteTitle) rewriteTitle.value = item.dataset.title;
      rewriteHeadlines.querySelectorAll('.headline-item').forEach(h => h.classList.remove('active'));
      item.classList.add('active');
    });
  });
}

async function exportRewrite() {
  const title = rewriteTitle?.value?.trim();
  const content = rewriteContent?.value?.trim();
  const tags = rewriteTags?.value?.split(/\s+/).filter(Boolean) || [];
  const slug = rewriteSlug?.value?.trim();
  
  if (!title) {
    showToast('请输入标题', 'error');
    return;
  }
  if (!content) {
    showToast('请输入正文', 'error');
    return;
  }
  
  rewriteExport.disabled = true;
  
  try {
    const res = await fetch('/api/rewrite/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, rewrite: content, tags, slug })
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '导出失败');
    
    showToast(`已导出: ${data.mdPath || '成功'}`, 'success');
    loadDashboardStats();
    
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    rewriteExport.disabled = false;
  }
}

function clearRewrite() {
  if (rewriteMaterial) rewriteMaterial.value = '';
  if (rewriteContent) rewriteContent.value = '';
  if (rewriteTitle) rewriteTitle.value = '';
  if (rewriteTags) rewriteTags.value = '';
  if (rewriteSlug) rewriteSlug.value = '';
  if (rewriteType) rewriteType.textContent = '准备就绪';
  if (rewriteHeadlines) rewriteHeadlines.innerHTML = '<span class="headline-placeholder">点击"开始改写"生成标题建议</span>';
  if (rewriteWelcome) rewriteWelcome.classList.add('hidden');
  if (publishPackEl) publishPackEl.value = '';
  if (preflightSummaryEl) preflightSummaryEl.textContent = '等待检查';
  if (preflightListEl) preflightListEl.innerHTML = '';
}

function showToast(message, type = 'success') {
  if (!rewriteExportResult) return;
  
  rewriteExportResult.textContent = message;
  rewriteExportResult.className = `export-toast ${type === 'error' ? 'error' : ''}`;
  rewriteExportResult.classList.remove('hidden');
  
  setTimeout(() => {
    rewriteExportResult.classList.add('hidden');
  }, 3000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Start
init();
