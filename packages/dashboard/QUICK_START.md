# 快速参考指南

## 启动项目

```bash
pnpm install
cd packages/dashboard
pnpm dev
```

**访问地址**: http://localhost:5174

## 环境配置

编辑 `.env.local`:
```
VITE_API_BASE=http://localhost:3000/api
```

## 核心目录说明

| 目录 | 用途 |
|------|------|
| `src/components/ui/` | UI 原子组件 (Button, Card, etc) |
| `src/components/data/` | 数据相关功能组件 |
| `src/components/layouts/` | 页面布局组件 |
| `src/services/` | API 服务封装 |
| `src/hooks/` | 自定义 Hooks（状态管理） |
| `src/atoms/` | Jotai 状态定义 |
| `src/pages/` | 页面级组件 |
| `src/utils/` | 工具函数 |
| `src/styles/` | 全局样式 |

## 常见任务

### 添加新的 UI 组件

1. 创建文件: `src/components/ui/NewComponent.tsx`
```typescript
import React from 'react'
import { cn } from '../../utils/helpers'

interface Props {
  className?: string
}

export const NewComponent: React.FC<Props> = ({ className }) => {
  return <div className={cn('...', className)}>Content</div>
}
```

2. 导出到 `src/components/ui/index.ts`:
```typescript
export { NewComponent } from './NewComponent'
```

### 调用 API

```typescript
import { databaseAPI } from '../services/database'

// 获取所有集合
const collections = await databaseAPI.getCollections()

// 获取文档列表
const result = await databaseAPI.getDocuments('users', 1, 50)

// 创建文档
await databaseAPI.createDocument('users', { name: 'John' })
```

### 使用状态管理

```typescript
import { useDatabaseState } from '../hooks/useDatabaseState'

function MyComponent() {
  const {
    activeCollection,
    documents,
    setActiveCollection,
    setDocuments,
  } = useDatabaseState()

  return <div>...</div>
}
```

### 添加新样式

**优先使用 Tailwind CSS 类名**:
```typescript
<div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-1">
  Content
</div>
```

**组合类名**:
```typescript
import { cn } from '../utils/helpers'

const className = cn(
  'flex items-center',
  isActive && 'bg-accent text-white',
  customClassName
)
```

**主题变量在 `tailwind.config.ts`**:
- `bg-surface-0` 到 `bg-surface-4`
- `text-text-primary`, `text-text-secondary`, `text-text-tertiary`
- `text-accent`, `bg-accent-light`, `bg-accent-dark`
- `bg-semantic-success`, `bg-semantic-warning`, `bg-semantic-error`

## 关键文件位置

| 文件 | 说明 |
|------|------|
| `src/pages/Dashboard.tsx` | 主仪表板页面 |
| `src/services/database.ts` | 数据库 API 服务 |
| `src/hooks/useDatabaseState.ts` | 数据库状态管理 Hook |
| `src/atoms/database.ts` | Jotai 状态定义 |
| `tailwind.config.ts` | 主题和设计令牌 |
| `src/styles/globals.css` | 全局样式和 Tailwind |

## 常用组件

```typescript
import { 
  Button, 
  Input, 
  Card, 
  CardHeader, 
  CardTitle, 
  CardContent,
  CardFooter,
  Badge 
} from '../components/ui'

// Button 变体
<Button variant="primary">Primary</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="danger">Danger</Button>

// Button 尺寸
<Button size="sm">Small</Button>
<Button size="md">Medium</Button>
<Button size="lg">Large</Button>

// Input
<Input placeholder="Enter text..." />

// Card
<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
  </CardHeader>
  <CardContent>Content</CardContent>
  <CardFooter>Footer</CardFooter>
</Card>

// Badge
<Badge variant="success">Success</Badge>
<Badge variant="error">Error</Badge>
<Badge variant="warning">Warning</Badge>
```

## 需要帮助？

查看详细架构文档: [ARCHITECTURE.md](./ARCHITECTURE.md)

查看项目说明: [README.md](./README.md)

