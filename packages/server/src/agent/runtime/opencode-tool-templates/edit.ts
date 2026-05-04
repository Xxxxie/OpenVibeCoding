/**
 * Global opencode tool override: edit
 * 覆盖 opencode builtin edit tool，沙箱模式下通过 HTTP 路由到 SCF 沙箱。
 *
 * Schema 与 opencode builtin 完全对齐（v1.14.33 src/tool/edit.ts）。
 * 如果 opencode 版本升级导致 builtin schema 变更，需同步更新本文件。
 *
 * 运行时行为：
 *   SANDBOX_MODE=1 → fetch SANDBOX_BASE_URL/api/tools/edit
 *   否则          → 本地字符串替换
 */
import { z } from 'zod'
import fs from 'node:fs'
import path from 'node:path'

export default {
  description:
    'Performs exact string replacements in files.\n\n' +
    'Usage:\n' +
    '- You must use your Read tool at least once before editing. This tool will error if you attempt an edit without reading the file.\n' +
    '- The edit will FAIL if oldString is not found in the file.\n' +
    '- The edit will FAIL if oldString is found multiple times; use replaceAll or provide more context.\n' +
    '- Use replaceAll for replacing and renaming strings across the file.\n' +
    '- In sandbox mode, use relative paths (no leading /); they resolve against the session working directory.',
  args: {
    filePath: z.string().describe('The absolute path to the file to modify'),
    oldString: z.string().describe('The text to replace'),
    newString: z
      .string()
      .describe('The text to replace it with (must be different from oldString)'),
    replaceAll: z
      .boolean()
      .optional()
      .describe('Replace all occurrences of oldString (default false)'),
  },
  async execute(
    args: { filePath: string; oldString: string; newString: string; replaceAll?: boolean },
    context: { directory?: string },
  ) {
    if (process.env.SANDBOX_MODE === '1') {
      return await sandboxCall('edit', {
        path: args.filePath,
        oldString: args.oldString,
        newString: args.newString,
        replaceAll: args.replaceAll ?? false,
      })
    }
    const resolved = path.isAbsolute(args.filePath)
      ? args.filePath
      : path.resolve(context?.directory ?? process.cwd(), args.filePath)
    const content = fs.readFileSync(resolved, 'utf8')
    if (!content.includes(args.oldString)) {
      throw new Error(`oldString not found in content of ${resolved}`)
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
