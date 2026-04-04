import { ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '../../utils/helpers'

interface ModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
  title?: string
  description?: string
  size?: 'sm' | 'md' | 'lg'
}

const sizeStyles = {
  sm: 'max-w-[400px]',
  md: 'max-w-[560px]',
  lg: 'max-w-[720px]',
}

export const Modal = ({ open, onOpenChange, children, title, description, size = 'md' }: ModalProps) => (
  <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
      <Dialog.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 w-full -translate-x-1/2 -translate-y-1/2',
          'rounded-lg border border-border-default bg-bg-overlay shadow-xl',
          'focus:outline-none',
          sizeStyles[size],
        )}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-border-default px-6 py-4">
            <div>
              <Dialog.Title className="text-sm font-medium text-fg-default">{title}</Dialog.Title>
              {description && (
                <Dialog.Description className="mt-1 text-xs text-fg-lighter">{description}</Dialog.Description>
              )}
            </div>
            <Dialog.Close className="rounded p-1 text-fg-lighter hover:text-fg-default hover:bg-bg-surface-300 transition-colors">
              <X size={16} />
            </Dialog.Close>
          </div>
        )}
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
)

export const ModalBody = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cn('px-6 py-4', className)}>{children}</div>
)

export const ModalFooter = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cn('flex items-center justify-end gap-2 border-t border-border-default px-6 py-3', className)}>
    {children}
  </div>
)
