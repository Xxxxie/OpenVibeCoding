interface SandboxesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SandboxesDialog({ open, onOpenChange }: SandboxesDialogProps) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center"
      onClick={() => onOpenChange(false)}
    >
      <div className="bg-background p-6 rounded-lg max-w-md" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-2">Sandboxes</h2>
        <p className="text-sm text-muted-foreground">Sandboxes dialog - not yet implemented</p>
        <button
          className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded"
          onClick={() => onOpenChange(false)}
        >
          Close
        </button>
      </div>
    </div>
  )
}
