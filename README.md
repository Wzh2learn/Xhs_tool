# 📘 XHS Automation - 搜广推实习生自动运营系统

> 基于 Puppeteer 移植 [xiaohongshu-mcp](https://github.com/xpzouying/xiaohongshu-mcp) (Go) 核心逻辑的小红书自动发布工具，专为"搜广推算法实习生"人设打造的内容运营解决方案。

**🔒 v4.1 Security & Database Edition** - 账号安全与数据资产并重

---

## 🎯 核心特性 (Features)

### ✅ Deep Dive Analysis (深度分析)
- 自动抓取笔记**正文全文** + **Top 5 热评**
- 智能过滤无意义短评（"求带"、"同问"）
- 精准捕捉评论区的**面试追问细节**

### ✅ Local Database (本地题库)
- JSON 增量写入，基于 `note_id` 自动去重
- 完整字段：`id` / `link` / `full_text` / `hot_comments`
- 状态管理：`status: "pending"` → `"imported"`
- 可直接导入 AlgoQuest 题库

### ✅ Human-Simulation (拟人防检测)
- 🖱️ **贝塞尔曲线鼠标轨迹**：自然的鼠标移动路径
- ⌨️ **变速打字**：80-200ms/字，偶尔"思考"停顿
- 🐢 **慢用户模式**：关键词间隔 90-180 秒
- 👀 **随机回看**：模拟真人阅读时的"往回看"行为
- 👤 **指纹隐藏**：随机视口 + webdriver 特征移除

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

## 🚀 快速开始 (Quick Start)

### 1. 安装依赖

```bash
cd d:\AIlearn\xhs_automation
npm install
```

### 2. 获取登录凭证 (Cookie)

```bash
npx tsx login.ts
```

**操作流程**:
1. 浏览器自动打开**小红书主站** (`xiaohongshu.com`)
2. 使用小红书 APP 扫码登录 (3 分钟超时)
3. 登录成功后，Cookie 自动保存至 `xhs_cookies.json`
4. 看到 "✅ 登录成功" 提示后，浏览器自动关闭

> ⚠️ Cookie 有效期约 7-30 天，过期后需重新运行此命令

### 3. 情报搜集

```bash
npx tsx index.ts
```

**自动执行**：
1. 搜索关键词 → 点击阅读笔记
2. 拓取正文 + 热评 → 生成日报
3. 增量保存到 JSON 题库

**产出文件**：
- `reports/daily_trends.md` - 可读日报
- `data/interview_questions.json` - 结构化题库

**耗时**：约 15-20 分钟（v4.1 慢用户模式）

> 🔒 **v4.1 Security Edition**: 贝塞尔鼠标 + 变速打字 + 90-180秒关键词间隔

### 4. 准备内容

将 Markdown 文件和**同名配图**放入 `content/drafts/` 目录：

```
content/drafts/
├── my_post.md      ← 文案
└── my_post.jpg     ← 配图 (⚠️ 必须与 .md 同名!)
```

> **重要**：图片和 Markdown 文件名必须完全一致（如 `note1.md` 对应 `note1.jpg`）

### 5. 发布笔记

```bash
npx tsx publisher.ts
```

**自动执行流程**:
1. 扫描 `content/drafts/` 目录
2. 解析第一个 `.md` 文件
3. 打开浏览器 → 上传图片 → 填写标题/正文/标签
4. 点击发布
5. 归档至 `content/published/`

---

## 📝 内容制作规范

### 目录结构

```
d:\AIlearn\xhs_automation\
├── content/
│   ├── drafts/           # 待发布 (放这里)
│   │   ├── note1.md
│   │   └── note1.jpg     # 必须同名!
│   └── published/        # 已发布 (自动归档)
├── reports/
│   └── daily_trends.md   # 每日情报日报
├── data/                 # v4.1: AlgoQuest 本地题库
│   └── interview_questions.json  # 增量去重 + 状态管理
├── xhs_cookies.json      # 登录凭证
├── login.ts              # 登录工具 (v3 主站扫码)
├── index.ts              # 情报搜集 (v4.1 安全加固版)
└── publisher.ts          # 发布工具 (v4.1 安全加固版)
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
| `login.ts` | 登录工具 (v3 主站扫码) |
| `index.ts` | 情报系统 (v3.3 点击模式 + 去重) |
| `publisher.ts` | 发布工具 (MCP 移植版) |
| `xhs_cookies.json` | 登录凭证存储 |
| `PLAN_FINAL.md` | 项目白皮书 |
| `SOP.md` | 每日运营剧本 |

---

## 🛠️ 技术栈

- **Runtime**: Node.js + TypeScript (tsx)
- **Browser Automation**: Puppeteer + puppeteer-extra
- **Anti-Detection**: puppeteer-extra-plugin-stealth
- **Reference**: [xiaohongshu-mcp](https://github.com/xpzouying/xiaohongshu-mcp) (Go)

---

## 📜 开发路线

- [x] **Phase 1**: 基础设施 (Cookie 登录 v3 主站)
- [x] **Phase 2**: 情报系统 (v3.3 点击模式 + 去重 + 视频过滤)
- [x] **Phase 3**: 发布系统 (MCP 逻辑移植)

---

## ⚠️ 免责声明

本项目仅供学习和个人使用。请遵守小红书平台的使用条款，合理控制发布频率，避免滥用自动化工具。

---

**Made with ❤️ by 搜广推实习生**
