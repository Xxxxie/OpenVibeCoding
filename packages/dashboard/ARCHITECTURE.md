# CloudBase Dashboard 包架构设计

## 项目完成概况

已成功创建 `packages/dashboard` 包，这是一个完整的 React + Vite 前端应用，用于管理 CloudBase 内的数据库和存储资源。

## 核心架构

### 1. 技术栈
- **构建工具**: Vite 6 + React 19
- **样式系统**: Tailwind CSS 4 + 自定义 CSS 变量
- **UI 组件**: 无状态原子组件 + 功能组件
- **状态管理**: Jotai (原子化状态管理)
- **表格**: TanStack React Table + 虚拟滚动
- **表单**: React Hook Form + Zod 验证
- **动画**: Framer Motion

### 2. 设计参考

#### 来自 Supabase 的设计模式
- **组件组织**: layouts > interfaces > ui > ui-patterns
- **权限控制**: 基于功能的访问检查
- **样式系统**: Tailwind CSS 为主，自定义 CSS 仅用于库覆盖
- **模块化布局**: 不同功能具有专用的布局组件

#### 来自 Nex 的实现参考
- **集合管理**: 分组展示（用户表、应用数据、系统表）
- **数据表显示**: 动画、分页、搜索等交互
- **类型推断**: 自动检测列数据类型
- **UI 样式**: 深色主题 + 清晰的视觉层级

### 3. 项目结构

```
packages/dashboard/
│
├── src/
│   ├── components/              # React 组件
│   │   ├── layouts/             # 页面结构
│   │   │   ├── MainLayout.tsx   # 顶层布局
│   │   │   └── SidebarLayout.tsx# 侧边栏布局
│   │   │
│   │   ├── ui/                  # 可复用 UI 原子
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Badge.tsx
│   │   │   └── index.ts         # 导出所有组件
│   │   │
│   │   └── data/                # 数据功能组件
│   │       ├── CollectionSidebar.tsx  # 集合列表侧栏
│   │       ├── DataView.tsx           # 数据主视图
│   │       ├── DataTable.tsx          # 表格组件
│   │       ├── CellValue.tsx          # 单元格值渲染
│   │       └── Pagination.tsx         # 分页控件
│   │
│   ├── pages/                   # 页面组件
│   │   └── Dashboard.tsx        # 主仪表板页面
│   │
│   ├── services/                # API 服务层
│   │   └── database.ts          # 数据库 API 封装
│   │
│   ├── hooks/                   # 自定义 Hooks
│   │   └── useDatabaseState.ts  # 数据库状态管理
│   │
│   ├── atoms/                   # Jotai 原子状态
│   │   └── database.ts          # 数据库状态定义
│   │
│   ├── utils/                   # 工具函数
│   │   └── helpers.ts           # 日期、格式化等
│   │
│   ├── styles/                  # 全局样式
│   │   └── globals.css          # 全局 CSS + Tailwind
│   │
│   ├── App.tsx                  # 主应用组件
│   └── main.tsx                 # Vite 入口
│
├── 配置文件
│   ├── vite.config.ts           # Vite 配置
│   ├── tsconfig.json            # TypeScript 配置
│   ├── tailwind.config.ts       # Tailwind 配置
│   ├── postcss.config.mjs       # PostCSS 配置
│   ├── package.json             # 包定义
│   ├── index.html               # HTML 模板
│   ├── .env.local               # 环境变量
│   ├── .gitignore               # Git 忽略规则
│   └── .editorconfig            # 编辑器配置
│
└── README.md                    # 包说明文档
```

## 关键特性

### 1. 集合管理 (CollectionSidebar)
- ✅ 自动分组: 用户表、应用数据、系统表
- ✅ 展开/折叠功能
- ✅ 快速搜索和过滤
- ✅ 创建新集合按钮
- ✅ 刷新集合列表

### 2. 数据展示 (DataView + DataTable)
- ✅ 响应式表格
- ✅ 自动类型推断 (文本、数字、日期、布尔、JSON)
- ✅ 数据分页 (每页 50 条)
- ✅ 单元格值优化渲染
- ✅ Hover 状态反馈

### 3. 状态管理 (useDatabaseState + Jotai)
- ✅ 原子化状态结构
- ✅ 集合选择状态
- ✅ 文档列表状态
- ✅ 分页状态
- ✅ 加载和错误状态

### 4. API 服务 (DatabaseAPI)
- ✅ RESTful API 封装
- ✅ 集合 CRUD 操作
- ✅ 文档分页查询
- ✅ 类型推断算法
- ✅ 错误处理

### 5. 样式系统
- ✅ 现代深色主题
- ✅ Tailwind CSS 为主
- ✅ CSS 自定义属性 (variables)
- ✅ Light/Dark 模式支持 (可扩展)
- ✅ 统一的设计令牌

## 设计令牌

### 颜色系统
```
surface:    白色到浅灰 (0-4)
text:       深色文本 + 副文本 + 禁用文本
accent:     蓝色主色系
semantic:   成功(绿)、警告(黄)、错误(红)、信息(蓝)
```

### 排版
```
微文本: 10px
超小: 11px
小号: 12px
正文: 13px
大号: 14px
特大: 16px
```

### 间距
```
使用标准 Tailwind 间距比例
侧边栏宽度: 220px
```

## 后续可扩展的功能

### 近期
- [ ] **存储管理器** (S3 浏览、上传、删除)
- [ ] **SQL 编辑器** (查询执行、结果显示)
- [ ] **数据编辑** (创建、编辑、删除文档)
- [ ] **搜索和过滤** (服务端查询支持)

### 中期
- [ ] **权限管理** (行级安全、字段权限)
- [ ] **数据导入导出** (CSV、JSON、Excel)
- [ ] **实时数据订阅** (WebSocket 支持)
- [ ] **AI 辅助查询** (自然语言转 SQL/查询)

### 长期
- [ ] **备份和恢复**
- [ ] **监控和统计**
- [ ] **审计日志**
- [ ] **高级权限系统**

## 如何集成到主项目

### 1. 安装依赖
```bash
cd /root/git/coding-agent-template
pnpm install
```

### 2. 运行开发服务器
```bash
# 运行 Dashboard
cd packages/dashboard
pnpm dev
```

默认访问: http://localhost:5174

### 3. API 配置
在 `.env.local` 中配置 API 基地址:
```
VITE_API_BASE=http://localhost:3000/api
```

## 代码示例

### 使用数据库状态
```typescript
import { useDatabaseState } from '../hooks/useDatabaseState'

export function MyComponent() {
  const { activeCollection, documents, setActiveCollection } = useDatabaseState()
  
  return (
    <div>
      <button onClick={() => setActiveCollection('users')}>
        Load Users
      </button>
    </div>
  )
}
```

### 调用 API
```typescript
import { databaseAPI } from '../services/database'

// 获取集合
const collections = await databaseAPI.getCollections()

// 获取文档
const result = await databaseAPI.getDocuments('users', 1, 50)

// 创建文档
await databaseAPI.createDocument('users', { name: 'John' })
```

### 创建新组件
```typescript
import React from 'react'
import { Button, Card } from '../components/ui'

export default function MyComponent() {
  return (
    <Card>
      <Button variant="primary">Click me</Button>
    </Card>
  )
}
```

## 设计决策说明

### 为什么选择 Jotai?
- 轻量级 (✅ 已在主项目中使用)
- 原子化管理 (符合现代 React 模式)
- 支持异步操作
- 与 Vite 的 HMR 兼容性好

### 为什么选择 TanStack React Table?
- 完全控制表格逻辑
- 不包含 UI，可自定义样式
- 支持虚拟滚动 (大数据集)
- 社区活跃

### 为什么最小化自定义 CSS?
- Tailwind CSS 4 已非常强大
- 减少样式维护成本
- 保证样式一致性
- 只在库覆盖时使用 SCSS

### 为什么采用分组布局?
- 参考 Supabase 的成熟方案
- 清晰的职责分离
- 便于功能扩展
- 代码复用性强

## 贡献指南

当添加新功能时:
1. 在 `components/ui/` 中创建可复用的 UI 原子
2. 在 `components/data/` 或 `components/layouts/` 中组合功能组件
3. 保持 Tailwind CSS 为主的样式方式
4. 使用 Jotai atoms 管理状态
5. 在 `services/` 中封装 API 调用
6. 编写 TypeScript 类型定义

## 相关资源

- [Supabase Dashboard](https://github.com/supabase/supabase/tree/master/apps/studio)
- [Nex 项目](file:///root/git/Nex)
- [Tailwind CSS 文档](https://tailwindcss.com)
- [Jotai 文档](https://jotai.org)
- [Vite 文档](https://vitejs.dev)

---

**创建时间**: 2026-04-02  
**项目版本**: 0.1.0  
**许可证**: 继承主项目许可证
