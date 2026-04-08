import { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import { Badge } from '../../components/ui/badge'

interface Environment {
  id: string
  userId: string
  status: string
  envId: string | null
  camUsername: string | null
  createdAt: number
}

export function AdminEnvironmentsPage() {
  const [environments, setEnvironments] = useState<Environment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadEnvironments()
  }, [])

  async function loadEnvironments() {
    setLoading(true)
    try {
      const data = (await api.get('/api/admin/environments')) as { resources: Environment[] }
      setEnvironments(data.resources || [])
    } catch (error) {
      console.error('Failed to load environments:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">环境管理</h1>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">加载中...</div>
      ) : environments.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">暂无环境数据</div>
      ) : (
        <div className="border rounded-lg p-4">
          <p className="text-muted-foreground text-sm">此功能需要后端实现 userResources.findAll() 方法</p>
        </div>
      )}
    </div>
  )
}
