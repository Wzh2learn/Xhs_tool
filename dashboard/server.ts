import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { marked } from 'marked';
import { AI_CONFIG, DRAFTS_DIR } from '../src/config';
import { callAI } from '../src/ai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const REPORT_PATH = path.join(PROJECT_ROOT, 'reports', 'daily_trends.md');
const DB_PATH = path.join(PROJECT_ROOT, 'data', 'interview_questions.json');
const PORT = Number(process.env.PORT) || 3000;

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

app.use(express.json({ limit: '5mb' }));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor', express.static(path.join(PROJECT_ROOT, 'node_modules', 'marked')));

const WW_WELCOME_MESSAGE = '🫡 收到！王王的分身已就位。\n\n不管是**实习复盘**、**项目安利**还是**深夜emo**，把你的素材丢给我吧。我会用最真实的口吻，帮你把这些经历变成笔记！';

const WW_SYSTEM_PROMPT = `# Role: 小红书个人IP分身——王王（转码版）

## 1. Profile

- 身份: 北邮研一、零基础转码选手、搜广推（搜索/广告/推荐）算法实习生。
- 核心人设: 一个正在打怪升级的“真实学长”。
- 人设关键词:
  - 真实: 会焦虑、会迷茫、会觉得自己菜，不装大佬。
  - 诚恳: 分享的都是踩过的坑或实打实的干货，拒绝宏大叙事。
  - 幸存者偏差: 保持谦卑，把成功归结为运气（“玄学”），把失败归结为经验。

## 2. Goal

接收用户提供的【任意主题素材】（可能是技术分享、面试复盘、实习日常、心情吐槽等），将其重写为一篇符合“王王（转码版）”人设风格的小红书笔记。

## 3. Style Guidelines (核心滤镜)

请对所有输出内容进行“去 AI 化”处理，严格遵守以下法则：

1) 禁止“翻译腔”与“公文风”
   - 严禁使用：首先/其次/最后、综上所述、不仅...而且...、在这个充满挑战的时代、助力、赋能。
   - 强制替换：其实... / 说实话... / 哪怕是... / 真的汗流浃背了 / 也是醉了 / 碎碎念一下。

2) 强制植入“内心独白”
   - 必须在正文中穿插使用括号（），用来存放你的内心戏、吐槽、补充说明或自嘲。

3) 情绪前置与共鸣
   - 不要写“前言”。开篇直接抛出情绪或一个具体的场景。
   - 把“读者”当成“兄弟/同学”，语气要平等交流。

4) 排版微操
   - 善用 Emoji 作为视觉锚点，但不要每句都加。
   - 长短句结合，关键的转折或金句独占一行。

## 4. Dynamic Structure (动态结构)

根据用户输入的素材类型，自动选择最合适的笔记结构：

- Type A: 技术/工具分享
  - 结构: 痛点引入 -> 我做了什么 -> 核心功能 -> 卑微求反馈/内测。

- Type B: 经历/复盘
  - 结构: 结果前置 -> 过程回顾 -> 经验总结 -> 鼓励大家。

- Type C: 日常/碎碎念
  - 结构: 时间/地点 -> 发生了什么 -> 此时此刻的想法 -> 随意结尾。

## 5. Workflow

1) Analyze: 阅读素材，判断属于哪种类型（Type A/B/C 或其他）。
2) Headline: 生成 3-4 个爆款标题（包含数据对比/反差/特定名词）。
3) Rewrite: 应用 Style Guidelines 进行正文重写。
   - 注意: 如果素材中有具体的代码、工具名、公司名，务必保留。
4) Tags: 生成 5-8 个标签（如 #小红书实习 #转码 #算法 #日常）。`;

function jsonFromText(text: string): any {
  const trimmed = (text || '').trim();
  if (!trimmed) {
    throw new Error('empty response');
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const slice = candidate.slice(start, end + 1);
      return JSON.parse(slice);
    }
    throw new Error('invalid json');
  }
}

function ensureStringArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((v) => String(v)).filter(Boolean);
  }
  return String(value)
    .split(/\r?\n|,|，|、/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeTags(tags: unknown): string[] {
  const arr = ensureStringArray(tags);
  const cleaned = arr
    .flatMap((t) => t.match(/#[\u4e00-\u9fa5a-zA-Z0-9_]+/g) || [t])
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (t.startsWith('#') ? t : `#${t}`))
    .map((t) => t.replace(/^#+/, '#'))
    .map((t) => t.replace(/\s+/g, ''))
    .filter((t) => /^#[\u4e00-\u9fa5a-zA-Z0-9_]+$/.test(t));

  return [...new Set(cleaned)].slice(0, 10);
}

function normalizeHeadlines(headlines: unknown, maxCount: number): string[] {
  const arr = ensureStringArray(headlines)
    .map((s) => s.replace(/^[-*\d.\s]+/, '').trim())
    .filter(Boolean);
  const uniq = [...new Set(arr)];
  return uniq.slice(0, Math.max(1, Math.min(6, maxCount)));
}

function makeDefaultSlug(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `note_${y}${m}${day}_${hh}${mm}${ss}`;
}

function sanitizeSlug(slug: string): string {
  const s = (slug || '').trim();
  if (!s) return makeDefaultSlug();
  const cleaned = s.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  return cleaned || makeDefaultSlug();
}

app.get('/api/rewrite/welcome', (_req, res) => {
  res.json({ message: WW_WELCOME_MESSAGE });
});

app.post('/api/rewrite', async (req, res) => {
  try {
    if (!AI_CONFIG.isConfigured) {
      return res.status(400).json({
        error: 'AI 未配置：请在 .env 中设置 DEEPSEEK_API_KEY（以及可选的 DEEPSEEK_BASE_URL/DEEPSEEK_MODEL）',
      });
    }

    const body = (req.body || {}) as { material?: string; maxHeadlines?: number };
    const material = String(body.material || '').trim();
    const maxHeadlinesInput = Number(body.maxHeadlines || 4);
    const maxHeadlines = Math.max(1, Math.min(6, Number.isFinite(maxHeadlinesInput) ? maxHeadlinesInput : 4));

    if (!material) {
      return res.status(400).json({ error: 'material is required' });
    }

    const prompt = `你将把“用户素材”改写为一篇小红书笔记。请严格输出 JSON，不要输出任何额外文字。

输出 JSON schema:
{
  "detectedType": "Type A" | "Type B" | "Type C" | "Other",
  "headlines": string[],
  "rewrite": string,
  "tags": string[]
}

硬性要求:
1) headlines: 3-4 条，简短有力
2) tags: 5-8 个，格式必须是 #标签
3) rewrite: 必须包含（内心独白），必须去 AI 化；开头直接情绪/场景；不要写“前言”
4) 保留素材中的具体名词/代码/工具名/公司名

用户素材:
"""
${material}
"""`;

    const raw = await callAI(prompt, WW_SYSTEM_PROMPT);
    if (!String(raw || '').trim()) {
      return res.status(502).json({
        error: 'AI 返回内容为空',
        hint: '请检查 DEEPSEEK 配置/网络连接，或稍后重试',
      });
    }

    let parsed: any;
    try {
      parsed = jsonFromText(raw);
    } catch (e: any) {
      return res.status(502).json({
        error: 'AI 返回内容无法解析为 JSON',
        hint: '可尝试再次点击 Rewrite；若持续失败，请调整提示词让模型只输出 JSON',
        raw,
        parseError: e?.message || String(e),
      });
    }

    const detectedType = String(parsed?.detectedType || parsed?.type || 'Other');
    const headlines = normalizeHeadlines(parsed?.headlines, maxHeadlines);
    const rewrite = String(parsed?.rewrite || parsed?.content || '').trim();
    const tags = normalizeTags(parsed?.tags);

    if (!rewrite) {
      return res.status(502).json({
        error: 'AI 返回内容缺少 rewrite 字段',
        hint: '可尝试再次点击 Rewrite；若持续失败，请调整提示词让模型严格返回 schema',
        raw,
      });
    }

    res.json({
      detectedType,
      headlines,
      rewrite,
      tags,
      raw,
    });
  } catch (err: any) {
    console.error('[rewrite] error', err);
    res.status(500).json({ error: err?.message || String(err) });
  }
});

app.post('/api/rewrite/export', async (req, res) => {
  try {
    const body = (req.body || {}) as { title?: string; rewrite?: string; tags?: string[]; slug?: string };
    const title = String(body.title || '').trim();
    const rewrite = String(body.rewrite || '').trim();
    const tags = normalizeTags(body.tags);
    const slug = sanitizeSlug(String(body.slug || ''));

    if (!title) {
      return res.status(400).json({ error: 'title is required' });
    }
    if (!rewrite) {
      return res.status(400).json({ error: 'rewrite is required' });
    }

    await fs.promises.mkdir(DRAFTS_DIR, { recursive: true });

    let fileName = `${slug}.md`;
    let mdPath = path.join(DRAFTS_DIR, fileName);
    if (fs.existsSync(mdPath)) {
      const suffix = Date.now();
      fileName = `${slug}_${suffix}.md`;
      mdPath = path.join(DRAFTS_DIR, fileName);
    }

    const tagLine = tags.length > 0 ? tags.join(' ') : '';
    const mdContent = `# ${title}\n${tagLine}\n\n${rewrite}\n`;
    // 强制 UTF-8 编码（带 BOM 以兼容 Windows 记事本）
    await fs.promises.writeFile(mdPath, Buffer.from([0xEF, 0xBB, 0xBF, ...Buffer.from(mdContent, 'utf-8')]), 'utf-8');

    res.json({ mdPath, imagePaths: [] });
  } catch (err: any) {
    console.error('[rewrite/export] error', err);
    res.status(500).json({ error: err?.message || String(err) });
  }
});

app.get('/api/report', async (_req, res) => {
  try {
    const content = await fs.promises.readFile(REPORT_PATH, 'utf-8');
    const html = marked.parse(content);
    res.json({ content, html });
  } catch (err: any) {
    res.status(404).json({ error: err?.message || 'Report not found' });
  }
});

app.get('/api/database', async (_req, res) => {
  try {
    const content = await fs.promises.readFile(DB_PATH, 'utf-8');
    const data = JSON.parse(content);
    res.json(data);
  } catch (err: any) {
    res.status(404).json({ error: err?.message || 'Database not found' });
  }
});

// HTTP API routes for script control (matching frontend fetch calls)
app.post('/api/run/:script', (req, res) => {
  const script = req.params.script as ScriptName;
  if (!scriptMap[script]) {
    return res.status(400).json({ error: `Unknown script: ${script}` });
  }
  if (currentProc) {
    return res.status(429).json({ error: `任务正在运行: ${currentScript}` });
  }
  
  startScript(script);
  res.json({ ok: true, script });
});

app.post('/api/kill', (_req, res) => {
  if (!currentProc) {
    return res.status(400).json({ error: '当前没有运行中的任务' });
  }
  killCurrent('API Kill');
  res.json({ ok: true });
});

// 工具式接口：通过 tool.ts 调用 list/search/detail/profile
// GET /api/tool?action=searchFeeds&params={"keyword":"推荐系统"}
app.get('/api/tool', (req, res) => {
  const action = (req.query.action as string) || '';
  const params = (req.query.params as string) || '';
  if (!action) {
    return res.status(400).json({ error: 'action is required', actions: ['listFeeds', 'searchFeeds', 'getFeedDetail', 'userProfile'] });
  }
  if (currentProc) {
    return res.status(429).json({ error: `任务正在运行: ${currentScript}` });
  }

  emitLog(`[system] API 调用 tool: ${action} ${params ? `(params: ${params})` : ''}`, 'system');
  startScript('tool', params ? [action, params] : [action]);
  res.json({ ok: true, action, params });
});

type ScriptName = 'login' | 'scout' | 'publish' | 'tool';

let currentProc: ChildProcessWithoutNullStreams | null = null;
let currentScript: ScriptName | null = null;

const scriptMap: Record<ScriptName, { cmd: string; args: string[] }> = {
  login: { cmd: 'npx', args: ['tsx', 'login.ts'] },
  scout: { cmd: 'npx', args: ['tsx', 'index.ts'] },
  publish: { cmd: 'npx', args: ['tsx', 'publisher.ts'] },
  tool: { cmd: 'npx', args: ['tsx', 'tool.ts'] }, // 新增工具入口
};

function broadcastStatus() {
  io.emit('status', { running: !!currentProc, script: currentScript });
}

function emitLog(message: string, source: 'stdout' | 'stderr' | 'system', script?: ScriptName) {
  const lines = message.split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    io.emit('log', { line, source, script });
  }
}

function startScript(script: ScriptName, extraArgs: string[] = []) {
  if (currentProc) {
    emitLog(`[system] 任务正在运行: ${currentScript}. 请稍后再试`, 'system');
    return;
  }

  const spec = scriptMap[script];
  const args = extraArgs.length > 0 ? [...spec.args, ...extraArgs] : spec.args;
  emitLog(`[system] 启动脚本: ${script}`, 'system');

  const child = spawn(spec.cmd, args, {
    cwd: PROJECT_ROOT,
    shell: process.platform === 'win32',
    env: process.env,
  });

  currentProc = child;
  currentScript = script;
  broadcastStatus();

  child.stdout.on('data', (data) => emitLog(data.toString(), 'stdout', script));
  child.stderr.on('data', (data) => emitLog(data.toString(), 'stderr', script));

  child.on('close', (code) => {
    emitLog(`[system] 脚本退出，代码: ${code ?? 'null'}`, 'system', script);
    currentProc = null;
    currentScript = null;
    broadcastStatus();
  });

  child.on('error', (err) => {
    emitLog(`[system] 启动失败: ${err.message}`, 'system', script);
    currentProc = null;
    currentScript = null;
    broadcastStatus();
  });
}

function killCurrent(reason = '用户请求停止'): void {
  if (!currentProc) {
    emitLog('[system] 当前没有运行中的任务', 'system');
    return;
  }
  emitLog(`[system] 尝试停止任务: ${currentScript} (${reason})`, 'system');

  try {
    if (process.platform === 'win32') {
      // 在 Windows 上调用 taskkill
      spawn('taskkill', ['/pid', String(currentProc.pid), '/f', '/t']);
    } else {
      currentProc.kill('SIGTERM');
      setTimeout(() => currentProc && currentProc.kill('SIGKILL'), 2000);
    }
  } catch (err: any) {
    emitLog(`[system] 停止失败: ${err?.message || err}`, 'system');
  }
}

io.on('connection', (socket) => {
  socket.emit('hello', { message: 'connected' });
  broadcastStatus();

  socket.on('start_login', () => startScript('login'));
  socket.on('start_scout', () => startScript('scout'));
  socket.on('start_publish', () => startScript('publish'));
  socket.on('kill_task', () => killCurrent('前端 Kill'));

  socket.on('disconnect', () => {
    // nothing for now
  });
});

httpServer.listen(PORT, () => {
  console.log(`Dashboard server running at http://localhost:${PORT}`);
});
