import { forwardRef, ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../../utils/helpers'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'default' | 'ghost' | 'danger' | 'outline' | 'dashed'
  size?: 'tiny' | 'small' | 'medium' | 'large'
  children?: ReactNode
  loading?: boolean
}

// 精确参照 Supabase Studio button 风格
// primary (brand): bg-brand-500 dark => bg-brand-500, hover => bg-brand/80
// default: bg-surface-control border border-default
// ghost: no bg, no border
// danger: bg-destructive-500 border-destructive/30
// outline: border only

const variantBase = [
  'relative cursor-pointer inline-flex justify-center items-center',
  'gap-1.5 text-center font-normal text-xs',
  'ease-out duration-200 rounded-md',
  'outline-none transition-all outline-0',
  'focus-visible:outline-4 focus-visible:outline-offset-1',
  'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
  'border',
].join(' ')

const variantStyles: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: [
    'bg-brand-500',
    'hover:bg-brand/80',
    'text-fg-default',
    'border-brand/30',
    'hover:border-brand',
    'focus-visible:outline-brand-600',
    '[&_svg]:text-brand-600',
    'shimmer',
  ].join(' '),

  default: [
    'bg-bg-surface-100',
    'hover:bg-bg-surface-200',
    'text-fg-default',
    'border-border-default',
    'hover:border-border-strong',
    'focus-visible:outline-brand',
    '[&_svg]:text-fg-lighter',
  ].join(' '),

  ghost: [
    'bg-transparent',
    'hover:bg-bg-surface-200',
    'text-fg-light',
    'hover:text-fg-default',
    'border-transparent',
    'hover:border-border-muted',
    'focus-visible:outline-brand',
    '[&_svg]:text-fg-muted',
    'hover:[&_svg]:text-fg-lighter',
  ].join(' '),

  danger: [
    'bg-destructive-500',
    'hover:bg-destructive/80',
    'text-fg-default',
    'border-destructive/30',
    'hover:border-destructive',
    'focus-visible:outline-destructive',
    '[&_svg]:text-destructive-600',
  ].join(' '),

  outline: [
    'bg-transparent',
    'hover:bg-bg-surface-200',
    'text-fg-light',
    'hover:text-fg-default',
    'border-border-strong',
    'hover:border-border-stronger',
    'focus-visible:outline-brand',
    '[&_svg]:text-fg-lighter',
  ].join(' '),

  dashed: [
    'bg-transparent',
    'hover:bg-bg-surface-100',
    'text-fg-lighter',
    'hover:text-fg-light',
    'border-border-default border-dashed',
    'hover:border-border-strong',
    'focus-visible:outline-brand',
    '[&_svg]:text-fg-muted',
  ].join(' '),
}

const sizeStyles: Record<NonNullable<ButtonProps['size']>, string> = {
  tiny: 'px-2.5 py-1 h-[26px] [&_svg]:h-[14px] [&_svg]:w-[14px]',
  small: 'px-3 py-1.5 h-[30px] [&_svg]:h-[14px] [&_svg]:w-[14px]',
  medium: 'px-4 py-2 h-[34px] [&_svg]:h-[16px] [&_svg]:w-[16px]',
  large: 'px-5 py-2.5 h-[38px] [&_svg]:h-[18px] [&_svg]:w-[18px]',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'tiny', children, loading, disabled, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(variantBase, variantStyles[variant], sizeStyles[size], className)}
      {...props}
    >
      {children}
    </button>
  ),
)

Button.displayName = 'Button'
