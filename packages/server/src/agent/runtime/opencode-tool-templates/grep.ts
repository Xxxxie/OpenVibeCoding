/**
 * Global opencode tool override: grep
 * 覆盖 opencode builtin grep tool，沙箱模式下通过 HTTP 路由到 SCF 沙箱。
 *
 * Schema 与 opencode builtin 完全对齐（v1.14.33 src/tool/grep.ts）。
 * 注意：builtin 参数名是 `include`（文件通配），不是 `glob`。
 * 如果 opencode 版本升级导致 builtin schema 变更，需同步更新本文件。
 *
 * 运行时行为：
 *   SANDBOX_MODE=1 → fetch SANDBOX_BASE_URL/api/tools/grep
 *   否则          → ripgrep（rg）
 */
import { z } from 'zod'
import { execSync } from 'node:child_process'

export default {
  description:
    'Fast content search tool that works with any codebase size.\n' +
    '- Searches file contents using regular expressions.\n' +
    '- Supports full regex syntax (e.g. "log.*Error", "function\\s+\\w+").\n' +
    '- Filter files by pattern with the include parameter (e.g. "*.js", "*.{ts,tsx}").\n' +
    '- Returns file paths and line numbers with at least one match sorted by modification time.',
  args: {
    pattern: z.string().describe('The regex pattern to search for in file contents'),
    path: z
      .string()
      .optional()
      .describe('The directory to search in. Defaults to the current working directory.'),
    include: z
      .string()
      .optional()
      .describe('File pattern to include in the search (e.g. "*.js", "*.{ts,tsx}")'),
  },
  async execute(
    args: { pattern: string; path?: string; include?: string },
    context: { directory?: string },
  ) {
    if (process.env.SANDBOX_MODE === '1') {
      return await sandboxCall('grep', {
        pattern: args.pattern,
        path: args.path,
        // 沙箱 API 参数名用 glob，与 builtin include 语义相同，做转换
        glob: args.include,
      })
    }
    const flags: string[] = ['-n', '--no-heading']
    if (args.include) flags.push('-g', args.include)
    const searchPath = args.path ?? context?.directory ?? '.'
    const cmd = `rg ${flags.map((f) => JSON.stringify(f)).join(' ')} ${JSON.stringify(args.pattern)} ${JSON.stringify(searchPath)}`
    try {
      return execSync(cmd, { encoding: 'utf8', maxBuffer: 1024 * 1024 * 4 })
    } catch (e) {
      const err = e as { status?: number; stdout?: string }
      if (err.status === 1) return '' // rg exit 1 = no matches
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
