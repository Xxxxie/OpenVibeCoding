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

/** 惰性确保全局 tools 已安装；多次调用只执行一次。 */
function ensureToolsInstalledOnce(): Promise<void> {
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

    this.launchAgent(prompt, callback, options, conversationId, turnId, abortController).catch((err) => {
      console.error('[OpencodeAcpRuntime] background agent error:', err)
    })

    return { turnId, alreadyRunning: false }
  }

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
    const modelId = options.model || DEFAULT_OPENCODE_MODEL

    const emit = makeEmitter({ liveCallback, envId, userId, conversationId, turnId })

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

      // 3. 构造 spawn env — 把沙箱凭证通过 env 注入 opencode 子进程
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
            await emit({
              type: 'tool_confirm',
              id: params.toolCall?.toolCallId || uuidv4(),
              name: params.toolCall?.title || 'unknown',
              input: (params.toolCall?.rawInput as Record<string, unknown>) || {},
            })
            const opt =
              params.options.find((o: { kind: string }) => o.kind === 'allow_once') ??
              params.options.find((o: { kind: string }) => o.kind === 'allow_always') ??
              params.options[0]
            return { outcome: { outcome: 'selected', optionId: opt!.optionId } }
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
  liveCallback: AgentCallback | null
  envId: string
  userId: string
  conversationId: string
  turnId: string
}): (msg: AgentCallbackMessage) => Promise<void> {
  const { liveCallback, envId, userId, conversationId, turnId } = ctx
  return async (msg) => {
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
