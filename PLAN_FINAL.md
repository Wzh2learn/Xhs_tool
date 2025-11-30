# 📘 XHS 搜广推"学霸进化"全栈运营白皮书 (The Ultimate Guide)

**版本**：v4.1 Security & Database Edition
**状态**：✅ 开发完成 | 已交付
**项目路径**：`d:\AIlearn\xhs_automation`

---

## 📖 目录

1.  [核心战略：真题内化与学霸人设](#1-核心战略真题内化与学霸人设)
2.  [运营闭环：输入-内化-输出](#2-运营闭环输入-内化-输出)
3.  [每日 SOP 执行手册](#3-每日-sop-执行手册)
4.  [技术架构：MCP 逻辑移植](#4-技术架构mcp-逻辑移植)
5.  [开发路线图](#5-开发路线图)
6.  [附录：内容模板](#6-附录内容模板)

---

## 1. 核心战略：真题内化与学霸人设

### 1.1 拒绝盲目热点，坚持"实习生进阶"
我们坚决**不做**没有灵魂的搬运工或营销号。
你的核心人设是 **"正在大厂算法岗实习，为了跳槽/转正而持续刷题进化的学霸"**。

### 1.2 核心价值主张
*   **真实感 (Authenticity)**：每一篇笔记都是你真实学习过程的记录。
*   **降维打击 (Insider View)**：用"大厂实习生"的视角去拆解网上的面经。
*   **工具赋能 (Tooling)**：顺带安利你自己开发的 AlgoQuest，作为"我复习用的秘密武器"。

---

## 2. 运营闭环：输入-内化-输出

这是本项目的灵魂逻辑：**以教代学 (Learning by Teaching)**。

### 🔄 闭环模型
1.  **Input (机器)**：脚本全网抓取最新的"搜广推/算法"面试题。
2.  **Process (人)**：**Study With Me**。你利用业余时间，针对抓到的题目进行深度学习和拆解。
3.  **Output (机器)**：将学习笔记发布为小红书，并引流到产品。

---

## 3. 每日 SOP 执行手册

> 详细剧本请查看 `SOP.md`

### 🌅 阶段一：情报搜集 (09:00)
```bash
npx tsx index.ts
```
产出：`reports/daily_trends.md`

### ✍️ 阶段二：内化与创作 (09:15)
1. 阅读日报中的**正文摘要**
2. 挑选一题，在 `content/drafts/` 下创建内容
3. 图片必须与 .md 文件**同名**

### 🌙 阶段三：自动化发布 (09:30)
```bash
npx tsx publisher.ts
```
发布成功后自动归档至 `content/published/`

---

## 4. 技术架构：MCP 逻辑移植

### 4.1 核心原则
我们采用 **Copy-Paste Engineering**：直接参考/翻译 `xiaohongshu-mcp` (Go) 的源码逻辑，在 Puppeteer (TypeScript) 中重写。

### 4.2 目录结构

```text
d:\AIlearn\xhs_automation\
├── package.json
├── xhs_cookies.json        # 登录凭证
│
├── login.ts                # [登录] v3 主站扫码
├── index.ts                # [情报] v4.1 安全加固版
├── publisher.ts            # [发布] v4.1 安全加固版
│
├── content/                # [仓库]
│   ├── drafts/             # 待发布
│   └── published/          # 已发布
│
├── reports/                # [日报]
│   └── daily_trends.md
│
├── PLAN_FINAL.md           # 项目白皮书
├── SOP.md                  # 每日运营剧本
└── README.md               # 使用手册
```

---

## 5. 开发路线图

### ✅ Phase 1: 基础设施 [Completed]
*   Puppeteer 环境搭建
*   Cookie 登录打通
*   **Login v3**: 主站登录 (`login.ts`)

### ✅ Phase 2: 情报系统 [Completed]
*   **Intelligence v3.3**: 
    - 点击模式（避免验证码）
    - 智能去重（基于标题）
    - 视频过滤（跳过无正文笔记）
*   **v4.0 Community Insight**:
    - 热评抓取 (Top 5)
    - 无意义评论过滤
*   **v4.1 Database Ready**:
    - JSON 增量写入 + note_id 去重
    - 状态管理 (pending/imported)
*   产出：`reports/daily_trends.md` + `data/interview_questions.json`

### ✅ Phase 3: 发布系统 [Completed]
*   基于 MCP 源码审计移植
*   本地图片直传
*   自动归档

### ✅ Phase 3.5: 安全加固 [Completed]
*   🖱️ 贝塞尔曲线鼠标轨迹
*   ⌨️ 变速打字 (80-200ms/字)
*   🐢 慢用户模式 (90-180秒关键词间隔)
*   👤 webdriver 特征隐藏
*   📱 随机视口尺寸

### 💡 Phase 4 Idea: AlgoQuest Admin 插件
> **未来展望**：开发 AlgoQuest 后台插件，一键读取 `interview_questions.json` 自动入库
*   自动识别 `status: "pending"` 的记录
*   一键导入到 AlgoQuest 题库
*   自动回写 `status: "imported"`

---

## 6. 附录：内容模板

### content.md (实习生拆题版)

```markdown
# 实习日记：DeepFM 模型在组里的真实应用

#搜广推 #算法实习 #推荐系统 #DeepFM #AlgoQuest

今天组会讨论 DeepFM 的特征交叉问题，发现面试面经里的某些说法太理论了...

## 面试 vs 实战
- 面试常问：DeepFM 和 DeepCrossing 的区别？
- 实战关注：低阶特征的 Embedding 维度怎么对齐？

## 我的理解
(这里写你的学习笔记，可以结合 AlgoQuest 里的知识点)

---
💡 复习神器：图里的【推荐系统知识树】是我自己整理的，收录在我的 AlgoQuest 里~
```

---

---

## 7. 版本历史

| 版本 | 日期 | 更新内容 |
|------|------|----------|
| v3.3 | 2025-11-29 | 点击模式 + 智能去重 |
| v4.0 | 2025-11-30 | Community Insight (热评抓取) |
| v4.1 | 2025-11-30 | Security & Database Edition |

---

**End of Document**

*Last Updated: 2025-11-30 (v4.1 Final Delivery)*
