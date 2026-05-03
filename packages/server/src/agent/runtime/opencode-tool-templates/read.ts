/**
 * 全局 opencode tool override：read
 *
 * 安装位置：~/.config/opencode/tools/read.ts
 * OpenCode 的 tool 注册规则（实测）：同名 custom tool 覆盖 builtin
 *
 * 运行时行为：
 *   - 若 env.SANDBOX_MODE === '1' → 转发到 env.SANDBOX_BASE_URL + /api/tools/read
 *   - 否则                         → 使用本地 fs.readFileSync（本地开发兜底）
 *
 * 沙箱凭证通过 server 进程 spawn opencode 时的 env 传递：
 *   SANDBOX_MODE=1
 *   SANDBOX_BASE_URL=https://xxx.api.tcloudbasegateway.com/v1/functions/sandbox-shared
 *   SANDBOX_AUTH_HEADERS_JSON={"Authorization":"Bearer ...","X-Cloudbase-Session-Id":"...","X-Tcb-Webfn":"true","X-Scope-Id":"..."}
 *
 * 凭证不写入文件，只在进程 env 里，session 结束即清理。
 */
import { z } from 'zod'
import fs from 'node:fs'
import path from 'node:path'

export default {
  description:
    'Read a text file. When running in a sandboxed session, reads from the sandbox workspace via HTTP. Otherwise reads the local file system.',
  args: {
    path: z.string().describe('Relative path from session cwd. Use relative paths (no leading /) in sandbox mode.'),
    offset: z.number().optional().describe('Optional start line offset (0-based).'),
    limit: z.number().optional().describe('Optional max lines to read.'),
  },
  async execute(args: { path: string; offset?: number; limit?: number }, context: { directory?: string }) {
    if (process.env.SANDBOX_MODE === '1') {
      return await sandboxCall('read', { path: args.path, offset: args.offset, limit: args.limit })
    }
    // Local fallback: resolve relative paths against opencode's session directory
    const resolvedPath = path.isAbsolute(args.path)
      ? args.path
      : path.resolve(context?.directory ?? process.cwd(), args.path)
    const content = fs.readFileSync(resolvedPath, 'utf8')
    const lines = content.split('\n')
    const offset = args.offset ?? 0
    const limit = args.limit ?? lines.length - offset
    return lines.slice(offset, offset + limit).join('\n')
  },
}

async function sandboxCall(tool: string, body: unknown): Promise<string> {
  const baseUrl = process.env.SANDBOX_BASE_URL
  if (!baseUrl) throw new Error('SANDBOX_BASE_URL not set')
  const headers = JSON.parse(process.env.SANDBOX_AUTH_HEADERS_JSON || '{}') as Record<string, string>
  const res = await fetch(`${baseUrl}/api/tools/${tool}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  })
  const data = (await res.json().catch(() => ({}))) as { success?: boolean; result?: unknown; error?: string }
  if (!data.success) throw new Error(data.error ?? `sandbox ${tool} failed (${res.status})`)
  const r = data.result as { content?: string } | string | undefined
  if (typeof r === 'string') return r
  if (r && typeof r === 'object' && typeof r.content === 'string') return r.content
  return JSON.stringify(r ?? '')
}
