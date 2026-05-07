/**
 * Tool Renderer Registry (P6)
 *
 * 基于 CodeBuddy Code 反编译 05-tool-call-components.tsx (L225~327) 的 KIND_RENDERERS +
 * NAME_RENDERERS 两级查找模型，简化为单级 name-based 注册表 + 默认 fallback。
 *
 * 设计要点:
 *   1. 渲染器是**纯数据**:只产出 React 节点/字符串，不持有状态
 *   2. 每个渲染器可以独立实现 Icon / summary / renderInput / renderOutput,
 *      缺失的字段由默认渲染器兜底
 *   3. 新增工具时只需在此注册表 append 一项，无需修改 ToolCallCard
 *
 * 与反编译版差异:
 *   - 反编译区分 "kind"(read/edit/execute/search/fetch) 和 "name"(Write/ImageGen/...)两张表;
 *     当前项目 ExtendedSessionUpdate 的 tool_call 里 `kind` 不稳定(常为 'other')，
 *     先只按 toolName 匹配;future 如果需要再加 kind fallback 即可。
 */
import type { ComponentType, ReactNode } from 'react'
import { defaultRenderer } from './default'
import { bashRenderer } from './bash'
import { readRenderer } from './read'
import { writeRenderer } from './write'
import { editRenderer } from './edit'
import { grepRenderer } from './grep'
import { globRenderer } from './glob'
import { webFetchRenderer, webSearchRenderer } from './web'
import { todoWriteRenderer } from './todo'
import { taskRenderer } from './task'
import { imageGenRenderer } from './imagegen'

/** 渲染器输入上下文 */
export interface ToolRenderContext {
  toolName: string
  input: unknown
  result?: string
  isError?: boolean
  isPending: boolean
}

export interface ToolRenderer {
  /** 卡片头部图标；不传则使用默认 Wrench */
  Icon?: ComponentType<{ className?: string }>
  /** 卡片头部摘要文字(例如文件路径、命令前 60 字符) */
  getSummary?: (ctx: ToolRenderContext) => string | undefined
  /** 展开区的"参数"区块;不传则走 default 的 JSON pretty print */
  renderInput?: (ctx: ToolRenderContext) => ReactNode
  /** 展开区的"结果"区块;不传则走 default 的 pre 文本 */
  renderOutput?: (ctx: ToolRenderContext) => ReactNode
}

/**
 * 按工具名注册的渲染器表。key 与模型发出的 toolName 完全一致。
 *
 * 注意 MCP 工具名通常带 `mcp__<server>__` 前缀，查找时会先试全名，再试去前缀;
 * 所以这里只需注册核心短名即可。
 */
export const TOOL_RENDERERS: Record<string, ToolRenderer> = {
  // Claude 内置工具（CodeBuddy SDK，名字是 PascalCase）
  Bash: bashRenderer,
  Read: readRenderer,
  Write: writeRenderer,
  Edit: editRenderer,
  MultiEdit: editRenderer, // 复用 Edit 渲染器
  Grep: grepRenderer,
  Glob: globRenderer,
  WebFetch: webFetchRenderer,
  WebSearch: webSearchRenderer,
  TodoWrite: todoWriteRenderer,
  Task: taskRenderer,
  Agent: taskRenderer, // Anthropic SDK 的 Agent 工具等价 Task
  ImageGen: imageGenRenderer,
  ImageEdit: imageGenRenderer, // 复用 ImageGen 渲染器

  // OpenCode builtin 工具（小写命名，复用同一套渲染器）
  bash: bashRenderer,
  read: readRenderer,
  write: writeRenderer,
  edit: editRenderer,
  multiedit: editRenderer,
  grep: grepRenderer,
  glob: globRenderer,
  webfetch: webFetchRenderer,
  websearch: webSearchRenderer,
  todowrite: todoWriteRenderer,
  task: taskRenderer,
}

/**
 * 把 MCP 工具名剥掉前缀;如 `mcp__cloudbase__listEnv` → `listEnv`。
 * 与服务端 normalizeToolName 保持一致逻辑。
 */
function stripMcpPrefix(name: string): string {
  if (!name.startsWith('mcp__')) return name
  const parts = name.split('__')
  return parts.slice(2).join('__') || name
}

/**
 * 为给定 toolName 找到最匹配的渲染器:
 *   1. 先精确匹配原始名
 *   2. 再匹配去掉 mcp__ 前缀的短名
 *   3. 都不命中 → defaultRenderer
 */
export function getToolRenderer(toolName: string | undefined): ToolRenderer {
  if (!toolName) return defaultRenderer
  if (TOOL_RENDERERS[toolName]) return TOOL_RENDERERS[toolName]
  const stripped = stripMcpPrefix(toolName)
  if (stripped !== toolName && TOOL_RENDERERS[stripped]) return TOOL_RENDERERS[stripped]
  return defaultRenderer
}

export { defaultRenderer }
