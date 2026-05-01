import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Loader2, RotateCw } from 'lucide-react'

/**
 * BrowserControls — 预览 iframe 的浏览器工具栏
 *
 * 功能:
 *   - 前进 / 后退 / 刷新
 *   - 可编辑地址栏(相对路径),回车触发 iframe 导航
 *   - loading 状态：刷新按钮变 spinner，禁用交互
 *
 * 实现说明:
 *   - 前进/后退:iframe.contentWindow.history.back/forward(仅当 iframe 同源可用)
 *   - 刷新:走 onHardRefresh → 父级重新调 preview-url 接口验证沙箱状态
 *   - 地址栏只编辑 pathname,保持 origin 不变;回车时把 `origin + newPath` 赋值给 iframe.src
 *
 * 安全:跨域 iframe 时 contentWindow.history 访问会抛 DOMException,内部 try/catch 吞掉。
 */
interface BrowserControlsProps {
  /** 预览 URL 的完整地址(提取 origin 作为导航基础) */
  previewUrl: string
  /** 外部传入的 iframe ref,BrowserControls 不拥有 iframe */
  iframeRef: React.RefObject<HTMLIFrameElement | null>
  /** 刷新时让父级重新调 preview-url 接口验证沙箱状态 */
  onHardRefresh?: () => void
  /** 是否正在加载（preview-url 接口进行中） */
  loading?: boolean
  className?: string
}

export function BrowserControls({ previewUrl, iframeRef, onHardRefresh, loading, className }: BrowserControlsProps) {
  // 地址栏编辑内容(只存 pathname + search,不含 host)
  const [urlValue, setUrlValue] = useState(() => extractPathFromUrl(previewUrl))

  // previewUrl 由外部更新时(如切换任务 / 重启预览),同步到输入框
  useEffect(() => {
    setUrlValue(extractPathFromUrl(previewUrl))
  }, [previewUrl])

  const baseUrl = (() => {
    try {
      const u = new URL(previewUrl)
      return `${u.protocol}//${u.host}`
    } catch {
      return previewUrl
    }
  })()

  const navigate = (path: string) => {
    if (loading) return
    const iframe = iframeRef.current
    if (!iframe) return
    const normalizedPath = path.startsWith('/') ? path : `/${path}`
    setUrlValue(normalizedPath)
    iframe.src = `${baseUrl}${normalizedPath}`
  }

  const handleReload = () => {
    if (loading) return
    // 走硬刷新：让父级重新调 preview-url 接口验证沙箱状态。
    // 沙箱已就绪时后端秒回，不会有感知延迟；沙箱销毁时会自动重建。
    if (onHardRefresh) {
      onHardRefresh()
      return
    }
    // fallback: 如果没传 onHardRefresh，走 iframe src 重赋值
    const iframe = iframeRef.current
    if (iframe) {
      iframe.src = iframe.src
    }
  }

  const handleBack = () => {
    if (loading) return
    try {
      iframeRef.current?.contentWindow?.history.back()
    } catch {
      // 跨域 iframe 不可访问 history — 静默降级
    }
  }

  const handleForward = () => {
    if (loading) return
    try {
      iframeRef.current?.contentWindow?.history.forward()
    } catch {
      // 跨域 iframe 不可访问 history — 静默降级
    }
  }

  return (
    <div className={`flex items-center gap-1 ${className ?? ''}`}>
      <button
        type="button"
        onClick={handleBack}
        disabled={loading}
        className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:pointer-events-none"
        title="后退"
        aria-label="后退"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={handleForward}
        disabled={loading}
        className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:pointer-events-none"
        title="前进"
        aria-label="前进"
      >
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={handleReload}
        disabled={loading}
        className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:pointer-events-none"
        title="刷新"
        aria-label="刷新"
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <RotateCw className="h-3.5 w-3.5" />
        )}
      </button>
      <form
        className="ml-1 flex-1 min-w-0"
        onSubmit={(e) => {
          e.preventDefault()
          navigate(urlValue)
        }}
      >
        <input
          type="text"
          value={urlValue}
          onChange={(e) => setUrlValue(e.target.value)}
          disabled={loading}
          className="h-6 w-full rounded-md bg-muted/50 px-2 text-[11px] text-foreground transition-colors outline-none focus:bg-muted focus:ring-1 focus:ring-ring disabled:opacity-50"
          aria-label="URL 路径"
          placeholder="/"
        />
      </form>
    </div>
  )
}

function extractPathFromUrl(url: string): string {
  try {
    const u = new URL(url)
    return u.pathname + u.search
  } catch {
    return '/'
  }
}
