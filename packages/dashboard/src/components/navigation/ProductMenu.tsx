import { useLocation } from 'react-router-dom'
import { DatabaseMenu } from './DatabaseMenu'
import { StorageMenu } from './StorageMenu'
import { HomeMenu } from './HomeMenu'
import { SqlMenu } from './SqlMenu'
import { FunctionsMenu } from './FunctionsMenu'

export const ProductMenu = () => {
  const location = useLocation()

  const getTitle = () => {
    if (location.pathname.startsWith('/database')) return '数据库'
    if (location.pathname.startsWith('/storage')) return '存储'
    if (location.pathname.startsWith('/sql')) return 'SQL 编辑器'
    if (location.pathname.startsWith('/functions')) return '云函数'
    return '首页'
  }

  return (
    <div className="flex flex-col w-full h-full hide-scrollbar bg-bg-sidebar/90 backdrop-blur-md border-r border-border-muted">
      {/* Header */}
      <div className="flex min-h-12 items-center border-b border-border-muted px-4 bg-bg-surface-100/30">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-brand shadow-[0_0_6px_hsl(225_84%_53%/0.8)]" />
          <h4 className="text-xs font-semibold text-fg-lighter uppercase tracking-widest">{getTitle()}</h4>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {location.pathname.startsWith('/database') && <DatabaseMenu />}
        {location.pathname.startsWith('/storage') && <StorageMenu />}
        {location.pathname.startsWith('/sql') && <SqlMenu />}
        {location.pathname.startsWith('/functions') && <FunctionsMenu />}
        {location.pathname === '/' && <HomeMenu />}
      </div>
    </div>
  )
}
