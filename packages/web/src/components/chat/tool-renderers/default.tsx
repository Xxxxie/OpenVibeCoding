import { Wrench } from 'lucide-react'
import type { ToolRenderer, ToolRenderContext } from './index'

/**
 * Service 端 tool_result 常以 `{"type":"text","text":"..."}` 的 JSON 字符串形式回传。
 * 这里尽量把 text 抽出来展示纯文本,让用户看不到协议细节。
 */
function extractResultText(result: string): string {
  if (!result) return result
  const trimmed = result.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return result
  try {
    const parsed = JSON.parse(trimmed)
    if (typeof parsed === 'string') return parsed
    if (parsed && typeof parsed.text === 'string') return parsed.text
    if (Array.isArray(parsed)) {
      return parsed.map((b: any) => (typeof b === 'string' ? b : b?.text || JSON.stringify(b))).join('\n')
    }
    return JSON.stringify(parsed, null, 2)
  } catch {
    return result
  }
}

/**
 * 默认渲染器 — 对未注册的工具 fallback。
 * 与原 ToolCallCard 的展开区行为等价(JSON.stringify input + pre 文本 result),
 * 但结果文本会先尝试剥掉 MCP 的 {"type":"text","text":"..."} 外壳。
 */
export const defaultRenderer: ToolRenderer = {
  Icon: Wrench,
  renderInput: ({ input }: ToolRenderContext) => {
    if (input == null) return null
    const text = typeof input === 'string' ? input : JSON.stringify(input, null, 2)
    return (
      <pre className="bg-muted/30 rounded p-2 overflow-x-auto text-[11px] leading-relaxed whitespace-pre-wrap break-all">
        {text}
      </pre>
    )
  },
  renderOutput: ({ result, isError }: ToolRenderContext) => {
    if (!result) return null
    const text = extractResultText(result)
    return (
      <pre
        className={`bg-muted/30 rounded p-2 overflow-x-auto text-[11px] leading-relaxed whitespace-pre-wrap break-all max-h-[300px] overflow-y-auto ${
          isError ? 'text-red-400' : ''
        }`}
      >
        {text}
      </pre>
    )
  },
}

export { extractResultText }
