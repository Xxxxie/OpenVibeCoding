import { Bot } from 'lucide-react'
import type { ToolRenderer, ToolRenderContext } from './index'

interface TaskInput {
  description?: string
  prompt?: string
  subagent_type?: string
  model?: string
}

/**
 * Task / Agent 工具渲染器(子代理调用)。
 * P7 Subagent 卡片尚未落地前,先用简单的描述 + prompt 摘要形式展示。
 */
export const taskRenderer: ToolRenderer = {
  Icon: Bot,
  getSummary: ({ input }) => {
    const d = (input as TaskInput)?.description
    if (!d) return undefined
    return d.length > 50 ? `${d.slice(0, 50)}…` : d
  },
  renderInput: ({ input }: ToolRenderContext) => {
    const { description, prompt, subagent_type, model } = (input as TaskInput) || {}
    if (!description && !prompt) return null
    return (
      <div className="space-y-1">
        <div className="flex gap-2 text-[11px] text-muted-foreground">
          {subagent_type && <span>agent: {subagent_type}</span>}
          {model && <span>model: {model}</span>}
        </div>
        {description && <div className="text-[11px] font-medium text-foreground">{description}</div>}
        {prompt && (
          <pre className="bg-muted/30 rounded p-2 overflow-x-auto text-[11px] leading-relaxed whitespace-pre-wrap break-all max-h-[180px] overflow-y-auto">
            {prompt}
          </pre>
        )}
      </div>
    )
  },
}
