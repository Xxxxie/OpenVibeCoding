/**
 * OpencodeAcpRuntime
 *
 * 基于 ACP 协议的 OpenCode agent runtime，严格遵守 agent/sandbox 分离原则。
 *
 * 架构（"全局 tool override + env 注入"）：
 *
 *   server 启动时：
 *     ensureOpencodeToolsInstalled()
 *       └─ 把 read/write/bash/edit/grep/glob 模板拷贝到 ~/.config/opencode/tools/
 *          （同名 custom tool 覆盖 builtin — 实测已验证）
 *
 *   每次 chatStream：
 *     1. 如果有 envId：scfSandboxManager.getOrCreate()
 *     2. spawn opencode acp，通过 child env 注入：
 *          SANDBOX_MODE=1
 *          SANDBOX_BASE_URL=<沙箱 HTTPS>
 *          SANDBOX_AUTH_HEADERS_JSON=<凭证 JSON>
 *     3. opencode 父进程的 env 会继承给所有子进程（MCP 服务等）
 *     4. 工具文件里读 process.env.SANDBOX_* 决定：本地执行 vs HTTP 转发到沙箱
 *     5. ACP 握手 → newSession → prompt → 收 session/update 流 → 翻译为 AgentCallbackMessage
 *
 * 相比旧方案（per-session 写 .opencode/opencode.json + MCP bridge 子进程）：
 *   - 不再写 per-session 配置文件（只写一次全局 tools/*.js）
 *   - 不再启 MCP 子进程（少一层进程 + 少一层 JSON-RPC 序列化）
 *   - 工具名就是 `read`/`write`/... 与 LLM 训练期望一致
 *   - 凭证只在进程 env 里，session 结束随进程退出清理
 */

import { v4 as uuidv4 } from 'uuid'
import { ClientSideConnection } from '@agentclientprotocol/sdk'
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
import { getAcpTransportFactory, type AcpTransport } from './acp-transport.js'
import { ensureOpencodeToolsInstalled } from './opencode-installer.js'
import { registerPending, resolvePending, rejectPendingForConversation } from './pending-permission-registry.js'
import { resolvePendingQuestion, rejectPendingQuestionsForConversation } from './pending-question-registry.js'
import { scfSandboxManager, type SandboxInstance } from '../../sandbox/scf-sandbox-manager.js'
import { spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

// ─── Config ──────────────────────────────────────────────────────────────

const OPENCODE_BIN = process.env.OPENCODE_BIN || 'opencode'
const DEFAULT_OPENCODE_MODEL = process.env.OPENCODE_DEFAULT_MODEL || 'moonshot/kimi-k2-0905-preview'

/** 沙箱内工作目录（agent 看到的"当前目录"概念）。相对路径工具都会以此为根。 */
const SANDBOX_WORKSPACE_ROOT = process.env.SANDBOX_WORKSPACE_ROOT || '.'

// ─── State ───────────────────────────────────────────────────────────────

let toolsInstallPromise: Promise<void> | null = null

/**
 * 活跃 agent 的 liveCallback 注册表。
 *
 * 为什么需要？—— Resume 场景：第一轮 chatStream 的 SSE 流已结束（前端看到
 * tool_confirm 后切 waiting_for_interaction），第二轮 chatStream 是**新的
 * HTTP 请求**，带新的 callback。pending 恢复后，后续的 session/update 必须
 * 用**新 callback** 推给新 SSE 流（而不是第一轮的 callback，那个 stream 已关）。
 *
 * 所以每次 chatStream（包括 resume 入口）都要更新这个 map，launchAgent 内部的
 * emit 函数通过 getLiveCallback() 间接取最新值。
 */
const liveCallbacks = new Map<string, AgentCallback | null>()

function registerLiveCallback(conversationId: string, cb: AgentCallback | null): void {
  liveCallbacks.set(conversationId, cb)
}

function updateLiveCallback(conversationId: string, cb: AgentCallback | null): void {
  liveCallbacks.set(conversationId, cb)
}

function getLiveCallback(conversationId: string): AgentCallback | null {
  return liveCallbacks.get(conversationId) ?? null
}

function clearLiveCallback(conversationId: string): void {
  liveCallbacks.delete(conversationId)
}

/**
 * Per-conversation emitter 注册表：launchAgent 里写入闭包 emit，
 * 供 routes/acp.ts 的 /internal/ask-user handler 对 ask_user 消息广播。
 */
const emitters = new Map<string, (msg: AgentCallbackMessage) => Promise<void>>()

function registerEmitter(conversationId: string, emit: (m: AgentCallbackMessage) => Promise<void>): void {
  emitters.set(conversationId, emit)
}

function clearEmitter(conversationId: string): void {
  emitters.delete(conversationId)
}

/**
 * 对外暴露：routes/acp.ts 调此方法给指定 conversation 发 AgentCallbackMessage。
 * 主要用于 /internal/ask-user endpoint：tool 请求问用户 → emit ask_user → SSE 推前端。
 */
export async function emitForConversation(conversationId: string, msg: AgentCallbackMessage): Promise<void> {
  const emit = emitters.get(conversationId)
  if (!emit) throw new Error(`no emitter registered for conversation ${conversationId}`)
  await emit(msg)
}

/**
 * Internal-endpoint 共享 token。
 *
 * 在 server 启动时生成一次（惰性），通过 env 注入 opencode 子进程。
 * 子进程的 custom tool 通过 `X-Internal-Token` header 回调 server 时认证。
 */
let askUserToken: string | null = null
export function getAskUserToken(): string {
  if (!askUserToken) {
    // 16 字节十六进制，足够强的临时 token
    askUserToken = cryptoRandomToken()
  }
  return askUserToken
}

function cryptoRandomToken(): string {
  // 16 bytes hex, no external deps
  const bytes = new Uint8Array(16)
  // Node runtime 保证有 crypto.getRandomValues
  ;(globalThis.crypto as Crypto).getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** 惰性确保全局 tools 已安装；多次调用只执行一次。 */
function ensureToolsInstalledOnce(): Promise<void> {
  if (process.env.OPENCODE_SKIP_TOOLS_INSTALL === '1') {
    // 测试场景可显式跳过（例如 ToolConfirm e2e 要测 builtin write 的 permission 流）
    return Promise.resolve()
  }
  if (!toolsInstallPromise) {
    toolsInstallPromise = ensureOpencodeToolsInstalled()
      .then((r) => {
        if (r.installed.length || r.forced) {
          console.log(
            `[OpencodeAcpRuntime] installed opencode tools to ${r.installDir}: installed=${r.installed.join(',') || '-'} skipped=${r.skipped.join(',') || '-'}`,
          )
        }
      })
      .catch((err) => {
        console.error('[OpencodeAcpRuntime] failed to install opencode tools:', err)
        // Don't reset — broken installer is better than infinite retry loop
      })
  }
  return toolsInstallPromise
}

// ─── Runtime ─────────────────────────────────────────────────────────────

export class OpencodeAcpRuntime implements IAgentRuntime {
  readonly name = 'opencode-acp'

  async isAvailable(): Promise<boolean> {
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
    return [
      { id: 'moonshot/kimi-k2-0905-preview', name: 'Kimi K2 (0905)', vendor: 'Moonshot' },
      { id: 'moonshot/kimi-k2-turbo-preview', name: 'Kimi K2 Turbo', vendor: 'Moonshot' },
      { id: 'opencode/big-pickle', name: 'OpenCode Big Pickle', vendor: 'OpenCode Zen' },
      { id: 'opencode/gpt-5-nano', name: 'OpenCode GPT-5 Nano', vendor: 'OpenCode Zen' },
    ]
  }

  async chatStream(prompt: string, callback: AgentCallback | null, options: AgentOptions): Promise<ChatStreamResult> {
    const conversationId = options.conversationId || uuidv4()

    // Resume path：已有挂起的 agent + 携带 toolConfirmation / askAnswers
    //   → 不 spawn 新进程，直接 resolve 挂起的 permission Promise / question HTTP
    //   → opencode 收到 outcome/answers 后继续执行，session/update 流继续
    if (isAgentRunning(conversationId)) {
      const run = getAgentRun(conversationId)!

      // 更新 liveCallback 到新 SSE 流（第一轮的 SSE 可能已关）
      updateLiveCallback(conversationId, callback)

      if (options.toolConfirmation) {
        const resolved = resolvePending(
          conversationId,
          options.toolConfirmation.interruptId,
          options.toolConfirmation.payload.action,
        )
        if (!resolved) {
          console.warn(
            `[OpencodeAcpRuntime] toolConfirmation arrived but no pending registration for interruptId=${options.toolConfirmation.interruptId}`,
          )
        }
      }

      if (options.askAnswers) {
        // askAnswers 结构：{ [assistantMessageId|recordId]: { toolCallId, answers } }
        // 我们只关心 value 里的 toolCallId + answers
        for (const entry of Object.values(options.askAnswers)) {
          const resolved = resolvePendingQuestion(conversationId, entry.toolCallId, entry.answers)
          if (!resolved) {
            console.warn(
              `[OpencodeAcpRuntime] askAnswers arrived but no pending question for toolCallId=${entry.toolCallId}`,
            )
          }
        }
      }

      if (!options.toolConfirmation && !options.askAnswers && process.env.OPENCODE_ACP_DEBUG) {
        console.log(
          `[OpencodeAcpRuntime] chatStream re-entered without resume payload (conv=${conversationId}); returning existing turn`,
        )
      }
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

    // 记录本轮的 liveCallback（resume 时可替换，因为 SSE 流可能已更新）
    registerLiveCallback(conversationId, callback)

    this.launchAgent(prompt, callback, options, conversationId, turnId, abortController).catch((err) => {
      console.error('[OpencodeAcpRuntime] background agent error:', err)
    })

    return { turnId, alreadyRunning: false }
  }

  private async launchAgent(
    prompt: string,
    _liveCallback: AgentCallback | null,
    options: AgentOptions,
    conversationId: string,
    turnId: string,
    abortController: AbortController,
  ): Promise<void> {
    const envId = options.envId || ''
    const userId = options.userId || 'anonymous'
    const modelId = options.model || DEFAULT_OPENCODE_MODEL

    // emit 每次动态取 liveCallback（resume 时回调会被替换）
    // 第一轮由 chatStream 调用 registerLiveCallback 写入；第二轮（resume）由
    // chatStream 的 resume 分支更新。
    const emit = makeEmitter({ envId, userId, conversationId, turnId })
    registerEmitter(conversationId, emit)

    let transport: AcpTransport | null = null
    let sandbox: SandboxInstance | null = null
    let sessionWorkingDir: string | null = null

    try {
      // 0. 确保全局 opencode tools 已安装
      await ensureToolsInstalledOnce()

      // 1. 如果有 envId，获取沙箱
      if (envId) {
        try {
          sandbox = await scfSandboxManager.getOrCreate(conversationId, envId, {
            mode: 'shared',
            workspaceIsolation: 'shared',
          })
        } catch (e) {
          console.warn('[OpencodeAcpRuntime] sandbox getOrCreate failed:', (e as Error).message)
          throw new Error(`Sandbox unavailable: ${(e as Error).message}`)
        }
      }

      await emit({ type: 'agent_phase', phase: 'preparing' })

      // 2. 工作目录
      //    - 沙箱模式：opencode cwd 用临时占位目录（opencode 需要一个本地目录启动，
      //      但真实读写由 tools 转发到沙箱，不依赖这个目录）
      //    - 本地模式：用 options.cwd 或临时目录
      sessionWorkingDir = options.cwd ?? path.join(os.tmpdir(), `opencode-session-${uuidv4()}`)
      if (!fs.existsSync(sessionWorkingDir)) {
        fs.mkdirSync(sessionWorkingDir, { recursive: true })
      }

      // 3. 构造 spawn env — 把沙箱凭证 + AskUser 回调 URL 通过 env 注入 opencode 子进程
      const childEnv: Record<string, string> = {}
      if (sandbox) {
        const authHeaders = await sandbox.getAuthHeaders()
        childEnv.SANDBOX_MODE = '1'
        childEnv.SANDBOX_BASE_URL = sandbox.baseUrl
        childEnv.SANDBOX_AUTH_HEADERS_JSON = JSON.stringify(authHeaders)
        childEnv.SANDBOX_WORKSPACE_ROOT = SANDBOX_WORKSPACE_ROOT
      } else {
        childEnv.SANDBOX_MODE = '0'
      }

      // AskUser 内部 HTTP 回调：question custom tool execute 时 fetch 此 URL
      // URL 从 ASK_USER_BASE_URL env（server 启动时设置）+ path + 查询参数拼成
      const askUserBase = process.env.ASK_USER_BASE_URL || ''
      if (askUserBase) {
        childEnv.ASK_USER_URL = `${askUserBase.replace(/\/$/, '')}/api/agent/internal/ask-user`
        childEnv.ASK_USER_TOKEN = getAskUserToken()
        childEnv.ASK_USER_CONVERSATION_ID = conversationId
      }

      // 4. spawn opencode acp
      const factory = getAcpTransportFactory('local-stdio')
      transport = await factory({
        cwd: sessionWorkingDir,
        signal: abortController.signal,
        debug: process.env.OPENCODE_ACP_DEBUG === '1',
        env: childEnv,
      })

      // 5. 建立 ACP connection
      const conn = new ClientSideConnection(
        () => ({
          sessionUpdate: async (params) => {
            await this.handleSessionUpdate(params.update, emit)
          },
          requestPermission: async (params) => {
            // ACP 权限请求 → 桥接到前端 ToolConfirm UI
            //
            // 流程：
            //   1. 生成/取 interruptId（前端用来回传 toolConfirmation）
            //   2. 发 AgentCallbackMessage(type='tool_confirm')：前端显示确认卡片
            //   3. registerPending 注册一个挂起 Promise
            //   4. await pending：handler 卡住 → opencode 也卡住
            //   5. 前端用户选择 → 下一轮 chatStream 带 toolConfirmation
            //   6. chatStream 调 resolvePending → 本 Promise resolve → handler 返回
            //   7. opencode 收到 outcome 后继续
            const interruptId = params.toolCall?.toolCallId || uuidv4()
            const toolName = params.toolCall?.title || 'unknown'
            const toolInput = (params.toolCall?.rawInput as Record<string, unknown>) || {}

            await emit({
              type: 'tool_confirm',
              id: interruptId,
              name: toolName,
              input: toolInput,
            })

            try {
              // 这里会长时间挂起 — 直到外部 resolvePending 或 rejectPendingForConversation
              return await registerPending(conversationId, interruptId, params.options as any[])
            } catch (e) {
              // abort/reject 时 fallback：让 opencode 收到拒绝（避免它卡死）
              const reject =
                params.options.find((o: { kind: string }) => o.kind === 'reject_once') ??
                params.options[params.options.length - 1]
              console.warn(
                `[OpencodeAcpRuntime] pending permission rejected (conv=${conversationId}, interrupt=${interruptId}):`,
                (e as Error).message,
              )
              return { outcome: { outcome: 'selected', optionId: reject!.optionId } }
            }
          },
        }),
        transport.stream,
      )

      // 6. ACP 握手
      await conn.initialize({
        protocolVersion: 1,
        clientCapabilities: {
          fs: { readTextFile: true, writeTextFile: true },
          terminal: false,
        },
      })

      // 7. 创建 session
      const newRes = await conn.newSession({
        cwd: sessionWorkingDir,
        mcpServers: [],
      })
      const opencodeSessionId = newRes.sessionId

      // 8. 选择模型
      try {
        await conn.unstable_setSessionModel({
          sessionId: opencodeSessionId,
          modelId,
        })
      } catch (e) {
        console.warn('[OpencodeAcpRuntime] setSessionModel failed:', (e as Error).message)
      }

      // 9. 发送 prompt（阻塞直到完成）
      const promptRes = await conn.prompt({
        sessionId: opencodeSessionId,
        prompt: [{ type: 'text', text: prompt }],
      })

      await emit({ type: 'agent_phase', phase: 'idle' })
      await emit({
        type: 'result',
        content: JSON.stringify({
          stopReason: promptRes.stopReason,
          usage: (promptRes as { _meta?: { usage?: unknown } })._meta?.usage ?? null,
          sandbox: sandbox ? { baseUrl: sandbox.baseUrl, conversationId: sandbox.conversationId } : null,
          workingDir: sessionWorkingDir,
        }),
      })

      completeAgent(conversationId, 'completed')
    } catch (error: any) {
      const isAbort = abortController.signal.aborted || error?.name === 'AbortError'
      console.error('[OpencodeAcpRuntime] launchAgent error:', error)
      // 释放挂起的权限请求（否则 opencode 子进程卡住 + chatStream 永远不返回）
      const rejectedCount = rejectPendingForConversation(
        conversationId,
        isAbort ? 'Aborted' : `runtime error: ${error?.message || error}`,
      )
      const rejectedQ = rejectPendingQuestionsForConversation(
        conversationId,
        isAbort ? 'Aborted' : `runtime error: ${error?.message || error}`,
      )
      if ((rejectedCount > 0 || rejectedQ > 0) && process.env.OPENCODE_ACP_DEBUG) {
        console.log(
          `[OpencodeAcpRuntime] rejected ${rejectedCount} pending permissions + ${rejectedQ} pending questions due to error`,
        )
      }
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
      if (transport) {
        try {
          transport.close()
        } catch {
          /* noop */
        }
      }
      // 清理临时工作目录（如果是我们自己建的）
      if (sessionWorkingDir && !options.cwd && sessionWorkingDir.startsWith(os.tmpdir())) {
        try {
          fs.rmSync(sessionWorkingDir, { recursive: true, force: true })
        } catch {
          /* noop */
        }
      }
      // 清掉 liveCallback + emitter 注册，避免 map 泄漏
      clearLiveCallback(conversationId)
      clearEmitter(conversationId)
      setTimeout(() => removeAgent(conversationId, turnId), 5000)
    }
  }

  /**
   * ACP session/update → 内部 AgentCallbackMessage。
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
          await emit({
            type: 'tool_input_update',
            id: update.toolCallId,
            input: (update.rawInput ?? {}) as Record<string, unknown>,
          })
        }
        break
      }
      case 'plan': {
        await emit({
          type: 'thinking',
          content: `[plan] ${JSON.stringify(update.entries ?? [])}`,
        })
        break
      }
      case 'available_commands_update':
      case 'usage_update':
      case 'current_mode_update':
        break
      default:
        if (process.env.OPENCODE_ACP_DEBUG) {
          console.log('[OpencodeAcpRuntime] unhandled session/update:', tag, JSON.stringify(update).slice(0, 200))
        }
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function makeEmitter(ctx: {
  envId: string
  userId: string
  conversationId: string
  turnId: string
}): (msg: AgentCallbackMessage) => Promise<void> {
  const { envId, userId, conversationId, turnId } = ctx
  return async (msg) => {
    const enriched: AgentCallbackMessage = {
      ...msg,
      sessionId: conversationId,
      assistantMessageId: turnId,
    }
    // 动态取 liveCallback：resume 时第二轮 SSE 的 callback 会替换第一轮的
    const liveCallback = getLiveCallback(conversationId)
    if (liveCallback) {
      try {
        const seq = getNextSeq(conversationId)
        await liveCallback(enriched, seq)
      } catch (e) {
        console.error('[OpencodeAcpRuntime] liveCallback error:', e)
      }
    }
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
}

// ─── Singleton ────────────────────────────────────────────────────────────

export const opencodeAcpRuntime = new OpencodeAcpRuntime()
