/**
 * OpencodeAcpRuntime
 *
 * 把 OpenCode (`opencode acp` 子进程) 包装成 IAgentRuntime。
 *
 * 架构：
 *   chatStream() ──fire-and-forget──► launchAgent()
 *                                       │
 *                                       ▼
 *                          spawn `opencode acp --cwd <cwd>`
 *                                       │
 *                                       ▼
 *                          ClientSideConnection (NDJSON over stdio)
 *                                       │
 *                                       ▼
 *                       initialize → newSession → setSessionModel? → prompt
 *                                       │
 *                                       ▼
 *                       session/update / requestPermission events
 *                                       │
 *                                       ▼
 *                       翻译为 AgentCallbackMessage → callback
 *
 * 与 TencentSdkRuntime 的差异：
 * - 进程外 agent（每次 chat 重新 spawn 一个 opencode 子进程；轻量、隔离干净）
 * - 工具执行在 opencode 进程内（Node fs / child_process），ACP client 回调仅用于
 *   session/update + requestPermission（不实现 fs/* terminal/*，因为 OpenCode 不会发）
 * - 不集成现有 sandbox/coding-mode/git-archive 复杂度（首版求最小可用）
 *
 * 已知限制（首版）：
 * - 不支持 resume（askAnswers / toolConfirmation 暂不处理）
 * - 不持久化 message 到 DB（仅 stream events 落库供 SSE replay）
 * - 不支持 maxTurns / cwd 之外的高级 options
 * - cwd 直接用 process.cwd() 或 options.cwd，不创建沙箱目录
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { v4 as uuidv4 } from 'uuid'
import { ClientSideConnection, ndJsonStream, type Stream } from '@agentclientprotocol/sdk'
import type { AgentCallback, AgentCallbackMessage, AgentOptions } from '@coder/shared'
import type { ChatStreamResult, IAgentRuntime } from './types.js'
import type { ModelInfo } from '../cloudbase-agent.service.js'
import {
  registerAgent,
  isAgentRunning,
  getAgentRun,
  completeAgent,
  removeAgent,
  getNextSeq,
} from '../agent-registry.js'
import { persistenceService } from '../persistence.service.js'
import { CloudbaseAgentService } from '../cloudbase-agent.service.js'

// ─── Config ──────────────────────────────────────────────────────────────

/** opencode CLI 可执行路径，可由环境变量覆盖 */
const OPENCODE_BIN = process.env.OPENCODE_BIN || 'opencode'

/** 默认模型（OpenCode 模型 id 格式: provider/model[/variant]） */
const DEFAULT_OPENCODE_MODEL = process.env.OPENCODE_DEFAULT_MODEL || 'moonshot/kimi-k2-0905-preview'

/** 子进程启动超时（ms） */
const SPAWN_TIMEOUT_MS = 15000

// ─── Runtime ─────────────────────────────────────────────────────────────

export class OpencodeAcpRuntime implements IAgentRuntime {
  readonly name = 'opencode-acp'

  /** 进程缓存：conversationId → child（按需复用，目前每次都新建） */
  // private readonly procs = new Map<string, ChildProcessWithoutNullStreams>()

  async isAvailable(): Promise<boolean> {
    // 简化：尝试 spawn 一次 --version。生产环境可缓存结果。
    return new Promise((resolve) => {
      try {
        const child = spawn(OPENCODE_BIN, ['--version'], { stdio: 'ignore' })
        const timer = setTimeout(() => {
          try {
            child.kill('SIGKILL')
          } catch {
            /* noop */
          }
          resolve(false)
        }, 3000)
        child.on('exit', (code) => {
          clearTimeout(timer)
          resolve(code === 0)
        })
        child.on('error', () => {
          clearTimeout(timer)
          resolve(false)
        })
      } catch {
        resolve(false)
      }
    })
  }

  async getSupportedModels(): Promise<ModelInfo[]> {
    // 简化版：返回硬编码的 Moonshot 模型清单，避免 spawn 开销。
    // 完善版应 spawn 一个 acp 进程做 newSession 并读取 availableModels。
    return [
      { id: 'moonshot/kimi-k2-0905-preview', name: 'Kimi K2 (0905)', vendor: 'Moonshot' },
      { id: 'moonshot/kimi-k2-turbo-preview', name: 'Kimi K2 Turbo', vendor: 'Moonshot' },
      { id: 'opencode/big-pickle', name: 'OpenCode Big Pickle', vendor: 'OpenCode Zen' },
      { id: 'opencode/gpt-5-nano', name: 'OpenCode GPT-5 Nano', vendor: 'OpenCode Zen' },
    ]
  }

  async chatStream(prompt: string, callback: AgentCallback | null, options: AgentOptions): Promise<ChatStreamResult> {
    const conversationId = options.conversationId || uuidv4()

    if (isAgentRunning(conversationId)) {
      const run = getAgentRun(conversationId)!
      return { turnId: run.turnId, alreadyRunning: true }
    }

    const turnId = uuidv4()
    const abortController = new AbortController()

    registerAgent({
      conversationId,
      turnId,
      envId: options.envId || '',
      userId: options.userId || 'anonymous',
      abortController,
    })

    // fire-and-forget
    this.launchAgent(prompt, callback, options, conversationId, turnId, abortController).catch((err) => {
      console.error('[OpencodeAcpRuntime] background agent error:', err)
    })

    return { turnId, alreadyRunning: false }
  }

  /**
   * 后台执行 opencode acp 一轮对话。
   */
  private async launchAgent(
    prompt: string,
    liveCallback: AgentCallback | null,
    options: AgentOptions,
    conversationId: string,
    turnId: string,
    abortController: AbortController,
  ): Promise<void> {
    const envId = options.envId || ''
    const userId = options.userId || 'anonymous'
    const cwd = options.cwd || process.cwd()
    const modelId = options.model || DEFAULT_OPENCODE_MODEL

    let child: ChildProcessWithoutNullStreams | null = null
    let endedNormally = false

    /** 把 AgentCallbackMessage 同时推 liveCallback 和 stream events DB */
    const emit = async (msg: AgentCallbackMessage) => {
      // 注入 ids
      const enriched: AgentCallbackMessage = {
        ...msg,
        sessionId: conversationId,
        assistantMessageId: turnId,
      }
      if (liveCallback) {
        try {
          const seq = getNextSeq(conversationId)
          await liveCallback(enriched, seq)
        } catch (e) {
          console.error('[OpencodeAcpRuntime] liveCallback error:', e)
        }
      }
      // 落库 stream event 供 SSE replay
      // 没有 envId 时跳过（典型场景：单元测试 / e2e 脚本，没接 CloudBase）
      if (envId) {
        const acpEvent = CloudbaseAgentService.convertToSessionUpdate(enriched, conversationId)
        if (acpEvent) {
          const seq = getAgentRun(conversationId)?.lastSeq ?? 0
          persistenceService
            .appendStreamEvents([
              {
                eventId: uuidv4(),
                conversationId,
                turnId,
                envId,
                userId,
                event: acpEvent,
                seq,
                createTime: Date.now(),
              },
            ])
            .catch((e) => console.error('[OpencodeAcpRuntime] appendStreamEvents error:', e))
        }
      }
    }

    try {
      // 1. spawn opencode acp
      child = await this.spawnOpencodeAcp(cwd, abortController.signal)

      // 2. 建立 ACP 连接
      const stream = makeNdJsonStream(child)
      const conn = createConnection(stream, {
        onSessionUpdate: async (update) => {
          await this.handleSessionUpdate(update, emit)
        },
        onRequestPermission: async (params) => {
          // 把权限请求转成 tool_confirm 推给前端
          await emit({
            type: 'tool_confirm',
            id: params.toolCall?.toolCallId || uuidv4(),
            name: params.toolCall?.title || 'unknown',
            input: (params.toolCall?.rawInput as Record<string, unknown>) || {},
          })
          // 当前版本：默认 allow_once（与 PoC 一致）。
          // TODO: 接入真实 ToolConfirm UI 回调（需要 askAnswers/toolConfirmation 流程）。
          const opt =
            params.options.find((o: { kind: string }) => o.kind === 'allow_once') ??
            params.options.find((o: { kind: string }) => o.kind === 'allow_always') ??
            params.options[0]
          return { outcome: { outcome: 'selected', optionId: opt!.optionId } }
        },
      })

      // 3. ACP 握手
      await conn.initialize({
        protocolVersion: 1,
        clientCapabilities: {
          fs: { readTextFile: true, writeTextFile: true },
          terminal: false,
        },
      })

      // 4. 创建 session
      const newRes = await conn.newSession({
        cwd,
        mcpServers: [],
      })
      const opencodeSessionId = newRes.sessionId

      // 5. 选择 model（best effort）
      try {
        await conn.unstable_setSessionModel({
          sessionId: opencodeSessionId,
          modelId,
        })
      } catch (e) {
        console.warn('[OpencodeAcpRuntime] setSessionModel failed (continuing):', (e as Error).message)
      }

      // 6. 发送 prompt（阻塞直到完成）
      await emit({ type: 'agent_phase', phase: 'preparing' })

      const promptRes = await conn.prompt({
        sessionId: opencodeSessionId,
        prompt: [{ type: 'text', text: prompt }],
      })

      await emit({ type: 'agent_phase', phase: 'idle' })
      await emit({
        type: 'result',
        content: JSON.stringify({
          stopReason: promptRes.stopReason,
          // PromptResponse 的 usage 在 _meta 内，不同 agent 有不同字段位置
          usage: (promptRes as { _meta?: { usage?: unknown } })._meta?.usage ?? null,
        }),
      })

      endedNormally = true
      completeAgent(conversationId, 'completed')
    } catch (error: any) {
      const isAbort = abortController.signal.aborted || error?.name === 'AbortError'
      console.error('[OpencodeAcpRuntime] launchAgent error:', error)
      try {
        await emit({
          type: 'error',
          content: isAbort ? 'Aborted' : `OpenCode runtime error: ${error?.message || String(error)}`,
        })
      } catch {
        /* noop */
      }
      completeAgent(conversationId, isAbort ? 'cancelled' : 'error', String(error?.message || error))
    } finally {
      // 清理子进程
      if (child) {
        try {
          child.kill('SIGTERM')
        } catch {
          /* noop */
        }
      }
      // 延后 remove，给 SSE poll 留窗口
      setTimeout(() => removeAgent(conversationId, turnId), 5000)
      if (!endedNormally) {
        // already handled above
      }
    }
  }

  /**
   * 把 ACP session/update 翻译成内部 AgentCallbackMessage。
   * OpenCode 的 SessionUpdate tag 集合见
   * https://agentclientprotocol.com/protocol/notifications#session-update
   */
  private async handleSessionUpdate(update: any, emit: (msg: AgentCallbackMessage) => Promise<void>): Promise<void> {
    const tag = update.sessionUpdate as string | undefined
    if (!tag) return

    switch (tag) {
      case 'agent_message_chunk': {
        const text = update.content?.text
        if (typeof text === 'string' && text.length > 0) {
          await emit({ type: 'text', content: text })
        }
        break
      }
      case 'agent_thought_chunk': {
        const text = update.content?.text
        if (typeof text === 'string' && text.length > 0) {
          await emit({ type: 'thinking', content: text })
        }
        break
      }
      case 'tool_call': {
        await emit({
          type: 'tool_use',
          id: update.toolCallId,
          name: update.title || update.kind || 'tool',
          input: update.rawInput ?? {},
        })
        break
      }
      case 'tool_call_update': {
        const status = update.status
        if (status === 'completed' || status === 'failed') {
          await emit({
            type: 'tool_result',
            tool_use_id: update.toolCallId,
            content: typeof update.rawOutput === 'string' ? update.rawOutput : JSON.stringify(update.rawOutput ?? ''),
            is_error: status === 'failed',
          })
        } else {
          // in_progress / pending：作为 input update 推（前端可选展示）
          await emit({
            type: 'tool_input_update',
            id: update.toolCallId,
            input: (update.rawInput ?? {}) as Record<string, unknown>,
          })
        }
        break
      }
      case 'plan': {
        // 把 plan 作为一个特殊的 thinking 段（首版极简处理）
        await emit({
          type: 'thinking',
          content: `[plan] ${JSON.stringify(update.entries ?? [])}`,
        })
        break
      }
      case 'available_commands_update':
      case 'usage_update':
      case 'current_mode_update':
        // 静默吞掉（OpenCode 噪声）
        break
      default:
        // 未识别的事件 → 调试日志
        if (process.env.OPENCODE_ACP_DEBUG) {
          console.log('[OpencodeAcpRuntime] unhandled session/update:', tag, JSON.stringify(update).slice(0, 200))
        }
    }
  }

  /**
   * spawn opencode acp 子进程，等到它真的启动（短暂延迟）后返回。
   */
  private async spawnOpencodeAcp(cwd: string, abortSignal: AbortSignal): Promise<ChildProcessWithoutNullStreams> {
    return new Promise((resolve, reject) => {
      const child = spawn(OPENCODE_BIN, ['acp', '--cwd', cwd], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      })

      let settled = false
      const onAbort = () => {
        try {
          child.kill('SIGTERM')
        } catch {
          /* noop */
        }
      }
      abortSignal.addEventListener('abort', onAbort)

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true
          try {
            child.kill('SIGKILL')
          } catch {
            /* noop */
          }
          reject(new Error('opencode acp spawn timeout'))
        }
      }, SPAWN_TIMEOUT_MS)

      child.on('error', (err) => {
        if (!settled) {
          settled = true
          clearTimeout(timer)
          reject(err)
        }
      })

      child.on('spawn', () => {
        if (!settled) {
          settled = true
          clearTimeout(timer)
          resolve(child)
        }
      })

      child.stderr?.on('data', (chunk) => {
        if (process.env.OPENCODE_ACP_DEBUG) {
          process.stderr.write('[opencode stderr] ' + chunk.toString())
        }
      })

      child.on('exit', (code, sig) => {
        if (process.env.OPENCODE_ACP_DEBUG) {
          console.log(`[OpencodeAcpRuntime] child exit code=${code} signal=${sig}`)
        }
      })
    })
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────

/**
 * 把 child_process 的 stdin/stdout 包装成 ACP SDK 需要的 NDJSON Stream。
 */
function makeNdJsonStream(child: ChildProcessWithoutNullStreams): Stream {
  const writable = new WritableStream<Uint8Array | string>({
    write(chunk) {
      return new Promise((resolve, reject) => {
        const data = typeof chunk === 'string' ? chunk : Buffer.from(chunk)
        child.stdin.write(data, (err) => (err ? reject(err) : resolve()))
      })
    },
    close() {
      try {
        child.stdin.end()
      } catch {
        /* noop */
      }
    },
  })

  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      child.stdout.on('data', (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)))
      child.stdout.on('end', () => {
        try {
          controller.close()
        } catch {
          /* noop */
        }
      })
      child.stdout.on('error', (err) => controller.error(err))
    },
  })

  return ndJsonStream(writable, readable)
}

/** ClientSideConnection 工厂 */
function createConnection(
  stream: Stream,
  handlers: {
    onSessionUpdate: (update: any) => Promise<void>
    onRequestPermission: (params: any) => Promise<any>
  },
) {
  return new ClientSideConnection(
    () => ({
      async sessionUpdate(params) {
        await handlers.onSessionUpdate(params.update)
      },
      async requestPermission(params) {
        return handlers.onRequestPermission(params)
      },
      async writeTextFile(_params) {
        // OpenCode 在 edit 后会推过来，作为编辑器刷新提示；server 侧目前不需要做事。
        return {}
      },
      async readTextFile(_params) {
        // 不实现 — OpenCode 自身从本地文件系统读
        return { content: '' }
      },
    }),
    stream,
  )
}

// ─── Singleton ────────────────────────────────────────────────────────────

export const opencodeAcpRuntime = new OpencodeAcpRuntime()
