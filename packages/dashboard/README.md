# CloudBase Dashboard

基于 Supabase 的设计风格和 Nex 的数据库 UI 实现的 CloudBase 管理 Dashboard。

## 特性

- 📊 NoSQL 和 SQL 数据库管理
- 💾 S3 存储浏览和管理
- 🔍 数据表格浏览和编辑
- 📈 数据分页展示
- 🎨 现代化深色主题 UI
- ⚡ Vite + React 19 快速构建

## 快速开始

```bash
# 安装依赖
pnpm install

# 开发模式
pnpm dev

# 构建
pnpm build
```

## 技术栈

- **框架**: React 19 + Vite 6
- **样式**: Tailwind CSS 4
- **UI组件**: 基于 Headless UI 和 Radix UI
- **表格**: TanStack React Table
- **状态管理**: Jotai
- **图标**: Lucide React
- **动画**: Framer Motion

## 项目结构

```
packages/dashboard/
├── src/
│   ├── components/
│   │   ├── layouts/          # 页面布局组件
│   │   ├── ui/               # 可复用 UI 原子组件
│   │   └── data/             # 数据相关组件
│   ├── pages/                # 页面组件
│   ├── services/             # API 服务
│   ├── hooks/                # 自定义 Hooks
│   ├── atoms/                # Jotai 状态原子
│   ├── utils/                # 工具函数
│   ├── styles/               # 全局样式
│   ├── App.tsx               # 主应用组件
│   └── main.tsx              # 入口文件
├── package.json
├── vite.config.ts
├── tailwind.config.ts
└── index.html
```

## 设计灵感

- **Supabase Dashboard**: 架构、样式系统和组件模式
- **Nex Database UI**: 集合管理和数据表显示
- **现代 BaaS**: 权限控制、分页展示、数据编辑

## 下一步

- [ ] 存储浏览器 (S3)
- [ ] SQL 查询编辑器
- [ ] 权限和访问控制
- [ ] 数据导入/导出
- [ ] AI 辅助查询
- [ ] 实时数据订阅
