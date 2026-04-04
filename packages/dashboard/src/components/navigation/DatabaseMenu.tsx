import { useState, useEffect } from 'react'
import { Search, Plus, ChevronDown, MoreHorizontal, Trash2, Copy, Shield, X, Check } from 'lucide-react'
import { cn } from '../../utils/helpers'
import { useDatabaseState } from '../../hooks/useDatabaseState'
import { databaseAPI } from '../../services/database'
import { ContextMenu, ContextMenuItem, ContextMenuSeparator } from '../ui/ContextMenu'
import { toast } from 'sonner'
import CollectionPermissions from '../data/CollectionPermissions'

export const DatabaseMenu = () => {
  const { activeCollection, setActiveCollection } = useDatabaseState()
  const [collections, setCollections] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    user: true,
    app: true,
    system: false,
  })
  const [permCollection, setPermCollection] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    databaseAPI
      .getCollections()
      .then((data) => setCollections(data.map((c) => c.CollectionName)))
      .catch(() => toast.error('加载集合失败'))
  }, [])

  const grouped = {
    user: collections.filter((c) => !c.startsWith('app_') && !c.startsWith('_system_') && !c.startsWith('system_')),
    app: collections.filter((c) => c.startsWith('app_')),
    system: collections.filter((c) => c.startsWith('_system_') || c.startsWith('system_')),
  }

  const filtered = Object.fromEntries(
    Object.entries(grouped).map(([k, v]) => [k, v.filter((c) => c.toLowerCase().includes(searchQuery.toLowerCase()))]),
  )

  const toggleGroup = (g: string) => setExpandedGroups((p) => ({ ...p, [g]: !p[g] }))

  const handleDelete = async (name: string) => {
    try {
      await databaseAPI.deleteCollection(name)
      setCollections((prev) => prev.filter((c) => c !== name))
      if (activeCollection === name) setActiveCollection(null)
      toast.success('集合已删除')
    } catch {
      toast.error('删除集合失败')
    }
  }

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) return
    if (collections.includes(name)) {
      toast.error('集合名称已存在')
      return
    }
    setSaving(true)
    try {
      await databaseAPI.createCollection(name)
      setCollections((prev) => [...prev, name])
      setActiveCollection(name)
      setNewName('')
      setCreating(false)
      toast.success(`集合 "${name}" 已创建`)
    } catch (e: any) {
      toast.error(e.message || '创建失败')
    } finally {
      setSaving(false)
    }
  }

  const Group = ({ title, groupKey, items }: { title: string; groupKey: string; items: string[] }) => {
    if (items.length === 0) return null
    const expanded = expandedGroups[groupKey]
    return (
      <div className="mb-1">
        <button
          onClick={() => toggleGroup(groupKey)}
          className="flex items-center gap-1.5 w-full px-3 py-1.5 text-xs font-medium text-fg-lighter hover:text-fg-light transition-colors"
        >
          <ChevronDown size={12} className={cn('transition-transform', expanded ? '' : '-rotate-90')} />
          {title}
          <span className="ml-auto text-fg-muted">{items.length}</span>
        </button>
        {expanded && (
          <div className="space-y-px">
            {items.map((c) => (
              <div key={c} className="relative group">
                {/* 选中按钮（左键选中） */}
                <button
                  onClick={() => setActiveCollection(c)}
                  className={cn(
                    'flex items-center w-full px-3 py-[5px] pr-8 text-xs transition-all duration-150 rounded-md relative',
                    activeCollection === c
                      ? 'bg-bg-surface-400 text-fg-default'
                      : 'text-fg-lighter hover:bg-bg-surface-200 hover:text-fg-light',
                  )}
                >
                  {activeCollection === c && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-3.5 rounded-r-full bg-brand" />
                  )}
                  <span className="truncate flex-1 text-left">{c}</span>
                </button>

                {/* 更多菜单（右上角，hover 显示） */}
                <div className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <ContextMenu
                    trigger={
                      <button
                        className="flex h-6 w-6 items-center justify-center rounded hover:bg-bg-surface-300 text-fg-muted hover:text-fg-lighter transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreHorizontal size={13} />
                      </button>
                    }
                  >
                    <ContextMenuItem onSelect={() => navigator.clipboard.writeText(c)}>
                      <Copy size={12} /> 复制名称
                    </ContextMenuItem>
                    <ContextMenuItem onSelect={() => setPermCollection(c)}>
                      <Shield size={12} /> 权限设置
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem destructive onSelect={() => handleDelete(c)}>
                      <Trash2 size={12} /> 删除集合
                    </ContextMenuItem>
                  </ContextMenu>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* 搜索 */}
      <div className="p-2 border-b border-border-muted space-y-2">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted" />
          <input
            type="text"
            placeholder="搜索集合..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-8 pl-8 pr-3 rounded border border-border-default bg-bg-surface-200 text-xs text-fg-default placeholder:text-fg-muted focus:border-brand focus:ring-1 focus:ring-brand/30 focus:outline-none transition-colors"
          />
        </div>

        {/* 新建集合 */}
        {creating ? (
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              type="text"
              placeholder="集合名称"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate()
                if (e.key === 'Escape') {
                  setCreating(false)
                  setNewName('')
                }
              }}
              className="flex-1 h-7 px-2 rounded border border-brand bg-bg-surface-200 text-xs text-fg-default placeholder:text-fg-muted focus:outline-none"
            />
            <button
              onClick={handleCreate}
              disabled={saving || !newName.trim()}
              className="flex h-7 w-7 items-center justify-center rounded bg-brand text-white hover:opacity-90 disabled:opacity-50 transition-colors"
            >
              <Check size={13} />
            </button>
            <button
              onClick={() => {
                setCreating(false)
                setNewName('')
              }}
              className="flex h-7 w-7 items-center justify-center rounded text-fg-muted hover:bg-bg-surface-300 transition-colors"
            >
              <X size={13} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 w-full px-3 py-1.5 rounded text-xs font-medium text-brand hover:bg-brand/10 transition-colors"
          >
            <Plus size={13} /> 新建集合
          </button>
        )}
      </div>

      {/* 集合列表 */}
      <div className="flex-1 overflow-y-auto p-1">
        <Group title="用户表" groupKey="user" items={filtered.user} />
        <Group title="应用数据" groupKey="app" items={filtered.app} />
        <Group title="系统表" groupKey="system" items={filtered.system} />
      </div>

      {permCollection && (
        <CollectionPermissions
          open={!!permCollection}
          onOpenChange={(v) => !v && setPermCollection(null)}
          collectionName={permCollection}
        />
      )}
    </div>
  )
}
