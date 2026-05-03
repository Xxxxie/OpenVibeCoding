/**
 * Agent Runtime 抽象层
 *
 * 设计目标：把"具体 agent 实现（Tencent SDK / OpenCode ACP / Claude Code ACP / ...）"
 * 与"对外的会话/流式/持久化逻辑（routes/acp.ts、persistence.service.ts）"解耦。
 *
 * 现状：原 `CloudbaseAgentService` 直接耦合 `@tencent-ai/agent-sdk`。
 * 重构后：`CloudbaseAgentService` 退化为 `TencentSdkRuntime`（实现 IAgentRuntime），
 *         新增 `OpencodeAcpRuntime`，由 `AgentRuntimeRegistry` 调度。
 *
 * 关键约束（来自 routes/acp.ts 现有调用面）：
 * 1. `chatStream(prompt, callback, options)` 签名保持不变
 * 2. callback 收到 `AgentCallbackMessage`，由 `convertToSessionUpdate` 转 ACP `SessionUpdate`
 *    （所以 runtime 实现者需把自己的事件流"翻译"为 AgentCallbackMessage）
 * 3. 返回 `{ turnId, alreadyRunning }`：turnId == assistantMessageId
 * 4. 必须配合 `agent-registry`、`persistence.service`、`event-buffer` 三件套
 *    （runtime 不直接 import 它们，由 BaseAgentRuntime 抽象类提供基础设施）
 */

import type { AgentCallback, AgentCallbackMessage, AgentOptions } from '@coder/shared'
import type { ModelInfo } from '../cloudbase-agent.service.js'

/**
 * Runtime 启动 chatStream 后的返回。
 *
 * - turnId: 本轮 assistant 消息在 DB 的 record id（用于 SSE observe / persistence）
 * - alreadyRunning: 同一 conversation 已有 agent 在跑 → 调用方应直接 observe 已有 turn
 */
export interface ChatStreamResult {
  turnId: string
  alreadyRunning: boolean
}

/**
 * Agent Runtime 接口
 *
 * 实现者必须：
 * - 接收 `prompt + options`，启动一次"会话回合"
 * - 通过 `callback` 实时推送 `AgentCallbackMessage`（type 列见 packages/shared/src/types/agent.ts）
 * - 把自身事件流（如 ACP `session/update`、Tencent SDK 的 query iterator）转成 AgentCallbackMessage
 * - 处理 abort / resume / askAnswers / toolConfirmation 等 options 字段
 * - 返回 `{ turnId, alreadyRunning }`，turnId 用于后续 SSE observe
 */
export interface IAgentRuntime {
  /**
   * Runtime 唯一标识（e.g. 'tencent-sdk', 'opencode-acp', 'claude-code-acp'）
   */
  readonly name: string

  /**
   * Runtime 是否可用（依赖检测，如 opencode CLI 是否安装、SDK 是否能 import）。
   * Registry 会在选择 runtime 前调用，避免选到不可用的 runtime。
   */
  isAvailable(): Promise<boolean>

  /**
   * 列出此 runtime 支持的模型。
   * 用于前端模型选择器。不同 runtime 可暴露不同的模型集合。
   */
  getSupportedModels(): Promise<ModelInfo[]>

  /**
   * 启动一次 chat 流。
   *
   * 行为约定（必须严格遵守，否则 routes/acp.ts 的 SSE 流会卡住）：
   * 1. 同步返回 `{ turnId, alreadyRunning }`
   * 2. 后台 fire-and-forget 跑 agent，通过 callback 推送 message
   * 3. 完成时推送 `type: 'result'` message（callback 触发后视为本轮结束）
   * 4. 若 abort，推送 `type: 'error', content: 'Aborted'`
   * 5. callback 调用顺序需保持单调时间序（不要并发 await）
   *
   * @param prompt 用户输入
   * @param callback 实时事件回调（可为 null，仅持久化不实时推）
   * @param options 见 packages/shared/src/types/agent.ts AgentOptions
   */
  chatStream(prompt: string, callback: AgentCallback | null, options: AgentOptions): Promise<ChatStreamResult>
}

/**
 * Runtime 选择策略。
 *
 * 优先级：
 * 1. 显式 `runtime` 字段（来自请求 body 或 task 记录）
 * 2. 环境变量 `AGENT_RUNTIME`
 * 3. registry 默认 runtime（构造时指定）
 */
export interface RuntimeSelectorOptions {
  explicitRuntime?: string
  conversationId?: string
}

/**
 * 把任意 runtime 内部事件桥接为 AgentCallbackMessage 时常用的辅助类型。
 * runtime 实现者可以用 EventBridge 的工具方法减少样板代码。
 */
export type EmitFn = (msg: AgentCallbackMessage) => void
