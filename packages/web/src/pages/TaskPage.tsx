import { useParams } from 'react-router'
import { TaskPageClient } from '@/components/task-page-client'

export function TaskPage() {
  const { taskId } = useParams<{ taskId: string }>()

  if (!taskId) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">No task ID provided</p>
      </div>
    )
  }

  return <TaskPageClient taskId={taskId} user={null} authProvider={null} />
}
