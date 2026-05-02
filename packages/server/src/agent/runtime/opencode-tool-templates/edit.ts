/**
 * 全局 opencode tool override：edit
 */
import { z } from 'zod'
import fs from 'node:fs'
import path from 'node:path'

export default {
  description:
    'Edit a file by string replacement. Fails if oldString is not found or appears multiple times (unless replaceAll). In sandbox mode, delegates to the sandbox edit endpoint.',
  args: {
    path: z.string(),
    oldString: z.string(),
    newString: z.string(),
    replaceAll: z.boolean().optional(),
  },
  async execute(
    args: { path: string; oldString: string; newString: string; replaceAll?: boolean },
    context: { directory?: string },
  ) {
    if (process.env.SANDBOX_MODE === '1') {
      return await sandboxCall('edit', {
        path: args.path,
        oldString: args.oldString,
        newString: args.newString,
        replaceAll: args.replaceAll ?? false,
      })
    }
    const resolved = path.isAbsolute(args.path)
      ? args.path
      : path.resolve(context?.directory ?? process.cwd(), args.path)
    const content = fs.readFileSync(resolved, 'utf8')
    if (!content.includes(args.oldString)) {
      throw new Error(`String not found in ${resolved}`)
    }
    const out = args.replaceAll
      ? content.split(args.oldString).join(args.newString)
      : content.replace(args.oldString, args.newString)
    fs.writeFileSync(resolved, out)
    return { output: `Edited ${resolved}` }
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
