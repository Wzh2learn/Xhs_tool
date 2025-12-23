# 📘 XHS Automation - 搜广推实习生自动运营系统

> 基于 Puppeteer 移植 [xiaohongshu-mcp](https://github.com/xpzouying/xiaohongshu-mcp) (Go) 核心逻辑的小红书自动发布工具，专为"搜广推算法实习生"人设打造的内容运营解决方案。

**🚀 v6.0 Dashboard Edition (Stable)** - Web 控制台 + 实时日志 + Feed 穿插 + AI 关键词

---

## 🎯 核心特性 (Features)

### ✅ v6.0 新功能

| 功能 | 说明 |
|------|------|
| 🖥️ **Web Dashboard** | 一键启动 `npm run dashboard`，浏览器控制全流程 |
| 📡 **实时监控** | Socket.io 推送日志，前端终端实时滚动 |
| 🛡️ **并发防护** | Dashboard 进程锁，防止 Scout/Publish 同时运行 |
| ⛔ **一键 Kill** | Dashboard 提供 Kill Task 按钮，终止卡死任务 |
| 🧰 **Tool API** | Dashboard 提供 `/api/tool`，以“工具接口”方式调用 `list/search/detail/profile` |
| 🧩 **__INITIAL_STATE__ 解析** | 优先从 `window.__INITIAL_STATE__` 抽取 feed/search/detail/profile，DOM 方案作为兜底 |

### ✅ v5.1 功能 (延续)
| 功能 | 说明 |
|------|------|
| 📱 **Feed流穿插** | 搜索间随机穿插2次Feed流浏览，获取1-2篇笔记 |
| 🎬 **视频检测** | 自动识别视频笔记，模拟观看但不记录内容 |
| 🧠 **AI关键词扩展** | DeepSeek 智能扩展搜索关键词 |
| 💬 **评论抓取** | 提取热门评论 Top 3 |
| 📅 **日期日报** | 日报文件自动带日期命名 `daily_YYYY-MM-DD.md` |
| ⏱️ **优化时序** | 停留15-30s，搜索间隔20-40s |

### ✅ Deep Dive Analysis (深度分析)
- 自动抓取笔记**正文全文** + **Top 5 热评**
- 智能过滤无意义短评（"求带"、"同问"）
- 精准捕捉评论区的**面试追问细节**
- **v5.0**: 短正文自动 OCR 补充图片内容

### ✅ Local Database (本地题库)
- JSON 增量写入，基于 `note_id` 自动去重
- 完整字段：`id` / `link` / `full_text` / `hot_comments`
- 状态管理：`status: "pending"` → `"imported"`
- 可直接导入 AlgoQuest 题库

### ✅ Human-Simulation (拟人防检测)
- 🖱️ **贝塞尔曲线鼠标轨迹**：自然的鼠标移动路径
- ⌨️ **变速打字**：80-200ms/字，偶尔"思考"停顿
- 📱 **Feed流穿插**：搜索间随机刷首页，更自然
- ⏱️ **真人停留**：每篇笔记停留 15-30 秒
- 🔀 **随机间隔**：关键词搜索间隔 20-40 秒
- 👤 **指纹隐藏**：随机视口 + webdriver 特征移除
- 🎬 **视频处理**：检测视频笔记，观看但不记录

### ✅ 其他特性
- **Copy-Paste Engineering**: 直接移植 MCP 项目的页面交互逻辑
- **本地图片直传**: Puppeteer 原生 `uploadFile()`
- **自动归档**: 发布成功后移入 `published/` 目录

---

## 🚨 安全红线 (Safety Guidelines)

> ⚠️ **严重警告**：违反以下规则可能导致账号被封！

| 禁止行为 | 原因 |
|----------|------|
| 🚫 **严禁多开** | 同一账号不要同时运行多个脚本实例 |
| 🚫 **严禁加速** | 不要修改 `SAFETY_CONFIG` 中的延迟参数 |
| 🚫 **严禁频繁登录** | 每天最多运行 2-3 次，间隔 > 4 小时 |
| 🚫 **严禁深夜运行** | 避免凌晨 1-6 点运行（异常行为标记） |

---

## 🚀 快速开始 (Quick Start · Dashboard 优先)

1) 安装依赖
```bash
cd d:\AIlearn\xhs_automation
npm install
```

2) 启动 Dashboard
```bash
npm run dashboard
```

3) 打开浏览器
```
http://localhost:3000
```
在页面点击：
- 🔑 Login：扫码获取 Cookie（只需偶尔执行）
- 🕵️ Scout：自动情报搜集（生成日报 + 题库）
- 🚀 Publish：读取 drafts 并自动发布
- ⛔ Kill Task：终止卡住的进程

> 日报与题库预览：界面底部的 Tabs（Daily Report / Database）

### 可选：配置环境变量

```bash
# 复制模板
cp .env.example .env

# 编辑 .env 文件，填入你的 AI API 配置
```

`.env` 文件内容：
```env
# DeepSeek API 配置
DEEPSEEK_API_KEY=sk-your-deepseek-key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
```

> 💡 不配置 AI 也能运行，会跳过 AI 关键词扩展和智能分析

### 传统 CLI (备选)
- `npx tsx login.ts`
- `npx tsx index.ts`
- `npx tsx publisher.ts`

### 工具化接口（Tool）

**CLI：**

- `npx tsx tool.ts listFeeds`
- `npx tsx tool.ts searchFeeds "{\"keyword\":\"推荐系统\"}"`
- `npx tsx tool.ts getFeedDetail "{\"feedId\":\"<id>\",\"xsecToken\":\"<token可选>\"}"`
- `npx tsx tool.ts userProfile "{\"userId\":\"<id>\",\"xsecToken\":\"<token可选>\"}"`

**Dashboard HTTP：**

- `GET /api/tool?action=listFeeds`
- `GET /api/tool?action=searchFeeds&params={"keyword":"推荐系统"}`

### 准备内容（发布前）

将 Markdown 文件和**同名配图**放入 `content/drafts/` 目录：

```
content/drafts/
├── my_post.md      ← 文案
└── my_post.jpg     ← 配图 (⚠️ 必须与 .md 同名!)
```

> **重要**：图片和 Markdown 文件名必须完全一致（如 `note1.md` 对应 `note1.jpg`）

发布请直接在 Dashboard 点击 🚀 Publish（等效于 `npx tsx publisher.ts`）。自动扫描 drafts → 上传 → 发布 → 归档。

---

## 📝 内容制作规范

### 目录结构

```
d:\AIlearn\xhs_automation\
├── src/                  # 模块化代码
│   ├── config.ts         # 配置常量
│   ├── types.ts          # 类型定义
│   ├── selectors.ts      # DOM 选择器
│   ├── utils.ts          # 通用工具函数
│   ├── ocr.ts            # OCR 图片识别
│   ├── ai.ts             # AI 智能分析
│   ├── xhsInitialState.ts # __INITIAL_STATE__ 抽取工具
│   └── database.ts       # 数据库操作
├── content/
│   ├── drafts/           # 待发布 (放这里)
│   └── published/        # 已发布 (自动归档)
├── reports/              # 每日情报日报
├── data/                 # AlgoQuest 本地题库
├── index.ts              # 情报搜集主程序
├── publisher.ts          # 发布工具
├── login.ts              # 登录工具
├── tool.ts               # 工具式入口（list/search/detail/profile）
└── .env.example          # 环境变量模板
```

### Markdown 模板

```markdown
# 这里是标题 (会被解析为笔记标题)

#标签1 #标签2 #标签3 #最多10个

这里是正文内容...

可以有多个段落，支持 Markdown 格式。

## 小标题也可以

- 列表项 1
- 列表项 2

正文会自动提取，标签行会被过滤掉。
```

### 解析规则

| 元素 | 规则 |
|------|------|
| **标题** | 第一行以 `# ` 开头的内容 |
| **标签** | 所有 `#中文或英文` 格式的词 (自动去重，最多10个) |
| **正文** | 除标题和纯标签行之外的所有内容 |
| **图片** | 与 `.md` 同名的 `.jpg/.png/.jpeg/.gif/.webp` 文件 |

### 示例：实习生拆题模板

```markdown
# 实习日记：DeepFM 特征交叉的工业落地细节

#搜广推 #算法实习 #推荐系统 #DeepFM #CTR预估

今天组会讨论了 DeepFM 在真实场景下的应用，发现面经里的很多说法太理论了...

## 面试 vs 实战对比

**面试常问：**
- DeepFM 和 Wide&Deep 的区别？

**实战关注：**
- Embedding 维度怎么统一对齐？
- 线上推理延迟怎么优化？

---

💡 复习神器：用 AlgoQuest 整理的推荐系统知识树~
```

---

## 🔧 故障排查

### 问题 1：发布失败，页面没反应

**检查 Cookie 是否过期**:
```bash
# 重新登录获取新 Cookie
npx tsx login.ts
```

### 问题 2：报错后想查看页面状态

**查看错误截图**:
```
d:\AIlearn\xhs_automation\error_screenshot.png
```

发布失败时会自动截图保存当前页面状态。

### 问题 3：图片上传超时

**可能原因**:
- 图片文件过大 (建议 < 5MB)
- 网络不稳定

**解决方案**:
- 压缩图片后重试
- 检查网络连接

### 问题 4：找不到编辑器元素

**可能原因**:
- 小红书页面结构更新

**解决方案**:
- 查看 `error_screenshot.png` 分析页面
- 对照 `publisher.ts` 中的 `SELECTORS` 更新选择器

---

## 📁 文件说明

| 文件 | 用途 |
|------|------|
| `index.ts` | 情报系统主程序 |
| `login.ts` | 登录工具 (主站扫码) |
| `publisher.ts` | 发布工具 |
| `test_all.ts` | 完整功能测试 (43项) |
| `.env.example` | 环境变量模板 |
| **[ARCHITECTURE.md](ARCHITECTURE.md)** | **🏗️ 技术架构文档** |

### 📦 模块化结构 (`src/`)

| 模块 | 功能 |
|------|------|
| `config.ts` | 配置常量 (路径、API、安全参数、词库) |
| `types.ts` | 类型定义 (NoteInfo, Draft, QuestionItem) |
| `selectors.ts` | DOM 选择器 (详情页、笔记列表、发布页) |
| `utils.ts` | 工具函数 (delay, humanClick, loadCookies) |
| `ocr.ts` | OCR 图片识别 + 拟人化看图 |
| `ai.ts` | AI 智能分析 (callAI, generateAIReport) |
| `database.ts` | 数据库操作 (去重保存 JSON) |

---

## 🛠️ 技术栈

- **Runtime**: Node.js + TypeScript (tsx)
- **Web**: Express + Socket.io + Marked
- **Browser Automation**: Puppeteer + puppeteer-extra
- **Anti-Detection**: puppeteer-extra-plugin-stealth
- **OCR**: tesseract.js (中英文识别)
- **Config**: dotenv (环境变量)
- **Reference**: [xiaohongshu-mcp](https://github.com/xpzouying/xiaohongshu-mcp) (Go)

---

## 📜 开发路线

- [x] **Phase 1**: 基础设施 (Cookie 登录)
- [x] **Phase 2**: 情报系统 (点击模式 + 去重)
- [x] **Phase 3**: 发布系统 (MCP 逻辑移植)
- [x] **Phase 4**: 安全加固 (贝塞尔鼠标 + 变速打字)
- [x] **Phase 5**: 智能升级 (OCR + AI 分析)
- [x] **Phase 6**: 模块化重构 (src/ 拆分)
- [x] **Phase 7**: 行为优化 (Feed流穿插 + 视频检测 + DeepSeek集成)

---

## ⚠️ 免责声明

本项目仅供学习和个人使用。请遵守小红书平台的使用条款，合理控制发布频率，避免滥用自动化工具。

---

**Made with ❤️ by 搜广推实习生**
