/**
 * 全局 opencode tool override：bash
 * 重要：沙箱模式下所有 shell 命令在 SCF 容器内执行，与宿主机隔离。
 */
import { z } from 'zod'
import { execSync } from 'node:child_process'

export default {
  description:
    'Run a shell command. In sandbox mode, the command runs inside the SCF container (isolated from host). In local mode, runs on the host.',
  args: {
    command: z.string().describe('Shell command to execute. Prefer simple commands; use heredocs for multi-line.'),
    timeout: z.number().optional().describe('Timeout in milliseconds (default 60000).'),
  },
  async execute(args: { command: string; timeout?: number }, context: { directory?: string }) {
    if (process.env.SANDBOX_MODE === '1') {
      return await sandboxCall(
        'bash',
        { command: args.command, timeout: args.timeout ?? 60_000 },
        args.timeout ?? 60_000,
      )
    }
    try {
      const out = execSync(args.command, {
        timeout: args.timeout ?? 60_000,
        cwd: context?.directory,
        encoding: 'utf8',
        maxBuffer: 1024 * 1024 * 4,
      })
      return out
    } catch (e) {
      const err = e as { stdout?: Buffer | string; stderr?: Buffer | string; message: string }
      const stdout = typeof err.stdout === 'string' ? err.stdout : (err.stdout?.toString() ?? '')
      const stderr = typeof err.stderr === 'string' ? err.stderr : (err.stderr?.toString() ?? '')
      throw new Error(`${err.message}\nstdout:\n${stdout}\nstderr:\n${stderr}`)
    }
  },
}

async function sandboxCall(tool: string, body: unknown, timeoutMs: number): Promise<string | { output: string }> {
  const baseUrl = process.env.SANDBOX_BASE_URL
  if (!baseUrl) throw new Error('SANDBOX_BASE_URL not set')
  const headers = JSON.parse(process.env.SANDBOX_AUTH_HEADERS_JSON || '{}') as Record<string, string>
  const res = await fetch(`${baseUrl}/api/tools/${tool}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs + 5000),
  })
  const data = (await res.json().catch(() => ({}))) as { success?: boolean; result?: unknown; error?: string }
  if (!data.success) throw new Error(data.error ?? `sandbox ${tool} failed (${res.status})`)
  const r = data.result as { output?: string; stdout?: string } | string | undefined
  if (typeof r === 'string') return r
  if (r && typeof r === 'object') {
    if (typeof r.output === 'string') return r.output
    if (typeof r.stdout === 'string') return r.stdout
  }
  return JSON.stringify(r ?? '')
}
