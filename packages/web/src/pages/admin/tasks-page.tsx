import { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import { Badge } from '../../components/ui/badge'

export function AdminTasksPage() {
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(false)
  }, [])

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">任务管理</h1>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">加载中...</div>
      ) : (
        <div className="border rounded-lg p-4">
          <p className="text-muted-foreground text-sm">此功能需要后端实现 tasks.findAll() 方法，支持按用户和状态过滤</p>
        </div>
      )}
    </div>
  )
}
