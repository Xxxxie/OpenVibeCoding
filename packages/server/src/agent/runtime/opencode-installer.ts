/**
 * OpenCode 全局配置安装器
 *
 * 目的：把 tool override 模板一次性装到 `~/.config/opencode/tools/`，这样：
 *   - 所有 opencode 实例都能加载（全局生效，不必每 session 写一遍）
 *   - 模板自身通过 `process.env.SANDBOX_*` 读取 per-session 凭证
 *   - opencode 看到 custom tool `read` / `write` / ...，**覆盖** builtin 同名工具
 *
 * 重要实现细节：
 *   - 直接安装 `.ts` 源文件（opencode binary 原生支持 TS loader）
 *   - tsup 打包后的 `.js` 含 `import { z } from "zod"`，opencode 当前版本不能解析这个 import，
 *     会静默忽略文件（tool 不被注册）。所以**必须用 .ts**。
 *   - 幂等：同 hash 跳过；OPENCODE_TOOLS_FORCE_REINSTALL=1 强制覆盖。
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const TOOL_NAMES = ['read', 'write', 'edit', 'bash', 'grep', 'glob', 'question'] as const
export type ToolName = (typeof TOOL_NAMES)[number]

/**
 * 找到 TS 模板源文件目录。
 * - 源码运行（tsx dev）：__dirname = .../src/agent/runtime/
 *   templates at .../src/agent/runtime/opencode-tool-templates/
 * - dist 运行：__dirname = .../dist/
 *   需要回溯到 src：.../dist/../src/agent/runtime/opencode-tool-templates/
 *   但 src 可能不在生产机器上，所以优先级：
 *   1. 环境变量 OPENCODE_TOOL_TEMPLATE_DIR
 *   2. __dirname 附近
 *   3. 回溯到 src（只在开发时可用）
 */
function resolveTemplateDir(): string {
  const fromEnv = process.env.OPENCODE_TOOL_TEMPLATE_DIR
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv

  const candidates = [
    // 源码运行
    path.resolve(__dirname, 'opencode-tool-templates'),
    // dist 运行，指向 server 包内 src
    path.resolve(__dirname, '../../src/agent/runtime/opencode-tool-templates'),
    path.resolve(__dirname, '../src/agent/runtime/opencode-tool-templates'),
    // 兜底（workspace root 下的 server）
    path.resolve(process.cwd(), 'packages/server/src/agent/runtime/opencode-tool-templates'),
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      // 再确认里面真的有 read.ts
      if (fs.existsSync(path.join(c, 'read.ts'))) return c
    }
  }
  throw new Error(
    `Cannot locate opencode tool templates. Tried: ${candidates.join(', ')}. Set OPENCODE_TOOL_TEMPLATE_DIR to override.`,
  )
}

/** 安装目录：默认 ~/.config/opencode/tools/ */
function getInstallDir(): string {
  const override = process.env.OPENCODE_TOOLS_INSTALL_DIR
  if (override) return override
  return path.join(os.homedir(), '.config', 'opencode', 'tools')
}

/** 读文件返回 sha256 hex */
function hashFile(p: string): string {
  const buf = fs.readFileSync(p)
  return crypto.createHash('sha256').update(buf).digest('hex')
}

interface InstallResult {
  installDir: string
  installed: ToolName[]
  skipped: ToolName[]
  forced: boolean
}

/**
 * 幂等安装所有 tool override 模板（.ts 源文件）到全局目录。
 * `OPENCODE_TOOLS_FORCE_REINSTALL=1` → 强制覆盖。
 */
export async function ensureOpencodeToolsInstalled(): Promise<InstallResult> {
  const templateDir = resolveTemplateDir()
  const installDir = getInstallDir()
  const force = process.env.OPENCODE_TOOLS_FORCE_REINSTALL === '1'

  fs.mkdirSync(installDir, { recursive: true })

  const installed: ToolName[] = []
  const skipped: ToolName[] = []

  for (const name of TOOL_NAMES) {
    const src = path.join(templateDir, `${name}.ts`)
    const dst = path.join(installDir, `${name}.ts`)

    if (!fs.existsSync(src)) {
      throw new Error(`Tool template not found: ${src}`)
    }

    if (fs.existsSync(dst) && !force && hashFile(src) === hashFile(dst)) {
      skipped.push(name)
      continue
    }
    fs.copyFileSync(src, dst)
    installed.push(name)
  }

  // 清理可能残留的 .js（旧的错误安装形式）
  for (const name of TOOL_NAMES) {
    const stale = path.join(installDir, `${name}.js`)
    if (fs.existsSync(stale)) {
      try {
        fs.unlinkSync(stale)
      } catch {
        /* noop */
      }
    }
  }

  return { installDir, installed, skipped, forced: force }
}
