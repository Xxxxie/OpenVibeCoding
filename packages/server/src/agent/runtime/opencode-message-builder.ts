/**
 * OpencodeMessageBuilder
 *
 * 把 AgentCallbackMessage 事件流累积成 UnifiedMessagePart[]，用于持久化到
 * vibe_agent_messages 集合（对齐 Tencent SDK runtime，前端零改动读取）。
 *
 * ## 为什么用 Builder
 *
 * OpenCode runtime 的事件流是 chunk 级别：
 *   text chunk × N → tool_use → tool_result → text chunk × M → result
 *
 * 前端读 DB 期望的 parts 数组是**合并后的结构**：
 *   [text(合并后), tool_call, tool_result, text(合并后)]
 *
 * Builder 负责这个 chunk → part 的聚合，并在合适的时机落库。
 *
 * ## 为什么不每个 chunk 都写 DB
 *
 * 1. DB 写入是网络 IO，text chunk 几十个一条 prompt 可能几百上千个
 * 2. Tencent SDK 的模式是 agent 结束后一次性 syncMessages
 * 3. 中间态的实时展示由 stream_events + SSE 负责（两条独立的通道）
 *
 * 所以 Builder 采用"累积 + 里程碑落库"策略：
 *   - 每次 pushEvent 追加内存 parts 数组
 *   - 工具调用完成 / 最终 finalize 时触发 DB 落库
 *   - finalize 时调 updateRecordStatus(assistantRecordId, 'done'|'error'|'cancel')
 *
 * ## 什么是"里程碑"
 *
 * - 每次 tool_result 事件（一个工具调用完整结束）→ 落一次
 * - finalize 时 → 落一次 + 改 status
 * 这样用户每次看到工具执行完毕，DB 已经反映最新状态；即使 server 崩溃，
 * 最坏丢失的是最后一段 text（stream_events 里仍然有，重启后 replay 可补偿）。
 */

import { v4 as uuidv4 } from 'uuid'
import type { AgentCallbackMessage, UnifiedMessagePart, UnifiedMessageRecord } from '@coder/shared'
import { persistenceService } from '../persistence.service.js'

export interface OpencodeMessageBuilderOptions {
  conversationId: string
  assistantRecordId: string
  envId: string
  userId: string
}

export class OpencodeMessageBuilder {
  private readonly parts: UnifiedMessagePart[] = []

  /** 当前正在累积的文本 part（遇到 tool_use 时 flush） */
  private currentTextBuffer: string[] = []

  /** 当前正在累积的 thinking part（与 text 分开 buffer） */
  private currentThinkingBuffer: string[] = []

  /** toolCallId → parts 数组中的 tool_call part 索引，用来 tool_input_update 时定位 */
  private toolCallIndexById = new Map<string, number>()

  private finalized = false

  constructor(private readonly opts: OpencodeMessageBuilderOptions) {}

  /**
   * 处理一条 AgentCallbackMessage。
   * 注意：不在这里写 DB（为了性能和事务简化）；DB 落库通过 flushToDb() 手动触发。
   */
  pushEvent(msg: AgentCallbackMessage): void {
    if (this.finalized) return

    switch (msg.type) {
      case 'text': {
        // 遇到新 text 前如果还有 thinking buffer，先 flush thinking
        if (this.currentThinkingBuffer.length > 0) {
          this.flushThinkingBuffer()
        }
        if (typeof msg.content === 'string' && msg.content.length > 0) {
          this.currentTextBuffer.push(msg.content)
        }
        break
      }
      case 'thinking': {
        if (this.currentTextBuffer.length > 0) {
          this.flushTextBuffer()
        }
        if (typeof msg.content === 'string' && msg.content.length > 0) {
          this.currentThinkingBuffer.push(msg.content)
        }
        break
      }
      case 'tool_use': {
        // 工具开始前先 flush 所有文本 / 思考
        this.flushTextBuffer()
        this.flushThinkingBuffer()

        const toolCallId = msg.id || uuidv4()
        const part: UnifiedMessagePart = {
          partId: uuidv4(),
          contentType: 'tool_call',
          content: JSON.stringify(msg.input ?? {}),
          toolCallId,
          metadata: {
            toolCallName: msg.name,
            toolName: msg.name,
            input: msg.input,
            status: 'in_progress',
          },
        }
        this.toolCallIndexById.set(toolCallId, this.parts.length)
        this.parts.push(part)
        break
      }
      case 'tool_input_update': {
        // 更新已有 tool_call part 的 input
        const toolCallId = msg.id
        if (!toolCallId) break
        const idx = this.toolCallIndexById.get(toolCallId)
        if (idx === undefined) break
        const existing = this.parts[idx]
        if (!existing || existing.contentType !== 'tool_call') break
        existing.content = JSON.stringify(msg.input ?? {})
        existing.metadata = {
          ...(existing.metadata ?? {}),
          input: msg.input,
        }
        break
      }
      case 'tool_result': {
        const toolCallId = msg.tool_use_id || msg.id
        const part: UnifiedMessagePart = {
          partId: uuidv4(),
          contentType: 'tool_result',
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content ?? ''),
          toolCallId,
          metadata: {
            status: msg.is_error ? 'error' : 'completed',
            isError: !!msg.is_error,
          },
        }
        this.parts.push(part)

        // 同步更新对应 tool_call 的 status
        if (toolCallId) {
          const idx = this.toolCallIndexById.get(toolCallId)
          if (idx !== undefined) {
            const callPart = this.parts[idx]
            if (callPart && callPart.contentType === 'tool_call') {
              callPart.metadata = {
                ...(callPart.metadata ?? {}),
                status: msg.is_error ? 'error' : 'completed',
              }
            }
          }
        }
        break
      }
      case 'result':
      case 'error':
      case 'agent_phase':
      case 'session':
      case 'tool_confirm':
      case 'ask_user':
      case 'artifact':
        // 这些不进 parts 数组（stream_events 已处理实时推送）
        // ask_user/tool_confirm 的状态通过 stream_events + turn lifecycle 展示
        break
    }
  }

  /**
   * 把当前累积的 parts 一次性写入 DB（replace）。
   * 触发点：tool_result 之后 + finalize 之前。
   */
  async flushToDb(): Promise<void> {
    if (this.finalized) return
    // 先把待定 buffer flush 到 parts 数组，然后写库
    const snapshot = this.snapshotParts()
    if (this.opts.envId) {
      try {
        await persistenceService.setRecordParts(this.opts.assistantRecordId, snapshot)
      } catch (e) {
        console.error('[OpencodeMessageBuilder] setRecordParts failed:', e)
      }
    }
  }

  /**
   * 结束构建：flush buffer → 写 DB → 更新 record status。
   * status = 'done' | 'error' | 'cancel'
   */
  async finalize(status: 'done' | 'error' | 'cancel'): Promise<void> {
    if (this.finalized) return
    this.finalized = true

    const snapshot = this.snapshotParts()
    if (this.opts.envId) {
      try {
        await persistenceService.setRecordParts(this.opts.assistantRecordId, snapshot)
      } catch (e) {
        console.error('[OpencodeMessageBuilder] setRecordParts on finalize failed:', e)
      }
      try {
        await persistenceService.finalizePendingRecords(this.opts.assistantRecordId, status)
      } catch (e) {
        console.error('[OpencodeMessageBuilder] finalizePendingRecords failed:', e)
      }
    }
  }

  /** 当前已累积的 parts 快照（flush 临时 buffer 到数组里） */
  private snapshotParts(): UnifiedMessagePart[] {
    // 为快照创建一个非破坏性 flush：临时合并 buffer
    const extra: UnifiedMessagePart[] = []
    if (this.currentTextBuffer.length > 0) {
      extra.push(this.buildTextPart(this.currentTextBuffer.join('')))
    }
    if (this.currentThinkingBuffer.length > 0) {
      extra.push(this.buildThinkingPart(this.currentThinkingBuffer.join('')))
    }
    return [...this.parts, ...extra]
  }

  private flushTextBuffer(): void {
    if (this.currentTextBuffer.length === 0) return
    this.parts.push(this.buildTextPart(this.currentTextBuffer.join('')))
    this.currentTextBuffer = []
  }

  private flushThinkingBuffer(): void {
    if (this.currentThinkingBuffer.length === 0) return
    this.parts.push(this.buildThinkingPart(this.currentThinkingBuffer.join('')))
    this.currentThinkingBuffer = []
  }

  private buildTextPart(text: string): UnifiedMessagePart {
    return {
      partId: uuidv4(),
      contentType: 'text',
      content: text,
      metadata: {
        id: this.opts.assistantRecordId,
        type: 'message',
        role: 'assistant',
      },
    }
  }

  private buildThinkingPart(text: string): UnifiedMessagePart {
    return {
      partId: uuidv4(),
      contentType: 'reasoning',
      content: text,
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * 根据 conversationId 查找上一轮 assistant recordId（用于新 user record 的
 * replyTo / parentId 建链）。没有历史时返回 null。
 */
export async function findLastRecordIds(
  conversationId: string,
  envId: string,
  userId: string,
): Promise<{ prevRecordId: string | null; lastAssistantRecordId: string | null }> {
  if (!envId || !conversationId) return { prevRecordId: null, lastAssistantRecordId: null }
  try {
    const records = await persistenceService.loadDBMessages(conversationId, envId, userId, 2)
    // loadDBMessages 返回按 createTime 升序的完整 records（最多 2 条，取最后 1 轮 QA）
    let prevRecordId: string | null = null
    let lastAssistantRecordId: string | null = null
    for (const r of records) {
      prevRecordId = r.recordId
      if (r.role === 'assistant') lastAssistantRecordId = r.recordId
    }
    return { prevRecordId, lastAssistantRecordId }
  } catch {
    return { prevRecordId: null, lastAssistantRecordId: null }
  }
}

/**
 * 从 DB 读最近 N 轮历史对话，构造一个 "context prompt prefix" 让新建的 opencode
 * session 看到之前的上下文。
 *
 * 为什么需要：OpenCode 每次 chatStream 都 newSession（空白上下文）。如果不注入
 * 历史，LLM 无法回答"上一轮我说过什么"。
 *
 * 格式（Markdown 分层，模型自然理解）：
 *   Below is the prior conversation history. Use it as context when responding.
 *
 *   ---
 *
 *   ## Turn 1
 *
 *   **User:** 你好，我叫王小明
 *
 *   **Assistant:** 你好王小明，有什么我可以帮你的？
 *
 *   [Tool call] AskUserQuestion
 *     params: question, header, options, multiSelect
 *
 *   [Tool result] AskUserQuestion — completed (28 bytes)
 *
 *   ---
 *
 *   ## Current user message
 *
 *   <实际 prompt>
 *
 * 安全截断策略：
 *   - tool_call：只输出工具名 + 参数名列表，**不包含参数值**（避免 JSON 截断半截）
 *   - tool_result：输出工具名 + status + 字节数，**不输出原始内容**（避免 context 爆表）
 *   - reasoning：完全跳过（LLM 已消化，再放进去是噪声）
 */
export async function buildHistoryContextPrompt(
  conversationId: string,
  envId: string,
  userId: string,
  newPrompt: string,
  opts: { maxHistoryRecords?: number; excludeRecordIds?: ReadonlySet<string> } = {},
): Promise<string> {
  const { maxHistoryRecords = 20, excludeRecordIds } = opts
  if (!envId || !conversationId) return newPrompt

  try {
    const records = await persistenceService.loadDBMessages(conversationId, envId, userId, maxHistoryRecords)
    if (records.length === 0) return newPrompt

    // 过滤掉被排除的 record 和非 done 状态
    const usableRecords = records.filter((r) => {
      if (excludeRecordIds?.has(r.recordId)) return false
      if (r.status !== 'done') return false
      return true
    })

    if (usableRecords.length === 0) return newPrompt

    // 把 records 按"user + 其后的 assistant"分组成 turns
    // 策略：遇到 user record 就开启新 turn（turn number 随之递增）
    const sections: string[] = []
    let turnNumber = 0
    let currentTurnLines: string[] = []

    const flushTurn = () => {
      if (currentTurnLines.length === 0) return
      sections.push(`## Turn ${turnNumber}\n\n${currentTurnLines.join('\n\n')}`)
      currentTurnLines = []
    }

    for (const r of usableRecords) {
      if (r.role === 'user') {
        // 开新 turn
        flushTurn()
        turnNumber += 1
        currentTurnLines = []
      }

      for (const p of r.parts || []) {
        if (p.contentType === 'text' && p.content) {
          const rolePrefix = r.role === 'user' ? '**User:**' : '**Assistant:**'
          currentTurnLines.push(`${rolePrefix} ${p.content.trim()}`)
        } else if (p.contentType === 'reasoning') {
          // 不入 context
        } else if (p.contentType === 'tool_call') {
          const toolName = (p.metadata?.toolName as string) ?? (p.metadata?.toolCallName as string) ?? 'tool'
          // 只输出参数名列表，不含参数值（安全截断，避免 JSON 断截）
          const input = p.metadata?.input as Record<string, unknown> | undefined
          const paramKeys = input ? Object.keys(input) : []
          const paramLine = paramKeys.length > 0 ? `\n  params: ${paramKeys.join(', ')}` : ''
          currentTurnLines.push(`[Tool call] ${toolName}${paramLine}`)
        } else if (p.contentType === 'tool_result') {
          const toolName = (p.metadata?.toolName as string) ?? 'tool'
          const status = (p.metadata?.status as string) ?? 'unknown'
          const byteCount = typeof p.content === 'string' ? p.content.length : 0
          currentTurnLines.push(`[Tool result] ${toolName} — ${status} (${byteCount} bytes)`)
        }
      }
    }
    flushTurn()

    if (sections.length === 0) return newPrompt

    const header = 'Below is the prior conversation history. Use it as context when responding.'
    return `${header}\n\n---\n\n${sections.join('\n\n---\n\n')}\n\n---\n\n## Current user message\n\n${newPrompt}`
  } catch (e) {
    console.warn('[buildHistoryContextPrompt] failed, falling back to raw prompt:', (e as Error).message)
    return newPrompt
  }
}

/**
 * 避免 tsc 类型未引用警告
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _KeepUnifiedMessageRecord = UnifiedMessageRecord
