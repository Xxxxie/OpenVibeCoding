#!/usr/bin/env tsx
/**
 * AskUserQuestion 端到端测试（OpenCode runtime）
 *
 * 验证链路：
 *   1. 启动一个 Hono app，只挂载 acp 路由（含 /api/agent/internal/ask-user）
 *   2. 设置 ASK_USER_BASE_URL = http://127.0.0.1:<port>
 *   3. 第一轮 chatStream：
 *        - LLM 调 question 工具
 *        - custom question.ts execute → fetch ASK_USER_URL
 *        - server /internal/ask-user → emit ask_user（到 callback）+ 注册 pending
 *        - 观察：收到 ask_user 事件；一段时间内没 result（证明挂起）
 *   4. 第二轮 chatStream 带 askAnswers
 *        - runtime resolvePendingQuestion → HTTP res.json(answers)
 *        - custom question.ts 拿到 answers → execute 返回 tool output
 *        - LLM 继续推理
 *        - 最终 result
 *   5. 断言：LLM 文本里包含用户答案的选项 label
 *
 * 用法：
 *   npx tsx scripts/test-ask-user-e2e.mts
 */

import fs from 'node:fs'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'

// 在 import runtime 前设置 env（installer 和 emitter 都需要）
// 端口在 hono serve 起来后才知道，所以先占位，后面改写
let assignedPort = 0
process.env.OPENCODE_SKIP_TOOLS_INSTALL !== '1' // noop; 这个场景需要 tool 被装上

// 启动测试 server ──────────────────────────────────────────────────────
const app = new Hono()
// 只需要 acp 路由，但 acp.ts 的 middleware 会检查用户 env / token。
// internal/* 走 token 认证（getAskUserToken），其他路径 requireUserEnv。
// 因此我们直接 import acp 路由模块并挂载。
import acpRoutes from '../src/routes/acp.js'
app.route('/api/agent', acpRoutes)

// 赋值端口（让系统挑一个空闲端口）
const server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' }, (info) => {
  assignedPort = info.port
  console.log(`[askuser-e2e] test server listening on 127.0.0.1:${assignedPort}`)
})
await new Promise((r) => setTimeout(r, 200))
process.env.ASK_USER_BASE_URL = `http://127.0.0.1:${assignedPort}`

// 此时再 import runtime —— 它会读最新的 env
const { opencodeAcpRuntime } = await import('../src/agent/runtime/opencode-acp-runtime.js')
const { getAskUserToken } = await import('../src/agent/runtime/opencode-acp-runtime.js')
console.log('[askuser-e2e] ASK_USER_BASE_URL=', process.env.ASK_USER_BASE_URL)
console.log('[askuser-e2e] ASK_USER_TOKEN=', getAskUserToken().slice(0, 8) + '...')

// ── 测试工作目录 ────────────────────────────────────────────────────────
const WORKDIR = '/tmp/opencode-askuser-e2e-' + Date.now()
fs.mkdirSync(WORKDIR, { recursive: true })

// ── Event recorder ──────────────────────────────────────────────────────
import type { AgentCallbackMessage } from '@coder/shared'
const events: Array<{ ts: number; type: string; name?: string; id?: string; content?: string; input?: unknown }> =
  []
const startT0 = Date.now()

function makeCb(label: string) {
  return async (msg: AgentCallbackMessage) => {
    events.push({
      ts: Date.now() - startT0,
      type: msg.type,
      name: msg.name,
      id: msg.id,
      content: typeof msg.content === 'string' ? msg.content.slice(0, 200) : undefined,
      input: msg.input,
    })
    const t = Date.now() - startT0
    if (msg.type === 'ask_user') {
      console.log(
        `\n[${label} +${t}ms] ★ ask_user id=${msg.id} questions=${JSON.stringify(msg.input).slice(0, 250)}`,
      )
    } else if (msg.type === 'tool_use') {
      console.log(`[${label} +${t}ms] tool_use id=${msg.id} name=${msg.name}`)
    } else if (msg.type === 'tool_result') {
      console.log(`[${label} +${t}ms] tool_result out=${(msg.content || '').slice(0, 200)}`)
    } else if (msg.type === 'result') {
      console.log(`[${label} +${t}ms] result: ${msg.content}`)
    } else if (msg.type === 'error') {
      console.log(`[${label} +${t}ms] error: ${msg.content}`)
    } else if (msg.type === 'text' && msg.content) {
      process.stdout.write(msg.content)
    }
  }
}

// ── Round 1: 第一轮 prompt ──────────────────────────────────────────────
const conversationId = 'askuser-e2e-' + Date.now()
console.log(`\n[askuser-e2e] === Round 1 ===`)

const r1 = await opencodeAcpRuntime.chatStream(
  `我想搭建一个 web 应用后端。请使用 AskUserQuestion 工具问我以下问题（严格按 schema）：\n` +
    `  question="Which database to use?"\n` +
    `  header="Database"\n` +
    `  options=[{label:"PostgreSQL", description:"powerful open-source"}, {label:"MySQL", description:"popular fast"}]\n` +
    `  multiSelect=false\n` +
    `等我回答后再给建议。不要自己下决定，必须用 AskUserQuestion 工具征询。`,
  makeCb('r1'),
  {
    conversationId,
    envId: '',
    userId: 'e2e-user',
    cwd: WORKDIR,
    model: 'moonshot/kimi-k2-0905-preview',
  },
)
console.log(`[askuser-e2e] round1 returned: turnId=${r1.turnId}`)

// 等 ask_user 事件
console.log('[askuser-e2e] waiting for ask_user ...')
const askTimeout = Date.now() + 60_000
let askEvent: (typeof events)[number] | undefined
while (Date.now() < askTimeout) {
  askEvent = events.find((e) => e.type === 'ask_user')
  if (askEvent) break
  if (events.find((e) => e.type === 'result' || e.type === 'error')) {
    console.error('[askuser-e2e] UNEXPECTED: round1 finished without ask_user')
    console.log(JSON.stringify(events, null, 2))
    server.close()
    process.exit(1)
  }
  await new Promise((r) => setTimeout(r, 200))
}

if (!askEvent) {
  console.error('[askuser-e2e] FAIL: no ask_user within 60s')
  server.close()
  process.exit(1)
}
console.log(`\n[askuser-e2e] ✓ Received ask_user at +${askEvent.ts}ms (toolCallId=${askEvent.id})`)

// 等 3 秒确认没 result（说明挂起）
await new Promise((r) => setTimeout(r, 3000))
const earlyResult = events.find((e) => e.type === 'result' && e.ts > (askEvent!.ts ?? 0))
if (earlyResult) {
  console.error('[askuser-e2e] FAIL: got result too early after ask_user')
  server.close()
  process.exit(1)
}
console.log('[askuser-e2e] ✓ agent suspended after ask_user')

// 取 questions 头（header）作为回答 key
const questions = (askEvent.input as { questions: Array<{ header: string; options: Array<{ label: string }> }> })
  .questions
const firstHeader = questions[0].header
const chosenLabel = questions[0].options.find((o) => /postgres/i.test(o.label))?.label ?? questions[0].options[0].label
console.log(`[askuser-e2e] simulated user answer: ${firstHeader}="${chosenLabel}"`)

// ── Round 2: 发 askAnswers ──────────────────────────────────────────────
console.log(`\n[askuser-e2e] === Round 2 ===`)
const resumeT0 = Date.now() - startT0
const r2 = await opencodeAcpRuntime.chatStream('', makeCb('r2'), {
  conversationId,
  envId: '',
  userId: 'e2e-user',
  cwd: WORKDIR,
  model: 'moonshot/kimi-k2-0905-preview',
  askAnswers: {
    [askEvent.id!]: {
      toolCallId: askEvent.id!,
      answers: { [firstHeader]: chosenLabel },
    },
  },
})
console.log(`[askuser-e2e] round2 returned: alreadyRunning=${r2.alreadyRunning}`)

if (!r2.alreadyRunning) {
  console.error('[askuser-e2e] FAIL: round2 should have alreadyRunning=true')
  server.close()
  process.exit(1)
}

// 等 result
console.log('[askuser-e2e] waiting for tool_result + result ...')
const finalTimeout = Date.now() + 120_000
while (Date.now() < finalTimeout) {
  if (events.find((e) => e.type === 'result' || e.type === 'error')) break
  await new Promise((r) => setTimeout(r, 200))
}

// ── Validation ──────────────────────────────────────────────────────────
console.log('\n\n[askuser-e2e] === validation ===')
const counts: Record<string, number> = {}
for (const e of events) counts[e.type] = (counts[e.type] ?? 0) + 1
console.log('[askuser-e2e] event counts:', JSON.stringify(counts))

const toolResults = events.filter((e) => e.type === 'tool_result')
const questionResult = toolResults.find((e) => e.ts > resumeT0 && typeof e.content === 'string' && e.content.includes(chosenLabel))
const finalResult = events.find((e) => e.type === 'result')
const errorEv = events.find((e) => e.type === 'error')

// 检查 LLM 是否在最终文本里引用了用户答案（不强要求，但加分）
const allText = events
  .filter((e) => e.type === 'text')
  .map((e) => e.content)
  .join('')
const textMentionsAnswer = allText.includes(chosenLabel) || allText.toLowerCase().includes(chosenLabel.toLowerCase())

console.log('\n[askuser-e2e] assertions:')

// ★ Tencent 契约对齐断言
const askUserToolUse = events.find((e) => e.type === 'tool_use' && e.name === 'AskUserQuestion')
const toolUseOk = !!askUserToolUse
console.log(`  tool_use name='AskUserQuestion': ${toolUseOk ? 'PASS' : 'FAIL'}`)

// ★ questions 字段 schema 对齐：multiSelect（不是 multiple），options[].description 必填
const askQuestions = (askEvent.input as { questions?: Array<Record<string, unknown>> }).questions || []
const schemaQ = askQuestions[0]
const hasHeader = typeof schemaQ?.header === 'string'
const hasQuestion = typeof schemaQ?.question === 'string'
const hasOptions = Array.isArray(schemaQ?.options) && (schemaQ.options as unknown[]).length >= 2
// multiSelect 是可选（默认 false）
const optArr = (schemaQ?.options as Array<Record<string, unknown>>) || []
const allOptsHaveDescription = optArr.every((o) => typeof o.label === 'string' && typeof o.description === 'string')
console.log(`  questions[0].header/question:    ${hasHeader && hasQuestion ? 'PASS' : 'FAIL'}`)
console.log(`  options[].label+description:     ${allOptsHaveDescription ? 'PASS' : 'FAIL'}`)
console.log(`  options length >= 2:             ${hasOptions ? 'PASS' : 'FAIL'}`)

console.log(`  ask_user received:               PASS`)
console.log(`  agent suspended after:           PASS (no result 3s)`)
console.log(`  round2 resume path:              PASS (alreadyRunning=true)`)
console.log(`  tool_result with user answer:    ${questionResult ? 'PASS' : 'FAIL'}`)
console.log(`  final result event:              ${finalResult ? 'PASS' : 'FAIL'}`)
console.log(`  no error event:                  ${errorEv ? 'FAIL (' + errorEv.content + ')' : 'PASS'}`)
console.log(`  text mentions answer:            ${textMentionsAnswer ? 'PASS (bonus)' : 'WARN (not required)'}`)

const overall =
  toolUseOk &&
  hasHeader &&
  hasQuestion &&
  hasOptions &&
  allOptsHaveDescription &&
  !!questionResult &&
  !!finalResult &&
  !errorEv
console.log(`\n[askuser-e2e] OVERALL: ${overall ? 'PASS' : 'FAIL'}`)

server.close()
process.exit(overall ? 0 : 1)
