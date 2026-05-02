/**
 * 全局 opencode tool override / 新增工具：question
 *
 * 作用：让 LLM 在执行中向用户提问（类似 Tencent SDK 的 AskUserQuestion）。
 *
 * OpenCode 原生有 question 工具但 ACP 模式默认禁用（`OPENCODE_CLIENT=acp`），
 * 且即便开启也没通过 ACP 协议路由（bus 事件没 subscriber）。我们自己实现一个同名
 * custom tool 覆盖它（同名 custom > builtin）。
 *
 * 运行时行为：
 *   execute 调用 server 的 /api/agent/internal/ask-user HTTP endpoint
 *   server 挂起响应，直到下一轮 prompt 的 askAnswers 到达 → res.json(answers)
 *   execute 拿到答案 → 格式化成文本返回给 LLM
 *
 * env 契约（由 server spawn opencode 时注入）：
 *   ASK_USER_URL            — 完整 URL，如 http://127.0.0.1:3001/api/agent/internal/ask-user
 *   ASK_USER_TOKEN          — 共享认证 token（X-Internal-Token header）
 *   ASK_USER_CONVERSATION_ID — 当前会话 id
 *
 * 如果 env 未配置（例如老版 runtime 或手动调 opencode）：
 *   → 返回一个提示文本告诉 LLM"无法向用户提问"，LLM 可改用文本方式沟通
 */
import { z } from 'zod'

const OptionSchema = z.object({
  label: z.string().describe('Short display text (1-5 words)'),
  description: z.string().optional().describe('Explanation of this choice'),
})

const QuestionSchema = z.object({
  header: z.string().describe('Short label for this question (max 30 chars)'),
  question: z.string().describe('The full question text'),
  options: z.array(OptionSchema).describe('Predefined choices; user can also type custom answer'),
  multiple: z.boolean().optional().describe('Allow multiple selection'),
})

export default {
  description:
    'Ask the user one or more multiple-choice questions during execution. Use this when you need a decision or clarification that can be expressed as a choice. Each question has a `header` (short label), `question` (full text), and `options` (list of {label, description}). Users may also type custom answers.',
  args: {
    questions: z.array(QuestionSchema).describe('Questions to ask'),
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

    // 用 opencode 给的 callID 作为 toolCallId（与 tool_call 事件的 id 保持一致，
    // 方便前端关联；如 ctx 缺失就用 sessionID + 时间戳退兜）
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

      // 格式化答案成 LLM 友好文本
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
