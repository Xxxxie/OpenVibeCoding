import { Code2, History } from 'lucide-react'

export const SqlMenu = () => (
  <div className="flex flex-col h-full p-2">
    <p className="px-3 py-1.5 text-xs font-medium text-fg-lighter uppercase tracking-wider">工具</p>
    <button className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-fg-light hover:bg-bg-surface-200 hover:text-fg-default rounded-sm transition-colors bg-bg-selection text-fg-default">
      <Code2 size={14} strokeWidth={1.5} /> SQL 编辑器
    </button>
    <button className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-fg-light hover:bg-bg-surface-200 hover:text-fg-default rounded-sm transition-colors">
      <History size={14} strokeWidth={1.5} /> 查询历史
    </button>
  </div>
)
