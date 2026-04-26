import { ShieldAlert, Loader2 } from 'lucide-react'
import type { PermissionAction } from '@coder/shared'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { ToolConfirmData } from '@/types/task-chat'
import { PlanModeCard } from './plan-mode-card'
import { extractPlanContent } from './plan-content'

/**
 * InterruptionCard — 工具权限中断卡片
 *
 * 官方反编译对应组件：05-tool-call-components.tsx 的 Hv 组件。
 *
 * 两种渲染分支：
 * 1. 标准权限（P1）：允许 / 总是允许（本会话）/ 拒绝
 * 2. ExitPlanMode（P2）：委托给 PlanModeCard 组件
 */
interface InterruptionCardProps {
  data: ToolConfirmData
  isSending: boolean
  onDecision: (action: PermissionAction) => void
}

/**
 * 容错渲染 input：
 *   - 对象 → 格式化 JSON
 *   - JSON 字符串(刷新恢复路径) → 解析后再格式化,避免双重转义
 *   - 普通字符串 → 原样输出
 */
function formatInput(input: unknown): string {
  if (typeof input === 'string') {
    const trimmed = input.trim()
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return JSON.stringify(JSON.parse(trimmed), null, 2)
      } catch {
        // fallthrough → 原样输出
      }
    }
    return input
  }
  return JSON.stringify(input, null, 2)
}

export function InterruptionCard({ data, isSending, onDecision }: InterruptionCardProps) {
  const isExitPlanMode = data.toolName === 'ExitPlanMode'

  // P2: ExitPlanMode 单独委托给 PlanModeCard 渲染，避免这里堆叠太多分支逻辑
  if (isExitPlanMode) {
    // 优先使用服务端注入的 planContent；否则从 input 各种常见字段中兜底提取
    const planContent = data.planContent ?? extractPlanContent(data.input)
    return <PlanModeCard planContent={planContent} isSending={isSending} onDecision={onDecision} />
  }

  return (
    <Card className="p-3 border-orange-500/50 bg-orange-500/5">
      <div className="flex items-center gap-2 mb-2">
        <ShieldAlert className="h-4 w-4 text-orange-500" />
        <span className="text-sm font-medium">工具调用需要确认</span>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {data.toolName}
          </Badge>
        </div>
        <div className="bg-muted/50 rounded p-2 max-h-48 overflow-auto">
          <pre className="text-xs whitespace-pre-wrap break-all">{formatInput(data.input)}</pre>
        </div>
      </div>

      <div className="flex justify-end gap-2 mt-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onDecision('deny')}
          disabled={isSending}
          className="text-red-500 border-red-500/50 hover:bg-red-500/10"
        >
          拒绝
        </Button>
        <Button variant="outline" size="sm" onClick={() => onDecision('allow_always')} disabled={isSending}>
          总是允许（本会话）
        </Button>
        <Button size="sm" onClick={() => onDecision('allow')} disabled={isSending}>
          {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : '允许'}
        </Button>
      </div>
    </Card>
  )
}
