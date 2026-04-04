import { Link } from 'react-router-dom'
import { Database, HardDrive } from 'lucide-react'

const LINKS = [
  { to: '/database', icon: Database, label: '数据库' },
  { to: '/storage', icon: HardDrive, label: '存储' },
]

export const HomeMenu = () => (
  <div className="p-2 space-y-1">
    <p className="px-3 py-2 text-xs font-medium text-fg-lighter uppercase tracking-wider">导航</p>
    {LINKS.map((link) => {
      const Icon = link.icon
      return (
        <Link
          key={link.to}
          to={link.to}
          className="flex items-center gap-3 rounded px-3 py-2 text-sm text-fg-light hover:bg-bg-surface-200 hover:text-fg-default transition-colors"
        >
          <Icon size={16} strokeWidth={1.5} />
          {link.label}
        </Link>
      )
    })}
  </div>
)
