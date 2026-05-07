/**
 * Global CloudBase MCP HTTP Route
 *
 * 全局单一 HTTP MCP 路由，供 OpenCode ACP runtime 连接 CloudBase 工具。
 *
 * 设计：
 * - 复用 Express server 的同一端口（/cloudbase-mcp 路径），零额外 TCP 端口
 * - 每次 HTTP 请求创建 per-request McpServer + StreamableHTTPServerTransport（stateless）
 *   请求处理完毕后实例随 GC 回收
 * - Sandbox 信息（URL、认证 headers、scope ID）通过 request headers 传入
 * - 工具 schema 按 scopeId 缓存，避免每次重新调 mcporter list
 *
 * OpenCode 配置（McpServerHttp）：
 *   {
 *     type: 'http',
 *     name: 'cloudbase',
 *     url: 'http://localhost:3001/cloudbase-mcp',
 *     headers: [
 *       { name: 'X-Sandbox-Url',  value: sandbox.baseUrl },
 *       { name: 'X-Sandbox-Auth', value: JSON.stringify(authHeaders) },
 *       { name: 'X-Scope-Id',     value: conversationId },
 *       { name: 'Authorization',  value: 'Bearer <MCP_API_KEY>' },
 *     ]
 *   }
 */

import { Hono } from 'hono'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { HttpBindings } from '@hono/node-server'
import { z } from 'zod'

// ─── Types ────────────────────────────────────────────────────────────────

interface ToolSchema {
  name: string
  description?: string
  inputSchema?: {
    type?: string
    properties?: Record<string, any>
    required?: string[]
  }
}

// ─── Tools Schema Cache ────────────────────────────────────────────────────
// key: scopeId（conversationId），value: discovered tool list
// TTL: 30 minutes（沙箱重启后工具列表不变，缓存避免重复调 mcporter list）

interface CacheEntry {
  tools: ToolSchema[]
  expiresAt: number
}
const toolsSchemaCache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 30 * 60 * 1000

function getCachedTools(scopeId: string): ToolSchema[] | null {
  const entry = toolsSchemaCache.get(scopeId)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    toolsSchemaCache.delete(scopeId)
    return null
  }
  return entry.tools
}

function setCachedTools(scopeId: string, tools: ToolSchema[]): void {
  toolsSchemaCache.set(scopeId, { tools, expiresAt: Date.now() + CACHE_TTL_MS })
}

// ─── Sandbox HTTP helpers ──────────────────────────────────────────────────
// 不依赖 SandboxInstance，直接通过 fetch 调沙箱 HTTP API

async function sandboxFetch(
  sandboxUrl: string,
  sandboxAuth: Record<string, string>,
  scopeId: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(`${sandboxUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...sandboxAuth,
      'X-Scope-Id': scopeId,
      ...(init.headers as Record<string, string> | undefined),
    },
  })
}

async function sandboxBash(
  sandboxUrl: string,
  sandboxAuth: Record<string, string>,
  scopeId: string,
  command: string,
  timeoutMs = 60_000,
): Promise<string> {
  const res = await sandboxFetch(sandboxUrl, sandboxAuth, scopeId, '/api/tools/bash', {
    method: 'POST',
    body: JSON.stringify({ command, timeout: timeoutMs }),
    signal: AbortSignal.timeout(timeoutMs + 5_000),
  })
  const data = (await res.json().catch(() => ({ success: false, error: `HTTP ${res.status}` }))) as any
  if (!data.success) throw new Error(data.error ?? `bash failed (${res.status})`)
  const r = data.result
  if (typeof r === 'string') return r
  return r?.output ?? r?.stdout ?? JSON.stringify(r ?? '')
}

// ─── Tool Schema Discovery ─────────────────────────────────────────────────

async function discoverCloudbaseTools(
  sandboxUrl: string,
  sandboxAuth: Record<string, string>,
  scopeId: string,
): Promise<ToolSchema[]> {
  const tmpPath = `.cloudbase-mcp-schema-${scopeId.slice(0, 8)}.json`
  try {
    await sandboxBash(
      sandboxUrl,
      sandboxAuth,
      scopeId,
      `mcporter list cloudbase --schema --output json > ${tmpPath} 2>&1`,
      25_000,
    )
    const res = await sandboxFetch(
      sandboxUrl,
      sandboxAuth,
      scopeId,
      `/e2b-compatible/files?path=${encodeURIComponent(tmpPath)}`,
    )
    if (!res.ok) throw new Error(`Failed to read schema file: ${res.status}`)
    const parsed = (await res.json()) as any
    if (!Array.isArray(parsed.tools)) throw new Error('No tools array in schema response')
    return parsed.tools as ToolSchema[]
  } finally {
    sandboxBash(sandboxUrl, sandboxAuth, scopeId, `rm -f ${tmpPath}`, 5_000).catch(() => {})
  }
}

// ─── mcporter call ─────────────────────────────────────────────────────────

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

async function mcporterCall(
  sandboxUrl: string,
  sandboxAuth: Record<string, string>,
  scopeId: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<string> {
  const expr = serializeFnCall(toolName, args)
  const escaped = expr.replace(/'/g, "'\\''")
  return sandboxBash(sandboxUrl, sandboxAuth, scopeId, `mcporter call '${escaped}' 2>&1`, 60_000)
}

// ─── JSON Schema to Zod ────────────────────────────────────────────────────

function jsonSchemaPropToZod(propSchema: any): z.ZodTypeAny {
  if (!propSchema) return z.any()
  const { type, description, enum: enumValues, items, properties, required } = propSchema
  let zodType: z.ZodTypeAny
  if (enumValues && Array.isArray(enumValues)) {
    zodType = z.enum(enumValues as [string, ...string[]])
  } else if (type === 'string') {
    zodType = z.string()
  } else if (type === 'number' || type === 'integer') {
    zodType = z.number()
  } else if (type === 'boolean') {
    zodType = z.boolean()
  } else if (type === 'array') {
    zodType = z.array(items ? jsonSchemaPropToZod(items) : z.any())
  } else if (type === 'object') {
    if (properties) {
      const shape: Record<string, z.ZodTypeAny> = {}
      const reqSet = new Set(required || [])
      for (const [k, v] of Object.entries(properties)) {
        let t = jsonSchemaPropToZod(v as any)
        if (!reqSet.has(k)) t = t.optional() as z.ZodTypeAny
        shape[k] = t
      }
      zodType = z.object(shape)
    } else {
      zodType = z.record(z.string(), z.any())
    }
  } else {
    zodType = z.any()
  }
  return description ? zodType.describe(description) : zodType
}

function jsonSchemaToZodShape(schema: any): Record<string, z.ZodTypeAny> {
  if (!schema?.properties) return {}
  const required = new Set<string>(schema.required ?? [])
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const [key, prop] of Object.entries(schema.properties as Record<string, any>)) {
    let t = jsonSchemaPropToZod(prop)
    if (!required.has(key)) t = t.optional() as z.ZodTypeAny
    shape[key] = t
  }
  return shape
}

// ─── Per-request MCP Server builder ───────────────────────────────────────

const SKIP_TOOLS = new Set(['logout', 'interactiveDialog'])

async function buildMcpServer(
  sandboxUrl: string,
  sandboxAuth: Record<string, string>,
  scopeId: string,
): Promise<McpServer> {
  // Get or discover tool schema
  let tools = getCachedTools(scopeId)
  if (!tools) {
    try {
      tools = await discoverCloudbaseTools(sandboxUrl, sandboxAuth, scopeId)
      setCachedTools(scopeId, tools)
    } catch (e) {
      console.warn('[cloudbase-mcp] Tool discovery failed:', (e as Error).message)
      tools = []
    }
  }

  const server = new McpServer({ name: 'cloudbase', version: '1.0.0' })

  for (const tool of tools) {
    if (SKIP_TOOLS.has(tool.name)) continue
    const zodShape = jsonSchemaToZodShape(tool.inputSchema)
    server.tool(
      tool.name,
      (tool.description ?? `CloudBase tool: ${tool.name}`) +
        '\n\nNOTE: localPath refers to paths inside the container workspace.',
      zodShape,
      async (args: Record<string, unknown>) => {
        try {
          const output = await mcporterCall(sandboxUrl, sandboxAuth, scopeId, tool.name, args)
          return {
            content: [{ type: 'text' as const, text: typeof output === 'string' ? output : JSON.stringify(output) }],
          }
        } catch (e: any) {
          return { content: [{ type: 'text' as const, text: `Error: ${e.message}` }], isError: true }
        }
      },
    )
  }

  return server
}

// ─── Hono Route ───────────────────────────────────────────────────────────

const MCP_API_KEY = process.env.MCP_API_KEY

const app = new Hono<{ Bindings: HttpBindings }>()

// All methods: parse sandbox headers and dispatch to MCP transport
app.all('*', async (c) => {
  // Optional API key check
  if (MCP_API_KEY) {
    const auth = c.req.header('Authorization') ?? ''
    const key = auth.startsWith('Bearer ') ? auth.slice(7) : auth
    if (key !== MCP_API_KEY) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
  }

  const sandboxUrl = c.req.header('X-Sandbox-Url')
  const sandboxAuthRaw = c.req.header('X-Sandbox-Auth') ?? '{}'
  const scopeId = c.req.header('X-Scope-Id') ?? 'default'

  if (!sandboxUrl) {
    return c.json({ error: 'X-Sandbox-Url header required' }, 400)
  }

  let sandboxAuth: Record<string, string>
  try {
    sandboxAuth = JSON.parse(sandboxAuthRaw)
  } catch {
    return c.json({ error: 'Invalid X-Sandbox-Auth header (must be JSON)' }, 400)
  }

  // Build per-request McpServer with tools registered
  const mcpServer = await buildMcpServer(sandboxUrl, sandboxAuth, scopeId)

  // Create stateless transport and handle this single HTTP request.
  // @hono/node-server exposes Node.js raw req/res via c.env (HttpBindings).
  // transport.handleRequest writes directly to the Node.js ServerResponse,
  // so we must tell Hono NOT to write its own response afterward.
  // We use the @hono/node-server internal header 'x-hono-already-sent' = '1'
  // which causes responseViaResponseObject to skip all header/body writing.
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  await mcpServer.connect(transport)

  const { incoming, outgoing } = c.env
  await transport.handleRequest(incoming, outgoing)

  return new Response(null, { status: 200, headers: { 'x-hono-already-sent': '1' } })
})

export default app
