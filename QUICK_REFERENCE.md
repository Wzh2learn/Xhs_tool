# 🚀 XHS Automation 快速参考

## �️ Dashboard 优先工作流（推荐）

```bash
# 启动控制台
npm run dashboard

# 打开浏览器访问 http://localhost:3000
```

### 界面功能分布

| 区域 | 操作 |
|------|------|
| **顶部操作栏** | 🔑 登录 → 🕵️ 情报搜集 → 🚀 内容发布 → ⛔ 停止 |
| **左侧导航栏** | 总览面板 / 情报日报 / 数据库 / 改写工坊 |
| **总览面板** | 查看统计、实时日志、快捷入口 |
| **改写工坊** | AI 改写素材：`Ctrl+Enter` 改写 / `Ctrl+S` 导出 |

### 每日运营流程

1. **登录**（首次或 Cookie 过期）→ 顶部 🔑 登录
2. **情报搜集** → 顶部 🕵️ 情报搜集（自动生成日报和题库）
3. **内容创作** → 左侧导航「改写工坊」→ 粘贴素材 → AI 改写 → 导出
4. **内容发布** → 顶部 🚀 内容发布（自动扫描 drafts 目录）

## � CLI 备用命令

```bash
# 情报搜集
npx tsx index.ts

# 发布内容
npx tsx publisher.ts

# 登录获取 Cookie
npx tsx login.ts

# 运行测试
npx tsx test_all.ts
```

## 📁 重要路径

| 目录 | 用途 |
|------|------|
| `content/drafts/` | 放置待发布内容 |
| `content/published/` | 已发布归档 |
| `reports/` | 日报输出 |
| `data/` | 题库数据 |

## 🔑 环境变量

```bash
# .env 必填项
AI_API_KEY=sk-xxx...

# 可选配置
LOG_LEVEL=INFO
PROJECT_ROOT=/custom/path
```

## 🏗️ 项目结构

```
主程序：
├── index.ts      # 情报搜集
├── login.ts      # 登录工具
├── publisher.ts  # 发布工具
└── test_all.ts   # 测试套件

模块库 (src/)：
├── config.ts     # 配置
├── types.ts      # 类型
├── selectors.ts  # 选择器
├── utils.ts      # 工具
├── ocr.ts        # OCR
├── ai.ts         # AI
├── database.ts   # 数据库
└── logger.ts     # 日志
```

## 💡 常用命令

```bash
# Git 操作
git add -A
git commit -m "描述"
git push

# 查看日志
tail -f *.log

# 清理数据
rm -rf reports/* data/*
```

## ⚠️ 注意事项

1. **Cookie 过期**: 重新运行 `login.ts`
2. **API 限额**: 检查 AI API 余额
3. **发布频率**: 建议每天不超过 3 篇
4. **图片格式**: 仅支持 jpg/png/webp

## 📚 文档

- [README.md](README.md) - 完整说明
- [ARCHITECTURE.md](ARCHITECTURE.md) - 技术架构
- [SOP.md](SOP.md) - 运营手册
- [PLAN_FINAL.md](PLAN_FINAL.md) - 项目规划

---

**v5.0 Ultimate Edition** | 2024-12-02


## Security Note
- Never commit cookie/session files (e.g. xhs_cookies.json, xhs_cookies.json.bak).
- Keep generated drafts under content/drafts/ local-only unless explicitly needed.

## Creator Assistant Quick Use

Entry: `Dashboard -> 改写工坊 -> 创作者助手`

### Buttons
- `刷新选题`: pull top topic ideas from local database
- `一键检查`: generate readiness score (0-100)
- `生成`: build publish pack
- `复制`: copy publish pack for direct paste
- `保存复盘`: store post metrics and reflection

### APIs
- `GET /api/stats`
- `GET /api/creator/topics?limit=3`
- `GET /api/creator/reviews?limit=5`
- `POST /api/creator/reviews`

### Data
- `data/creator_reviews.json`

### Tips
- Use this tool for execution quality, not full运营中台
- Keep platform analytics in Xiaohongshu native creator tools
- Recommended cadence: post -> save one review immediately
