/**
 * Global opencode tool override: glob
 * 覆盖 opencode builtin glob tool，沙箱模式下通过 HTTP 路由到 SCF 沙箱。
 *
 * Schema 与 opencode builtin 完全对齐（v1.14.33 src/tool/glob.ts）。
 * 如果 opencode 版本升级导致 builtin schema 变更，需同步更新本文件。
 *
 * 运行时行为：
 *   SANDBOX_MODE=1 → fetch SANDBOX_BASE_URL/api/tools/glob
 *   否则          → find（本地文件系统）
 */
import { z } from 'zod'
import { execSync } from 'node:child_process'

export default {
  description:
    'Fast file pattern matching tool that works with any codebase size.\n' +
    '- Supports glob patterns like "**/*.js" or "src/**/*.ts".\n' +
    '- Returns matching file paths sorted by modification time.\n' +
    '- Use this tool when you need to find files by name patterns.',
  args: {
    pattern: z.string().describe('The glob pattern to match files against'),
    path: z
      .string()
      .optional()
      .describe(
        'The directory to search in. If not specified, the current working directory will be used. ' +
          'IMPORTANT: Omit this field to use the default directory. DO NOT enter "undefined" or "null". ' +
          'Must be a valid directory path if provided.',
      ),
  },
  async execute(args: { pattern: string; path?: string }, context: { directory?: string }) {
    if (process.env.SANDBOX_MODE === '1') {
      return await sandboxCall('glob', { pattern: args.pattern, path: args.path })
    }
    const base = args.path ?? context?.directory ?? '.'
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
