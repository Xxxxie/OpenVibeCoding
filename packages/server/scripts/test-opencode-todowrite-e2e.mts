#!/usr/bin/env tsx
/**
 * E2E: 验证 OpenCode 的 todoWrite 工具事件名称和格式
 *
 * 目的：确认前端 TodoWrite renderer 能识别 opencode 发出的 tool_call name
 */

import 'dotenv/config'
import { opencodeAcpRuntime } from '../src/agent/runtime/opencode-acp-runtime.js'
import type { AgentCallbackMessage } from '@coder/shared'

const envId = process.env.TCB_ENV_ID
if (!envId) {
  console.error('TCB_ENV_ID not set')
  process.exit(1)
}

const conversationId = `opencode-todo-e2e-${Date.now()}`
const userId = 'e2e-todo-user'

console.log('=== OpenCode todoWrite e2e ===')
console.log(`envId=${envId}`)
console.log(`conversationId=${conversationId}\n`)

interface ToolCall {
  name: string
  input: unknown
}

const toolCalls: ToolCall[] = []
const events: { type: string; name?: string; input?: unknown }[] = []

const cb = async (msg: AgentCallbackMessage): Promise<void> => {
  events.push({ type: msg.type, name: msg.name, input: msg.input })
  if (msg.type === 'tool_use') {
    toolCalls.push({ name: msg.name || '', input: msg.input })
    console.log(`\n[tool_use ▶] name="${msg.name}" input=${JSON.stringify(msg.input).slice(0, 400)}`)
  } else if (msg.type === 'tool_input_update') {
    console.log(`[tool_input_update] id=${msg.id} input=${JSON.stringify(msg.input).slice(0, 200)}`)
  } else if (msg.type === 'text' && msg.content) {
    process.stdout.write(msg.content)
  } else if (msg.type === 'result') {
    console.log(`\n[result] ${(msg.content || '').slice(0, 200)}`)
  } else if (msg.type === 'error') {
    console.log(`\n[error] ${msg.content}`)
  } else if (msg.type === 'agent_phase') {
    console.log(`\n[phase] ${msg.phase}`)
  }
}

const prompt = `请用 todoWrite 工具创建一个待办清单，至少 4 项，内容随意（比如"读取文件"、"分析代码"、"修改 bug"、"验证结果"）。创建完就结束。`

console.log('[todowrite-e2e] Starting chatStream...')
const { turnId } = await opencodeAcpRuntime.chatStream(prompt, cb, {
  conversationId,
  envId,
  userId,
  mode: 'coding',
  model: 'mimo/mimo-v2.5-pro',
})
console.log(`[todowrite-e2e] chatStream returned: turnId=${turnId}`)

const start = Date.now()
while (Date.now() - start < 180_000) {
  if (events.some((e) => e.type === 'result' || e.type === 'error')) break
  await new Promise((r) => setTimeout(r, 500))
}

console.log('\n\n=== SUMMARY ===')
console.log(`total events: ${events.length}`)
console.log(`tool_use events: ${toolCalls.length}`)
for (const tc of toolCalls) {
  console.log(`  - name="${tc.name}"`)
}

const todoCall = toolCalls.find(
  (t) => t.name.toLowerCase().includes('todo') || /todo/i.test(t.name),
)
if (todoCall) {
  console.log(`\n[VERIFIED] Found todo-like tool call: name="${todoCall.name}"`)
  console.log(`input: ${JSON.stringify(todoCall.input, null, 2)}`)

  // Verify input format matches what frontend TodoWrite renderer expects
  const input = todoCall.input as { todos?: unknown[] }
  if (Array.isArray(input.todos)) {
    console.log(`\ntodos array length: ${input.todos.length}`)
    console.log(`first item: ${JSON.stringify(input.todos[0])}`)
  }
} else {
  console.log('\n[NOT FOUND] No todo-like tool was called')
}

process.exit(0)
