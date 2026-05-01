#!/usr/bin/env tsx
/**
 * 端到端测试 OpencodeAcpRuntime
 *
 * 用法（从 packages/server 目录）：
 *   npx tsx scripts/test-opencode-runtime.mts
 *
 * 验证目标：
 *  1. runtime.chatStream() 能启动子进程并完成一轮对话
 *  2. callback 收到完整 AgentCallbackMessage 流（text / tool_use / tool_result / result）
 *  3. 真实 LLM 响应（Moonshot Kimi）
 *  4. 文件实际写入工作目录
 */

import fs from 'node:fs'
import { opencodeAcpRuntime } from '../src/agent/runtime/opencode-acp-runtime.js'
import type { AgentCallbackMessage } from '@coder/shared'

const WORKDIR = '/tmp/opencode-runtime-e2e'
fs.rmSync(WORKDIR, { recursive: true, force: true })
fs.mkdirSync(WORKDIR, { recursive: true })

console.log(`[e2e] workdir = ${WORKDIR}`)

console.log('[e2e] checking opencode availability...')
const available = await opencodeAcpRuntime.isAvailable()
console.log(`[e2e] available = ${available}`)
if (!available) {
  console.error('opencode CLI not available')
  process.exit(1)
}

interface RecordedEvent {
  seq: number | undefined
  type: string
  name?: string
  contentPreview?: string
}
const events: RecordedEvent[] = []

const cb = async (msg: AgentCallbackMessage, seq?: number): Promise<void> => {
  events.push({
    seq,
    type: msg.type,
    name: msg.name,
    contentPreview: typeof msg.content === 'string' ? msg.content.slice(0, 100) : undefined,
  })
  if (msg.type === 'text' && msg.content) process.stdout.write(msg.content)
  else if (msg.type === 'tool_use')
    console.log(`\n[tool_use ▶] ${msg.name} id=${msg.id} input=${JSON.stringify(msg.input).slice(0, 200)}`)
  else if (msg.type === 'tool_result')
    console.log(
      `[tool_result ◯] tool_use_id=${msg.tool_use_id} is_error=${msg.is_error} out=${(msg.content || '').slice(0, 200)}`,
    )
  else if (msg.type === 'agent_phase') console.log(`\n[phase] ${msg.phase}`)
  else if (msg.type === 'error') console.log(`\n[error] ${msg.content}`)
  else if (msg.type === 'result') console.log(`\n[result] ${msg.content}`)
  else if (msg.type === 'thinking') console.log(`\n[thinking] ${(msg.content || '').slice(0, 100)}`)
}

console.log('\n[e2e] === starting chatStream ===')
const conversationId = 'e2e-test-' + Date.now()
const { turnId, alreadyRunning } = await opencodeAcpRuntime.chatStream(
  '请在当前目录创建一个名为 hello.txt 的文件，内容是单行 "hello from runtime"。完成后简短告诉我已完成。',
  cb,
  {
    conversationId,
    // 不传 envId → 跳过持久化，纯内存模式（适合 e2e）
    envId: '',
    userId: 'e2e-user',
    cwd: WORKDIR,
    model: 'moonshot/kimi-k2-0905-preview',
  },
)
console.log(`\n[e2e] chatStream returned: turnId=${turnId} alreadyRunning=${alreadyRunning}`)

console.log('[e2e] waiting for result event...')
const startTime = Date.now()
while (Date.now() - startTime < 120000) {
  const done = events.find((e) => e.type === 'result' || e.type === 'error')
  if (done) break
  await new Promise((r) => setTimeout(r, 500))
}

console.log('\n\n[e2e] === completed ===')
const counts: Record<string, number> = {}
for (const e of events) counts[e.type] = (counts[e.type] ?? 0) + 1
console.log('[e2e] event counts:', JSON.stringify(counts, null, 2))

console.log('\n[e2e] file system check:')
let fileOk = false
try {
  const content = fs.readFileSync(`${WORKDIR}/hello.txt`, 'utf8')
  console.log(`hello.txt content: ${JSON.stringify(content)}`)
  if (content.includes('hello from runtime')) {
    console.log('PASS: file created with correct content')
    fileOk = true
  } else {
    console.log('WARN: file content unexpected')
  }
} catch (e) {
  console.log(`FAIL: hello.txt not created — ${(e as Error).message}`)
}

const hasText = (counts.text ?? 0) > 0
const hasToolUse = (counts.tool_use ?? 0) > 0
const hasToolResult = (counts.tool_result ?? 0) > 0
const hasResult = (counts.result ?? 0) > 0

console.log('\n[e2e] assertions:')
console.log(`  text events:        ${hasText ? 'PASS' : 'FAIL'} (${counts.text ?? 0})`)
console.log(`  tool_use events:    ${hasToolUse ? 'PASS' : 'FAIL'} (${counts.tool_use ?? 0})`)
console.log(`  tool_result events: ${hasToolResult ? 'PASS' : 'FAIL'} (${counts.tool_result ?? 0})`)
console.log(`  result events:      ${hasResult ? 'PASS' : 'FAIL'} (${counts.result ?? 0})`)
console.log(`  file created:       ${fileOk ? 'PASS' : 'FAIL'}`)

const ok = hasText && hasToolUse && hasToolResult && hasResult && fileOk
console.log(`\n[e2e] OVERALL: ${ok ? 'PASS' : 'FAIL'}`)
process.exit(ok ? 0 : 1)
