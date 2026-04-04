import { ReactNode } from 'react'
import { cn } from '../../utils/helpers'

interface CardProps {
  children?: ReactNode
  className?: string
}

export const Card = ({ children, className }: CardProps) => (
  <div className={cn('rounded-lg border border-border-default bg-bg-surface-100', className)}>{children}</div>
)

export const CardHeader = ({ children, className }: CardProps) => (
  <div className={cn('border-b border-border-default px-6 py-4', className)}>{children}</div>
)

export const CardTitle = ({ children, className }: CardProps) => (
  <h3 className={cn('text-sm font-medium text-fg-default', className)}>{children}</h3>
)

export const CardContent = ({ children, className }: CardProps) => (
  <div className={cn('px-6 py-4', className)}>{children}</div>
)

export const CardFooter = ({ children, className }: CardProps) => (
  <div className={cn('border-t border-border-default px-6 py-3 flex items-center justify-end gap-3', className)}>
    {children}
  </div>
)
