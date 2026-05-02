/**
 * 全局 opencode tool override：glob
 */
import { z } from 'zod'
import { execSync } from 'node:child_process'

export default {
  description: 'Find files by glob pattern. Local mode uses find; sandbox mode delegates to sandbox.',
  args: {
    pattern: z.string(),
    path: z.string().optional(),
  },
  async execute(args: { pattern: string; path?: string }, context: { directory?: string }) {
    if (process.env.SANDBOX_MODE === '1') {
      return await sandboxCall('glob', args)
    }
    const base = args.path || context?.directory || '.'
    try {
      const out = execSync(`find ${JSON.stringify(base)} -name ${JSON.stringify(args.pattern)} -type f`, {
        encoding: 'utf8',
        maxBuffer: 1024 * 1024 * 4,
      })
      return out
    } catch {
      return ''
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
