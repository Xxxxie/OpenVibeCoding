import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router'
import { api } from '../../lib/api'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table'
import { toast } from 'sonner'

interface TaskItem {
  id: string
  userId: string
  username: string
  title: string | null
  prompt: string
  status: string
  selectedAgent: string | null
  repoUrl: string | null
  createdAt: number
  completedAt: number | null
}

interface UserOption {
  userId: string
  username: string
}

const statusLabels: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { label: '等待中', variant: 'outline' },
  processing: { label: '执行中', variant: 'default' },
  completed: { label: '已完成', variant: 'secondary' },
  error: { label: '失败', variant: 'destructive' },
  stopped: { label: '已停止', variant: 'outline' },
}

function formatTimeAgo(ts: number) {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins} 分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} 天前`
  return new Date(ts).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

export function AdminTasksPage() {
  const navigate = useNavigate()
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [userFilter, setUserFilter] = useState('')
  const [userOptions, setUserOptions] = useState<UserOption[]>([])

  // Load user list for filter dropdown
  useEffect(() => {
    api
      .get<{ users: { id: string; username: string }[] }>('/api/admin/users')
      .then((data) => {
        setUserOptions(data.users.map((u) => ({ userId: u.id, username: u.username })))
      })
      .catch(() => {})
  }, [])

  const loadTasks = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' })
      if (statusFilter) params.set('status', statusFilter)
      if (userFilter) params.set('userId', userFilter)
      const data = (await api.get(`/api/admin/tasks?${params}`)) as {
        tasks: TaskItem[]
        pagination: { totalPages: number }
      }
      setTasks(data.tasks)
      setTotalPages(data.pagination.totalPages)
    } catch {
      toast.error('加载任务列表失败')
    } finally {
      setLoading(false)
    }
  }, [page, statusFilter, userFilter])

  useEffect(() => {
    loadTasks()
  }, [loadTasks])

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">任务管理</h1>
          <p className="text-sm text-muted-foreground mt-0.5">查看所有用户的任务执行情况</p>
        </div>
        <div className="flex items-center gap-2">
          {/* User filter */}
          <select
            value={userFilter}
            onChange={(e) => {
              setUserFilter(e.target.value)
              setPage(1)
            }}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">全部用户</option>
            {userOptions.map((u) => (
              <option key={u.userId} value={u.userId}>
                {u.username}
              </option>
            ))}
          </select>
          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value)
              setPage(1)
            }}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">全部状态</option>
            <option value="pending">等待中</option>
            <option value="processing">执行中</option>
            <option value="completed">已完成</option>
            <option value="error">失败</option>
            <option value="stopped">已停止</option>
          </select>
        </div>
      </div>

      {/* Task Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">加载中...</div>
      ) : tasks.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">暂无任务</div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Prompt / ID</TableHead>
                <TableHead className="w-[100px]">用户</TableHead>
                <TableHead className="w-[80px]">状态</TableHead>
                <TableHead className="w-[80px]">Agent</TableHead>
                <TableHead className="w-[140px]">仓库</TableHead>
                <TableHead className="w-[120px]">创建时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((task) => {
                const meta = statusLabels[task.status] || { label: task.status, variant: 'outline' as const }
                return (
                  <TableRow
                    key={task.id}
                    className="cursor-pointer hover:bg-accent/50"
                    onClick={() => navigate(`/admin/tasks/${task.id}`)}
                  >
                    <TableCell>
                      <div className="min-w-0 max-w-[320px]">
                        <div className="text-sm truncate" title={task.prompt}>
                          {task.prompt || task.title || '-'}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono mt-0.5">{task.id}</div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{task.username}</TableCell>
                    <TableCell>
                      <Badge variant={meta.variant} className="text-[11px]">
                        {meta.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{task.selectedAgent || '-'}</TableCell>
                    <TableCell>
                      {task.repoUrl ? (
                        <code className="text-[11px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded truncate block max-w-[140px]">
                          {task.repoUrl.replace(/^https?:\/\/github\.com\//, '')}
                        </code>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatTimeAgo(task.createdAt)}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 pt-4">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
            上一页
          </Button>
          <span className="py-1.5 px-3 text-sm text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>
            下一页
          </Button>
        </div>
      )}
    </div>
  )
}
