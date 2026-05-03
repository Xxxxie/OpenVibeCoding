/**
 * 全局 opencode tool override：write
 * 覆盖 builtin write。沙箱模式下通过 HTTP 转发；本地模式直接写 fs。
 * 运行时配置见 read.ts 同级注释。
 */
import { z } from 'zod'
import fs from 'node:fs'
import path from 'node:path'

export default {
  description:
    'Write a text file, creating parent directories as needed. Overwrites existing files. In sandbox mode, writes happen in the SCF container; in local mode, writes use the host file system.',
  args: {
    path: z.string().describe('Relative path from session cwd. Use relative paths in sandbox mode.'),
    content: z.string().describe('File content (as utf-8 text).'),
  },
  async execute(args: { path: string; content: string }, context: { directory?: string }) {
    if (process.env.SANDBOX_MODE === '1') {
      return await sandboxCall('write', { path: args.path, content: args.content })
    }
    const resolved = path.isAbsolute(args.path)
      ? args.path
      : path.resolve(context?.directory ?? process.cwd(), args.path)
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
