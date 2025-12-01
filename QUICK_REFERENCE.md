# 🚀 XHS Automation 快速参考

## 📋 每日运营

```bash
# 1. 情报搜集 (早上 9:00)
npx tsx index.ts

# 2. 查看日报
code reports/daily_trends.md

# 3. 发布内容 (有新内容时)
npx tsx publisher.ts
```

## 🔐 首次使用

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 添加 API Key

# 3. 登录获取 Cookie
npx tsx login.ts
```

## 🧪 测试

```bash
# 运行全部测试
npx tsx test_all.ts

# 调试模式
LOG_LEVEL=DEBUG npx tsx index.ts
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
