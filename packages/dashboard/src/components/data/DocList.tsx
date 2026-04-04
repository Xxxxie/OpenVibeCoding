import { useState, useMemo, useCallback } from 'react'
import { Search, Plus, ChevronsUpDown, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { Button } from '../ui'
import DocCard from './DocCard'
import { toast } from 'sonner'

interface Props {
  documents: any[]
  total: number
  page: number
  pageSize: number
  loading: boolean
  search?: string
  onSearch?: (q: string) => void
  onPageChange: (p: number) => void
  onEdit: (doc: any) => void
  onDelete: (id: string) => void
  onAdd: () => void
}

export default function DocList({
  documents,
  total,
  page,
  pageSize,
  loading,
  search: externalSearch = '',
  onSearch,
  onPageChange,
  onEdit,
  onDelete,
  onAdd,
}: Props) {
  const [localSearch, setLocalSearch] = useState('')
  // 如果有外部搜索就用外部的，否则用前端本地过滤
  const search = onSearch ? externalSearch : localSearch
  const setSearch = onSearch ? onSearch : setLocalSearch
  const [showSearch, setShowSearch] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const filteredDocs = useMemo(() => {
    if (!search.trim()) return documents
    const q = search.toLowerCase()
    return documents.filter((doc) => JSON.stringify(doc).toLowerCase().includes(q))
  }, [documents, search])

  const totalPages = Math.ceil(total / pageSize)
  const startRow = (page - 1) * pageSize + 1
  const endRow = Math.min(page * pageSize, total)

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }, [])

  const toggleAll = useCallback(() => {
    if (expandedIds.size === filteredDocs.length) setExpandedIds(new Set())
    else setExpandedIds(new Set(filteredDocs.map((d) => String(d._id || ''))))
  }, [expandedIds.size, filteredDocs])

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* 工具栏 */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-border-muted bg-bg-surface-100/30">
        {showSearch ? (
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索文档..."
            className="flex-1 h-7 px-2.5 rounded border border-brand bg-bg-surface-200 text-xs text-fg-default placeholder:text-fg-muted focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setShowSearch(false)
                setSearch('')
              }
            }}
          />
        ) : (
          <button
            onClick={() => setShowSearch(true)}
            className="flex items-center gap-1.5 h-7 px-2 rounded text-xs text-fg-lighter hover:text-fg-default hover:bg-bg-surface-200 transition-colors"
          >
            <Search size={12} /> 搜索
          </button>
        )}
        <div className="flex-1" />
        <button
          onClick={toggleAll}
          className="flex items-center gap-1.5 h-7 px-2 rounded text-xs text-fg-lighter hover:text-fg-default hover:bg-bg-surface-200 transition-colors"
        >
          <ChevronsUpDown size={12} />
          {expandedIds.size === filteredDocs.length && filteredDocs.length > 0 ? '折叠' : '展开'}全部
        </button>
      </div>

      {/* 卡片列表 */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 size={18} className="animate-spin text-fg-muted" />
          </div>
        ) : filteredDocs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3">
            <p className="text-sm text-fg-lighter">{search ? '无匹配文档' : '暂无文档'}</p>
            {!search && (
              <Button variant="outline" size="tiny" onClick={onAdd}>
                <Plus size={12} /> 新增文档
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-1.5">
            {filteredDocs.map((doc, i) => {
              const id = String(doc._id || `idx-${i}`)
              return (
                <DocCard
                  key={id}
                  doc={doc}
                  index={i}
                  expanded={expandedIds.has(id)}
                  selected={selectedId === id}
                  onToggle={() => toggleExpand(id)}
                  onSelect={() => setSelectedId(id)}
                  onEdit={() => onEdit(doc)}
                  onCopy={() => {
                    navigator.clipboard.writeText(JSON.stringify(doc, null, 2))
                    toast.success('已复制 JSON')
                  }}
                  onDelete={() => {
                    if (confirm('确认删除？')) onDelete(String(doc._id))
                  }}
                />
              )
            })}
          </div>
        )}
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="shrink-0 flex items-center justify-between px-4 h-9 border-t border-border-muted text-xs text-fg-muted">
          <span>
            {startRow}–{endRow} / {total}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="flex h-6 w-6 items-center justify-center rounded hover:bg-bg-surface-200 disabled:opacity-30"
            >
              <ChevronLeft size={12} />
            </button>
            <span className="px-2">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="flex h-6 w-6 items-center justify-center rounded hover:bg-bg-surface-200 disabled:opacity-30"
            >
              <ChevronRight size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
