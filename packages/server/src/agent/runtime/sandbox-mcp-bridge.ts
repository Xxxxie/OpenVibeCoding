/**
 * Sandbox MCP Bridge — 模块职责说明
 *
 * OpenCode 内置工具（read/write/bash/edit）在其进程内本地执行，违反"agent/sandbox 分离"。
 * 本模块提供解决方案：
 *
 *   1. 禁用 OpenCode 内置工具（通过 per-session agent config 的 `tools: { read:false, ... }`）
 *   2. 注入一个 sandbox MCP server，暴露 sandbox_read / sandbox_write / sandbox_bash /
 *      sandbox_edit 工具；这些工具的 execute 通过 HTTP 打到 SCF 沙箱
 *   3. 于是 OpenCode 在处理用户任务时**只能**调用 sandbox_* 工具，所有 IO 天然落在沙箱容器内
 *
 * 实现形式：
 *   - 一个独立的子进程（stdio MCP server）
 *   - 启动命令：`node <compiled-path-of-this-module>`
 *   - 环境变量传沙箱 base URL + auth headers（避免敏感信息进命令行）
 *   - OpenCode 的 session/new 里以 McpServerStdio 形式注入
 *
 * 运行模式：
 *   - 作为 **CLI 入口** 执行（main block 在文件末尾）
 *   - 不导出任何 server 端业务符号——server 进程 spawn 它作为外部命令
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js'

// ─── Config from env ────────────────────────────────────────────────────────

const SANDBOX_BASE_URL = process.env.SANDBOX_BASE_URL || ''
const SANDBOX_AUTH_HEADERS_JSON = process.env.SANDBOX_AUTH_HEADERS_JSON || '{}'
const DEFAULT_CWD = process.env.SANDBOX_DEFAULT_CWD || '/workspace'
const DEBUG = process.env.SANDBOX_MCP_DEBUG === '1'

if (!SANDBOX_BASE_URL) {
  // 允许空 URL → 工具执行时返回错误（便于开发/测试时启动 MCP server 不挂）
  if (DEBUG) process.stderr.write('[sandbox-mcp] WARN: SANDBOX_BASE_URL not set\n')
}

let parsedHeaders: Record<string, string> = {}
try {
  parsedHeaders = JSON.parse(SANDBOX_AUTH_HEADERS_JSON) as Record<string, string>
} catch (e) {
  process.stderr.write('[sandbox-mcp] invalid SANDBOX_AUTH_HEADERS_JSON, using empty\n')
}

// ─── Sandbox HTTP helper ────────────────────────────────────────────────────

async function callSandboxTool(tool: string, body: unknown, timeoutMs = 60_000): Promise<any> {
  if (!SANDBOX_BASE_URL) {
    throw new Error('SANDBOX_BASE_URL not configured')
  }
  const res = await fetch(`${SANDBOX_BASE_URL}/api/tools/${tool}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...parsedHeaders },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const data = (await res.json().catch(() => ({}))) as { success?: boolean; result?: unknown; error?: string }
  if (!data.success) {
    throw new Error(data.error ?? `${tool} failed (status=${res.status})`)
  }
  return data.result
}

// ─── Tool definitions ───────────────────────────────────────────────────────

interface SandboxTool extends Tool {
  readonly name: string
  execute: (args: Record<string, unknown>) => Promise<CallToolResult>
}

const TOOLS: SandboxTool[] = [
  {
    name: 'read',
    description:
      'Read a text file from the sandbox workspace. Use this INSTEAD OF the builtin read tool. ' +
      `All file paths must be absolute and within the sandbox (default working dir: ${DEFAULT_CWD}).`,
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute file path inside the sandbox' },
        offset: { type: 'number', description: 'Optional start line offset (0-based)' },
        limit: { type: 'number', description: 'Optional max line count' },
      },
      required: ['path'],
    },
    async execute(args) {
      const result = await callSandboxTool('read', {
        path: args.path,
        offset: args.offset,
        limit: args.limit,
      })
      return textResult(typeof result === 'string' ? result : (result?.content ?? JSON.stringify(result)))
    },
  },
  {
    name: 'write',
    description:
      'Write a text file into the sandbox workspace, creating parent directories as needed. ' +
      'Use this INSTEAD OF the builtin write tool.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['path', 'content'],
    },
    async execute(args) {
      const result = await callSandboxTool('write', {
        path: args.path,
        content: args.content,
      })
      return textResult(result?.output ?? 'Wrote file successfully.')
    },
  },
  {
    name: 'edit',
    description: 'Edit a text file in the sandbox by replacing a string. Use this INSTEAD OF the builtin edit tool.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        oldString: { type: 'string' },
        newString: { type: 'string' },
        replaceAll: { type: 'boolean' },
      },
      required: ['path', 'oldString', 'newString'],
    },
    async execute(args) {
      const result = await callSandboxTool('edit', {
        path: args.path,
        oldString: args.oldString,
        newString: args.newString,
        replaceAll: args.replaceAll ?? false,
      })
      return textResult(result?.output ?? 'Edited file successfully.')
    },
  },
  {
    name: 'bash',
    description:
      'Run a shell command inside the sandbox. Use this INSTEAD OF the builtin bash tool. ' +
      'Command runs in a container isolated from the host machine.',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string' },
        timeout: { type: 'number', description: 'Timeout in milliseconds (default 60s)' },
      },
      required: ['command'],
    },
    async execute(args) {
      const result = await callSandboxTool(
        'bash',
        { command: args.command, timeout: args.timeout ?? 60_000 },
        (args.timeout as number | undefined) ?? 60_000,
      )
      return textResult(
        typeof result === 'string' ? result : (result?.content ?? result?.stdout ?? JSON.stringify(result)),
      )
    },
  },
  {
    name: 'glob',
    description: 'Glob files in the sandbox workspace matching a pattern.',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: { type: 'string' },
        path: { type: 'string' },
      },
      required: ['pattern'],
    },
    async execute(args) {
      const result = await callSandboxTool('glob', {
        pattern: args.pattern,
        path: args.path ?? DEFAULT_CWD,
      })
      return textResult(typeof result === 'string' ? result : JSON.stringify(result, null, 2))
    },
  },
  {
    name: 'grep',
    description: 'Grep files in the sandbox workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: { type: 'string' },
        path: { type: 'string' },
        glob: { type: 'string' },
        type: { type: 'string' },
      },
      required: ['pattern'],
    },
    async execute(args) {
      const result = await callSandboxTool('grep', args)
      return textResult(typeof result === 'string' ? result : JSON.stringify(result, null, 2))
    },
  },
]

function textResult(text: string): CallToolResult {
  return { content: [{ type: 'text', text }] }
}

// ─── MCP Server wiring ──────────────────────────────────────────────────────

async function main(): Promise<void> {
  const server = new Server({ name: 'sandbox-bridge', version: '0.1.0' }, { capabilities: { tools: {} } })

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }))

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = TOOLS.find((t) => t.name === req.params.name)
    if (!tool) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Unknown tool: ${req.params.name}` }],
      }
    }
    try {
      return await tool.execute((req.params.arguments ?? {}) as Record<string, unknown>)
    } catch (e) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Tool ${req.params.name} failed: ${(e as Error).message}` }],
      }
    }
  })

  const transport = new StdioServerTransport()
  await server.connect(transport)

  if (DEBUG) process.stderr.write('[sandbox-mcp] ready\n')
}

// Run as CLI when invoked directly
main().catch((err) => {
  process.stderr.write(`[sandbox-mcp] fatal: ${err}\n`)
  process.exit(1)
})
