import { useMemo, useState, useCallback, useRef } from 'react'
import { Search, X, Copy, Pencil, Trash2, ChevronLeft, ChevronRight, Loader2, Plus } from 'lucide-react'
import { databaseAPI } from '../../services/database'
import { FieldValue } from './FieldValue'
import { Button } from '../ui'

interface DataTableProps {
  documents: any[]
  loading?: boolean
  onEditRow?: (doc: any) => void
  onCellEdit?: (id: string, field: string, value: string) => void
  onDeleteRow?: (id: string) => void
  onDeleteSelected?: () => void
  onAddRow?: () => void
  total?: number
  page?: number
  pageSize?: number
  onPageChange?: (p: number) => void
  search?: string
  onSearch?: (q: string) => void
  selectedIds?: Set<string>
  onSelectionChange?: (ids: Set<string>) => void
}

interface EditingCell {
  rowIdx: number
  colKey: string
  value: string
}
interface CtxMenu {
  x: number
  y: number
  doc: any
}

export default function DataTable({
  documents,
  loading,
  onEditRow,
  onCellEdit,
  onDeleteRow,
  onDeleteSelected,
  onAddRow,
  total = 0,
  page = 1,
  pageSize = 20,
  onPageChange,
  search = '',
  onSearch,
  selectedIds = new Set(),
  onSelectionChange,
}: DataTableProps) {
  const columns = useMemo(() => databaseAPI.inferColumns(documents), [documents])
  const [showSearch, setShowSearch] = useState(!!search)
  const [searchInput, setSearchInput] = useState(search)
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null)
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null)
  const [selectedRow, setSelectedRow] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const totalPages = Math.ceil(total / pageSize)
  const startRow = (page - 1) * pageSize + 1
  const endRow = Math.min(page * pageSize, total)

  const allSelected = documents.length > 0 && documents.every((d) => selectedIds.has(d._id))
  const someSelected = !allSelected && documents.some((d) => selectedIds.has(d._id))

  const toggleSelectAll = useCallback(() => {
    if (!onSelectionChange) return
    if (allSelected) {
      const next = new Set(selectedIds)
      documents.forEach((d) => next.delete(d._id))
      onSelectionChange(next)
    } else {
      const next = new Set(selectedIds)
      documents.forEach((d) => {
        if (d._id) next.add(d._id)
      })
      onSelectionChange(next)
    }
  }, [allSelected, documents, selectedIds, onSelectionChange])

  const toggleSelect = useCallback(
    (id: string) => {
      if (!onSelectionChange) return
      const next = new Set(selectedIds)
      next.has(id) ? next.delete(id) : next.add(id)
      onSelectionChange(next)
    },
    [selectedIds, onSelectionChange],
  )

  const startEdit = useCallback((rowIdx: number, colKey: string, value: unknown) => {
    setEditingCell({ rowIdx, colKey, value: value === null || value === undefined ? '' : String(value) })
    setTimeout(() => inputRef.current?.select(), 0)
  }, [])

  const commitEdit = useCallback(() => {
    if (!editingCell) return
    const doc = documents[editingCell.rowIdx]
    const originalValue = doc?.[editingCell.colKey]
    const originalStr = originalValue === null || originalValue === undefined ? '' : String(originalValue)
    // 值没有变化，不请求
    if (editingCell.value === originalStr) {
      setEditingCell(null)
      return
    }
    if (doc?._id && onCellEdit) onCellEdit(doc._id, editingCell.colKey, editingCell.value)
    setEditingCell(null)
  }, [editingCell, documents, onCellEdit])

  const submitSearch = useCallback(() => {
    onSearch?.(searchInput)
  }, [searchInput, onSearch])

  if (loading)
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2">
        <Loader2 size={18} className="animate-spin text-brand" />
        <p className="text-xs text-fg-lighter">加载中...</p>
      </div>
    )

  return (
    <div className="flex flex-col h-full overflow-hidden" onClick={() => ctxMenu && setCtxMenu(null)}>
      {/* 操作栏 */}
      <div className="shrink-0 flex items-center gap-2 px-4 h-10 border-b border-border-muted bg-bg-surface-100/20">
        {/* 左侧：搜索区 */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          {showSearch ? (
            <div className="flex items-center gap-1.5 flex-1 max-w-xs bg-bg-surface-200 border border-border-default rounded-md px-2.5 h-7 focus-within:border-brand transition-colors">
              <Search size={11} className="text-fg-muted shrink-0" />
              <input
                ref={searchRef}
                autoFocus
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="field:value 或 _id..."
                className="flex-1 bg-transparent text-xs text-fg-default placeholder:text-fg-muted focus:outline-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitSearch()
                  if (e.key === 'Escape') {
                    setShowSearch(false)
                    setSearchInput('')
                    onSearch?.('')
                  }
                }}
              />
              {searchInput && (
                <button
                  onClick={() => {
                    setSearchInput('')
                    onSearch?.('')
                  }}
                  className="text-fg-muted hover:text-fg-default"
                >
                  <X size={11} />
                </button>
              )}
              <button onClick={submitSearch} className="text-[10px] text-brand hover:opacity-80 shrink-0 font-medium">
                搜索
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setShowSearch(true)
                setTimeout(() => searchRef.current?.focus(), 0)
              }}
              className="flex items-center gap-1.5 h-7 px-2 rounded text-xs text-fg-muted hover:text-fg-default hover:bg-bg-surface-200 transition-colors"
            >
              <Search size={12} /> 搜索
            </button>
          )}
          {search && <span className="text-[11px] text-brand bg-brand/10 px-2 py-0.5 rounded-full">"{search}"</span>}
        </div>

        {/* 右侧：操作按钮 */}
        <div className="flex items-center gap-1.5 shrink-0">
          {selectedIds.size > 0 && (
            <Button variant="danger" size="tiny" onClick={onDeleteSelected}>
              <Trash2 size={12} /> 删除 {selectedIds.size} 条
            </Button>
          )}
          <Button variant="primary" size="tiny" onClick={onAddRow}>
            <Plus size={12} /> Insert
          </Button>
        </div>
      </div>

      {/* 表格 */}
      <div className="flex-1 overflow-auto">
        {documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <p className="text-sm text-fg-lighter">{search ? '无匹配文档' : '暂无文档'}</p>
            {!search && onAddRow && (
              <button onClick={onAddRow} className="flex items-center gap-1 text-xs text-brand hover:opacity-80">
                <Plus size={12} /> 添加文档
              </button>
            )}
          </div>
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="sticky top-0 z-10 bg-bg-surface-200/90 backdrop-blur-sm">
                {/* Checkbox 全选 */}
                <th className="w-10 px-3 py-2 border-b border-border-default">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected
                    }}
                    onChange={toggleSelectAll}
                    className="accent-brand cursor-pointer"
                  />
                </th>
                <th className="w-10 px-2 py-2 text-left text-[10px] font-semibold text-fg-muted border-b border-border-default select-none">
                  #
                </th>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className="px-3 py-2 text-left text-[10px] font-semibold text-fg-muted uppercase tracking-wider whitespace-nowrap border-b border-border-default border-l border-l-border-muted/30"
                  >
                    {col.key}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {documents.map((doc, rowIdx) => {
                const isSelected = selectedIds.has(doc._id)
                return (
                  <tr
                    key={rowIdx}
                    className={`border-b border-border-muted transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-brand/5 hover:bg-brand/8'
                        : selectedRow === rowIdx
                          ? 'bg-bg-surface-200'
                          : 'hover:bg-bg-surface-100'
                    }`}
                    onClick={() => setSelectedRow(rowIdx)}
                    onDoubleClick={(e) => {
                      if ((e.target as HTMLElement).closest('td[data-col]')) return
                      onEditRow?.(doc)
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      setCtxMenu({ x: e.clientX, y: e.clientY, doc })
                    }}
                  >
                    {/* Checkbox */}
                    <td className="px-3 py-1.5 w-10" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(doc._id)}
                        className="accent-brand cursor-pointer"
                      />
                    </td>
                    {/* 行号 */}
                    <td className="px-2 py-1.5 text-[10px] font-mono text-fg-muted select-none border-r border-border-muted/30">
                      {startRow + rowIdx - 1}
                    </td>
                    {/* 单元格 */}
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        data-col={col.key}
                        className="px-3 py-1.5 max-w-[220px] border-l border-l-border-muted/20 relative"
                        onDoubleClick={(e) => {
                          e.stopPropagation()
                          startEdit(rowIdx, col.key, doc[col.key])
                        }}
                      >
                        {editingCell?.rowIdx === rowIdx && editingCell?.colKey === col.key ? (
                          <input
                            ref={inputRef}
                            value={editingCell.value}
                            onChange={(e) =>
                              setEditingCell((prev) => (prev ? { ...prev, value: e.target.value } : null))
                            }
                            onBlur={commitEdit}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                commitEdit()
                              }
                              if (e.key === 'Escape') setEditingCell(null)
                            }}
                            className="w-full bg-bg-surface-300 border border-brand rounded px-1.5 py-0.5 text-xs text-fg-default focus:outline-none"
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <div className="truncate">
                            <FieldValue value={doc[col.key]} inline />
                          </div>
                        )}
                      </td>
                    ))}
                  </tr>
                )
              })}

              {/* 新增行入口 */}
              {onAddRow && (
                <tr className="border-b border-dashed border-border-muted/40 opacity-60 hover:opacity-100 transition-opacity">
                  <td colSpan={columns.length + 2} className="px-4 py-1.5">
                    <button
                      onClick={onAddRow}
                      className="flex items-center gap-1 text-xs text-fg-muted hover:text-brand transition-colors"
                    >
                      <Plus size={11} /> 添加行
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* 底部分页 */}
      {totalPages > 0 && (
        <div className="shrink-0 flex items-center justify-between px-4 h-9 border-t border-border-muted text-xs text-fg-muted">
          <span className="tabular-nums">{total > 0 ? `${startRow}–${endRow} / ${total}` : '0 条'}</span>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => onPageChange?.(page - 1)}
                disabled={page <= 1}
                className="flex h-6 w-6 items-center justify-center rounded hover:bg-bg-surface-200 disabled:opacity-30"
              >
                <ChevronLeft size={12} />
              </button>
              <span className="px-2 tabular-nums">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => onPageChange?.(page + 1)}
                disabled={page >= totalPages}
                className="flex h-6 w-6 items-center justify-center rounded hover:bg-bg-surface-200 disabled:opacity-30"
              >
                <ChevronRight size={12} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* 右键菜单 */}
      {ctxMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setCtxMenu(null)} />
          <div
            className="fixed z-50 w-44 py-1 rounded-lg border border-border-default bg-bg-overlay shadow-lg shadow-black/20"
            style={{ top: ctxMenu.y, left: ctxMenu.x }}
          >
            {[
              {
                icon: Pencil,
                label: '编辑行',
                action: () => {
                  onEditRow?.(ctxMenu.doc)
                  setCtxMenu(null)
                },
                danger: false,
              },
              {
                icon: Copy,
                label: '复制 JSON',
                action: () => {
                  navigator.clipboard.writeText(JSON.stringify(ctxMenu.doc, null, 2))
                  setCtxMenu(null)
                },
                danger: false,
              },
              {
                icon: Trash2,
                label: '删除',
                action: () => {
                  if (confirm('确认删除？')) {
                    onDeleteRow?.(ctxMenu.doc._id)
                    setCtxMenu(null)
                  }
                },
                danger: true,
              },
            ].map((item) => (
              <button
                key={item.label}
                onClick={item.action}
                className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs transition-colors ${
                  item.danger ? 'text-destructive hover:bg-destructive/10' : 'text-fg-default hover:bg-bg-surface-300'
                }`}
              >
                <item.icon size={12} /> {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
