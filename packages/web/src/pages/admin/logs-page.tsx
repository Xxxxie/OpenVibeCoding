import { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import { Badge } from '../../components/ui/badge'
import { toast } from 'sonner'

interface AdminLog {
  id: string
  adminUserId: string
  action: string
  targetUserId: string | null
  details: string | null
  ipAddress: string | null
  createdAt: number
}

const actionLabels: Record<string, { label: string; color: string }> = {
  user_disable: { label: '禁用用户', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  user_enable: { label: '启用用户', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  user_role_change: { label: '角色变更', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  password_reset: {
    label: '密码重置',
    color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  },
  user_create: { label: '创建用户', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
}

function formatTimeAgo(ts: number) {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins}分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}小时前`
  const days = Math.floor(hours / 24)
  return `${days}天前`
}

export function AdminLogsPage() {
  const [logs, setLogs] = useState<AdminLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadLogs()
  }, [])

  async function loadLogs() {
    setLoading(true)
    try {
      const data = (await api.get('/api/admin/logs?limit=100')) as { logs: AdminLog[] }
      setLogs(data.logs || [])
    } catch {
      toast.error('加载操作日志失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">操作日志</h1>
        <p className="text-sm text-muted-foreground mt-0.5">管理员操作记录</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">加载中...</div>
      ) : logs.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">暂无操作日志</div>
      ) : (
        <div className="space-y-0 divide-y divide-border rounded-md border">
          {logs.map((log) => {
            const meta = actionLabels[log.action] || { label: log.action, color: 'bg-muted text-muted-foreground' }
            let detailText = ''
            if (log.details) {
              try {
                const parsed = JSON.parse(log.details)
                detailText = Object.entries(parsed)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(', ')
              } catch {
                detailText = log.details
              }
            }
            return (
              <div key={log.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium whitespace-nowrap ${meta.color}`}
                >
                  {meta.label}
                </span>
                <span className="text-muted-foreground truncate flex-1">
                  {log.targetUserId && <span className="font-mono text-xs">{log.targetUserId.slice(0, 8)}</span>}
                  {detailText && <span className="ml-1 text-xs">{detailText}</span>}
                </span>
                <span className="text-xs text-muted-foreground whitespace-nowrap">{formatTimeAgo(log.createdAt)}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
