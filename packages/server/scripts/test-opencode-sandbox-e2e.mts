#!/usr/bin/env tsx
/**
 * 沙箱隔离端到端测试
 *
 * 验证目标：
 *   1. 有 envId 时，runtime 自动获取沙箱实例
 *   2. opencode 的 session/new 读 per-session .opencode/opencode.json（禁用内置 read/write）
 *   3. LLM 调用 sandbox MCP bridge 工具（sbx_write 等）
 *   4. sandbox MCP bridge 通过 HTTP 把请求打到沙箱容器
 *   5. 文件真的在沙箱容器内写入（用另一条路径——直接调沙箱 /api/tools/read——确认）
 *   6. 本地文件系统干净，没被污染
 *
 * 前提：
 *   - packages/server/.env 配了 TCB_*、CODEBUDDY_* 等
 *   - opencode CLI 已装 + Moonshot provider 已配（见 ~/.config/opencode/opencode.json）
 *   - sandbox-mcp-bridge.js 已构建（pnpm build:server）
 *
 * 用法（packages/server 目录）：
 *   npx tsx --env-file=.env scripts/test-opencode-sandbox-e2e.mts
 */

import 'dotenv/config'
import fs from 'node:fs'
import { opencodeAcpRuntime } from '../src/agent/runtime/opencode-acp-runtime.js'
import { scfSandboxManager } from '../src/sandbox/scf-sandbox-manager.js'
import type { AgentCallbackMessage } from '@coder/shared'

const envId = process.env.TCB_ENV_ID
if (!envId) {
  console.error('TCB_ENV_ID not set in env — cannot run sandbox e2e')
  process.exit(1)
}

const conversationId = 'sandbox-e2e-' + Date.now()
const testFilename = `hello-sandbox-${Date.now()}.txt`
const expectedContent = `hello from sandbox ${Math.random().toString(36).slice(2, 10)}`
// 沙箱要求相对路径（绝对路径会被 Path traversal 拦截）
const sandboxRelPath = testFilename

console.log(`[sandbox-e2e] envId=${envId}`)
console.log(`[sandbox-e2e] conversationId=${conversationId}`)
console.log(`[sandbox-e2e] testFile (relative)=${sandboxRelPath}`)
console.log(`[sandbox-e2e] expectedContent=${JSON.stringify(expectedContent)}\n`)

// Make sure local /tmp doesn't have a stale file — e2e will verify local stays clean
const localMirror = `/tmp/${testFilename}`
try {
  fs.unlinkSync(localMirror)
} catch {
  /* noop */
}

// 事件收集
interface RecordedEvent {
  type: string
  name?: string
  content?: string
}
const events: RecordedEvent[] = []

const cb = async (msg: AgentCallbackMessage): Promise<void> => {
  events.push({ type: msg.type, name: msg.name, content: typeof msg.content === 'string' ? msg.content.slice(0, 120) : undefined })
  if (msg.type === 'text' && msg.content) process.stdout.write(msg.content)
  else if (msg.type === 'tool_use')
    console.log(`\n[tool_use ▶] name=${msg.name} id=${msg.id} input=${JSON.stringify(msg.input).slice(0, 200)}`)
  else if (msg.type === 'tool_result')
    console.log(`[tool_result ◯] tool_use_id=${msg.tool_use_id} is_error=${msg.is_error} out=${(msg.content || '').slice(0, 200)}`)
  else if (msg.type === 'agent_phase') console.log(`\n[phase] ${msg.phase}`)
  else if (msg.type === 'error') console.log(`\n[error] ${msg.content}`)
  else if (msg.type === 'result') console.log(`\n[result] ${msg.content}`)
}

console.log('[sandbox-e2e] === starting chatStream (sandbox mode) ===')
const { turnId } = await opencodeAcpRuntime.chatStream(
  `请使用 sbx_write 工具在沙箱里创建文件 ${sandboxRelPath}（使用相对路径，不要写 /workspace 前缀），内容正好一行：${expectedContent}\n不要加引号、不要加 markdown、不要多余换行。完成后简短告诉我已完成。`,
  cb,
  {
    conversationId,
    envId,
    userId: 'e2e-user',
    model: 'moonshot/kimi-k2-0905-preview',
  },
)
console.log(`\n[sandbox-e2e] chatStream returned: turnId=${turnId}`)

// 等 result
const startTime = Date.now()
while (Date.now() - startTime < 180000) {
  if (events.find((e) => e.type === 'result' || e.type === 'error')) break
  await new Promise((r) => setTimeout(r, 500))
}

console.log('\n\n[sandbox-e2e] === validation ===')

// 1. 事件计数
const counts: Record<string, number> = {}
for (const e of events) counts[e.type] = (counts[e.type] ?? 0) + 1
console.log('[sandbox-e2e] event counts:', JSON.stringify(counts))

// 2. 确认调了 sbx_* 工具
const sbxToolUses = events.filter((e) => e.type === 'tool_use' && typeof e.name === 'string' && e.name.startsWith('sbx'))
const builtinWriteUses = events.filter(
  (e) => e.type === 'tool_use' && (e.name === 'write' || e.name === 'edit' || e.name === 'bash'),
)
console.log(`[sandbox-e2e] sbx_* tool_use count: ${sbxToolUses.length}`)
console.log(`[sandbox-e2e] builtin write/edit/bash tool_use count: ${builtinWriteUses.length}`)

// 3. 验证沙箱内文件确实写入（直接调沙箱 /api/tools/read）
console.log('\n[sandbox-e2e] querying sandbox /api/tools/read to verify...')
let sandboxReadOk = false
let sandboxReadContent = ''
try {
  const sandbox = await scfSandboxManager.getOrCreate(conversationId, envId, {
    mode: 'shared',
    workspaceIsolation: 'shared',
  })
  const headers = await sandbox.getAuthHeaders()
  const res = await fetch(`${sandbox.baseUrl}/api/tools/read`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ path: sandboxRelPath }),
  })
  const data = (await res.json().catch(() => ({}))) as { success?: boolean; result?: any; error?: string }
  if (data.success && typeof data.result?.content === 'string') {
    sandboxReadContent = data.result.content
    sandboxReadOk = sandboxReadContent.includes(expectedContent)
    console.log(`[sandbox-e2e] sandbox file content = ${JSON.stringify(sandboxReadContent.slice(0, 200))}`)
  } else {
    console.log(`[sandbox-e2e] sandbox read failed: ${data.error ?? JSON.stringify(data).slice(0, 200)}`)
  }
} catch (e) {
  console.log(`[sandbox-e2e] sandbox read error: ${(e as Error).message}`)
}

// 4. 验证本地未被污染
const localExists = fs.existsSync(localMirror)
console.log(`[sandbox-e2e] local /tmp/${testFilename} exists = ${localExists} (should be false)`)

// ─── Assertions ─────────────────────────────────────────────────────────────
const hasText = (counts.text ?? 0) > 0
const hasResult = (counts.result ?? 0) > 0
const usedSandboxMcp = sbxToolUses.length > 0
const noBuiltinTools = builtinWriteUses.length === 0

console.log('\n[sandbox-e2e] assertions:')
console.log(`  text events:                 ${hasText ? 'PASS' : 'FAIL'}`)
console.log(`  result event:                ${hasResult ? 'PASS' : 'FAIL'}`)
console.log(`  used sbx_* tools:            ${usedSandboxMcp ? 'PASS' : 'FAIL'} (count=${sbxToolUses.length})`)
console.log(`  did NOT use builtin tools:   ${noBuiltinTools ? 'PASS' : 'FAIL'} (count=${builtinWriteUses.length})`)
console.log(`  sandbox file has expected:   ${sandboxReadOk ? 'PASS' : 'FAIL'}`)
console.log(`  local NOT polluted:          ${!localExists ? 'PASS' : 'FAIL'}`)

const overall = hasText && hasResult && usedSandboxMcp && noBuiltinTools && sandboxReadOk && !localExists
console.log(`\n[sandbox-e2e] OVERALL: ${overall ? 'PASS' : 'FAIL'}`)

process.exit(overall ? 0 : 1)
