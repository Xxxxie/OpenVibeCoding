/**
 * 单元测试：buildHistoryContextPrompt
 *
 * 全部 mock persistenceService，不依赖 LLM / CloudBase / TCB。
 * 测试粒度：精确 toContain，不用 snapshot（snapshot 对换行太脆）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock persistence service ───────────────────────────────────────────────
vi.mock('../../persistence.service.js', () => ({
  persistenceService: {
    loadDBMessages: vi.fn(),
  },
}))

// 延迟 import，确保 mock 先就绪
const { buildHistoryContextPrompt } = await import('../opencode-message-builder.js')
const { persistenceService } = await import('../../persistence.service.js')

// ─── Helper types (mirror UnifiedMessageRecord subset) ───────────────────────
function makeRecord(
  recordId: string,
  role: 'user' | 'assistant',
  status: 'done' | 'pending' | 'error' | 'cancel',
  parts: Array<{ contentType: string; content?: string; metadata?: Record<string, unknown>; toolCallId?: string }>,
) {
  return { recordId, role, status, parts }
}

function textPart(content: string) {
  return { contentType: 'text', content }
}

function reasoningPart(content: string) {
  return { contentType: 'reasoning', content }
}

function toolCallPart(toolName: string, input: Record<string, unknown>, toolCallId = 'tc-1') {
  return {
    contentType: 'tool_call',
    content: JSON.stringify(input),
    toolCallId,
    metadata: { toolName, toolCallName: toolName, input },
  }
}

function toolResultPart(toolName: string, output: string, status = 'completed', toolCallId = 'tc-1') {
  return {
    contentType: 'tool_result',
    content: output,
    toolCallId,
    metadata: { toolName, status },
  }
}

const CONV = 'conv-1'
const ENV = 'env-1'
const USER = 'user-1'
const PROMPT = 'What should I do next?'

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('buildHistoryContextPrompt', () => {
  beforeEach(() => {
    vi.mocked(persistenceService.loadDBMessages).mockReset()
  })

  // ── no-op cases ──────────────────────────────────────────────────────────

  it('returns raw prompt when envId is empty', async () => {
    const result = await buildHistoryContextPrompt(CONV, '', USER, PROMPT)
    expect(result).toBe(PROMPT)
    expect(persistenceService.loadDBMessages).not.toHaveBeenCalled()
  })

  it('returns raw prompt when conversationId is empty', async () => {
    const result = await buildHistoryContextPrompt('', ENV, USER, PROMPT)
    expect(result).toBe(PROMPT)
  })

  it('returns raw prompt when loadDBMessages returns empty array', async () => {
    vi.mocked(persistenceService.loadDBMessages).mockResolvedValueOnce([])
    const result = await buildHistoryContextPrompt(CONV, ENV, USER, PROMPT)
    expect(result).toBe(PROMPT)
  })

  it('returns raw prompt when all records are excluded', async () => {
    vi.mocked(persistenceService.loadDBMessages).mockResolvedValueOnce([
      makeRecord('r1', 'user', 'done', [textPart('hello')]),
    ])
    const result = await buildHistoryContextPrompt(CONV, ENV, USER, PROMPT, {
      excludeRecordIds: new Set(['r1']),
    })
    expect(result).toBe(PROMPT)
  })

  it('returns raw prompt when loadDBMessages throws', async () => {
    vi.mocked(persistenceService.loadDBMessages).mockRejectedValueOnce(new Error('db error'))
    const result = await buildHistoryContextPrompt(CONV, ENV, USER, PROMPT)
    expect(result).toBe(PROMPT)
  })

  // ── format checks ─────────────────────────────────────────────────────────

  it('single turn: contains Turn 1 heading', async () => {
    vi.mocked(persistenceService.loadDBMessages).mockResolvedValueOnce([
      makeRecord('r1', 'user', 'done', [textPart('hello')]),
      makeRecord('r2', 'assistant', 'done', [textPart('hi there')]),
    ])
    const result = await buildHistoryContextPrompt(CONV, ENV, USER, PROMPT)
    expect(result).toContain('## Turn 1')
  })

  it('single turn: user text prefixed with **User:**', async () => {
    vi.mocked(persistenceService.loadDBMessages).mockResolvedValueOnce([
      makeRecord('r1', 'user', 'done', [textPart('hello world')]),
    ])
    const result = await buildHistoryContextPrompt(CONV, ENV, USER, PROMPT)
    expect(result).toContain('**User:** hello world')
  })

  it('single turn: assistant text prefixed with **Assistant:**', async () => {
    vi.mocked(persistenceService.loadDBMessages).mockResolvedValueOnce([
      makeRecord('r2', 'assistant', 'done', [textPart('reply text')]),
    ])
    const result = await buildHistoryContextPrompt(CONV, ENV, USER, PROMPT)
    expect(result).toContain('**Assistant:** reply text')
  })

  it('multiple turns: contains Turn 1 and Turn 2', async () => {
    vi.mocked(persistenceService.loadDBMessages).mockResolvedValueOnce([
      makeRecord('r1', 'user', 'done', [textPart('first')]),
      makeRecord('r2', 'assistant', 'done', [textPart('ok1')]),
      makeRecord('r3', 'user', 'done', [textPart('second')]),
      makeRecord('r4', 'assistant', 'done', [textPart('ok2')]),
    ])
    const result = await buildHistoryContextPrompt(CONV, ENV, USER, PROMPT)
    expect(result).toContain('## Turn 1')
    expect(result).toContain('## Turn 2')
  })

  it('multiple turns: --- separator between turns', async () => {
    vi.mocked(persistenceService.loadDBMessages).mockResolvedValueOnce([
      makeRecord('r1', 'user', 'done', [textPart('first')]),
      makeRecord('r2', 'assistant', 'done', [textPart('ok1')]),
      makeRecord('r3', 'user', 'done', [textPart('second')]),
    ])
    const result = await buildHistoryContextPrompt(CONV, ENV, USER, PROMPT)
    // 应该有多个 --- 分隔（turn 之间 + current message 前）
    const separators = result.match(/^---$/gm)
    expect(separators?.length).toBeGreaterThanOrEqual(2)
  })

  it('contains "Current user message" section with new prompt', async () => {
    vi.mocked(persistenceService.loadDBMessages).mockResolvedValueOnce([
      makeRecord('r1', 'user', 'done', [textPart('hello')]),
    ])
    const result = await buildHistoryContextPrompt(CONV, ENV, USER, PROMPT)
    expect(result).toContain('## Current user message')
    expect(result).toContain(PROMPT)
  })

  // ── tool_call ─────────────────────────────────────────────────────────────

  it('tool_call: shows tool name and param keys, NOT param values', async () => {
    vi.mocked(persistenceService.loadDBMessages).mockResolvedValueOnce([
      makeRecord('r1', 'assistant', 'done', [
        toolCallPart('write', { path: '/secret/file.txt', content: 'topsecret' }),
      ]),
    ])
    const result = await buildHistoryContextPrompt(CONV, ENV, USER, PROMPT)
    // 工具名显示
    expect(result).toContain('[Tool call] write')
    // 参数名显示
    expect(result).toContain('path')
    expect(result).toContain('content')
    // 参数值不显示
    expect(result).not.toContain('/secret/file.txt')
    expect(result).not.toContain('topsecret')
  })

  // ── tool_result ───────────────────────────────────────────────────────────

  it('tool_result: shows name, status and byte count, NOT raw content', async () => {
    const longOutput = 'a'.repeat(500)
    vi.mocked(persistenceService.loadDBMessages).mockResolvedValueOnce([
      makeRecord('r1', 'assistant', 'done', [
        toolCallPart('read', { path: 'x.txt' }),
        toolResultPart('read', longOutput, 'completed'),
      ]),
    ])
    const result = await buildHistoryContextPrompt(CONV, ENV, USER, PROMPT)
    expect(result).toContain('[Tool result] read')
    expect(result).toContain('completed')
    expect(result).toContain('500 bytes')
    // 原始内容不应出现
    expect(result).not.toContain(longOutput.slice(0, 50))
  })

  // ── filtering ─────────────────────────────────────────────────────────────

  it('reasoning part is NOT included in context', async () => {
    vi.mocked(persistenceService.loadDBMessages).mockResolvedValueOnce([
      makeRecord('r1', 'assistant', 'done', [reasoningPart('my secret thinking process'), textPart('final answer')]),
    ])
    const result = await buildHistoryContextPrompt(CONV, ENV, USER, PROMPT)
    expect(result).not.toContain('my secret thinking process')
    expect(result).toContain('final answer')
  })

  it('pending/error/cancel records are skipped', async () => {
    vi.mocked(persistenceService.loadDBMessages).mockResolvedValueOnce([
      makeRecord('r1', 'user', 'done', [textPart('good')]),
      makeRecord('r2', 'assistant', 'pending', [textPart('should not appear')]),
      makeRecord('r3', 'assistant', 'error', [textPart('error msg')]),
    ])
    const result = await buildHistoryContextPrompt(CONV, ENV, USER, PROMPT)
    expect(result).toContain('good')
    expect(result).not.toContain('should not appear')
    expect(result).not.toContain('error msg')
  })

  it('excludeRecordIds skips specific records', async () => {
    vi.mocked(persistenceService.loadDBMessages).mockResolvedValueOnce([
      makeRecord('r1', 'user', 'done', [textPart('old message')]),
      makeRecord('r2', 'user', 'done', [textPart('new prompt - excluded')]),
    ])
    const result = await buildHistoryContextPrompt(CONV, ENV, USER, PROMPT, {
      excludeRecordIds: new Set(['r2']),
    })
    expect(result).toContain('old message')
    expect(result).not.toContain('new prompt - excluded')
  })
})
