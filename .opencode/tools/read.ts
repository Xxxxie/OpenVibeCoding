/**
 * Global opencode tool override: read
 * 覆盖 opencode builtin read tool，沙箱模式下通过 HTTP 路由到 SCF 沙箱。
 *
 * Schema 与 opencode builtin 完全对齐（v1.14.33 src/tool/read.ts）。
 * 如果 opencode 版本升级导致 builtin schema 变更，需同步更新本文件。
 * 检查命令：opencode --version
 *
 * 运行时行为：
 *   SANDBOX_MODE=1 → fetch SANDBOX_BASE_URL/api/tools/read
 *   否则          → 读本地文件系统（使用 context.directory 解析相对路径）
 */
import { z } from 'zod'
import fs from 'node:fs'
import path from 'node:path'

export default {
  description:
    'Read a file or directory from the filesystem. Returns file contents with line numbers prefixed as `<line>: <content>`.\n\n' +
    'Usage:\n' +
    '- The filePath parameter should be an absolute path.\n' +
    '- By default, returns up to 2000 lines from the start of the file.\n' +
    '- The offset parameter is the line number to start from (1-indexed).\n' +
    '- In sandbox mode, use relative paths (no leading /); they resolve against the session working directory.',
  args: {
    filePath: z.string().describe('The absolute path to the file or directory to read'),
    offset: z.number().int().nonnegative().optional().describe('The line number to start reading from (1-indexed)'),
    limit: z.number().int().positive().optional().describe('The maximum number of lines to read (defaults to 2000)'),
  },
  async execute(args: { filePath: string; offset?: number; limit?: number }, context: { directory?: string }) {
    if (process.env.SANDBOX_MODE === '1') {
      return await sandboxCall('read', {
        path: args.filePath,
        // builtin offset is 1-indexed; sandbox API expects 0-based offset
        offset: args.offset !== undefined ? args.offset - 1 : undefined,
        limit: args.limit,
      })
    }
    // Local fallback: resolve relative paths against opencode session directory
    const resolved = path.isAbsolute(args.filePath)
      ? args.filePath
      : path.resolve(context?.directory ?? process.cwd(), args.filePath)
    const content = fs.readFileSync(resolved, 'utf8')
    const allLines = content.split('\n')
    // offset is 1-indexed in the builtin interface
    const startIdx = args.offset !== undefined ? args.offset - 1 : 0
    const count = args.limit ?? 2000
    const slice = allLines.slice(startIdx, startIdx + count)
    // Prefix each line with its 1-indexed line number, matching builtin output format
    return slice.map((line, i) => `${startIdx + i + 1}: ${line}`).join('\n')
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
