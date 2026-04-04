import { Link, useLocation } from 'react-router'
import { useTasks } from '../../hooks/use-tasks'
import { cn } from '../../lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Plus, Menu, AlertCircle, Loader2 } from 'lucide-react'
import { useState } from 'react'

interface AppLayoutProps {
  children: React.ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  const { tasks, isLoading } = useTasks()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <Badge
            variant="secondary"
            className="text-[10px] px-1.5 py-0 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
          >
            Done
          </Badge>
        )
      case 'processing':
        return (
          <Badge
            variant="secondary"
            className="text-[10px] px-1.5 py-0 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
          >
            Running
          </Badge>
        )
      case 'error':
        return (
          <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
            Error
          </Badge>
        )
      case 'stopped':
        return (
          <Badge
            variant="secondary"
            className="text-[10px] px-1.5 py-0 bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
          >
            Stopped
          </Badge>
        )
      default:
        return (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            Pending
          </Badge>
        )
    }
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <div
        className={cn(
          'h-full border-r bg-muted flex flex-col shrink-0 transition-all duration-300',
          sidebarOpen ? 'w-72' : 'w-0 overflow-hidden',
        )}
      >
        <div className="px-3 pt-5 pb-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium tracking-wide text-foreground px-2 py-1">Tasks</span>
            <div className="flex items-center gap-1">
              <Link to="/">
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="New Task">
                  <Plus className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1">
          {isLoading ? (
            <Card>
              <CardContent className="p-3 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading tasks...
              </CardContent>
            </Card>
          ) : tasks.length === 0 ? (
            <Card>
              <CardContent className="p-3 text-center text-xs text-muted-foreground">
                No tasks yet. Create your first task!
              </CardContent>
            </Card>
          ) : (
            tasks.map((task) => {
              const isActive = location.pathname === `/tasks/${task.id}`
              const displayText = task.title || task.prompt
              const truncatedText = displayText.slice(0, 50) + (displayText.length > 50 ? '...' : '')

              return (
                <Link
                  key={task.id}
                  to={`/tasks/${task.id}`}
                  className={cn('block rounded-lg', isActive && 'ring-1 ring-primary/50 ring-offset-0')}
                >
                  <Card
                    className={cn(
                      'cursor-pointer transition-colors hover:bg-accent p-0 rounded-lg',
                      isActive && 'bg-accent',
                    )}
                  >
                    <CardContent className="px-3 py-2">
                      <div className="flex gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <h3
                              className={cn(
                                'text-xs font-medium truncate mb-0.5',
                                task.status === 'processing' &&
                                  'bg-gradient-to-r from-muted-foreground from-20% via-white via-50% to-muted-foreground to-80% bg-clip-text text-transparent bg-[length:300%_100%] animate-[shimmer_1.5s_linear_infinite]',
                              )}
                            >
                              {truncatedText}
                            </h3>
                            {task.status === 'error' && <AlertCircle className="h-3 w-3 text-red-500 flex-shrink-0" />}
                            {task.status === 'stopped' && (
                              <AlertCircle className="h-3 w-3 text-orange-500 flex-shrink-0" />
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {getStatusBadge(task.status)}
                            {task.selectedAgent && <span className="truncate capitalize">{task.selectedAgent}</span>}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              )
            })
          )}
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header with menu toggle */}
        <div className="px-3 pt-3 pb-1.5 flex items-center">
          <Button onClick={() => setSidebarOpen(!sidebarOpen)} variant="ghost" size="sm" className="h-8 w-8 p-0">
            <Menu className="h-4 w-4" />
          </Button>
        </div>
        {/* Page content */}
        <div className="flex-1 overflow-hidden">{children}</div>
      </div>
    </div>
  )
}
