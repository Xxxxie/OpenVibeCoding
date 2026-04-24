import { FolderSearch } from 'lucide-react'
import type { ToolRenderer, ToolRenderContext } from './index'

interface GlobInput {
  pattern?: string
  path?: string
}

/**
 * Glob 工具渲染器。
 * 简单展示 pattern + 搜索起点目录。
 */
export const globRenderer: ToolRenderer = {
  Icon: FolderSearch,
  getSummary: ({ input }) => {
    const p = (input as GlobInput)?.pattern
    return p && p.length > 50 ? `${p.slice(0, 50)}…` : p
  },
  renderInput: ({ input }: ToolRenderContext) => {
    const { pattern, path } = (input as GlobInput) || {}
    if (!pattern) return null
    return (
      <div className="text-[11px] font-mono">
        <span className="text-foreground">{pattern}</span>
        {path && <span className="ml-2 text-muted-foreground">in {path}</span>}
      </div>
    )
  },
}
