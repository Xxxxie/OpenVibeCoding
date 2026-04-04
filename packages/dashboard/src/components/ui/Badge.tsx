import { cn } from '../../utils/helpers'
import { ReactNode } from 'react'

interface BadgeProps {
  children?: ReactNode
  className?: string
  variant?: 'default' | 'success' | 'warning' | 'error'
}

export const Badge = ({ children, className, variant = 'default' }: BadgeProps) => {
  const styles = {
    default: 'bg-bg-surface-300 text-fg-light',
    success: 'bg-brand/10 text-brand',
    warning: 'bg-warning/10 text-warning',
    error: 'bg-destructive/10 text-destructive',
  }

  return (
    <span
      className={cn('inline-flex items-center rounded px-2 py-0.5 text-xs font-medium', styles[variant], className)}
    >
      {children}
    </span>
  )
}
