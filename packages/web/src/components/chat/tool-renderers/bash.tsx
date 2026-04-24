import { Terminal } from 'lucide-react'
import type { ToolRenderer, ToolRenderContext } from './index'
import { extractResultText } from './default'

interface BashInput {
  command?: string
  description?: string
  timeout?: number
}

/**
 * Bash 工具渲染器。
 * 显示"$ <command>"风格的命令预览 + 命令输出。
 * 参考反编译 05-tool-call-components.tsx KIND_RENDERERS.execute 设计。
 */
export const bashRenderer: ToolRenderer = {
  Icon: Terminal,
  getSummary: ({ input }) => {
    const cmd = (input as BashInput)?.command
    if (!cmd) return undefined
    return cmd.length > 60 ? `${cmd.slice(0, 60)}…` : cmd
  },
  renderInput: ({ input }: ToolRenderContext) => {
    const { command, description } = (input as BashInput) || {}
    if (!command) return null
    return (
      <div className="space-y-1">
        {description && <div className="text-[11px] text-muted-foreground">{description}</div>}
        <pre className="bg-muted/60 rounded p-2 overflow-x-auto text-[11px] leading-relaxed whitespace-pre-wrap break-all font-mono">
          <span className="text-muted-foreground mr-1">$</span>
          {command}
        </pre>
      </div>
    )
  },
  renderOutput: ({ result, isError }: ToolRenderContext) => {
    if (!result) return null
    const text = extractResultText(result)
    return (
      <pre
        className={`bg-muted/30 rounded p-2 overflow-x-auto text-[11px] leading-relaxed whitespace-pre-wrap break-all max-h-[300px] overflow-y-auto font-mono ${
          isError ? 'text-red-400' : 'text-muted-foreground'
        }`}
      >
        {text}
      </pre>
    )
  },
}
