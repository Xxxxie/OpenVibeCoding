import { useState, useEffect } from 'react'
import { HardDrive, Globe } from 'lucide-react'
import { useAtom } from 'jotai'
import { storageAPI, BucketInfo } from '../../services/storage'
import { activeBucketAtom, storagePrefixAtom } from '../../atoms/storage'
import { cn } from '../../utils/helpers'

export const StorageMenu = () => {
  const [buckets, setBuckets] = useState<BucketInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [activeBucket, setActiveBucket] = useAtom(activeBucketAtom)
  const [, setPrefix] = useAtom(storagePrefixAtom)

  useEffect(() => {
    storageAPI
      .getBuckets()
      .then((data) => {
        setBuckets(data)
        if (data.length > 0 && !activeBucket) setActiveBucket(data[0])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleSelect = (b: BucketInfo) => {
    setActiveBucket(b)
    setPrefix('')
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-1">
        <p className="px-3 py-1.5 text-xs font-medium text-fg-lighter uppercase tracking-wider">存储桶</p>
        {loading ? (
          <p className="px-3 py-1.5 text-xs text-fg-muted">加载中...</p>
        ) : buckets.length === 0 ? (
          <p className="px-3 py-1.5 text-xs text-fg-muted">暂无存储桶</p>
        ) : (
          buckets.map((b) => (
            <button
              key={b.type}
              onClick={() => handleSelect(b)}
              className={cn(
                'flex items-center gap-2 w-full px-3 py-1.5 text-xs rounded-sm transition-colors text-left',
                activeBucket?.type === b.type
                  ? 'bg-bg-selection text-fg-default border-l-2 border-brand'
                  : 'text-fg-light hover:bg-bg-surface-200 hover:text-fg-default',
              )}
            >
              {b.type === 'static' ? (
                <Globe size={14} strokeWidth={1.5} className="shrink-0" />
              ) : (
                <HardDrive size={14} strokeWidth={1.5} className="shrink-0" />
              )}
              <span className="truncate flex-1">{b.label}</span>
              {b.isPublic && <span className="text-[10px] px-1 py-0.5 rounded bg-brand/10 text-brand">公开</span>}
            </button>
          ))
        )}
      </div>
    </div>
  )
}
