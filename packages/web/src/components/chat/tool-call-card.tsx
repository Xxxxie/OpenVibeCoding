import { useState, useMemo } from 'react'
import { Loader2, CheckCircle, XCircle, ChevronDown, ChevronRight } from 'lucide-react'
import { defaultRenderer, getToolRenderer } from './tool-renderers'

/**
 * ToolCallCard — 工具调用卡片(P6 升级版)
 *
 * 相比 P6 之前的版本:
 *   - 头部图标由 `TOOL_RENDERERS[toolName].Icon` 决定（Bash→Terminal / Edit→FilePen 等）
 *   - 头部右侧新增摘要文字(由 renderer.getSummary 产出),方便折叠状态下一眼看清做了啥
 *   - 展开区的参数/结果区块交给 renderer.renderInput / renderOutput;
 *     缺失的字段 fallback 到 default 渲染器(JSON / pre)
 *
 * 签名保持与原组件一致(props 名字、语义不变),调用方 task-chat.tsx 无需改动。
 *
 * 注意: 服务端历史消息中的 `input` 可能是 JSON 字符串(流式累积期间/DB 回放),
 * 这里统一尝试解析为对象,让每个 renderer 可以直接访问字段。
 */
export function ToolCallCard({
  toolName,
  toolCallId,
  input,
  result,
  isError,
  isPending,
}: {
  toolName: string
  toolCallId?: string
  input?: unknown
  result?: string
  isError?: boolean
  isPending: boolean
}) {
  const [expanded, setExpanded] = useState(false)

  // 统一解析 input:字符串则尝试 JSON.parse,失败保留原值
  const parsedInput = useMemo(() => {
    if (typeof input !== 'string') return input
    try {
      return JSON.parse(input)
    } catch {
      return input
    }
  }, [input])

  const renderer = getToolRenderer(toolName)
  const ctx = { toolName, input: parsedInput, result, isError, isPending }

  const Icon = renderer.Icon || defaultRenderer.Icon || (() => null)
  const summary = renderer.getSummary?.(ctx)
  const inputNode = (renderer.renderInput || defaultRenderer.renderInput)?.(ctx)
  const outputNode = (renderer.renderOutput ?? defaultRenderer.renderOutput)?.(ctx)

  // 纯命名展示:MCP 工具剥前缀后更易读
  const displayName = toolName && toolName !== 'tool' ? toolName.replace(/^mcp__[^_]+__/, '') : 'Tool'

  return (
    <div className="border border-border/50 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted/30 transition-colors"
      >
        {isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400 flex-shrink-0" />
        ) : isError ? (
          <XCircle className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />
        ) : (
          <CheckCircle className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
        )}
        <Icon className="h-3 w-3 text-muted-foreground/80 flex-shrink-0" />
        <span className="font-medium text-foreground">{displayName}</span>
        {summary && (
          <span className="text-muted-foreground truncate max-w-[240px] md:max-w-[360px]" title={summary}>
            {summary}
          </span>
        )}
        {toolCallId && !summary && <span className="text-muted-foreground/50">{toolCallId}</span>}
        <span className="ml-auto">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </span>
      </button>
      {expanded && (inputNode || outputNode) && (
        <div className="border-t border-border/30 text-xs">
          {inputNode && (
            <div className="px-3 py-2">
              <div className="text-muted-foreground font-medium mb-1">参数</div>
              {inputNode}
            </div>
          )}
          {outputNode && (
            <div className="px-3 py-2 border-t border-border/20">
              <div className="text-muted-foreground font-medium mb-1">结果</div>
              {outputNode}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
