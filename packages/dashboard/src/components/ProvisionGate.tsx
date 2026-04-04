import { useState, useEffect, ReactNode } from 'react'
import { Loader2, RefreshCw, AlertCircle, Cloud } from 'lucide-react'

interface Props {
  children: ReactNode
}

type ProvisionStatus = 'loading' | 'success' | 'processing' | 'failed' | 'not_started'

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

export default function ProvisionGate({ children }: Props) {
  const [status, setStatus] = useState<ProvisionStatus>('loading')
  const [failReason, setFailReason] = useState<string | null>(null)
  const [step, setStep] = useState(0)

  const checkStatus = async () => {
    try {
      const r = await fetch(`${API_BASE}/auth/provision-status`, { credentials: 'include' })
      if (!r.ok) {
        setStatus('success')
        return
      }
      const data = await r.json()
      if (data.status === 'success') setStatus('success')
      else if (data.status === 'processing') setStatus('processing')
      else if (data.status === 'failed') {
        setStatus('failed')
        setFailReason(data.failReason || '未知错误')
      } else setStatus('success')
    } catch {
      setStatus('success')
    }
  }

  useEffect(() => {
    checkStatus()
  }, [])

  useEffect(() => {
    if (status !== 'processing') return
    const poll = setInterval(checkStatus, 3000)
    const animate = setInterval(() => setStep((s) => (s + 1) % 4), 2000)
    return () => {
      clearInterval(poll)
      clearInterval(animate)
    }
  }, [status])

  const steps = ['创建子账号', '生成密钥', '初始化环境', '配置权限']

  if (status === 'loading') {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-bg-default">
        <Loader2 size={24} className="animate-spin text-brand" />
      </div>
    )
  }

  if (status === 'processing') {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-bg-default">
        <div className="flex flex-col items-center gap-6 max-w-sm text-center px-6">
          {/* 动画 Logo */}
          <div className="relative">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-brand/10 border border-brand/20">
              <Cloud size={36} className="text-brand" strokeWidth={1.5} />
            </div>
            <div
              className="absolute inset-0 rounded-2xl border border-brand/30 animate-ping"
              style={{ animationDuration: '2s' }}
            />
          </div>

          <div>
            <h2 className="text-lg font-semibold text-fg-default">正在创建 CloudBase 环境</h2>
            <p className="mt-2 text-sm text-fg-lighter leading-relaxed">
              正在为您配置专属云开发环境，包括数据库、存储和云函数服务
            </p>
          </div>

          {/* 步骤指示 */}
          <div className="w-full space-y-2">
            {steps.map((s, i) => (
              <div key={i} className="flex items-center gap-3 text-xs">
                <div
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-medium ${
                    i < step
                      ? 'bg-brand text-white'
                      : i === step
                        ? 'bg-brand/20 text-brand border border-brand/40'
                        : 'bg-bg-surface-300 text-fg-muted'
                  }`}
                >
                  {i < step ? '✓' : i + 1}
                </div>
                <span className={i <= step ? 'text-fg-default' : 'text-fg-muted'}>{s}</span>
                {i === step && <Loader2 size={12} className="animate-spin text-brand ml-auto" />}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (status === 'failed') {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-bg-default">
        <div className="flex flex-col items-center gap-5 max-w-sm text-center px-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 border border-destructive/20">
            <AlertCircle size={28} className="text-destructive" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-fg-default">环境创建失败</h2>
            <p className="mt-2 text-sm text-fg-lighter">请联系管理员或重试</p>
            {failReason && (
              <p className="mt-3 text-xs text-destructive font-mono bg-destructive/5 border border-destructive/10 rounded-lg p-3 break-all text-left">
                {failReason}
              </p>
            )}
          </div>
          <button
            onClick={() => {
              setStatus('loading')
              checkStatus()
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-bg-surface-300 text-sm text-fg-default hover:bg-bg-surface-400 transition-colors"
          >
            <RefreshCw size={14} /> 重新检查
          </button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
