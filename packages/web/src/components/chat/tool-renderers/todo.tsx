import { ListChecks, Circle, CircleDashed, CircleCheckBig } from 'lucide-react'
import type { ToolRenderer, ToolRenderContext } from './index'

interface TodoItem {
  content?: string
  activeForm?: string
  status?: 'pending' | 'in_progress' | 'completed'
}

interface TodoWriteInput {
  todos?: TodoItem[]
}

function StatusIcon({ status }: { status?: string }) {
  if (status === 'completed') return <CircleCheckBig className="h-3 w-3 text-green-500 flex-shrink-0" />
  if (status === 'in_progress') return <CircleDashed className="h-3 w-3 text-blue-500 flex-shrink-0 animate-spin" />
  return <Circle className="h-3 w-3 text-muted-foreground flex-shrink-0" />
}

/**
 * TodoWrite 工具渲染器。
 * 把 todos 数组渲染成带状态图标的列表;已完成项用删除线。
 */
export const todoWriteRenderer: ToolRenderer = {
  Icon: ListChecks,
  getSummary: ({ input }) => {
    const items = (input as TodoWriteInput)?.todos
    if (!Array.isArray(items)) return undefined
    const done = items.filter((i) => i.status === 'completed').length
    return `${done}/${items.length}`
  },
  renderInput: ({ input }: ToolRenderContext) => {
    const items = (input as TodoWriteInput)?.todos
    if (!Array.isArray(items) || items.length === 0) return null
    return (
      <ul className="space-y-1 text-[11px]">
        {items.map((item, idx) => (
          <li key={idx} className="flex items-start gap-2">
            <StatusIcon status={item.status} />
            <span
              className={
                item.status === 'completed'
                  ? 'line-through text-muted-foreground'
                  : item.status === 'in_progress'
                    ? 'text-foreground font-medium'
                    : 'text-foreground'
              }
            >
              {item.status === 'in_progress' && item.activeForm ? item.activeForm : item.content}
            </span>
          </li>
        ))}
      </ul>
    )
  },
  renderOutput: () => null, // TodoWrite 的 result 没有信息量
}
