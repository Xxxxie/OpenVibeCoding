#!/usr/bin/env tsx
/**
 * 测试 supervisor 流程
 *
 * 用法:
 *   cd packages/server
 *   tsx --env-file=.env src/scripts/test-dev-supervisor.ts <taskId>
 *
 * 例:
 *   tsx --env-file=.env src/scripts/test-dev-supervisor.ts 8nxgwhro4vbmoh0kdbt
 *
 * 脚本会：
 *   1. 从 DB 读取 task 的 sandboxId / sandboxCwd
 *   2. 获取沙箱实例
 *   3. 调用 detectAndEnsureDevServer，实时打印 supervisor 状态
 *   4. 成功后打印 gatewayUrl
 */

import { getDb } from '../db/index.js'
import { scfSandboxManager } from '../sandbox/index.js'
import { detectAndEnsureDevServer } from '../agent/coding-mode.js'

const taskId = process.argv[2]
if (!taskId) {
  console.error('Usage: tsx test-dev-supervisor.ts <taskId>')
  process.exit(1)
}

async function main() {
  console.log(`[test] Looking up task: ${taskId}`)
  const task = await getDb().tasks.findById(taskId)
  if (!task) {
    console.error('[test] Task not found')
    process.exit(1)
  }

  const envId = process.env.TCB_ENV_ID || ''
  if (!envId) {
    console.error('[test] TCB_ENV_ID not set')
    process.exit(1)
  }

  const sandboxSessionId = (task as any).sandboxSessionId || envId
  const workspace = (task as any).sandboxCwd || `/tmp/workspace/${envId}/${taskId}`

  console.log(`[test] task.sandboxId    = ${task.sandboxId}`)
  console.log(`[test] sandboxSessionId  = ${sandboxSessionId}`)
  console.log(`[test] workspace         = ${workspace}`)

  // 获取沙箱
  let sandbox
  if (task.sandboxId) {
    console.log('[test] Getting existing sandbox...')
    sandbox = await scfSandboxManager.getExisting(task.sandboxId, sandboxSessionId)
  }
  if (!sandbox) {
    console.log('[test] Sandbox not found, creating...')
    sandbox = await scfSandboxManager.getOrCreate(taskId, envId, {
      mode: 'shared',
      workspaceIsolation: 'shared',
      sandboxSessionId,
    })
  }
  console.log(`[test] Sandbox ready: ${sandbox.functionName}`)

  // 开始计时
  const startMs = Date.now()
  console.log('\n[test] ── Calling detectAndEnsureDevServer ──────────────────')

  try {
    const port = await detectAndEnsureDevServer(sandbox, workspace, { maxPollSeconds: 120 })
    const elapsed = ((Date.now() - startMs) / 1000).toFixed(1)
    console.log(`\n[test] ✅ Dev server ready on port ${port} (${elapsed}s)`)

    // 打印 gateway URL
    const previewBase = `https://${envId}.service.tcloudbase.com/preview`
    const gatewayUrl = `${previewBase}/${port}/?cloudbase_session_id=${sandboxSessionId}`
    console.log(`[test] Preview URL: ${gatewayUrl}`)

    // 打印 supervisor 日志最后几行
    const logRes = await sandbox.request('/api/tools/bash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: 'tail -20 /tmp/devserver.log 2>/dev/null', timeout: 5000 }),
      signal: AbortSignal.timeout(8_000),
    })
    const logData = (await logRes.json()) as { result?: { output?: string } }
    console.log('\n[test] ── devserver.log (last 20 lines) ───────────────────')
    console.log(logData.result?.output)

    // 检查 tar 缓存是否生成
    const tarRes = await sandbox.request('/api/tools/bash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        command: `ls -lh ${workspace}/node_modules.tar.gz 2>/dev/null || echo "(no tar cache)"`,
        timeout: 5000,
      }),
      signal: AbortSignal.timeout(8_000),
    })
    const tarData = (await tarRes.json()) as { result?: { output?: string } }
    console.log('\n[test] ── node_modules cache ──────────────────────────────')
    console.log(tarData.result?.output)
  } catch (err) {
    const elapsed = ((Date.now() - startMs) / 1000).toFixed(1)
    console.error(`\n[test] ❌ Failed after ${elapsed}s: ${(err as Error).message}`)

    // 打印完整 supervisor 日志帮助诊断
    try {
      const logRes = await sandbox.request('/api/tools/bash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'cat /tmp/devserver.log 2>/dev/null || echo "(no log)"', timeout: 5000 }),
        signal: AbortSignal.timeout(8_000),
      })
      const logData = (await logRes.json()) as { result?: { output?: string } }
      console.log('\n[test] ── devserver.log (full) ────────────────────────────')
      console.log(logData.result?.output)
    } catch {}
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('[test] Unexpected error:', err)
  process.exit(1)
})
