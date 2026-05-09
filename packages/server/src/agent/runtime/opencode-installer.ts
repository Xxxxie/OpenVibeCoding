/**
 * OpenCode 项目级配置路径解析
 *
 * 背景：opencode 用 `OPENCODE_CONFIG_DIR` env 指向项目级配置目录，里面含：
 *   - `opencode.json`（model / provider / tools 声明）
 *   - `tools/*.ts`（checked-in 的 tool override 源文件，覆盖 builtin 同名工具）
 *
 * 我们的项目把 `.opencode/` 直接签入仓库（.opencode/tools/read.ts 等），
 * 生产镜像 Dockerfile Stage 2 会把 `.opencode/` 拷贝到 `/app/.opencode/`。
 * 本模块负责把 `__dirname` 映射回项目根，从而定位到 `.opencode/` 目录。
 *
 * 历史：曾有一个 `ensureOpencodeToolsInstalled()` 从 `src/agent/runtime/opencode-tool-templates/`
 * 拷贝模板到 `.opencode/tools/`，但 38114f1 后 tools 直接签入仓库，安装步骤已废弃。
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * 解析项目根目录。
 * 优先级：
 *   1. OPENCODE_PROJECT_ROOT env（测试 / 自定义部署时覆盖）
 *   2. 从 __dirname 向上找包含 packages/server 的 monorepo 根
 *   3. process.cwd() 兜底
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
 * 返回项目级 `.opencode/` 目录路径（供 spawn 时注入 OPENCODE_CONFIG_DIR）。
 * 可通过 OPENCODE_CONFIG_DIR env 覆盖（若用户自行设置则尊重用户）。
 */
export function getOpencodeConfigDir(): string {
  return process.env.OPENCODE_CONFIG_DIR ?? path.join(resolveProjectRoot(), '.opencode')
}
