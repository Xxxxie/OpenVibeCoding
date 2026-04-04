import { useState } from 'react'
import { Play, Trash2, ChevronDown } from 'lucide-react'
import { Button, Badge } from '../components/ui'
import { toast } from 'sonner'

interface QueryResult {
  columns: string[]
  rows: any[][]
  rowCount: number
  duration: number
}

export default function SqlPage() {
  const [sql, setSql] = useState('SELECT * FROM information_schema.tables LIMIT 10;')
  const [result, setResult] = useState<QueryResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const runQuery = async () => {
    if (!sql.trim()) return
    setLoading(true)
    setError(null)
    const t = Date.now()
    try {
      const apiBase = import.meta.env.VITE_API_BASE || '/api'
      const r = await fetch(`${apiBase}/sql/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql }),
      })
      const data = await r.json()
      if (!r.ok || data.error) throw new Error(data.error || '查询失败')
      setResult({ ...data, duration: Date.now() - t })
    } catch (e: any) {
      setError(e.message)
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-bg-default/70 overflow-hidden">
      {/* 顶部标题栏 */}
      <div className="flex min-h-12 items-center justify-between border-b border-border-muted px-4 bg-bg-surface-100/30">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold text-fg-default">SQL 编辑器</h1>
          <span className="text-xs text-fg-muted">关系数据库查询</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="tiny"
            onClick={() => {
              setSql('')
              setResult(null)
              setError(null)
            }}
          >
            <Trash2 size={12} /> 清空
          </Button>
          <Button variant="primary" size="tiny" onClick={runQuery} disabled={loading}>
            <Play size={12} /> {loading ? '执行中...' : '运行 (Ctrl+↵)'}
          </Button>
        </div>
      </div>

      {/* 主体：编辑器 + 结果区上下布局 */}
      <div className="flex-1 flex flex-col overflow-hidden p-4 gap-3">
        {/* SQL 编辑器面板 */}
        <div className="shrink-0 rounded-xl border border-border-default bg-bg-surface-100 overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border-muted bg-bg-surface-200/60">
            <span className="text-[11px] font-semibold text-fg-muted uppercase tracking-wider">SQL 查询</span>
            <span className="text-[10px] text-fg-muted">Ctrl+Enter 运行</span>
          </div>
          <textarea
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault()
                runQuery()
              }
            }}
            className="w-full h-40 px-4 py-3 bg-transparent font-mono text-sm text-fg-default placeholder:text-fg-muted resize-none focus:outline-none"
            placeholder="输入 SQL 语句..."
            spellCheck={false}
          />
        </div>

        {/* 结果面板 */}
        <div className="flex-1 rounded-xl border border-border-default bg-bg-surface-100 overflow-hidden shadow-sm flex flex-col min-h-0">
          {/* 结果标题栏 */}
          <div className="flex items-center gap-3 px-4 py-2 border-b border-border-muted bg-bg-surface-200/60 shrink-0">
            <span className="text-[11px] font-semibold text-fg-muted uppercase tracking-wider">查询结果</span>
            {result && (
              <>
                <Badge variant="success">成功</Badge>
                <span className="text-xs text-fg-lighter">{result.rowCount} 行</span>
                <span className="text-xs text-fg-lighter">{result.duration}ms</span>
              </>
            )}
            {error && <Badge variant="error">错误</Badge>}
          </div>

          {/* 结果内容 */}
          <div className="flex-1 overflow-auto">
            {error ? (
              <div className="p-4">
                <div className="rounded-lg bg-destructive/8 border border-destructive/20 p-4">
                  <p className="text-sm text-destructive font-mono leading-relaxed">{error}</p>
                </div>
              </div>
            ) : result ? (
              result.columns.length === 0 ? (
                <div className="flex items-center justify-center h-24 text-sm text-fg-lighter">
                  查询执行成功，无返回数据
                </div>
              ) : (
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="sticky top-0 z-10 bg-bg-surface-200/80 backdrop-blur-sm">
                      {result.columns.map((col, i) => (
                        <th
                          key={i}
                          className="text-left px-4 py-2.5 text-[11px] font-semibold text-fg-muted uppercase tracking-wider whitespace-nowrap border-b border-border-default"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, i) => (
                      <tr key={i} className="border-b border-border-muted hover:bg-bg-surface-200/50 transition-colors">
                        {row.map((cell, j) => (
                          <td key={j} className="px-4 py-2.5 font-mono text-xs text-fg-default max-w-[200px] truncate">
                            {cell === null ? <span className="text-fg-muted italic">NULL</span> : String(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-fg-muted">
                <ChevronDown size={20} strokeWidth={1.5} className="-mt-4" />
                <p className="text-sm">输入 SQL 后点击运行查看结果</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
