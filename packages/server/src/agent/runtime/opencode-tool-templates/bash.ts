/**
 * Global opencode tool override: bash
 * 覆盖 opencode builtin bash tool，沙箱模式下通过 HTTP 路由到 SCF 沙箱。
 *
 * Schema 与 opencode builtin 完全对齐（v1.14.33 src/tool/bash.ts）。
 * 如果 opencode 版本升级导致 builtin schema 变更，需同步更新本文件。
 *
 * 运行时行为：
 *   SANDBOX_MODE=1 → fetch SANDBOX_BASE_URL/api/tools/bash（沙箱内执行，与宿主机完全隔离）
 *   否则          → 本地 execSync
 *
 * 注意：sandbox 模式下 workdir 参数会被忽略（沙箱有自己的 cwd，
 * 沙箱 API 暂不支持覆盖 cwd）。
 */
import { z } from 'zod'
import { execSync } from 'node:child_process'

export default {
  description:
    'Executes a bash command. In sandbox mode, the command runs inside the SCF container (isolated from host).\n\n' +
    'Usage:\n' +
    '- The command argument is required.\n' +
    '- You can specify an optional timeout in milliseconds (default 120000ms).\n' +
    '- It is very helpful to write a clear, concise description of what this command does in 5-10 words.\n' +
    '- Use the workdir parameter to change the working directory instead of "cd ... && command".\n' +
    '- AVOID using this tool for file operations (reading/writing/editing/searching); use the specialized tools instead.',
  args: {
    command: z.string().describe('The command to execute'),
    timeout: z.number().int().positive().optional().describe('Optional timeout in milliseconds'),
    description: z.string().optional().describe('A clear, concise description of what this command does in 5-10 words'),
    workdir: z
      .string()
      .optional()
      .describe(
        'The working directory to run the command in. Defaults to the current directory. Use this instead of "cd" commands.',
      ),
  },
  async execute(
    args: { command: string; timeout?: number; description?: string; workdir?: string },
    context: { directory?: string },
  ) {
    const timeoutMs = args.timeout ?? 120_000
    if (process.env.SANDBOX_MODE === '1') {
      // workdir not forwarded to sandbox (sandbox manages its own cwd)
      return await sandboxCall('bash', { command: args.command, timeout: timeoutMs }, timeoutMs)
    }
    try {
      const out = execSync(args.command, {
        timeout: timeoutMs,
        cwd: args.workdir ?? context?.directory ?? undefined,
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
    signal: AbortSignal.timeout(timeoutMs + 5_000),
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
