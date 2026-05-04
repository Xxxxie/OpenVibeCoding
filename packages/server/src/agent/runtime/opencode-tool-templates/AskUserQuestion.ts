/**
 * AskUserQuestion custom tool — 对齐 Tencent AskUserQuestion 契约
 *
 * 这不是 opencode builtin tool 的 override，而是我们新增的 custom tool。
 * opencode 原生的 question tool 在 ACP 模式默认禁用且无 ACP 路由，
 * 因此我们自行实现。工具名和 schema 对齐 Tencent SDK 的 AskUserQuestion。
 *
 * 版本声明（用于 check:tool-schemas 脚本识别）：
 *   custom tool, not synced from opencode v1.14.33 src/tool/
 *
 * Schema 来源：packages/web/src/types/task-chat.ts:AskUserQuestionData
 *   - 前端 `task-chat.tsx` 按 `part.toolName === 'AskUserQuestion'` 匹配渲染
 *     AskUserForm；用其他名字前端识别不到
 *   - 前端从 `part.input.questions` 取字段，结构必须是
 *     `{ question, header, options:[{label, description}], multiSelect }`
 *   - askAnswers resume 契约也已存在：
 *     `{ [assistantMessageId]: { toolCallId, answers: { [header]: value } } }`
 *
 * OpenCode 文件名约定：文件名 = tool id（ACP tool_call.title）
 * 所以文件名 `AskUserQuestion.ts` → opencode 注册的 tool id `AskUserQuestion`
 * → 我们 runtime 把 ACP tool_call.title 透传为 AgentCallbackMessage.name
 * → convertToSessionUpdate 把 name 放到 sessionUpdate.title
 * → 前端 part.toolName = 'AskUserQuestion' ✓
 *
 * 运行时行为：
 *   - execute 发 fetch 到 ASK_USER_URL 阻塞等答案
 *   - 收到答案格式：{ ok: true, answers: { [header]: value } }
 *   - 格式化文本返回给 LLM
 *
 * env 契约（由 server spawn opencode 时注入）：
 *   ASK_USER_URL            — server 本地回环 endpoint
 *   ASK_USER_TOKEN          — shared secret，X-Internal-Token header
 *   ASK_USER_CONVERSATION_ID — 当前会话 id
 */
import { z } from 'zod'

const OptionSchema = z.object({
  label: z.string().describe('Short display text (1-5 words)'),
  description: z.string().describe('Explanation of what this option means or its implications'),
})

const QuestionSchema = z.object({
  question: z.string().describe('The complete question text (ends with ?)'),
  header: z
    .string()
    .max(30)
    .describe('Very short label for this question (max 30 chars, e.g. "Database", "Framework")'),
  options: z.array(OptionSchema).min(2).max(4).describe('2-4 available choices'),
  multiSelect: z.boolean().optional().describe('true = user may select multiple; false (default) = single selection'),
})

export default {
  description:
    'Ask the user one or more multiple-choice questions during execution. Use this when you need a decision or clarification that can be expressed as choices. Each question has a `question` (full text), `header` (short label), `options` (2-4 choices, each with `label` and `description`), and `multiSelect` (default false). The user may also type a custom answer.',
  args: {
    questions: z.array(QuestionSchema).min(1).describe('Questions to ask'),
  },
  async execute(
    args: { questions: Array<z.infer<typeof QuestionSchema>> },
    context: { sessionID?: string; callID?: string },
  ) {
    const url = process.env.ASK_USER_URL
    const token = process.env.ASK_USER_TOKEN
    const conversationId = process.env.ASK_USER_CONVERSATION_ID

    if (!url || !token || !conversationId) {
      return {
        output:
          'Cannot ask questions: AskUser HTTP endpoint is not configured in this environment (ASK_USER_URL missing). Please ask the user directly in your next text response instead.',
      }
    }

    // 用 opencode 的 callID 作为 toolCallId，与 tool_call 事件的 toolCallId 对齐
    const toolCallId = context.callID || `ask-${context.sessionID ?? 'unknown'}-${Date.now()}`

    const timeoutMs = Number(process.env.ASK_USER_TIMEOUT_MS || 10 * 60 * 1000)

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Token': token,
        },
        body: JSON.stringify({
          conversationId,
          toolCallId,
          questions: args.questions,
        }),
        signal: AbortSignal.timeout(timeoutMs + 5_000),
      })

      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        answers?: Record<string, string>
        error?: string
      }

      if (!res.ok || !data.ok || !data.answers) {
        return {
          output: `Failed to get user answer: ${data.error ?? 'unknown error'} (status=${res.status}). Consider asking via plain text.`,
        }
      }

      // 格式化答案给 LLM（answer key 是 question.header）
      const formatted = args.questions
        .map((q) => {
          const a = data.answers![q.header]
          return `"${q.question}" → ${a || '(unanswered)'}`
        })
        .join('; ')

      return {
        output: `User answered: ${formatted}. You can continue with these answers in mind.`,
        metadata: {
          answers: data.answers,
        },
      }
    } catch (e) {
      const msg = (e as Error).message
      return {
        output: `Error asking user (${msg}). You can try asking via plain text in your next response.`,
      }
    }
  },
}
