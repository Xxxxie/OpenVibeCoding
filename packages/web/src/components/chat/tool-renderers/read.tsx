import { FileText } from 'lucide-react'
import type { ToolRenderer, ToolRenderContext } from './index'
import { extractResultText } from './default'

interface ReadInput {
  file_path?: string
  offset?: number
  limit?: number
  pages?: string
}

/** 把长路径收敛为 `…/<dir>/<file>`,便于头部摘要展示 */
function shortenPath(path: string, maxLen = 48): string {
  if (path.length <= maxLen) return path
  const parts = path.split('/')
  if (parts.length <= 2) return `…${path.slice(-(maxLen - 1))}`
  return `…/${parts.slice(-2).join('/')}`
}

/**
 * Read 工具渲染器。
 * 展示被读取的文件路径 + 可选的行范围;结果走默认文本渲染。
 */
export const readRenderer: ToolRenderer = {
  Icon: FileText,
  getSummary: ({ input }) => {
    const p = (input as ReadInput)?.file_path
    return p ? shortenPath(p) : undefined
  },
  renderInput: ({ input }: ToolRenderContext) => {
    const { file_path, offset, limit, pages } = (input as ReadInput) || {}
    if (!file_path) return null
    const range =
      offset != null || limit != null
        ? ` · ${offset ?? 0}${limit != null ? `+${limit}` : ''}`
        : pages
          ? ` · pages ${pages}`
          : ''
    return (
      <div className="text-[11px] font-mono text-muted-foreground">
        <span className="text-foreground">{file_path}</span>
        {range}
      </div>
    )
  },
  renderOutput: ({ result, isError }: ToolRenderContext) => {
    if (!result) return null
    const text = extractResultText(result)
    return (
      <pre
        className={`bg-muted/30 rounded p-2 overflow-x-auto text-[11px] leading-relaxed whitespace-pre-wrap break-all max-h-[300px] overflow-y-auto font-mono ${
          isError ? 'text-red-400' : ''
        }`}
      >
        {text}
      </pre>
    )
  },
}
