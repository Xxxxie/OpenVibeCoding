#!/usr/bin/env tsx
/**
 * ToolConfirm 端到端测试（OpenCode runtime）
 *
 * 验证路径：
 *   1. 配置 `permission.edit: 'ask'` 让 write 工具触发 requestPermission
 *   2. 第一次 chatStream（不带 toolConfirmation）
 *      → 收到 tool_confirm 事件（agent 挂起）
 *   3. 第二次 chatStream（携带 toolConfirmation，模拟用户 allow）
 *      → pending 被 resolve
 *      → opencode 继续执行 write
 *      → 收到 tool_result 事件
 *      → 收到 result 事件（整轮结束）
 *
 * 关键断言：
 *   A. 第一轮先收 tool_confirm，再（一段时间后还没）收到 result → 证实挂起
 *   B. 第二轮发出后 1-2s 内收到 tool_result → 证实 pending 被唤醒
 *   C. 最终文件真的被写入（证明 allow 走到底）
 *
 * 用法（不需要沙箱，纯本地即可）：
 *   npx tsx scripts/test-tool-confirm-e2e.mts
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

// 在 runtime 导入前设置：防止 installer 自动安装 custom tools 覆盖 builtin。
// 本 e2e 要测试 builtin write 的 permission 流程（custom tools 有独立代码路径不走 permission）
process.env.OPENCODE_SKIP_TOOLS_INSTALL = '1'

import { opencodeAcpRuntime } from '../src/agent/runtime/opencode-acp-runtime.js'
import type { AgentCallbackMessage } from '@coder/shared'

// ── Setup：临时改全局 opencode.json 加 permission，测试结束恢复 ───────────────
const OC_CONFIG_PATH = path.join(os.homedir(), '.config', 'opencode', 'opencode.json')
const OC_CONFIG_BACKUP = OC_CONFIG_PATH + '.bak-tc-e2e-' + Date.now()
const OC_TOOLS_DIR = path.join(os.homedir(), '.config', 'opencode', 'tools')
const OC_TOOLS_BACKUP = OC_TOOLS_DIR + '.bak-tc-e2e-' + Date.now()

let originalConfigExists = false
if (fs.existsSync(OC_CONFIG_PATH)) {
  fs.copyFileSync(OC_CONFIG_PATH, OC_CONFIG_BACKUP)
  originalConfigExists = true
}

// 读原配置合并 permission
let baseConfig: Record<string, unknown> = {}
try {
  baseConfig = JSON.parse(fs.readFileSync(OC_CONFIG_PATH, 'utf8')) as Record<string, unknown>
} catch {
  /* noop */
}

const patchedConfig = {
  ...baseConfig,
  permission: {
    ...(baseConfig.permission as Record<string, unknown> | undefined),
    edit: 'ask',
  },
}
fs.writeFileSync(OC_CONFIG_PATH, JSON.stringify(patchedConfig, null, 2))

// 关键：暂时移除 custom tools 目录，让 builtin write 接受 permission 流程
// 自定义 tools 有独立代码路径，不走 opencode 的 permission 系统
let originalToolsExists = false
if (fs.existsSync(OC_TOOLS_DIR)) {
  fs.renameSync(OC_TOOLS_DIR, OC_TOOLS_BACKUP)
  originalToolsExists = true
}

function restoreConfig() {
  try {
    if (originalConfigExists) {
      fs.copyFileSync(OC_CONFIG_BACKUP, OC_CONFIG_PATH)
      fs.unlinkSync(OC_CONFIG_BACKUP)
    } else {
      fs.unlinkSync(OC_CONFIG_PATH)
    }
  } catch (e) {
    console.error('[tc-e2e] restore opencode.json error:', e)
  }
  try {
    if (originalToolsExists) {
      if (fs.existsSync(OC_TOOLS_DIR)) {
        fs.rmSync(OC_TOOLS_DIR, { recursive: true, force: true })
      }
      fs.renameSync(OC_TOOLS_BACKUP, OC_TOOLS_DIR)
    }
  } catch (e) {
    console.error('[tc-e2e] restore tools dir error:', e)
  }
}

process.on('exit', restoreConfig)
process.on('SIGINT', () => {
  restoreConfig()
  process.exit(130)
})

// ── Test workdir ─────────────────────────────────────────────────────────────
const WORKDIR = '/tmp/opencode-toolconfirm-e2e'
fs.rmSync(WORKDIR, { recursive: true, force: true })
fs.mkdirSync(WORKDIR, { recursive: true })
const targetFile = path.join(WORKDIR, 'hello.txt')

// ── Event recorder ───────────────────────────────────────────────────────────
interface Evt {
  ts: number
  type: string
  name?: string
  id?: string
  content?: string
  input?: unknown
}
const events: Evt[] = []

const startT0 = Date.now()
function recordCb(msg: AgentCallbackMessage) {
  events.push({
    ts: Date.now() - startT0,
    type: msg.type,
    name: msg.name,
    id: msg.id,
    content: typeof msg.content === 'string' ? msg.content.slice(0, 120) : undefined,
    input: msg.input,
  })
  if (msg.type === 'tool_confirm') {
    console.log(
      `\n[+${Date.now() - startT0}ms] tool_confirm id=${msg.id} name=${msg.name} input=${JSON.stringify(msg.input).slice(0, 150)}`,
    )
  } else if (msg.type === 'tool_use') {
    console.log(`[+${Date.now() - startT0}ms] tool_use id=${msg.id} name=${msg.name}`)
  } else if (msg.type === 'tool_result') {
    console.log(
      `[+${Date.now() - startT0}ms] tool_result id=${msg.tool_use_id} is_error=${msg.is_error} out=${(msg.content || '').slice(0, 120)}`,
    )
  } else if (msg.type === 'result') {
    console.log(`[+${Date.now() - startT0}ms] result: ${msg.content}`)
  } else if (msg.type === 'error') {
    console.log(`[+${Date.now() - startT0}ms] error: ${msg.content}`)
  } else if (msg.type === 'text' && msg.content) {
    process.stdout.write(msg.content)
  }
}

// ── Round 1: initial prompt ──────────────────────────────────────────────────
const conversationId = 'tc-e2e-' + Date.now()
console.log(`[tc-e2e] conversationId=${conversationId}`)
console.log(`[tc-e2e] targetFile=${targetFile}`)

console.log('\n[tc-e2e] === Round 1: initial chatStream ===')
const r1 = await opencodeAcpRuntime.chatStream(
  `请用 write 工具在当前目录创建文件 hello.txt，内容正好是一行：hi from tc e2e\n不要加其他内容，写完后告诉我已完成。`,
  recordCb,
  {
    conversationId,
    envId: '', // 本地模式
    userId: 'tc-e2e-user',
    cwd: WORKDIR,
    model: 'moonshot/kimi-k2-0905-preview',
  },
)
console.log(`[tc-e2e] round1 returned: turnId=${r1.turnId} alreadyRunning=${r1.alreadyRunning}`)

// 等 tool_confirm 事件出现（或超时）
console.log('[tc-e2e] waiting for tool_confirm ...')
const confirmTimeout = Date.now() + 60_000
let confirmEvent: Evt | undefined
while (Date.now() < confirmTimeout) {
  confirmEvent = events.find((e) => e.type === 'tool_confirm')
  if (confirmEvent) break
  // early exit：如果直接收到 result 或 error，说明没触发权限请求（可能配置没生效）
  if (events.find((e) => e.type === 'result' || e.type === 'error')) {
    console.error('[tc-e2e] UNEXPECTED: round1 finished without tool_confirm. Config might not take effect.')
    console.log('[tc-e2e] events so far:', JSON.stringify(events, null, 2))
    process.exit(1)
  }
  await new Promise((r) => setTimeout(r, 200))
}

if (!confirmEvent) {
  console.error('[tc-e2e] FAIL: no tool_confirm within 60s')
  console.log(events.map((e) => `${e.ts}ms ${e.type}`).join('\n'))
  process.exit(1)
}

console.log(
  `\n[tc-e2e] ✓ Received tool_confirm at +${confirmEvent.ts}ms (interruptId=${confirmEvent.id})`,
)

// 确认收到 tool_confirm 后，一段时间（3s）不应该再收到 result（说明真挂起了）
const roundAT = confirmEvent.ts
await new Promise((r) => setTimeout(r, 3000))
const resultAfterConfirm = events.find((e) => e.type === 'result' && e.ts > roundAT)
if (resultAfterConfirm) {
  console.error('[tc-e2e] FAIL: got "result" within 3s after tool_confirm — agent did not suspend')
  process.exit(1)
}
console.log('[tc-e2e] ✓ Agent appears suspended (no result in 3s after tool_confirm)')

// ── Round 2: resume with toolConfirmation ─────────────────────────────────────
console.log('\n[tc-e2e] === Round 2: resume with toolConfirmation (allow) ===')
const resumeT0 = Date.now() - startT0

const r2 = await opencodeAcpRuntime.chatStream('', recordCb, {
  conversationId,
  envId: '',
  userId: 'tc-e2e-user',
  cwd: WORKDIR,
  model: 'moonshot/kimi-k2-0905-preview',
  toolConfirmation: {
    interruptId: confirmEvent.id!,
    payload: { action: 'allow' },
  },
})
console.log(`[tc-e2e] round2 returned: turnId=${r2.turnId} alreadyRunning=${r2.alreadyRunning}`)

// 预期 alreadyRunning === true（同一个 agent）
if (!r2.alreadyRunning) {
  console.error('[tc-e2e] FAIL: round2 alreadyRunning=false (expected true for resume path)')
  process.exit(1)
}
console.log('[tc-e2e] ✓ round2 resume path (alreadyRunning=true)')

// 等 tool_result + result 出现
console.log('[tc-e2e] waiting for tool_result + result after resume ...')
const finalTimeout = Date.now() + 90_000
while (Date.now() < finalTimeout) {
  if (events.find((e) => e.type === 'result' || e.type === 'error')) break
  await new Promise((r) => setTimeout(r, 200))
}

// ── Validation ────────────────────────────────────────────────────────────────
console.log('\n\n[tc-e2e] === validation ===')
const counts: Record<string, number> = {}
for (const e of events) counts[e.type] = (counts[e.type] ?? 0) + 1
console.log('[tc-e2e] event counts:', JSON.stringify(counts, null, 2))

const toolResults = events.filter((e) => e.type === 'tool_result')
const resumedToolResult = toolResults.find((e) => e.ts > resumeT0)
const finalResult = events.find((e) => e.type === 'result')
const errorEv = events.find((e) => e.type === 'error')

// 文件检查
let fileOk = false
try {
  const content = fs.readFileSync(targetFile, 'utf8')
  fileOk = content.includes('hi from tc e2e')
  console.log(`[tc-e2e] file content = ${JSON.stringify(content)}`)
} catch (e) {
  console.log(`[tc-e2e] file missing: ${(e as Error).message}`)
}

console.log('\n[tc-e2e] assertions:')
console.log(`  tool_confirm received:        ${confirmEvent ? 'PASS' : 'FAIL'}`)
console.log(`  agent suspended after it:     PASS (no 'result' for 3s)`)
console.log(`  round2 took resume path:      PASS (alreadyRunning=true)`)
console.log(`  tool_result after resume:     ${resumedToolResult ? 'PASS' : 'FAIL'}`)
console.log(`  final result event:           ${finalResult ? 'PASS' : 'FAIL'}`)
console.log(`  no error event:               ${errorEv ? 'FAIL (err=' + errorEv.content + ')' : 'PASS'}`)
console.log(`  file has expected content:    ${fileOk ? 'PASS' : 'FAIL'}`)

const overall = !!confirmEvent && !!resumedToolResult && !!finalResult && !errorEv && fileOk
console.log(`\n[tc-e2e] OVERALL: ${overall ? 'PASS' : 'FAIL'}`)

process.exit(overall ? 0 : 1)
