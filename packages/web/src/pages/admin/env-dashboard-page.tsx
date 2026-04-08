import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router'
import { api } from '../../lib/api'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { CloudDashboard } from '@coder/dashboard/CloudDashboard'
import { toast } from 'sonner'
import { ArrowLeft, Loader2 } from 'lucide-react'

interface UserInfo {
  id: string
  username: string
  email: string | null
  role: 'user' | 'admin'
  status: 'active' | 'disabled'
}

interface ResourceInfo {
  status: string
  envId: string | null
  credentialType: 'permanent' | 'temp'
}

export function AdminEnvDashboardPage() {
  const { userId } = useParams<{ userId: string }>()
  const navigate = useNavigate()
  const [user, setUser] = useState<UserInfo | null>(null)
  const [resource, setResource] = useState<ResourceInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('dark')

  useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark')
    setResolvedTheme(isDark ? 'dark' : 'light')
  }, [])

  useEffect(() => {
    if (!userId) return
    loadUserInfo()
  }, [userId])

  async function loadUserInfo() {
    setLoading(true)
    try {
      const data = (await api.get(`/api/admin/users/${userId}`)) as {
        user: UserInfo
        resource: ResourceInfo | null
      }
      setUser(data.user)
      setResource(data.resource)
    } catch {
      toast.error('加载用户信息失败')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!user) {
    return <div className="flex items-center justify-center h-96 text-muted-foreground">用户不存在</div>
  }

  const envId = resource?.envId

  if (!envId) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-3">
        <p className="text-muted-foreground">该用户尚未分配环境</p>
        <Button variant="outline" size="sm" onClick={() => navigate('/admin/users')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          返回用户列表
        </Button>
      </div>
    )
  }

  const apiBase = `/api/admin/proxy/${envId}`

  return (
    <div className="flex flex-col -mx-4 -mb-4 -mt-0 h-[calc(100vh-7.5rem)]">
      {/* Top bar with back navigation */}
      <div className="flex items-center gap-3 px-4 py-2 border-b bg-background shrink-0">
        <Button variant="outline" size="sm" onClick={() => navigate('/admin/users')}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          用户管理
        </Button>
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{user.username}</span>
          <Badge variant="secondary" className="text-[10px]">
            {user.role === 'admin' ? '管理员' : '用户'}
          </Badge>
        </div>
        <div className="h-4 w-px bg-border" />
        <code className="text-xs font-mono text-muted-foreground">{envId}</code>
        {resource?.credentialType && (
          <>
            <div className="h-4 w-px bg-border" />
            <Badge
              variant={resource.credentialType === 'permanent' ? 'outline' : 'secondary'}
              className={
                resource.credentialType === 'permanent' ? 'text-[10px] text-green-600 border-green-200' : 'text-[10px]'
              }
            >
              {resource.credentialType === 'permanent' ? '永久密钥' : '临时密钥'}
            </Badge>
          </>
        )}
      </div>

      {/* Dashboard - fills remaining space */}
      <div className="flex-1 overflow-hidden">
        <CloudDashboard envId={envId} apiBase={apiBase} theme={resolvedTheme} style={{ height: '100%' }} />
      </div>
    </div>
  )
}
