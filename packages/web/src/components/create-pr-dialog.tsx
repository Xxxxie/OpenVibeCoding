interface CreatePRDialogProps {
  taskId: string
  defaultTitle: string
  defaultBody: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onPRCreated: (prUrl: string, prNumber: number) => void
}

export function CreatePRDialog({ open, onOpenChange }: CreatePRDialogProps) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center"
      onClick={() => onOpenChange(false)}
    >
      <div className="bg-background p-6 rounded-lg max-w-md" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-2">Create Pull Request</h2>
        <p className="text-sm text-muted-foreground">PR creation dialog - not yet implemented</p>
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
