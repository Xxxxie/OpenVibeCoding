# CloudBase VibeCoding Platform

基于 [coding-agent-template](https://github.com/vercel-labs/coding-agent-template) 重构改造的 AI 编程助手平台，结合腾讯云 CloudBase 打造的 VibeCoding 体验。

## 项目特点

- **Monorepo 架构**: 使用 pnpm workspace 管理多包项目
- **前后端分离**:
  - **Web**: React 19 + Vite + Tailwind CSS
  - **Server**: Hono + Node.js
- **CloudBase 集成**: 腾讯云开发后端服务
- **多 AI Agent 支持**: 支持 Claude Code、OpenAI Codex、GitHub Copilot、Gemini 等
- **容器化部署**: 支持 TCR（腾讯云容器镜像服务）部署

## 项目结构

```
├── packages/
│   ├── web/          # React + Vite 前端
│   ├── server/       # Hono 后端服务
│   ├── dashboard/    # CloudBase 管理面板
│   └── shared/       # 共享类型和工具
├── scripts/
│   ├── init.ts       # 初始化脚本
│   └── setup-tcr.ts  # TCR 镜像仓库配置
├── init.sh           # 快速启动入口
└── package.json      # Monorepo 配置
```

## 快速开始

### 一键初始化

```bash
# 克隆项目
git clone <repository-url>
cd coding-agent-template

# 运行初始化脚本
./init.sh
```

初始化脚本会自动：
1. 检查 Node.js 版本（需要 >= 18）
2. 检查/安装 pnpm
3. 创建 `.env.local` 环境配置
4. 可选：配置 TCR 容器镜像服务
5. 安装项目依赖

### 手动初始化

如果已有 pnpm 环境：

```bash
# 安装依赖
pnpm install

# 运行初始化脚本
pnpm init
```

## 开发模式

### 启动开发服务器

```bash
# 同时启动 web 和 server
pnpm dev
```

- **Web**: http://localhost:5174
- **Server API**: http://localhost:3001

### 单独启动

```bash
# 仅启动 web
pnpm dev:web

# 仅启动 server
pnpm dev:server
```

## 生产部署

### 构建

```bash
pnpm build
```

### 启动生产服务

```bash
pnpm start
```

生产模式下，Server 会同时提供 API 和静态文件服务（端口 3001）。

## 环境变量配置

创建 `.env.local` 文件配置以下变量：

### 必需配置

```env
# Session 加密密钥（自动生成）
JWE_SECRET=<base64-encoded-secret>
ENCRYPTION_KEY=<32-byte-hex-string>

# 认证方式
NEXT_PUBLIC_AUTH_PROVIDERS=local
```

### CloudBase 配置

```env
# CloudBase 凭证
TCB_SECRET_ID=<secret-id>
TCB_SECRET_KEY=<secret-key>
TENCENTCLOUD_ACCOUNT_ID=<account-id>

# TCR 容器镜像配置
TCR_NAMESPACE=<namespace>
TCR_PASSWORD=<password>
TCR_IMAGE=<image-url>
```

### 可选配置

```env
# 每日消息限制
MAX_MESSAGES_PER_DAY=50

# Sandbox 最大持续时间（分钟）
MAX_SANDBOX_DURATION=300

# API Keys（可由用户在界面配置）
ANTHROPIC_API_KEY=<key>
OPENAI_API_KEY=<key>
GEMINI_API_KEY=<key>
```

## TCR 容器镜像配置

项目支持一键配置腾讯云 TCR 个人版镜像仓库：

```bash
pnpm setup:tcr
```

该命令会：
1. 自动安装 cloudbase CLI（如未安装）
2. 引导完成 cloudbase login 登录
3. 初始化 TCR 个人版实例
4. 创建命名空间（自动添加随机后缀避免冲突）
5. 推送默认镜像到仓库

### TCR 配置选项

```bash
pnpm setup:tcr --namespace my-app --local-image node:20
```

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--namespace` | 命名空间前缀 | `cloudbase-vibecoding` |
| `--local-image` | 本地镜像 | `ghcr.io/yhsunshining/cloudbase-workspace:latest` |
| `--repo-name` | 仓库名称 | `sandbox` |
| `--tag` | 镜像标签 | `latest` |
| `--password` | TCR 密码 | 交互式输入 |

也可通过 `.env.local` 配置：

```env
TCR_LOCAL_IMAGE=ghcr.io/yhsunshining/cloudbase-workspace:latest
TCR_REPO_NAME=sandbox
TCR_TAG=latest
```

## 常用命令

```bash
# 开发
pnpm dev              # 启动开发环境
pnpm dev:web          # 仅启动 web
pnpm dev:server       # 仅启动 server

# 构建
pnpm build            # 构建所有包
pnpm build:web        # 仅构建 web
pnpm build:server     # 仅构建 server

# 生产
pnpm start            # 启动生产服务

# 代码质量
pnpm lint             # ESLint 检查
pnpm type-check       # TypeScript 类型检查
pnpm format           # Prettier 格式化

# 数据库
pnpm db:generate      # 生成迁移
pnpm db:push          # 推送 schema
pnpm db:studio        # 打开 Drizzle Studio

# TCR
pnpm setup:tcr        # 配置容器镜像服务
```

## 技术栈

### 前端 (packages/web)
- React 19
- Vite
- Tailwind CSS 4
- shadcn/ui
- Jotai (状态管理)

### 后端 (packages/server)
- Hono
- Node.js
- Drizzle ORM
- SQLite / PostgreSQL

### CloudBase 服务
- 云函数
- 云数据库
- 云存储
- 容器镜像服务 (TCR)

### AI Agent
- Claude Code
- OpenAI Codex
- GitHub Copilot
- Google Gemini
- @tencent-ai/agent-sdk

## 与原项目的主要变化

| 项目 | 原版 (coding-agent-template) | 本项目 |
|------|------------------------------|--------|
| 架构 | Next.js 全栈 | Monorepo 前后端分离 |
| 前端 | Next.js 15 | React + Vite |
| 后端 | Next.js API Routes | Hono |
| 部署 | Vercel | CloudBase / TCR |
| 数据库 | Neon Postgres | SQLite / CloudBase DB |
| Sandbox | Vercel Sandbox | CloudBase SCF |

## 许可证

MIT
