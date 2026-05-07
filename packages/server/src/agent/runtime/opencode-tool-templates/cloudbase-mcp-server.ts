#!/usr/bin/env node
/**
 * CloudBase Sandbox MCP Server (stdio transport)
 *
 * 作为独立进程被 opencode 通过 McpServerStdio 启动。
 * 从环境变量读取沙箱连接信息，通过沙箱内的 mcporter 动态发现并暴露所有 CloudBase 工具。
 *
 * 环境变量（由 opencode-acp-runtime 通过 McpServerStdio.env 注入）：
 *   SANDBOX_BASE_URL            — 沙箱 HTTPS endpoint
 *   SANDBOX_AUTH_HEADERS_JSON   — 沙箱认证 headers（JSON 对象）
 *   CLOUDBASE_ENV_ID            — CloudBase 环境 ID
 *   TENCENTCLOUD_SECRETID       — TencentCloud SecretId
 *   TENCENTCLOUD_SECRETKEY      — TencentCloud SecretKey
 *   TENCENTCLOUD_SESSIONTOKEN   — 可选：STS session token
 *
 * 工具发现流程：
 *   1. POST /api/session/env  注入凭证
 *   2. bash mcporter list cloudbase --schema --output json
 *   3. 为每个工具注册 MCP handler（通过 mcporter call）
 *   4. 以 stdio 方式提供 MCP 服务
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

// ─── Sandbox HTTP helpers ─────────────────────────────────────────────────

const BASE_URL = process.env.SANDBOX_BASE_URL?.replace(/\/$/, '') ?? ''
const AUTH_HEADERS: Record<string, string> = (() => {
  try {
    return JSON.parse(process.env.SANDBOX_AUTH_HEADERS_JSON ?? '{}')
  } catch {
    return {}
  }
})()
// Scope header (conversation/task ID) injected by runtime
const SCOPE_ID = process.env.SANDBOX_SCOPE_ID ?? ''

function makeHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...AUTH_HEADERS,
    ...(SCOPE_ID ? { 'X-Scope-Id': SCOPE_ID } : {}),
    ...extra,
  }
}

async function sandboxPost(path: string, body: unknown, timeoutMs = 60_000): Promise<any> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: makeHeaders(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const data = (await res.json().catch(() => ({ success: false, error: `HTTP ${res.status}` }))) as any
  if (!data.success) throw new Error(data.error ?? `${path} failed (${res.status})`)
  return data.result
}

async function bashCall(command: string, timeoutMs = 60_000): Promise<string> {
  const result = await sandboxPost('/api/tools/bash', { command, timeout: timeoutMs }, timeoutMs)
  if (typeof result === 'string') return result
  return result?.output ?? result?.stdout ?? JSON.stringify(result)
}

// ─── Credentials injection ────────────────────────────────────────────────

async function injectCredentials(): Promise<void> {
  const envId = process.env.CLOUDBASE_ENV_ID ?? ''
  const secretId = process.env.TENCENTCLOUD_SECRETID ?? ''
  const secretKey = process.env.TENCENTCLOUD_SECRETKEY ?? ''
  const sessionToken = process.env.TENCENTCLOUD_SESSIONTOKEN ?? ''

  const res = await fetch(`${BASE_URL}/api/session/env`, {
    method: 'PUT',
    headers: makeHeaders(),
    body: JSON.stringify({
      CLOUDBASE_ENV_ID: envId,
      TENCENTCLOUD_SECRETID: secretId,
      TENCENTCLOUD_SECRETKEY: secretKey,
      TENCENTCLOUD_SESSIONTOKEN: sessionToken,
      INTEGRATION_IDE: 'opencode',
    }),
    signal: AbortSignal.timeout(15_000),
  })
  const data = (await res.json().catch(() => ({}))) as any
  if (!data.success) {
    process.stderr.write(`[cloudbase-mcp] credential injection warning: ${data.error}\n`)
  }
}

// ─── Tool schema discovery ────────────────────────────────────────────────

interface ToolSchema {
  name: string
  description?: string
  inputSchema?: {
    type?: string
    properties?: Record<string, any>
    required?: string[]
  }
}

async function discoverTools(): Promise<ToolSchema[]> {
  const tmpPath = `.cloudbase-mcp-schema-${Date.now()}.json`
  try {
    await bashCall(`mcporter list cloudbase --schema --output json > ${tmpPath} 2>&1`, 25_000)
    const res = await fetch(`${BASE_URL}/e2b-compatible/files?path=${encodeURIComponent(tmpPath)}`, {
      headers: { ...AUTH_HEADERS, ...(SCOPE_ID ? { 'X-Scope-Id': SCOPE_ID } : {}) },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) throw new Error(`Failed to read schema file: ${res.status}`)
    const parsed = (await res.json()) as any
    if (!Array.isArray(parsed.tools)) throw new Error('No tools array in schema')
    return parsed.tools as ToolSchema[]
  } finally {
    bashCall(`rm -f ${tmpPath}`, 5_000).catch(() => {})
  }
}

// ─── mcporter call helper ─────────────────────────────────────────────────

function serializeFnCall(toolName: string, args: Record<string, unknown>): string {
  if (!args || Object.keys(args).length === 0) return `cloudbase.${toolName}()`
  const parts = Object.entries(args)
    .map(([k, v]) => {
      if (v === undefined || v === null) return null
      if (typeof v === 'string') return `${k}: ${JSON.stringify(v)}`
      if (typeof v === 'boolean' || typeof v === 'number') return `${k}: ${v}`
      return `${k}: ${JSON.stringify(v)}`
    })
    .filter(Boolean)
    .join(', ')
  return `cloudbase.${toolName}(${parts})`
}

async function mcporterCall(toolName: string, args: Record<string, unknown>): Promise<string> {
  const expr = serializeFnCall(toolName, args)
  const escaped = expr.replace(/'/g, "'\\''")
  return bashCall(`mcporter call '${escaped}' 2>&1`, 60_000)
}

// ─── JSON Schema → Zod shape ──────────────────────────────────────────────

function jsonSchemaToZodShape(schema: any): Record<string, z.ZodTypeAny> {
  if (!schema?.properties) return {}
  const required = new Set<string>(schema.required ?? [])
  const shape: Record<string, z.ZodTypeAny> = {}

  for (const [key, prop] of Object.entries(schema.properties as Record<string, any>)) {
    let zodType: z.ZodTypeAny
    switch (prop.type) {
      case 'string':
        zodType = z.string()
        break
      case 'number':
      case 'integer':
        zodType = z.number()
        break
      case 'boolean':
        zodType = z.boolean()
        break
      case 'array':
        zodType = z.array(z.unknown())
        break
      case 'object':
        zodType = z.record(z.unknown())
        break
      default:
        zodType = z.unknown()
    }
    if (prop.description) zodType = zodType.describe(prop.description)
    if (!required.has(key)) zodType = zodType.optional() as z.ZodTypeAny
    shape[key] = zodType
  }

  return shape
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  if (!BASE_URL) {
    process.stderr.write('[cloudbase-mcp] SANDBOX_BASE_URL not set, exiting\n')
    process.exit(1)
  }

  // Inject credentials first
  await injectCredentials()

  // Discover CloudBase tools
  let tools: ToolSchema[] = []
  try {
    tools = await discoverTools()
    process.stderr.write(`[cloudbase-mcp] Discovered ${tools.length} CloudBase tools\n`)
  } catch (e) {
    process.stderr.write(`[cloudbase-mcp] Tool discovery failed: ${(e as Error).message}\n`)
  }

  // Build MCP server
  const server = new McpServer({ name: 'cloudbase', version: '1.0.0' })

  // Register all discovered CloudBase tools
  for (const tool of tools) {
    if (tool.name === 'logout' || tool.name === 'interactiveDialog') continue
    const zodShape = jsonSchemaToZodShape(tool.inputSchema)

    server.tool(
      tool.name,
      (tool.description ?? `CloudBase tool: ${tool.name}`) +
        '\n\nNOTE: localPath refers to paths inside the container workspace.',
      zodShape,
      async (args: Record<string, unknown>) => {
        try {
          const output = await mcporterCall(tool.name, args)
          return { content: [{ type: 'text' as const, text: output }] }
        } catch (e: any) {
          return {
            content: [{ type: 'text' as const, text: `Error: ${e.message}` }],
            isError: true,
          }
        }
      },
    )
  }

  // Start stdio transport
  const transport = new StdioServerTransport()
  await server.connect(transport)
  process.stderr.write('[cloudbase-mcp] MCP server ready (stdio)\n')
}

main().catch((e) => {
  process.stderr.write(`[cloudbase-mcp] Fatal: ${e.message}\n`)
  process.exit(1)
})
