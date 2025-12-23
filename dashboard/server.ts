import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { marked } from 'marked';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const REPORT_PATH = path.join(PROJECT_ROOT, 'reports', 'daily_trends.md');
const DB_PATH = path.join(PROJECT_ROOT, 'data', 'interview_questions.json');
const PORT = Number(process.env.PORT) || 3000;

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor', express.static(path.join(PROJECT_ROOT, 'node_modules', 'marked')));

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
    res.json({ content });
  } catch (err: any) {
    res.status(404).json({ error: err?.message || 'Database not found' });
  }
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
