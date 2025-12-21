const connStatusEl = document.getElementById('conn-status');
const runStatusEl = document.getElementById('run-status');
const terminalEl = document.getElementById('terminal');
const btnLogin = document.getElementById('btn-login');
const btnScout = document.getElementById('btn-scout');
const btnPublish = document.getElementById('btn-publish');
const btnKill = document.getElementById('btn-kill');
const clearBtn = document.getElementById('clear-log');
const reportEl = document.getElementById('report');
const dbEl = document.getElementById('database');
const tabs = document.querySelectorAll('.tab');
const tabBodies = {
  report: document.getElementById('tab-report'),
  database: document.getElementById('tab-database'),
};

let autoScroll = true;
let isRunning = false;

function setConnStatus(text, ok) {
  connStatusEl.textContent = text;
  connStatusEl.style.borderColor = ok ? 'rgba(24,255,98,0.8)' : '#ff5f5f';
  connStatusEl.style.color = ok ? '#d9ffe4' : '#ff9f9f';
}

function setRunStatus(running, script) {
  isRunning = running;
  runStatusEl.textContent = running ? `Running: ${script || ''}` : 'Idle';
  runStatusEl.style.borderColor = running ? 'rgba(24,255,98,0.8)' : 'rgba(24,255,98,0.3)';
  [btnLogin, btnScout, btnPublish].forEach((btn) => (btn.disabled = running));
  btnKill.disabled = !running;
}

function appendLine({ line, source }) {
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

function bindTabs() {
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      Object.values(tabBodies).forEach((body) => body.classList.add('hidden'));
      const target = tab.dataset.tab;
      tabBodies[target].classList.remove('hidden');
      if (target === 'report') fetchReport();
      if (target === 'database') fetchDatabase();
    });
  });
}

async function fetchReport() {
  try {
    const res = await fetch('/api/report');
    const data = await res.json();
    if (data.content) {
      reportEl.innerHTML = window.marked.parse(data.content);
    } else {
      reportEl.textContent = data.error || 'No report found';
    }
  } catch (err) {
    reportEl.textContent = '无法加载日报: ' + (err.message || err);
  }
}

async function fetchDatabase() {
  try {
    const res = await fetch('/api/database');
    const data = await res.json();
    if (data.content) {
      const parsed = JSON.parse(data.content);
      dbEl.textContent = JSON.stringify(parsed, null, 2);
    } else {
      dbEl.textContent = data.error || 'No database file';
    }
  } catch (err) {
    dbEl.textContent = '无法加载数据库: ' + (err.message || err);
  }
}

function refreshPreviewsIfIdle() {
  if (!isRunning) {
    fetchReport();
    fetchDatabase();
  }
}

function setupSocket() {
  const socket = io();

  socket.on('connect', () => setConnStatus('WS: online', true));
  socket.on('disconnect', () => setConnStatus('WS: offline', false));
  socket.on('hello', () => setConnStatus('WS: online', true));

  socket.on('status', ({ running, script }) => {
    setRunStatus(running, script);
    if (!running) {
      refreshPreviewsIfIdle();
    }
  });

  socket.on('log', (payload) => appendLine(payload));

  btnLogin.addEventListener('click', () => socket.emit('start_login'));
  btnScout.addEventListener('click', () => socket.emit('start_scout'));
  btnPublish.addEventListener('click', () => socket.emit('start_publish'));
  btnKill.addEventListener('click', () => socket.emit('kill_task'));
}

function init() {
  bindTabs();
  setupSocket();
  clearBtn.addEventListener('click', clearLog);
  // initial fetches
  fetchReport();
  fetchDatabase();

  // auto-scroll toggle on manual scroll
  terminalEl.addEventListener('scroll', () => {
    const nearBottom = terminalEl.scrollHeight - terminalEl.scrollTop - terminalEl.clientHeight < 20;
    autoScroll = nearBottom;
  });
}

init();
