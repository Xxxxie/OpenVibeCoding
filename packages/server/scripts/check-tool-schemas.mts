#!/usr/bin/env tsx
/**
 * 检查 opencode CLI 版本是否与 tool override 模板的同步版本一致。
 *
 * tool override 模板（opencode-tool-templates/*.ts）是从 opencode 源码
 * 手动同步过来的。如果 opencode CLI 升级了，需要重新对比 builtin tool
 * 的 schema / description 并更新模板。
 *
 * 用法：
 *   npx tsx scripts/check-tool-schemas.mts
 * 或在 CI 里定期跑，确保模板不过期。
 */

import { execSync } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TEMPLATE_DIR = path.resolve(__dirname, '../src/agent/runtime/opencode-tool-templates')
const SYNCED_VERSION = '1.14.31'

// 从模板文件顶部注释提取已声明的同步版本
function extractSyncedVersion(file: string): string | null {
  const content = fs.readFileSync(file, 'utf8')
  const m = content.match(/v([\d.]+)\s+src\/tool\//)
  return m ? m[1] : null
}

// 获取本地安装的 opencode 版本
function getInstalledVersion(): string | null {
  try {
    const out = execSync('opencode --version', { encoding: 'utf8', timeout: 5000 })
    const m = out.trim().match(/([\d]+\.[\d]+\.[\d]+)/)
    return m ? m[1] : out.trim().split('\n')[0]
  } catch {
    return null
  }
}

const installedVersion = getInstalledVersion()

if (!installedVersion) {
  console.log('[check-tool-schemas] opencode not installed, skipping version check.')
  process.exit(0)
}

console.log(`[check-tool-schemas] opencode installed: v${installedVersion}`)
console.log(`[check-tool-schemas] templates synced from: v${SYNCED_VERSION}`)

const templates = fs.readdirSync(TEMPLATE_DIR).filter((f) => f.endsWith('.ts'))
let allMatch = true

for (const f of templates) {
  const filePath = path.join(TEMPLATE_DIR, f)
  const ver = extractSyncedVersion(filePath)
  if (!ver) {
    console.warn(`  ⚠  ${f}: no synced version comment found`)
    allMatch = false
  } else if (ver !== installedVersion) {
    console.warn(`  ⚠  ${f}: synced from v${ver}, installed v${installedVersion} — may need update`)
    allMatch = false
  } else {
    console.log(`  ✓  ${f}: v${ver}`)
  }
}

if (!allMatch) {
  console.warn(
    '\n[check-tool-schemas] Some templates may be out of sync with the installed opencode version.\n' +
      'Please compare the schemas in:\n' +
      '  https://github.com/sst/opencode/tree/dev/packages/opencode/src/tool/\n' +
      'and update packages/server/src/agent/runtime/opencode-tool-templates/ if needed.\n',
  )
  process.exit(1)
}

console.log('\n[check-tool-schemas] All templates in sync with installed opencode version.')
process.exit(0)
