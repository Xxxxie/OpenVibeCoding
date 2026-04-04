import { Zap } from 'lucide-react'

export const FunctionsMenu = () => (
  <div className="flex flex-col h-full p-2">
    <p className="px-3 py-1.5 text-xs font-medium text-fg-lighter uppercase tracking-wider">云函数</p>
    <button className="flex items-center gap-2 w-full px-3 py-1.5 text-xs bg-bg-selection text-fg-default rounded-sm">
      <Zap size={14} strokeWidth={1.5} /> 函数列表
    </button>
  </div>
)
