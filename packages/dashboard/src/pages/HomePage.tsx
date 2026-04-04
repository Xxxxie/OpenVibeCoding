import { useEffect, useState } from 'react'
import { BarChart3, Database, HardDrive, Activity, Zap, Code2, ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { databaseAPI } from '../services/database'

export default function HomePage() {
  const [collectionCount, setCollectionCount] = useState(0)

  useEffect(() => {
    databaseAPI
      .getCollections()
      .then((c) => setCollectionCount(c.length))
      .catch(() => {})
  }, [])

  const stats = [
    { label: '集合数', value: String(collectionCount), icon: Database, accent: '#3b82f6' },
    { label: '存储桶', value: '2', icon: HardDrive, accent: '#8b5cf6' },
    { label: 'API 请求', value: '12.4K', icon: Activity, accent: '#f59e0b' },
    { label: '使用率', value: '24%', icon: BarChart3, accent: '#10b981' },
  ]

  const modules = [
    { to: '/database', icon: Database, label: '数据库', desc: 'NoSQL 集合与文档管理', color: '#3b82f6' },
    { to: '/storage', icon: HardDrive, label: '存储', desc: '云存储和静态托管', color: '#8b5cf6' },
    { to: '/sql', icon: Code2, label: 'SQL 编辑器', desc: '关系数据库查询', color: '#06b6d4' },
    { to: '/functions', icon: Zap, label: '云函数', desc: 'Serverless 函数管理', color: '#f59e0b' },
  ]

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-bg-default">
      {/* Header */}
      <div className="flex min-h-12 items-center gap-2 border-b border-border-muted px-4 bg-bg-surface-100/30">
        <h1 className="text-sm font-medium text-fg-default">仪表盘</h1>
        <span className="text-xs text-fg-muted">·</span>
        <span className="text-xs text-fg-lighter">CloudBase 管理概览</span>
      </div>

      <div className="flex-1 p-5 space-y-8">
        {/* 统计卡片 - 左侧渐变色，向右淡出 */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((s) => {
            const Icon = s.icon
            return (
              <div
                key={s.label}
                className="relative overflow-hidden rounded-xl border border-border-default bg-bg-surface-100 p-5 transition-all duration-200 hover:border-border-strong hover:shadow-xl hover:shadow-black/20 group"
              >
                {/* 左侧渐变光晕 - dark 全强度，light 通过 CSS var 降低 */}
                <div
                  className="absolute inset-0 transition-opacity group-hover:brightness-110"
                  style={{
                    background: `linear-gradient(to right, ${s.accent}40 0%, ${s.accent}18 35%, transparent 65%)`,
                    opacity: 'var(--card-glow-opacity, 1)',
                  }}
                />
                {/* 右上角圆形光晕 */}
                <div
                  className="absolute -right-3 -top-3 h-20 w-20 rounded-full transition-opacity group-hover:opacity-[0.22]"
                  style={{
                    background: `radial-gradient(circle, ${s.accent}, transparent)`,
                    opacity: `calc(var(--card-glow-opacity, 1) * 0.12)`,
                  }}
                />
                <div className="relative z-10 flex items-start justify-between">
                  <div>
                    <p className="text-xs font-medium text-fg-lighter uppercase tracking-wider">{s.label}</p>
                    <p className="mt-2 text-3xl font-bold text-fg-default tabular-nums">{s.value}</p>
                  </div>
                  <Icon size={20} className="text-fg-muted mt-0.5" strokeWidth={1.5} />
                </div>
              </div>
            )
          })}
        </div>

        {/* 功能模块 */}
        <div>
          <h2 className="text-xs font-semibold text-fg-muted uppercase tracking-wider mb-4">功能模块</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {modules.map((m) => {
              const Icon = m.icon
              return (
                <Link
                  key={m.to}
                  to={m.to}
                  className="group relative overflow-hidden flex items-center gap-4 rounded-xl border border-border-default bg-bg-surface-100 p-4 transition-all duration-200 hover:border-border-strong hover:shadow-lg hover:shadow-black/15"
                >
                  {/* hover 时左侧微光 */}
                  <div
                    className="absolute left-0 top-0 h-full w-24 opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ background: `linear-gradient(to right, ${m.color}12, transparent)` }}
                  />
                  <div
                    className="relative flex h-10 w-10 items-center justify-center rounded-lg bg-bg-surface-300 transition-colors group-hover:bg-bg-surface-400"
                    style={{ boxShadow: `0 0 0 1px ${m.color}25` }}
                  >
                    <Icon size={20} strokeWidth={1.5} style={{ color: m.color }} />
                  </div>
                  <div className="relative flex-1 min-w-0">
                    <p className="text-sm font-medium text-fg-default">{m.label}</p>
                    <p className="text-xs text-fg-lighter mt-0.5">{m.desc}</p>
                  </div>
                  <ArrowUpRight
                    size={15}
                    className="relative text-fg-muted opacity-0 group-hover:opacity-60 transition-opacity shrink-0"
                  />
                </Link>
              )
            })}
          </div>
        </div>

        {/* 环境信息 */}
        <div className="rounded-xl border border-border-default bg-bg-surface-100/80 overflow-hidden shimmer">
          <div className="border-b border-border-default px-6 py-3 bg-bg-surface-200/50">
            <h2 className="text-xs font-semibold text-fg-muted uppercase tracking-wider">环境信息</h2>
          </div>
          <div className="px-6 py-4 grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="space-y-1">
              <p className="text-xs text-fg-muted uppercase tracking-wider">环境 ID</p>
              <p className="text-fg-light font-mono text-xs bg-bg-surface-200 px-2 py-1 rounded">
                huming-test-1giud5ua4e72b386
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-fg-muted uppercase tracking-wider">地域</p>
              <p className="text-sm text-fg-default">上海 (ap-shanghai)</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-fg-muted uppercase tracking-wider">状态</p>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-success shadow-sm shadow-success/50 animate-pulse" />
                <span className="text-sm text-fg-default">运行中</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
