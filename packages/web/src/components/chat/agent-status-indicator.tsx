import { Loader2, Rocket, Sparkles, Hammer, Archive } from 'lucide-react'
import type { AgentPhaseName } from '@coder/shared'
import type { ComponentType } from 'react'

/**
 * AgentStatusIndicator — 代理执行阶段指示器(P4 前端)
 *
 * 对应官方反编译 05-tool-call-components.tsx 的 AgentStatusLine 组件。
 * 服务端通过 `sessionUpdate: 'agent_phase'` 事件推送阶段,
 * 此处只负责把 {phase, toolName} 映射成一条"…中"样式的状态行。
 *
 * 设计细节:
 *   - phase === null → 直接返回 null,避免空容器占位
 *   - 图标按 phase 分色(准备中蓝 / 模型响应紫 / 工具执行橙 / 压缩中灰)
 *   - aria-live="polite" 让屏幕阅读器在 phase 切换时朗读
 */

interface AgentStatusIndicatorProps {
  phase: AgentPhaseName | null
  toolName?: string
  /** 额外 className(如 padding / margin) */
  className?: string
}

interface PhaseConfig {
  Icon: ComponentType<{ className?: string }>
  iconClass: string
  /** 根据 toolName 动态生成文案的函数 */
  label: (toolName?: string) => string
}

/**
 * 工具名显示归一化:剥掉 `mcp__<server>__` 前缀,与 ToolCallCard 保持一致
 */
function prettyToolName(name?: string): string {
  if (!name) return ''
  return name.replace(/^mcp__[^_]+__/, '')
}

const PHASE_CONFIG: Record<AgentPhaseName, PhaseConfig> = {
  preparing: {
    Icon: Rocket,
    iconClass: 'text-blue-500',
    label: () => '准备中...',
  },
  model_responding: {
    Icon: Sparkles,
    iconClass: 'text-primary',
    label: () => '模型响应中...',
  },
  tool_executing: {
    Icon: Hammer,
    iconClass: 'text-orange-500',
    label: (toolName) => (toolName ? `执行 ${prettyToolName(toolName)} 中...` : '工具执行中...'),
  },
  compacting: {
    Icon: Archive,
    iconClass: 'text-muted-foreground',
    label: () => '正在压缩上下文...',
  },
  idle: {
    // idle 不会渲染,这里占位保证类型完备
    Icon: Loader2,
    iconClass: '',
    label: () => '',
  },
}

export function AgentStatusIndicator({ phase, toolName, className }: AgentStatusIndicatorProps) {
  if (!phase || phase === 'idle') return null
  const cfg = PHASE_CONFIG[phase]
  const text = cfg.label(toolName)
  if (!text) return null
  const { Icon } = cfg

  return (
    <div aria-live="polite" className={`flex items-center gap-2 text-xs text-muted-foreground ${className ?? ''}`}>
      {/* 主图标:phase 主题色 */}
      <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${cfg.iconClass}`} />
      {/* 文案 + 旋转 Loader 的组合(Loader 表示"仍在进行中") */}
      <span className="truncate">{text}</span>
      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/60 flex-shrink-0" />
    </div>
  )
}
