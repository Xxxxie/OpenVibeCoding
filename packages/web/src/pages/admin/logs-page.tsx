import { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import { Badge } from '../../components/ui/badge'

interface AdminLog {
  id: string
  adminUserId: string
  action: string
  targetUserId: string | null
  details: string | null
  ipAddress: string | null
  userAgent: string | null
  createdAt: number
}

const actionLabels: Record<string, string> = {
  user_disable: '禁用用户',
  user_enable: '启用用户',
  user_role_change: '角色变更',
  password_reset: '密码重置',
}

export function AdminLogsPage() {
  const [logs, setLogs] = useState<AdminLog[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)

  useEffect(() => {
    loadLogs()
  }, [page])

  async function loadLogs() {
    setLoading(true)
    try {
      const data = (await api.get(`/api/admin/logs?page=${page}&limit=50`)) as { logs: AdminLog[] }
      setLogs(data.logs || [])
    } catch (error) {
      console.error('Failed to load logs:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">操作日志</h1>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">加载中...</div>
      ) : logs.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">暂无操作日志</div>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <div key={log.id} className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <Badge>{actionLabels[log.action] || log.action}</Badge>
                <span className="text-sm text-muted-foreground">{new Date(log.createdAt).toLocaleString()}</span>
              </div>
              <div className="text-sm space-y-1">
                <p>操作人ID: {log.adminUserId}</p>
                {log.targetUserId && <p>目标用户ID: {log.targetUserId}</p>}
                {log.details && <p className="text-muted-foreground">{log.details}</p>}
                {log.ipAddress && <p className="text-xs text-muted-foreground">IP: {log.ipAddress}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
