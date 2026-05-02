/**
 * OpencodeAcpRuntime
 *
 * 基于 ACP 协议的 OpenCode agent runtime，严格遵守 agent/sandbox 分离原则。
 *
 * 架构：
 *
 *   server 进程
 *   │
 *   ├─ opencode acp (子进程, agent 域)
 *   │    │
 *   │    ├─ 内置 read/write/bash/edit/... — 已禁用（per-session agent config）
 *   │    │
 *   │    └─ MCP client → stdio spawn sandbox-mcp-bridge.js
 *   │                      │
 *   │                      ▼ HTTP
 *   │            ┌─────────────────────┐
 *   │            │  Sandbox (SCF)      │
 *   │            │   /api/tools/read   │
 *   │            │   /api/tools/write  │
 *   │            │   /api/tools/bash   │
 *   │            │   /workspace        │
 *   │            └─────────────────────┘
 *   │
 *   └─ IAgentRuntime.chatStream()
 *        │
 *        ▼
 *      1. 为本次 session 准备临时工作目录（放配置 + AGENTS.md）
 *      2. 获取 sandbox instance（从 scfSandboxManager）
 *      3. spawn opencode acp --cwd <临时目录>
 *      4. ACP 握手 → newSession（mcpServers 传入 sandbox-mcp-bridge）
 *      5. setSessionMode('sandboxed') 锁定只能用 sbx_* 工具
 *      6. prompt → 翻译 session/update 为 AgentCallbackMessage
 *      7. 清理临时目录、kill 子进程
 *
 * 首版仍保留：如果没有 envId（本地开发），自动退回"无沙箱模式"，工具本地执行。
 * 这样 e2e#1 (本地模式) 与生产沙箱模式可以共存。
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
import { createSessionWorkspace, type SessionWorkspace } from './opencode-session-config.js'
import { scfSandboxManager, type SandboxInstance } from '../../sandbox/scf-sandbox-manager.js'
import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

// ─── Config ──────────────────────────────────────────────────────────────

const OPENCODE_BIN = process.env.OPENCODE_BIN || 'opencode'

/** 默认模型（OpenCode 模型 id 格式: provider/model[/variant]） */
const DEFAULT_OPENCODE_MODEL = process.env.OPENCODE_DEFAULT_MODEL || 'moonshot/kimi-k2-0905-preview'

/** 工作空间根（沙箱侧） */
const SANDBOX_WORKSPACE_ROOT = process.env.SANDBOX_WORKSPACE_ROOT || '/workspace'

// ─── Helpers ─────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * 解析 sandbox-mcp-bridge.js 的绝对路径。
 *
 * 三种运行形态：
 *   1. 源码（tsx watch dev）：__filename = ...src/agent/runtime/opencode-acp-runtime.ts
 *      → 期望 dist 产物在 ../../../dist/agent/runtime/sandbox-mcp-bridge.js
 *   2. 构建后（node dist/index.js）：__filename = ...dist/index.js
 *      → 在 同目录/agent/runtime/sandbox-mcp-bridge.js
 *   3. 环境变量 override：SANDBOX_MCP_BRIDGE_PATH=...
 */
function resolveMcpBridgePath(): string {
  const fromEnv = process.env.SANDBOX_MCP_BRIDGE_PATH
  if (fromEnv) return fromEnv

  const candidates = [
    // 1. src 运行：走到项目 dist
    path.resolve(__dirname, '../../../dist/agent/runtime/sandbox-mcp-bridge.js'),
    // 2. dist 运行：同目录
    path.resolve(__dirname, 'sandbox-mcp-bridge.js'),
    // 3. monorepo root dist
    path.resolve(__dirname, '../../../../packages/server/dist/agent/runtime/sandbox-mcp-bridge.js'),
  ]
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c
    } catch {
      /* noop */
    }
  }
  // 兜底：返回第一个猜测，spawn 时会报错
  return candidates[0]
}

// ─── Types ───────────────────────────────────────────────────────────────

export interface OpencodeAcpRuntimeOptions {
  /** 工作空间根目录（沙箱内），默认 /workspace */
  sandboxWorkspaceRoot?: string
}

// ─── Runtime ─────────────────────────────────────────────────────────────

export class OpencodeAcpRuntime implements IAgentRuntime {
  readonly name = 'opencode-acp'

  constructor(private readonly runtimeOpts: OpencodeAcpRuntimeOptions = {}) {}

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
    let workspace: SessionWorkspace | null = null
    let sandbox: SandboxInstance | null = null

    try {
      // 1. 获取沙箱（有 envId 时）
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

      // 2. 创建 per-session 工作目录 + opencode 配置
      workspace = await createSessionWorkspace({
        sandbox: sandbox ?? undefined,
        sandboxWorkspaceRoot: this.runtimeOpts.sandboxWorkspaceRoot ?? SANDBOX_WORKSPACE_ROOT,
        mcpBridgePath: resolveMcpBridgePath(),
        localWorkspaceDir: options.cwd,
      })

      // 3. spawn opencode acp
      const factory = getAcpTransportFactory('local-stdio')
      transport = await factory({
        cwd: workspace.dir,
        signal: abortController.signal,
        debug: process.env.OPENCODE_ACP_DEBUG === '1',
      })

      // 4. 建立 ACP connection — 这里不挂 fs/terminal 回调（OpenCode 不会调）
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

      // 5. ACP 握手
      await conn.initialize({
        protocolVersion: 1,
        clientCapabilities: {
          fs: { readTextFile: true, writeTextFile: true },
          terminal: false,
        },
      })

      // 6. 创建 session — 此处**不传 mcpServers**，因为我们在 opencode.json 里已经配了
      //    mcp.sbx（local stdio）。OpenCode 启动时会读 cwd 下的 .opencode/opencode.json。
      const newRes = await conn.newSession({
        cwd: workspace.dir,
        mcpServers: [],
      })
      const opencodeSessionId = newRes.sessionId

      // 7. 切到 sandboxed agent mode（禁用所有内置工具）
      try {
        await conn.setSessionMode({
          sessionId: opencodeSessionId,
          modeId: workspace.agentMode,
        })
      } catch (e) {
        console.warn('[OpencodeAcpRuntime] setSessionMode failed (continuing):', (e as Error).message)
      }

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
          workspaceDir: workspace.dir,
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
      if (workspace) {
        try {
          workspace.cleanup()
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
