import { useMemo, useState } from 'react'
import { CheckCircle2, Circle, Loader2, ListTodo, ChevronDown, ChevronRight, CirclePause } from 'lucide-react'
import type { TaskMessage, MessagePart } from '@/types/task-chat'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DerivedTask {
  id: string
  subject: string
  status: 'pending' | 'in_progress' | 'completed'
  activeForm?: string
  owner?: string
}

// ---------------------------------------------------------------------------
// Helpers — safely parse tool input (may be object from SSE or JSON string from DB)
// ---------------------------------------------------------------------------

function parseInput(raw: unknown): Record<string, unknown> {
  if (!raw) return {}
  if (typeof raw === 'object') return raw as Record<string, unknown>
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw)
    } catch {
      return {}
    }
  }
  return {}
}

// ---------------------------------------------------------------------------
// deriveTasks — extract tasks from multiple sources:
//   1. CodeBuddy SDK: TaskCreate + TaskUpdate 工具（task id 来自 result 里的 "Task #N"）
//   2. OpenCode: todowrite / TodoWrite 工具（一次性全量 todos 数组）
// ---------------------------------------------------------------------------

/** 支持 CodeBuddy TaskCreate / OpenCode todowrite 两种工具名 */
const TASK_CREATE_TOOLS = new Set(['TaskCreate'])
const TASK_UPDATE_TOOLS = new Set(['TaskUpdate'])
const TODO_WRITE_TOOLS = new Set(['todowrite', 'TodoWrite'])

interface TodoItemInput {
  content?: string
  activeForm?: string
  status?: 'pending' | 'in_progress' | 'completed'
  priority?: string
}

export function deriveTasks(messages: TaskMessage[]): DerivedTask[] {
  const tasks: Record<string, DerivedTask> = {}

  // 记录按时间顺序最近一次 todoWrite 调用的 message/partIndex，
  // 用于判断哪个 todoWrite 是当前权威版本（后覆盖前）。
  let lastTodoWriteSnapshot: DerivedTask[] | null = null

  for (const msg of messages) {
    if (!msg.parts) continue
    for (const part of msg.parts) {
      // ─── 1. OpenCode todowrite：一次性全量 todos 数组 ───────────
      if (part.type === 'tool_call' && TODO_WRITE_TOOLS.has(part.toolName)) {
        const input = parseInput(part.input)
        const todos = Array.isArray(input.todos) ? (input.todos as TodoItemInput[]) : []
        lastTodoWriteSnapshot = todos
          .filter((t) => t && (t.content || t.activeForm))
          .map((t, idx) => ({
            id: `todo-${idx + 1}`,
            subject: t.content ? String(t.content) : '',
            status: (t.status === 'completed' || t.status === 'in_progress'
              ? t.status
              : 'pending') as DerivedTask['status'],
            activeForm: t.activeForm ? String(t.activeForm) : undefined,
          }))
        continue
      }

      // ─── 2. CodeBuddy TaskCreate / TaskUpdate ────────────────────
      if (part.type === 'tool_call' && TASK_CREATE_TOOLS.has(part.toolName)) {
        const input = parseInput(part.input)

        // Find matching tool_result to extract task ID
        const resultPart: MessagePart | undefined = msg.parts?.find(
          (p) => p.type === 'tool_result' && p.toolCallId === part.toolCallId,
        )
        const resultText: string = typeof (resultPart as any)?.content === 'string' ? (resultPart as any).content : ''

        const match: RegExpMatchArray | null = resultText.match(/Task #(\d+)/)
        const taskId = match ? match[1] : `t-${Object.keys(tasks).length + 1}`

        tasks[taskId] = {
          id: taskId,
          subject: input.subject ? String(input.subject) : '',
          status: 'pending',
          activeForm: input.activeForm ? String(input.activeForm) : undefined,
          owner: input.owner ? String(input.owner) : undefined,
        }
      } else if (part.type === 'tool_call' && TASK_UPDATE_TOOLS.has(part.toolName)) {
        const input = parseInput(part.input)
        const taskId = input.taskId ? String(input.taskId) : undefined
        if (!taskId || !tasks[taskId]) continue

        if (input.status === 'deleted') {
          delete tasks[taskId]
          continue
        }
        const task = tasks[taskId]
        if (input.status) task.status = String(input.status) as DerivedTask['status']
        if (input.subject) task.subject = String(input.subject)
        if (input.activeForm) task.activeForm = String(input.activeForm)
        if (input.owner !== undefined) task.owner = input.owner ? String(input.owner) : undefined
      }
    }
  }

  // 如果存在 todoWrite 快照，它作为权威来源（覆盖 CodeBuddy 的 task 列表，
  // 两者不会同时存在于同一会话）。若想都保留，可以 spread concat。
  if (lastTodoWriteSnapshot && lastTodoWriteSnapshot.length > 0) {
    return lastTodoWriteSnapshot
  }

  return Object.values(tasks)
}

// ---------------------------------------------------------------------------
// TaskStatusIcon
// ---------------------------------------------------------------------------

function TaskStatusIcon({ status, isStreaming }: { status: string; isStreaming: boolean }) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 size={14} className="text-green-500 flex-shrink-0" />
    case 'in_progress':
      return isStreaming ? (
        <Loader2 size={14} className="text-primary flex-shrink-0 animate-spin" />
      ) : (
        <CirclePause size={14} className="text-yellow-500 flex-shrink-0" />
      )
    default:
      return <Circle size={14} className="text-muted-foreground flex-shrink-0" />
  }
}

// ---------------------------------------------------------------------------
// TaskListPanel
// ---------------------------------------------------------------------------

interface TaskListPanelProps {
  messages: TaskMessage[]
  isStreaming?: boolean
}

export function TaskListPanel({ messages, isStreaming = true }: TaskListPanelProps) {
  const tasks = useMemo(() => deriveTasks(messages), [messages])
  const [isCollapsed, setIsCollapsed] = useState(false)

  if (tasks.length === 0) return null

  const completedCount = tasks.filter((t) => t.status === 'completed').length
  const allCompleted = completedCount === tasks.length
  const activeTask = tasks.find((t) => t.status === 'in_progress')
  const label = activeTask ? activeTask.activeForm || activeTask.subject : `${completedCount}/${tasks.length}`

  // Auto-collapse when all done
  if (allCompleted && !isCollapsed) {
    // Will collapse on next render via useEffect is cleaner, but for simplicity:
  }

  return (
    <div className="flex-none px-3 pb-1">
      <div className="rounded-lg border border-border/40 bg-muted/30 overflow-hidden">
        <button
          onClick={() => setIsCollapsed((prev) => !prev)}
          className="flex items-center gap-2 w-full px-3 py-1.5 hover:bg-muted/50 transition-colors cursor-pointer text-left"
        >
          {isCollapsed ? (
            <ChevronRight size={13} className="text-muted-foreground flex-shrink-0" />
          ) : (
            <ChevronDown size={13} className="text-muted-foreground flex-shrink-0" />
          )}
          <ListTodo size={13} className="text-muted-foreground flex-shrink-0" />
          <span className="text-xs text-muted-foreground truncate">{label}</span>
          {!isCollapsed && tasks.length > 1 && (
            <span className="text-[10px] text-muted-foreground ml-auto flex-shrink-0">
              {completedCount}/{tasks.length}
            </span>
          )}
        </button>

        {!isCollapsed && (
          <div className="px-3 py-1.5 space-y-0.5 max-h-52 overflow-y-auto border-t border-border/30">
            {tasks.map((task, idx) => (
              <div key={task.id} className="flex items-center gap-2 py-0.5 text-xs">
                <TaskStatusIcon status={task.status} isStreaming={isStreaming} />
                <span className={`truncate ${task.status === 'completed' ? 'line-through text-muted-foreground' : ''}`}>
                  {idx + 1}. {task.status === 'in_progress' ? task.activeForm || task.subject : task.subject}
                </span>
                {task.owner && (
                  <span className="text-[10px] font-medium flex-shrink-0 ml-auto text-muted-foreground">
                    @{task.owner}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
