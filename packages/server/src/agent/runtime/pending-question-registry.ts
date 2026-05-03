/**
 * PendingQuestionRegistry
 *
 * 挂起"question tool"的 HTTP 回调，等用户通过下一轮 prompt.askAnswers 回答。
 *
 * 对比 PendingPermissionRegistry（用于 ToolConfirm）：
 * - PermissionRegistry 挂 ACP JSON-RPC Promise（opencode stdio ACP 协议里）
 * - QuestionRegistry 挂 **HTTP 响应**（opencode 子进程里 custom tool 通过 fetch 调进来）
 *
 * 流程：
 *   1. opencode 子进程的 custom tool `question` execute：
 *        fetch POST <server>/api/agent/internal/ask-user
 *              body { conversationId, toolCallId, questions }
 *   2. server handler：
 *        registerPendingQuestion(convId, toolCallId, res) → res 挂起直到 resolve
 *        同时 emit `ask_user` AgentCallbackMessage → 转为 SSE sessionUpdate 给前端
 *   3. 前端展示 AskUserForm，用户答完 → 下一轮 POST /api/agent/acp
 *      body.askAnswers = { toolCallId: { answers: {...} } }
 *   4. routes/acp.ts 把 askAnswers 传给 runtime.chatStream
 *   5. runtime 判断 isAgentRunning + options.askAnswers 非空：
 *        对每个 toolCallId 调 resolvePendingQuestion → res.json({ answers }) → tool execute 返回
 *   6. opencode 收到 tool_result，LLM 继续推理
 */

import type { ServerResponse } from 'node:http'

/**
 * 存放的上下文。
 *
 * - `response`: Hono/Node 返回的 HTTP response 对象的写入句柄。
 *   为什么不直接存 Hono Context？—— context 生命周期短，req 结束会销毁。
 *   用底层 ServerResponse（Node 原生）更可靠，或者 Hono 的 streaming primitive。
 *   这里存一个简单的 resolve 函数，由 route handler 关联到自身的 response。
 */
export interface PendingQuestion {
  conversationId: string
  toolCallId: string
  questions: unknown[]
  createdAt: number
  /** 由 route handler 提供：接收最终答案后写回 HTTP 响应 */
  resolve: (answers: Record<string, string>) => void
  reject: (reason: string) => void
}

const pending = new Map<string, PendingQuestion>()

function key(conversationId: string, toolCallId: string): string {
  return `${conversationId}::${toolCallId}`
}

/**
 * 由 HTTP handler 调用，记录一个挂起的 question 请求。
 */
export function registerPendingQuestion(entry: PendingQuestion): void {
  const k = key(entry.conversationId, entry.toolCallId)
  const existing = pending.get(k)
  if (existing) {
    existing.reject('Replaced by new question request')
  }
  pending.set(k, entry)
}

/**
 * 由 runtime.chatStream 的 resume 分支调用：找到挂起的 question，写回答案。
 *
 * @returns true 表示成功；false 表示没找到（可能已超时）
 */
export function resolvePendingQuestion(
  conversationId: string,
  toolCallId: string,
  answers: Record<string, string>,
): boolean {
  const k = key(conversationId, toolCallId)
  const entry = pending.get(k)
  if (!entry) return false
  pending.delete(k)
  entry.resolve(answers)
  return true
}

/**
 * 错误/abort 时清理该 conversation 下所有挂起 question，让 HTTP 调用方拿到失败。
 */
export function rejectPendingQuestionsForConversation(conversationId: string, reason = 'Aborted'): number {
  let count = 0
  for (const [k, entry] of pending) {
    if (entry.conversationId === conversationId) {
      entry.reject(reason)
      pending.delete(k)
      count++
    }
  }
  return count
}

export function hasPendingQuestion(conversationId: string): boolean {
  for (const entry of pending.values()) {
    if (entry.conversationId === conversationId) return true
  }
  return false
}

/** Debug only */
export function listPendingQuestions(): ReadonlyArray<PendingQuestion> {
  return Array.from(pending.values())
}

// Explicit no-op import to keep ServerResponse referenced (avoids unused-type lint)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _KeepServerResponseImportForDocs = ServerResponse
