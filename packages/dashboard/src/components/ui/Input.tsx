import { forwardRef, InputHTMLAttributes } from 'react'
import { cn } from '../../utils/helpers'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

export const Input = forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'h-9 w-full rounded border border-border-default bg-bg-surface-200 px-3 text-sm text-fg-default',
      'placeholder:text-fg-muted',
      'focus:border-brand focus:ring-1 focus:ring-brand/30 focus:outline-none',
      'transition-colors duration-150',
      className,
    )}
    {...props}
  />
))

Input.displayName = 'Input'
