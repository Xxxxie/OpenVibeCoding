import { db } from '../db/client'
import { tasks } from '../db/schema'
import { eq } from 'drizzle-orm'
import type { ExtendedSessionUpdate } from '@coder/shared'

type LogLevel = 'info' | 'error' | 'success' | 'command'

interface LogEntry {
  type: LogLevel
  message: string
  timestamp: number
}

type ACPNotifyFn = (update: ExtendedSessionUpdate) => void

export class TaskLogger {
  private taskId: string
  private acpNotify?: ACPNotifyFn

  constructor(taskId: string) {
    this.taskId = taskId
  }

  registerACPNotifier(notify: ACPNotifyFn) {
    this.acpNotify = notify
  }

  private async appendLog(level: LogLevel, message: string) {
    const entry: LogEntry = { type: level, message, timestamp: Date.now() }

    try {
      const [task] = await db.select({ logs: tasks.logs }).from(tasks).where(eq(tasks.id, this.taskId)).limit(1)
      const existingLogs: LogEntry[] = task?.logs ? JSON.parse(task.logs) : []
      const newLogs = [...existingLogs, entry]

      await db
        .update(tasks)
        .set({ logs: JSON.stringify(newLogs), updatedAt: Date.now() })
        .where(eq(tasks.id, this.taskId))
    } catch {
      // Don't throw - logging failures should not break the main process
    }

    if (this.acpNotify) {
      this.acpNotify({ sessionUpdate: 'log', level, message, timestamp: entry.timestamp })
    }
  }

  async info(message: string) {
    await this.appendLog('info', message)
  }

  async error(message: string) {
    await this.appendLog('error', message)
  }

  async success(message: string) {
    await this.appendLog('success', message)
  }

  async command(message: string) {
    await this.appendLog('command', message)
  }

  async updateProgress(progress: number, message?: string) {
    try {
      if (message) {
        const entry: LogEntry = { type: 'info', message, timestamp: Date.now() }
        const [task] = await db.select({ logs: tasks.logs }).from(tasks).where(eq(tasks.id, this.taskId)).limit(1)
        const existingLogs: LogEntry[] = task?.logs ? JSON.parse(task.logs) : []
        const newLogs = [...existingLogs, entry]
        await db
          .update(tasks)
          .set({ progress, logs: JSON.stringify(newLogs), updatedAt: Date.now() })
          .where(eq(tasks.id, this.taskId))
      } else {
        await db.update(tasks).set({ progress, updatedAt: Date.now() }).where(eq(tasks.id, this.taskId))
      }
    } catch {
      // Don't throw
    }

    if (this.acpNotify) {
      const [task] = await db
        .select({ status: tasks.status })
        .from(tasks)
        .where(eq(tasks.id, this.taskId))
        .limit(1)
        .catch(() => [undefined])
      this.acpNotify({
        sessionUpdate: 'task_progress',
        progress,
        status: (task?.status ?? 'processing') as any,
      })
    }
  }

  async updateStatus(status: 'pending' | 'processing' | 'completed' | 'error' | 'stopped', error?: string) {
    try {
      const updateData: Record<string, unknown> = { status, updatedAt: Date.now() }
      if (status === 'completed') updateData.completedAt = Date.now()
      if (error) updateData.error = error
      await db
        .update(tasks)
        .set(updateData as any)
        .where(eq(tasks.id, this.taskId))
    } catch {
      // Don't throw
    }
  }
}

export function createTaskLogger(taskId: string): TaskLogger {
  return new TaskLogger(taskId)
}
