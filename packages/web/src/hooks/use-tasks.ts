import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'
import type { Task } from '@coder/shared'

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchTasks = useCallback(async () => {
    try {
      const data = await api.get<{ tasks: Task[] }>('/api/tasks')
      setTasks(data.tasks)
    } catch {
      setTasks([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  return { tasks, isLoading, refreshTasks: fetchTasks }
}
