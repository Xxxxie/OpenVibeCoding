import type { AgentRunStatus } from '@coder/shared'

// ─── Types ─────────────────────────────────────────────────────────────

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
}

// ─── Registry ──────────────────────────────────────────────────────────

const runningAgents = new Map<string, AgentRun>()

export function registerAgent(run: Omit<AgentRun, 'status' | 'startTime' | 'lastSeq'>): AgentRun {
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
): void {
  const run = runningAgents.get(conversationId)
  if (run) {
    run.status = status
    if (error) run.error = error
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
