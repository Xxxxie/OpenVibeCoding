import { useEffect, useState, useCallback } from 'react'
import { useDatabaseState } from '../hooks/useDatabaseState'
import { databaseAPI } from '../services/database'
import DataTable from '../components/data/DataTable'
import DocList from '../components/data/DocList'
import DocumentEditor from '../components/data/DocumentEditor'
import { Button, Badge } from '../components/ui'
import { RefreshCw, Plus, Table2, LayoutList } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '../utils/helpers'

type ViewMode = 'table' | 'doc'

export default function DatabasePage() {
  const {
    activeCollection,
    documents,
    total,
    currentPage,
    pageSize,
    loading,
    error,
    isEditorOpen,
    editorMode,
    editingDocument,
    setDocuments,
    setTotal,
    setCurrentPage,
    setLoading,
    setError,
    openEditor,
    closeEditor,
  } = useDatabaseState()

  const [viewMode, setViewMode] = useState<ViewMode>('doc')
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const load = useCallback(
    async (collection: string, page: number, q?: string) => {
      setLoading(true)
      try {
        const result = await databaseAPI.getDocuments(collection, page, pageSize, q)
        setDocuments(result.documents)
        setTotal(result.total)
        setError(null)
        setSelectedIds(new Set())
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载失败')
        toast.error('加载文档失败')
      } finally {
        setLoading(false)
      }
    },
    [pageSize, setDocuments, setTotal, setLoading, setError],
  )

  useEffect(() => {
    if (!activeCollection) return
    load(activeCollection, currentPage, search || undefined)
  }, [activeCollection, currentPage])

  // search 变化时重置到第 1 页并重新加载
  const handleSearch = useCallback(
    (q: string) => {
      setSearch(q)
      setCurrentPage(1)
      if (activeCollection) load(activeCollection, 1, q || undefined)
    },
    [activeCollection, load, setCurrentPage],
  )

  const handleRefresh = useCallback(() => {
    if (activeCollection) load(activeCollection, currentPage, search || undefined)
  }, [activeCollection, currentPage, search, load])

  const handleDelete = async (id: string) => {
    if (!activeCollection) return
    try {
      await databaseAPI.deleteDocument(activeCollection, id)
      toast.success('已删除')
      handleRefresh()
    } catch {
      toast.error('删除失败')
    }
  }

  const handleDeleteSelected = async () => {
    if (!activeCollection || selectedIds.size === 0) return
    if (!confirm(`确认删除选中的 ${selectedIds.size} 条文档？`)) return
    try {
      await Promise.all([...selectedIds].map((id) => databaseAPI.deleteDocument(activeCollection, id)))
      toast.success(`已删除 ${selectedIds.size} 条文档`)
      handleRefresh()
    } catch {
      toast.error('批量删除失败')
    }
  }

  const handleSave = async (data: any) => {
    if (!activeCollection) return
    try {
      if (editorMode === 'create') {
        await databaseAPI.createDocument(activeCollection, data)
        toast.success('文档已创建')
      } else if (editingDocument) {
        await databaseAPI.updateDocument(activeCollection, (editingDocument as any)._id, data)
        toast.success('文档已更新')
      }
      closeEditor()
      handleRefresh()
    } catch {
      toast.error('保存失败')
    }
  }

  if (!activeCollection) {
    return (
      <div className="flex items-center justify-center h-full bg-bg-default/70">
        <div className="text-center space-y-1.5">
          <p className="text-sm text-fg-lighter">请从侧栏选择一个集合</p>
          <p className="text-xs text-fg-muted">选择集合后即可查看和编辑文档</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-bg-default/70">
      {/* Header Toolbar */}
      <div className="flex min-h-12 items-center justify-between border-b border-border-muted px-4 bg-bg-surface-100/30 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-fg-default">{activeCollection}</span>
          <Badge>{total}</Badge>
          {selectedIds.size > 0 && <span className="text-[11px] text-brand">{selectedIds.size} 已选</span>}
        </div>
        <div className="flex items-center gap-1.5">
          {/* 视图切换 */}
          <div className="flex items-center gap-0.5 rounded-md border border-border-default bg-bg-surface-200 p-0.5">
            <button
              onClick={() => setViewMode('table')}
              className={cn(
                'flex items-center gap-1 h-6 px-2 rounded text-xs transition-colors',
                viewMode === 'table' ? 'bg-bg-surface-400 text-fg-default' : 'text-fg-muted hover:text-fg-lighter',
              )}
            >
              <Table2 size={12} /> 表格
            </button>
            <button
              onClick={() => setViewMode('doc')}
              className={cn(
                'flex items-center gap-1 h-6 px-2 rounded text-xs transition-colors',
                viewMode === 'doc' ? 'bg-bg-surface-400 text-fg-default' : 'text-fg-muted hover:text-fg-lighter',
              )}
            >
              <LayoutList size={12} /> 文档
            </button>
          </div>

          <Button variant="ghost" size="tiny" onClick={handleRefresh} disabled={loading}>
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </Button>
          <Button variant="primary" size="tiny" onClick={() => openEditor(null, 'create')}>
            <Plus size={12} /> Insert
          </Button>
        </div>
      </div>

      {/* 内容区 */}
      {error ? (
        <div className="flex items-center justify-center flex-1">
          <p className="text-xs text-destructive">{error}</p>
        </div>
      ) : viewMode === 'table' ? (
        <DataTable
          documents={documents}
          loading={loading}
          total={total}
          page={currentPage}
          pageSize={pageSize}
          search={search}
          onSearch={handleSearch}
          onPageChange={setCurrentPage}
          onEditRow={(doc) => openEditor(doc, 'edit')}
          onCellEdit={async (id, field, value) => {
            try {
              await databaseAPI.updateDocument(activeCollection, id, { [field]: value })
              // 就地更新本地 documents，不整体刷新
              setDocuments(documents.map((doc: any) => (doc._id === id ? { ...doc, [field]: value } : doc)))
            } catch {
              toast.error('保存失败')
            }
          }}
          onDeleteRow={handleDelete}
          onAddRow={() => openEditor(null, 'create')}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          onDeleteSelected={handleDeleteSelected}
        />
      ) : (
        <DocList
          documents={documents}
          total={total}
          page={currentPage}
          pageSize={pageSize}
          loading={loading}
          search={search}
          onSearch={handleSearch}
          onPageChange={setCurrentPage}
          onEdit={(doc) => openEditor(doc, 'edit')}
          onDelete={handleDelete}
          onAdd={() => openEditor(null, 'create')}
        />
      )}

      <DocumentEditor
        open={isEditorOpen}
        onOpenChange={(open) => {
          if (!open) closeEditor()
        }}
        mode={editorMode}
        document={editingDocument}
        collectionName={activeCollection}
        onSave={handleSave}
      />
    </div>
  )
}
