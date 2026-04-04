// Stub: RepoSelector component
interface RepoSelectorProps {
  selectedOwner: string
  selectedRepo: string
  onOwnerChange: (owner: string) => void
  onRepoChange: (repo: string) => void
  size?: string
  onMultiRepoClick?: () => void
}

export function RepoSelector({
  selectedOwner,
  selectedRepo,
  onOwnerChange,
  onRepoChange,
  size,
  onMultiRepoClick,
}: RepoSelectorProps) {
  return (
    <div className="flex items-center gap-1 text-sm text-muted-foreground">
      <span>{selectedOwner || 'Select owner'}</span>
      <span>/</span>
      <span>{selectedRepo || 'Select repo'}</span>
    </div>
  )
}
