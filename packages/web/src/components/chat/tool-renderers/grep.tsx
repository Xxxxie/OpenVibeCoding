import { Search } from 'lucide-react'
import type { ToolRenderer, ToolRenderContext } from './index'

interface GrepInput {
  pattern?: string
  path?: string
  glob?: string
  type?: string
  output_mode?: string
  '-i'?: boolean
  multiline?: boolean
  head_limit?: number
}

/**
 * Grep 工具渲染器。
 * 头部摘要突出 pattern + 可选的 type/glob 限定。
 */
export const grepRenderer: ToolRenderer = {
  Icon: Search,
  getSummary: ({ input }) => {
    const p = (input as GrepInput)?.pattern
    if (!p) return undefined
    return p.length > 50 ? `${p.slice(0, 50)}…` : p
  },
  renderInput: ({ input }: ToolRenderContext) => {
    const i = (input as GrepInput) || {}
    if (!i.pattern) return null
    const meta: string[] = []
    if (i.path) meta.push(`path: ${i.path}`)
    if (i.type) meta.push(`type: ${i.type}`)
    if (i.glob) meta.push(`glob: ${i.glob}`)
    if (i.output_mode) meta.push(`mode: ${i.output_mode}`)
    if (i['-i']) meta.push('ignore-case')
    if (i.multiline) meta.push('multiline')
    return (
      <div className="space-y-1">
        <pre className="bg-muted/60 rounded p-2 overflow-x-auto text-[11px] leading-relaxed whitespace-pre-wrap break-all font-mono">
          {i.pattern}
        </pre>
        {meta.length > 0 && <div className="text-[11px] text-muted-foreground">{meta.join(' · ')}</div>}
      </div>
    )
  },
  // result 多为匹配行列表 → 默认 pre 文本即可
}
