/**
 * ExitPlanMode 工具输入的 plan 内容提取（P2）
 *
 * ## 背景
 *
 * 官方反编译版本假设 ExitPlanMode 的 input 是 `{ plan: string }` 的 Markdown。
 * 但实际 Claude Agent SDK（@anthropic-ai/claude-agent-sdk@0.1.77）中该工具声明为：
 *
 * ```ts
 * export interface ExitPlanModeInput {
 *   [k: string]: unknown
 * }
 * ```
 *
 * 即 **开放 schema**，由模型自己决定传什么字段。实测出现过以下几种形态：
 *   - `{ plan: "步骤1\n步骤2…" }`                      ← 反编译假设的理想形态
 *   - `{ allowedPrompts: [{prompt, tool}, …] }`        ← 新版 SDK 常见形态
 *   - `{ description, steps: [...] }`                  ← 结构化形态
 *   - 其它兜底情况（直接字符串、complicated object）
 *
 * 为避免用户看到"（模型未提供计划内容）"空白卡片，这里做宽松提取：
 *   1. 优先取 `plan` 字段（字符串 / 对象 / 数组均转为可读文本）
 *   2. 其次识别常见替代字段（`allowedPrompts` / `steps` / `description`）
 *   3. 都没有就整个对象 pretty-print 作为最后兜底
 */

interface AllowedPromptEntry {
  prompt?: string
  tool?: string
}

/** 字符串化任意值，确保人类可读 */
function stringifyForDisplay(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

/**
 * 将 `allowedPrompts` 数组渲染为 Markdown 样式的步骤列表。
 * 形如：
 *   - **Write** — create the foo file
 *   - **Bash** — run tests
 */
function renderAllowedPrompts(items: AllowedPromptEntry[]): string {
  return items
    .map((item) => {
      const tool = (item.tool || '').trim()
      const prompt = (item.prompt || '').trim()
      if (!tool && !prompt) return ''
      if (tool && prompt) return `- **${tool}** — ${prompt}`
      return `- ${tool || prompt}`
    })
    .filter(Boolean)
    .join('\n')
}

/**
 * 从 ExitPlanMode 工具的 input 对象中提取可读的计划内容文本。
 *
 * @param input tool_confirm.input（通常是 JSON 对象，也可能是字符串）
 * @returns 空字符串表示完全无法提取（此时 PlanModeCard 会显示占位符）
 */
export function extractPlanContent(input: unknown): string {
  if (input == null) return ''
  if (typeof input === 'string') return input

  if (typeof input !== 'object') return ''

  const obj = input as Record<string, unknown>

  // 1. 优先使用 plan 字段（反编译假设的理想形态）
  if (typeof obj.plan === 'string' && obj.plan.trim()) {
    return obj.plan
  }
  if (obj.plan && typeof obj.plan === 'object') {
    return stringifyForDisplay(obj.plan)
  }

  // 2. allowedPrompts: [{prompt, tool}]（新版 SDK 形态）
  if (Array.isArray(obj.allowedPrompts) && obj.allowedPrompts.length > 0) {
    const rendered = renderAllowedPrompts(obj.allowedPrompts as AllowedPromptEntry[])
    if (rendered) return rendered
  }

  // 3. description + steps 结构化形态
  const parts: string[] = []
  if (typeof obj.description === 'string' && obj.description.trim()) {
    parts.push(obj.description)
  }
  if (Array.isArray(obj.steps) && obj.steps.length > 0) {
    const stepsText = obj.steps
      .map((s, i) => {
        if (typeof s === 'string') return `${i + 1}. ${s}`
        if (s && typeof s === 'object' && 'text' in s && typeof (s as any).text === 'string') {
          return `${i + 1}. ${(s as any).text}`
        }
        return `${i + 1}. ${stringifyForDisplay(s)}`
      })
      .join('\n')
    if (stepsText) parts.push(stepsText)
  }
  if (parts.length > 0) return parts.join('\n\n')

  // 4. 兜底：整个对象 JSON pretty-print（至少用户能看到原始内容）
  return stringifyForDisplay(obj)
}
