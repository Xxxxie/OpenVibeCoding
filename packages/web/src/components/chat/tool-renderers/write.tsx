import { FilePlus } from 'lucide-react'
import type { ToolRenderer, ToolRenderContext } from './index'

interface WriteInput {
  file_path?: string
  content?: string
}

function shortenPath(path: string, maxLen = 48): string {
  if (path.length <= maxLen) return path
  const parts = path.split('/')
  if (parts.length <= 2) return `…${path.slice(-(maxLen - 1))}`
  return `…/${parts.slice(-2).join('/')}`
}

/**
 * Write 工具渲染器。
 * Write 通常是"从 0 创建",没有 old 文本,这里只展示即将写入的完整内容
 * (截断 300 行;完整内容用户可通过文件树查看)。
 */
export const writeRenderer: ToolRenderer = {
  Icon: FilePlus,
  getSummary: ({ input }) => {
    const p = (input as WriteInput)?.file_path
    return p ? shortenPath(p) : undefined
  },
  renderInput: ({ input }: ToolRenderContext) => {
    const { file_path, content } = (input as WriteInput) || {}
    if (!file_path && !content) return null
    return (
      <div className="space-y-2">
        {file_path && (
          <div className="text-[11px] font-mono">
            <span className="text-foreground">{file_path}</span>
          </div>
        )}
        {content && (
          <pre className="bg-muted/30 rounded p-2 overflow-x-auto text-[11px] leading-relaxed whitespace-pre-wrap break-all max-h-[300px] overflow-y-auto font-mono">
            {content}
          </pre>
        )}
      </div>
    )
  },
}
