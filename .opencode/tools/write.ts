/**
 * Global opencode tool override: write
 * 覆盖 opencode builtin write tool，沙箱模式下通过 HTTP 路由到 SCF 沙箱。
 *
 * Schema 与 opencode builtin 完全对齐（v1.14.33 src/tool/write.ts）。
 * 如果 opencode 版本升级导致 builtin schema 变更，需同步更新本文件。
 *
 * 运行时行为：
 *   SANDBOX_MODE=1 → fetch SANDBOX_BASE_URL/api/tools/write
 *   否则          → 写本地文件系统
 */
import { z } from 'zod'
import fs from 'node:fs'
import path from 'node:path'

export default {
  description:
    'Writes a file to the filesystem. Overwrites existing files.\n\n' +
    'Usage:\n' +
    '- This tool will overwrite the existing file if there is one at the provided path.\n' +
    "- If this is an existing file, you MUST use the Read tool first to read the file's contents.\n" +
    '- ALWAYS prefer editing existing files in the codebase. NEVER write new files unless explicitly required.\n' +
    '- In sandbox mode, use relative paths (no leading /); they resolve against the session working directory.',
  args: {
    filePath: z.string().describe('The absolute path to the file to write (must be absolute, not relative)'),
    content: z.string().describe('The content to write to the file'),
  },
  async execute(args: { filePath: string; content: string }, context: { directory?: string }) {
    if (process.env.SANDBOX_MODE === '1') {
      return await sandboxCall('write', { path: args.filePath, content: args.content })
    }
    const resolved = path.isAbsolute(args.filePath)
      ? args.filePath
      : path.resolve(context?.directory ?? process.cwd(), args.filePath)
    fs.mkdirSync(path.dirname(resolved), { recursive: true })
    fs.writeFileSync(resolved, args.content)
    return { output: `Wrote ${args.content.length} bytes to ${resolved}` }
  },
}

async function sandboxCall(tool: string, body: unknown): Promise<string | { output: string }> {
  const baseUrl = process.env.SANDBOX_BASE_URL
  if (!baseUrl) throw new Error('SANDBOX_BASE_URL not set')
  const headers = JSON.parse(process.env.SANDBOX_AUTH_HEADERS_JSON || '{}') as Record<string, string>
  const res = await fetch(`${baseUrl}/api/tools/${tool}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  })
  const data = (await res.json().catch(() => ({}))) as { success?: boolean; result?: unknown; error?: string }
  if (!data.success) throw new Error(data.error ?? `sandbox ${tool} failed (${res.status})`)
  const r = data.result as { output?: string } | string | undefined
  if (typeof r === 'string') return r
  if (r && typeof r === 'object' && typeof r.output === 'string') return { output: r.output }
  return JSON.stringify(r ?? 'ok')
}
