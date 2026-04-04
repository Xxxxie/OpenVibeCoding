import { ChevronRight, Copy, Pencil, Trash2 } from 'lucide-react'
import { FieldValue, TypeTag } from './FieldValue'

interface Props {
  doc: Record<string, unknown>
  index: number
  expanded: boolean
  selected: boolean
  onToggle: () => void
  onSelect: () => void
  onEdit: () => void
  onCopy: () => void
  onDelete: () => void
}

export default function DocCard({
  doc,
  index,
  expanded,
  selected,
  onToggle,
  onSelect,
  onEdit,
  onCopy,
  onDelete,
}: Props) {
  const docId = String(doc._id || '')
  const entries = Object.entries(doc)
  const nonIdEntries = entries.filter(([k]) => k !== '_id')
  const previewEntries = nonIdEntries.slice(0, 3)
  const extraCount = nonIdEntries.length - previewEntries.length

  return (
    <div
      className={`group border rounded-xl transition-all duration-150 ${
        selected
          ? 'border-brand/30 bg-bg-surface-200'
          : 'border-border-muted bg-bg-surface-100 hover:border-border-default'
      }`}
    >
      {/* 卡片头部 */}
      <div
        className="flex items-center gap-2.5 px-3.5 py-2.5 cursor-pointer"
        onClick={(e) => {
          onSelect()
          if (!(e.target as HTMLElement).closest('button')) onToggle()
        }}
        onDoubleClick={onEdit}
      >
        <ChevronRight
          size={12}
          className={`shrink-0 text-fg-muted transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
        />
        {/* 行号 */}
        <span className="text-[10px] font-mono text-fg-muted shrink-0 w-5 text-right">{index + 1}</span>
        {/* _id */}
        <span className="text-[11px] font-mono text-fg-lighter shrink-0 w-24 truncate" title={docId}>
          {docId.slice(0, 10)}…
        </span>

        {/* 折叠态预览 */}
        {!expanded && (
          <div className="flex-1 flex items-center gap-3 min-w-0 overflow-hidden">
            {previewEntries.map(([key, val]) => (
              <span key={key} className="flex items-center gap-1 shrink-0">
                <span className="text-[11px] text-fg-muted">{key}:</span>
                <FieldValue value={val} inline />
              </span>
            ))}
            {extraCount > 0 && <span className="text-[10px] text-fg-muted">+{extraCount}</span>}
          </div>
        )}
        {expanded && <div className="flex-1" />}

        {/* 操作按钮 */}
        <div
          className={`flex items-center gap-0.5 shrink-0 transition-opacity ${expanded ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
        >
          <button
            onClick={(e) => {
              e.stopPropagation()
              onEdit()
            }}
            className="flex h-6 w-6 items-center justify-center rounded text-fg-muted hover:text-fg-default hover:bg-bg-surface-300 transition-colors"
          >
            <Pencil size={11} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onCopy()
            }}
            className="flex h-6 w-6 items-center justify-center rounded text-fg-muted hover:text-fg-default hover:bg-bg-surface-300 transition-colors"
          >
            <Copy size={11} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            className="flex h-6 w-6 items-center justify-center rounded text-fg-muted hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Trash2 size={11} />
          </button>
        </div>
      </div>

      {/* 展开内容 */}
      {expanded && (
        <div className="border-t border-border-muted px-4 py-2.5 space-y-1">
          {entries.map(([key, val]) => (
            <div key={key} className="flex items-start gap-3 py-0.5">
              <span className="text-[11px] font-mono text-fg-lighter w-32 shrink-0 text-right truncate pt-0.5">
                {key}
              </span>
              <div className="flex-1 min-w-0">
                <FieldValue value={val} />
              </div>
              <TypeTag value={val} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
