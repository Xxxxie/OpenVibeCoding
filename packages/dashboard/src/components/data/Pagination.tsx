import { Button } from '../ui'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface PaginationProps {
  currentPage: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
}

export default function Pagination({ currentPage, pageSize, total, onPageChange }: PaginationProps) {
  const totalPages = Math.ceil(total / pageSize)
  const start = (currentPage - 1) * pageSize + 1
  const end = Math.min(currentPage * pageSize, total)

  return (
    <div className="flex items-center justify-between h-10 px-4 border-t border-border-muted bg-bg-surface-100/60 backdrop-blur-sm shrink-0">
      <span className="text-xs text-fg-muted font-mono tabular-nums">
        {start}–{end} / {total}
      </span>
      <div className="flex items-center gap-1.5">
        <Button variant="ghost" size="tiny" onClick={() => onPageChange(currentPage - 1)} disabled={currentPage <= 1}>
          <ChevronLeft size={13} />
        </Button>
        <span className="text-xs text-fg-lighter px-2 tabular-nums">
          {currentPage} / {totalPages}
        </span>
        <Button
          variant="ghost"
          size="tiny"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
        >
          <ChevronRight size={13} />
        </Button>
      </div>
    </div>
  )
}
