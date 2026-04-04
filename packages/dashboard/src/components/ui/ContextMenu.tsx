import { ReactNode } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { cn } from '../../utils/helpers'

interface ContextMenuProps {
  trigger: ReactNode
  children: ReactNode
}

export const ContextMenu = ({ trigger, children }: ContextMenuProps) => (
  <DropdownMenu.Root>
    <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        className="z-50 min-w-[160px] rounded-md border border-border-default bg-bg-overlay p-1 shadow-lg"
        sideOffset={4}
      >
        {children}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>
)

interface ContextMenuItemProps {
  children: ReactNode
  onSelect?: () => void
  destructive?: boolean
  className?: string
}

export const ContextMenuItem = ({ children, onSelect, destructive, className }: ContextMenuItemProps) => (
  <DropdownMenu.Item
    className={cn(
      'flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-xs outline-none transition-colors',
      destructive
        ? 'text-destructive hover:bg-destructive/10 focus:bg-destructive/10'
        : 'text-fg-default hover:bg-bg-surface-300 focus:bg-bg-surface-300',
      className,
    )}
    onSelect={onSelect}
  >
    {children}
  </DropdownMenu.Item>
)

export const ContextMenuSeparator = () => <DropdownMenu.Separator className="my-1 h-px bg-border-default" />
