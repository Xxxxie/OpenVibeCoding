/**
 * Per-session OpenCode 配置与工作目录管理
 *
 * 核心职责：为每次 chatStream 调用准备一个**临时工作目录**，内放 opencode 配置：
 *
 *   /tmp/opencode-session-<uuid>/
 *     .opencode/opencode.json   ← 定义 agent：禁用内置 read/write/bash/edit，
 *                                  只允许 sandbox_* 工具
 *     AGENTS.md                  ← 可选的 system prompt 增强
 *
 * 为什么要这样做？
 *   - opencode 启动时从 `cwd` 读配置
 *   - 我们需要每个 session 有独立配置（不同用户/沙箱的凭证互不串）
 *   - per-session 目录隔离避免 race condition（同时跑多个 session）
 *
 * 注意：这个目录**仅放配置**。真实的用户工作文件都在沙箱容器里（/workspace）。
 *       opencode 进程虽然 cwd 指向临时目录，但它通过 MCP (sandbox_*) 工具读写沙箱。
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { v4 as uuidv4 } from 'uuid'
import type { SandboxInstance } from '../../sandbox/scf-sandbox-manager.js'

/** 默认工作目录前缀 */
const SESSION_DIR_PREFIX = 'opencode-session-'

/**
 * 要禁用的 OpenCode 内置工具。
 * 见 https://opencode.ai/docs/agents/#tools
 */
const DISABLED_BUILTIN_TOOLS = ['read', 'write', 'edit', 'bash', 'grep', 'glob', 'webfetch', 'patch'] as const

/**
 * 给 sandbox MCP bridge 用的工具名（MCP 上报给 opencode 时会被加 `<server>_` 前缀）。
 * 我们的 server name 定为 "sandbox"，所以实际 tool id 是 `sandbox_sandbox_read` 之类。
 * 为了干净，把 MCP server 名就叫 "sbx"，tool name 就叫 "read"/"write"/...
 * OpenCode 看到 `sbx_read`/`sbx_write` 等。
 */
export const SANDBOX_MCP_SERVER_NAME = 'sbx'

export interface SessionWorkspace {
  /** 临时目录绝对路径；opencode acp 的 --cwd 指向此 */
  readonly dir: string
  /** 要在 `session/new.mcpServers` 里传给 opencode 的 MCP server 定义 */
  readonly mcpServerCommand: string
  readonly mcpServerArgs: string[]
  readonly mcpServerEnv: Record<string, string>
  /** 要在 `session/set_mode` 里切的 agent mode id（不存在则用 'build'） */
  readonly agentMode: string
  /** 清理临时目录 */
  cleanup(): void
}

export interface CreateSessionWorkspaceOptions {
  sandbox?: SandboxInstance
  /** 沙箱 workspace 根目录（默认 /workspace，即 opencode 的工作视角） */
  sandboxWorkspaceRoot?: string
  /** 编译后的 sandbox-mcp-bridge.js 路径（由 runtime 传入） */
  mcpBridgePath: string
  /**
   * 本地模式的工作目录（无沙箱时）。
   * - 有沙箱：忽略此字段，创建临时目录仅存配置
   * - 无沙箱：使用此目录作为 opencode 的 cwd，LLM 读写都在这里
   */
  localWorkspaceDir?: string
}

/**
 * 创建 per-session 工作目录 + 生成 opencode 配置。
 */
export async function createSessionWorkspace(opts: CreateSessionWorkspaceOptions): Promise<SessionWorkspace> {
  const sandboxMode = !!opts.sandbox

  // 工作目录选择：
  //   sandbox 模式 → 临时 staging 目录（只放配置，不用于 LLM 读写）
  //   无沙箱 → 用传入的 localWorkspaceDir（LLM 真的读写这里）
  const dir = sandboxMode
    ? path.join(os.tmpdir(), `${SESSION_DIR_PREFIX}${uuidv4()}`)
    : (opts.localWorkspaceDir ?? path.join(os.tmpdir(), `${SESSION_DIR_PREFIX}${uuidv4()}`))

  // 临时目录需要我们自己创建；用户传入的工作目录假定已存在
  const isTempDir = sandboxMode || !opts.localWorkspaceDir
  fs.mkdirSync(path.join(dir, '.opencode'), { recursive: true })

  const sandboxWorkspaceRoot = opts.sandboxWorkspaceRoot ?? '.'

  // ── 1. agent + mcp 配置 ─────────────────────────────────────────────
  //
  // 有沙箱 → 禁用内置工具 + 注入 sandbox MCP
  // 无沙箱（本地开发） → 保留内置工具，不注入 MCP（opencode 就用本地文件系统）

  const mcpBridgeEnv: Record<string, string> = {
    SANDBOX_BASE_URL: opts.sandbox?.baseUrl ?? '',
    SANDBOX_AUTH_HEADERS_JSON: opts.sandbox ? JSON.stringify(await opts.sandbox.getAuthHeaders()) : '{}',
    SANDBOX_DEFAULT_CWD: sandboxWorkspaceRoot,
    SANDBOX_MCP_DEBUG: process.env.SANDBOX_MCP_DEBUG ?? '',
  }

  const opencodeConfig: Record<string, unknown> = {
    $schema: 'https://opencode.ai/config.json',
  }

  if (sandboxMode) {
    const toolsDisabled: Record<string, boolean> = {}
    for (const t of DISABLED_BUILTIN_TOOLS) toolsDisabled[t] = false
    toolsDisabled[`${SANDBOX_MCP_SERVER_NAME}_*`] = true

    opencodeConfig.agent = {
      sandboxed: {
        description: 'Sandboxed agent: all file I/O and shell execution go through sandbox MCP bridge',
        mode: 'primary',
        tools: toolsDisabled,
      },
    }
    opencodeConfig.mcp = {
      [SANDBOX_MCP_SERVER_NAME]: {
        type: 'local',
        command: ['node', opts.mcpBridgePath],
        enabled: true,
        environment: mcpBridgeEnv,
      },
    }
  }

  fs.writeFileSync(path.join(dir, '.opencode', 'opencode.json'), JSON.stringify(opencodeConfig, null, 2))

  // ── 2. AGENTS.md 作为 system-prompt 强化 ──────────────────────────────
  const agentsMd = sandboxMode
    ? `# Sandboxed Environment

You are running in a sandboxed mode. Your local working directory is a temporary staging area —
DO NOT attempt to read or write files here. Instead, use the \`${SANDBOX_MCP_SERVER_NAME}_*\` MCP tools:

- \`${SANDBOX_MCP_SERVER_NAME}_read\` — read files
- \`${SANDBOX_MCP_SERVER_NAME}_write\` — create / overwrite files
- \`${SANDBOX_MCP_SERVER_NAME}_edit\` — string replacement
- \`${SANDBOX_MCP_SERVER_NAME}_bash\` — run shell commands
- \`${SANDBOX_MCP_SERVER_NAME}_glob\` / \`${SANDBOX_MCP_SERVER_NAME}_grep\` — search

## CRITICAL: Path rules

The sandbox enforces **path traversal protection**. You MUST use **relative paths** (no leading \`/\`).
The sandbox automatically resolves these against its scope directory.

✅ Correct:
- \`${SANDBOX_MCP_SERVER_NAME}_write\` with path \`"hello.txt"\`
- \`${SANDBOX_MCP_SERVER_NAME}_write\` with path \`"src/index.ts"\`
- \`${SANDBOX_MCP_SERVER_NAME}_read\` with path \`"package.json"\`

❌ Wrong (will fail 403 Path traversal blocked):
- path \`"/workspace/hello.txt"\`
- path \`"/tmp/x"\`
- path \`"/home/..."\`

The builtin \`read\`/\`write\`/\`edit\`/\`bash\` tools are disabled. Calling them will fail.
Always use \`${SANDBOX_MCP_SERVER_NAME}_*\` tools with RELATIVE paths.
`
    : `# Local development mode

Sandbox not configured — tools run on the local file system.
`
  // AGENTS.md 只在临时目录里写，避免污染用户工作目录
  if (isTempDir) {
    fs.writeFileSync(path.join(dir, 'AGENTS.md'), agentsMd)
  }

  return {
    dir,
    mcpServerCommand: 'node',
    mcpServerArgs: [opts.mcpBridgePath],
    mcpServerEnv: mcpBridgeEnv,
    agentMode: sandboxMode ? 'sandboxed' : 'build',
    cleanup: () => {
      // 只清理自己创建的临时目录；用户传入的工作目录保留
      if (isTempDir) {
        try {
          fs.rmSync(dir, { recursive: true, force: true })
        } catch {
          /* noop */
        }
      } else {
        // 仅清理 .opencode 子目录（配置）
        try {
          fs.rmSync(path.join(dir, '.opencode'), { recursive: true, force: true })
        } catch {
          /* noop */
        }
      }
    },
  }
}
