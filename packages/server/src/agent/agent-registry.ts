import type { AgentRunStatus } from '@coder/shared'

// ─── Types ─────────────────────────────────────────────────────────────

/**
 * ACP 协议定义的 stopReason 合法值。
 * 见 @agentclientprotocol/sdk 的 StopReason schema。
 * 这里不引入 ACP SDK 的类型依赖，直接用字面量联合足以。
 */
export type StopReason = 'end_turn' | 'max_tokens' | 'max_turn_requests' | 'refusal' | 'cancelled'

export interface AgentRun {
  conversationId: string
  turnId: string
  envId: string
  userId: string
  status: AgentRunStatus
  abortController: AbortController
  startTime: number
  lastSeq: number
  error?: string
  /**
   * 真实终止原因。runtime 在 completeAgent 时透传，routes/acp.ts 终结报文优先使用此值；
   * 若 undefined 则 acp.ts 会根据 status 派生（cancelled→cancelled、error→refusal、else→end_turn）。
   */
  stopReason?: StopReason
}

// ─── Registry ──────────────────────────────────────────────────────────

const runningAgents = new Map<string, AgentRun>()

export function registerAgent(run: Omit<AgentRun, 'status' | 'startTime' | 'lastSeq'>): AgentRun {
  const existing = runningAgents.get(run.conversationId)
  if (existing) {
    console.log(
      `[Registry] registerAgent(${run.conversationId}) OVERWRITING existing entry: prev status=${existing.status}, prev turnId=${existing.turnId}, new turnId=${run.turnId}`,
    )
  }
  const agentRun: AgentRun = {
    ...run,
    status: 'running',
    startTime: Date.now(),
    lastSeq: -1,
  }
  runningAgents.set(run.conversationId, agentRun)
  return agentRun
}

export function getAgentRun(conversationId: string): AgentRun | undefined {
  return runningAgents.get(conversationId)
}

export function completeAgent(
  conversationId: string,
  status: 'completed' | 'error' | 'cancelled',
  error?: string,
  stopReason?: StopReason,
): void {
  const run = runningAgents.get(conversationId)
  if (run) {
    const caller = new Error().stack?.split('\n')[2]?.trim() || 'unknown'
    console.log(
      `[Registry] completeAgent(${conversationId}) prev status=${run.status} → ${status}, stopReason=${stopReason ?? 'n/a'}, turnId=${run.turnId}, caller=${caller}`,
    )
    run.status = status
    if (error) run.error = error
    if (stopReason) run.stopReason = stopReason
  } else {
    console.log(`[Registry] completeAgent(${conversationId}) NO RUN FOUND, status=${status}`)
  }
}

/**
 * Remove agent from registry.
 * Only deletes if the current entry matches the given turnId (prevents a stale
 * setTimeout from removing a newer run that reused the same conversationId).
 */
export function removeAgent(conversationId: string, turnId?: string): void {
  if (turnId) {
    const run = runningAgents.get(conversationId)
    if (run && run.turnId !== turnId) return // stale removal — skip
  }
  runningAgents.delete(conversationId)
}

export function isAgentRunning(conversationId: string): boolean {
  const run = runningAgents.get(conversationId)
  return run?.status === 'running'
}

export function getNextSeq(conversationId: string): number {
  const run = runningAgents.get(conversationId)
  if (!run) return 0
  run.lastSeq += 1
  return run.lastSeq
}
