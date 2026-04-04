import { useState } from 'react'
import { useLocation, Link } from 'react-router-dom'
import {
  Home,
  Database,
  HardDrive,
  Sun,
  Moon,
  Code2,
  Zap,
  PanelLeftClose,
  PanelLeft,
  PanelLeftOpen,
} from 'lucide-react'
import { cn } from '../../utils/helpers'
import { useTheme } from '../../hooks/useTheme'

const NAV_ITEMS = [
  { path: '/', icon: Home, label: '首页' },
  { path: '/database', icon: Database, label: '数据库' },
  { path: '/storage', icon: HardDrive, label: '存储' },
  { path: '/sql', icon: Code2, label: 'SQL 编辑器' },
  { path: '/functions', icon: Zap, label: '云函数' },
]

type SidebarMode = 'icon' | 'hover' | 'expanded'

const MODE_CYCLE: SidebarMode[] = ['hover', 'expanded', 'icon']

const MODE_META: Record<SidebarMode, { label: string; icon: typeof PanelLeft }> = {
  icon: { label: '图标模式', icon: PanelLeftClose },
  hover: { label: 'Hover 展开', icon: PanelLeft },
  expanded: { label: '固定展开', icon: PanelLeftOpen },
}

export const NavigationIconRail = () => {
  const location = useLocation()
  const { theme, toggleTheme } = useTheme()
  const [mode, setMode] = useState<SidebarMode>('hover')
  const [hovered, setHovered] = useState(false)

  const cycleMode = (e: React.MouseEvent) => {
    e.stopPropagation()
    setMode((prev) => {
      const idx = MODE_CYCLE.indexOf(prev)
      return MODE_CYCLE[(idx + 1) % MODE_CYCLE.length]
    })
  }

  const isExpanded = mode === 'expanded' || (mode === 'hover' && hovered)

  const { label: modeLabel, icon: ModeIcon } = MODE_META[mode]

  return (
    <aside
      className={cn(
        'flex flex-col items-start shrink-0 bg-bg-alternative border-r border-border-muted relative z-40',
        'transition-[width] duration-200 ease-in-out overflow-hidden',
        isExpanded ? 'w-48' : 'w-12',
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* 顶部品牌光晕 */}
      <div className="absolute top-0 left-0 right-0 h-20 bg-gradient-to-b from-brand/5 to-transparent pointer-events-none" />

      {/* Logo */}
      <div className="flex h-11 w-full items-center border-b border-border-muted shrink-0 relative z-10 overflow-hidden">
        <div className="flex items-center gap-3 pl-2 pr-3 min-w-0">
          <div className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand text-white text-[10px] font-bold">
            CB
            <div className="absolute inset-0 rounded-md bg-brand opacity-30 blur-sm -z-10 scale-125" />
          </div>
          <span
            className={cn(
              'text-sm font-semibold text-fg-default whitespace-nowrap transition-all duration-200',
              isExpanded ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2 pointer-events-none',
            )}
          >
            CloudBase
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 w-full flex flex-col gap-0.5 py-2 px-1.5 relative z-10 overflow-hidden">
        {NAV_ITEMS.map((item) => {
          const isActive = item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path)
          const Icon = item.icon
          return (
            <Link
              key={item.path}
              to={item.path}
              title={isExpanded ? undefined : item.label}
              className={cn(
                'relative flex h-9 items-center gap-3 pl-2 pr-3 rounded-md transition-all duration-150 overflow-hidden',
                isActive
                  ? 'bg-bg-surface-400 text-fg-default'
                  : 'text-fg-muted hover:bg-bg-surface-200 hover:text-fg-lighter',
              )}
            >
              <Icon size={17} strokeWidth={isActive ? 2 : 1.5} className="shrink-0" />
              <span
                className={cn(
                  'text-xs font-medium whitespace-nowrap transition-all duration-200',
                  isExpanded ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2',
                )}
              >
                {item.label}
              </span>
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-r-full bg-brand" />
              )}
            </Link>
          )
        })}
      </nav>

      {/* Divider */}
      <div className="w-full px-3 pb-1">
        <div className="h-px bg-gradient-to-r from-transparent via-border-default to-transparent" />
      </div>

      {/* Bottom actions */}
      <div className="w-full flex flex-col gap-0.5 py-2 px-1.5 shrink-0">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          title={isExpanded ? undefined : theme === 'dark' ? '切换亮色' : '切换暗色'}
          className="flex h-9 items-center gap-3 pl-2 pr-3 rounded-md text-fg-muted hover:bg-bg-surface-200 hover:text-fg-lighter transition-all duration-150 overflow-hidden w-full text-left"
        >
          {theme === 'dark' ? (
            <Sun size={16} strokeWidth={1.5} className="shrink-0" />
          ) : (
            <Moon size={16} strokeWidth={1.5} className="shrink-0" />
          )}
          <span
            className={cn(
              'text-xs font-medium whitespace-nowrap transition-all duration-200',
              isExpanded ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2',
            )}
          >
            {theme === 'dark' ? '亮色模式' : '暗色模式'}
          </span>
        </button>

        {/* Sidebar mode toggle */}
        <button
          onClick={cycleMode}
          title={isExpanded ? undefined : `侧栏：${modeLabel}`}
          className="flex h-9 items-center gap-3 pl-2 pr-3 rounded-md text-fg-muted hover:bg-bg-surface-200 hover:text-fg-lighter transition-all duration-150 overflow-hidden w-full text-left"
        >
          <ModeIcon size={16} strokeWidth={1.5} className="shrink-0" />
          <span
            className={cn(
              'text-xs font-medium whitespace-nowrap transition-all duration-200',
              isExpanded ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2',
            )}
          >
            {modeLabel}
          </span>
        </button>
      </div>
    </aside>
  )
}
