import { useMemo } from 'react'
import { InferredColumn } from '../../services/database'

interface CellValueProps {
  value: any
  column?: InferredColumn
}

export default function CellValue({ value, column }: CellValueProps) {
  const type = column?.type || 'text'

  const content = useMemo(() => {
    if (value === null || value === undefined) {
      return <span className="text-fg-muted italic text-xs">NULL</span>
    }
    switch (type) {
      case 'boolean':
        return (
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${value ? 'bg-brand' : 'bg-fg-muted'}`} />
            <span className="text-xs">{value ? 'true' : 'false'}</span>
          </div>
        )
      case 'number':
        return <span className="font-mono text-xs tabular-nums">{value.toLocaleString()}</span>
      case 'date':
        return <span className="text-xs text-fg-lighter tabular-nums">{String(value)}</span>
      case 'json':
        return (
          <span className="inline-block max-w-[200px] truncate rounded bg-bg-surface-300 px-1.5 py-0.5 font-mono text-xs text-fg-light">
            {JSON.stringify(value).slice(0, 50)}
          </span>
        )
      default:
        return <span className="text-xs truncate block max-w-[300px]">{String(value)}</span>
    }
  }, [value, type])

  return <>{content}</>
}
