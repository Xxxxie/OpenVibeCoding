/**
 * OpenCode 项目级配置安装器
 *
 * 目的：把 tool override 模板装到项目根目录的 `.opencode/tools/`，这样：
 *   - 同一项目的所有 session 共享同一份 tools（session 之间不重复写入）
 *   - 与用户的全局 `~/.config/opencode/` 完全隔离，不污染用户配置
 *   - spawn 时通过 `OPENCODE_CONFIG_DIR=<projectRoot>/.opencode` 让 opencode 只读项目目录
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
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const TOOL_NAMES = ['read', 'write', 'edit', 'bash', 'grep', 'glob', 'AskUserQuestion'] as const
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

/**
 * 解析项目根目录。
 * 优先级：
 *   1. OPENCODE_PROJECT_ROOT env（测试 / 自定义部署时覆盖）
 *   2. 从 __dirname 向上查找 package.json 中 name === 'coding-agent-template' 的目录
 *   3. 从 __dirname 向上找包含 packages/server 的 monorepo 根
 *   4. process.cwd() 兜底
 */
export function resolveProjectRoot(): string {
  const fromEnv = process.env.OPENCODE_PROJECT_ROOT
  if (fromEnv) return fromEnv

  // 向上最多 8 层查找 monorepo 根（含 packages/server 子目录）
  let dir = __dirname
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, 'packages', 'server'))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  return process.cwd()
}

/**
 * 安装目录：项目根 `.opencode/tools/`
 * 可通过 OPENCODE_TOOLS_INSTALL_DIR 完全覆盖（保留旧的逃生舱）。
 */
function getInstallDir(): string {
  const override = process.env.OPENCODE_TOOLS_INSTALL_DIR
  if (override) return override
  return path.join(resolveProjectRoot(), '.opencode', 'tools')
}

/**
 * 返回项目级 `.opencode/` 目录路径（供 spawn 时注入 OPENCODE_CONFIG_DIR）。
 * 可通过 OPENCODE_CONFIG_DIR env 覆盖（若用户自行设置则尊重用户）。
 */
export function getOpencodeConfigDir(): string {
  return process.env.OPENCODE_CONFIG_DIR ?? path.join(resolveProjectRoot(), '.opencode')
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
