/**
 * PendingPermissionRegistry
 *
 * 存放被挂起的 ACP `requestPermission` 调用，跨 chatStream 请求传递用户决策。
 *
 * 场景（OpenCode ACP 下的 ToolConfirm 流程）：
 *
 *   1. opencode 子进程对工具调用发 `session/request_permission`
 *   2. ClientSideConnection 的 `requestPermission` handler 被触发
 *   3. handler：
 *        a. 通过 emit 发 AgentCallbackMessage(type='tool_confirm') 给前端 SSE
 *        b. 调用 `registerPending(convId, interruptId, options)` 拿到 pending Promise
 *        c. `return await pending` → 本 handler 挂起（opencode 也挂起）
 *   4. 前端用户点 "允许/拒绝" → 下一轮 session/prompt 带 params.toolConfirmation
 *   5. routes/acp.ts 照常调 runtime.chatStream(options.toolConfirmation)
 *   6. runtime 检测到：
 *        - isAgentRunning → 已有挂起的 agent
 *        - options.toolConfirmation 非空
 *      → 调 `resolvePending(convId, interruptId, action)` 喂给挂起的 Promise
 *   7. opencode 收到 outcome，继续执行，session/update 事件从卡住的地方恢复
 *
 * 内存存储，进程重启清空（与 agent-registry 一致）。
 * 同一个 conversationId 同时只能有一个挂起的权限请求（opencode 本身保证序列化）。
 */

import type { RequestPermissionResponse } from '@agentclientprotocol/sdk'

type AcpOption = {
  optionId: string
  kind: 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always' | string
  name?: string
}

export interface PendingPermission {
  conversationId: string
  /** 对应 toolCallId（前端 resume 时传 interruptId） */
  interruptId: string
  options: AcpOption[]
  /** 创建时间（用于调试和超时清理） */
  createdAt: number
  /**
   * resolve opencode ACP `requestPermission` 返回值。
   * 这个函数被 runtime 外部（resolvePending）调用。
   */
  resolve: (outcome: RequestPermissionResponse) => void
  /** reject 用于 abort 场景 */
  reject: (reason?: unknown) => void
}

const pending = new Map<string, PendingPermission>()

function key(conversationId: string, interruptId: string): string {
  return `${conversationId}::${interruptId}`
}

/**
 * 注册一个挂起的权限请求，返回 Promise 给 ACP handler。
 * ACP handler 应该 `await` 这个 Promise，Promise resolve 时 handler 返回给 opencode。
 */
export function registerPending(
  conversationId: string,
  interruptId: string,
  options: AcpOption[],
): Promise<RequestPermissionResponse> {
  return new Promise((resolve, reject) => {
    const existing = pending.get(key(conversationId, interruptId))
    if (existing) {
      // 边界：同一 interruptId 重复注册（理论上不应发生）—— 清理旧的
      existing.reject(new Error('Replaced by new pending permission'))
    }
    pending.set(key(conversationId, interruptId), {
      conversationId,
      interruptId,
      options,
      createdAt: Date.now(),
      resolve,
      reject,
    })
  })
}

/**
 * 由 runtime（下一轮 chatStream）调用：根据用户 action 查找对应 ACP 选项 id，喂给挂起的 handler。
 *
 * @returns true 表示成功找到并 resolve；false 表示没有挂起的记录（可能 agent 已超时/被 cancel）
 */
export function resolvePending(
  conversationId: string,
  interruptId: string,
  action: 'allow' | 'allow_always' | 'deny' | 'reject_and_exit_plan',
): boolean {
  const entry = pending.get(key(conversationId, interruptId))
  if (!entry) return false

  const optionId = pickOptionId(entry.options, action)
  pending.delete(key(conversationId, interruptId))
  entry.resolve({
    outcome: { outcome: 'selected', optionId },
  })
  return true
}

/**
 * 由 abort 逻辑调用：把所有该 conversation 的挂起权限请求 reject，让 opencode 收到错误退出。
 */
export function rejectPendingForConversation(conversationId: string, reason = 'Aborted'): number {
  let count = 0
  for (const [k, entry] of pending) {
    if (entry.conversationId === conversationId) {
      entry.reject(new Error(reason))
      pending.delete(k)
      count++
    }
  }
  return count
}

/** 是否有挂起的权限请求（调试/observability 用） */
export function hasPending(conversationId: string): boolean {
  for (const entry of pending.values()) {
    if (entry.conversationId === conversationId) return true
  }
  return false
}

/**
 * 把 PermissionAction 映射到 ACP options 的 optionId。
 *
 * ACP options 的 kind 可能包括：
 *   - allow_once: 本次允许
 *   - allow_always: 永远允许
 *   - reject_once: 本次拒绝
 *   - reject_always: 永远拒绝（OpenCode 不一定提供）
 *
 * 前端 PermissionAction:
 *   - allow             → allow_once
 *   - allow_always      → allow_always（没有就 fallback 到 allow_once）
 *   - deny              → reject_once
 *   - reject_and_exit_plan → reject_once（ExitPlanMode 特化，opencode 端视同拒绝）
 */
function pickOptionId(options: AcpOption[], action: string): string {
  const findKind = (kind: string) => options.find((o) => o.kind === kind)

  switch (action) {
    case 'allow':
      return (findKind('allow_once') ?? findKind('allow_always') ?? options[0]).optionId
    case 'allow_always':
      return (findKind('allow_always') ?? findKind('allow_once') ?? options[0]).optionId
    case 'deny':
    case 'reject_and_exit_plan':
      return (findKind('reject_once') ?? findKind('reject_always') ?? options[options.length - 1]).optionId
    default:
      return options[0].optionId
  }
}
