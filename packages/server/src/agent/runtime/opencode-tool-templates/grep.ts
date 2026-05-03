/**
 * 全局 opencode tool override：grep
 */
import { z } from 'zod'
import { execSync } from 'node:child_process'

export default {
  description:
    'Search file contents with a regex pattern. Uses ripgrep in local mode, delegates to sandbox in sandbox mode.',
  args: {
    pattern: z.string(),
    path: z.string().optional(),
    glob: z.string().optional(),
    type: z.string().optional(),
  },
  async execute(
    args: { pattern: string; path?: string; glob?: string; type?: string },
    context: { directory?: string },
  ) {
    if (process.env.SANDBOX_MODE === '1') {
      return await sandboxCall('grep', args)
    }
    const flags: string[] = ['-n', '--no-heading']
    if (args.glob) flags.push('-g', args.glob)
    if (args.type) flags.push('-t', args.type)
    const cmd = `rg ${flags.map((f) => JSON.stringify(f)).join(' ')} ${JSON.stringify(args.pattern)} ${args.path ? JSON.stringify(args.path) : '.'}`
    try {
      return execSync(cmd, { encoding: 'utf8', cwd: context?.directory, maxBuffer: 1024 * 1024 * 4 })
    } catch (e) {
      const err = e as { status?: number; stdout?: string }
      if (err.status === 1) return '' // rg exit 1 means no matches
      throw e
    }
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
  return typeof data.result === 'string' ? data.result : JSON.stringify(data.result ?? '')
}
