import { useCallback } from 'react'
import { useAtom } from 'jotai'
import { databaseStateAtom } from '../atoms/database'

export function useDatabaseState() {
  const [state, setState] = useAtom(databaseStateAtom)

  const setActiveCollection = useCallback(
    (collection: string | null) => {
      setState((prev) => ({ ...prev, activeCollection: collection, currentPage: 1, searchQuery: '' }))
    },
    [setState],
  )

  const setDocuments = useCallback(
    (documents: any[]) => {
      setState((prev) => ({ ...prev, documents }))
    },
    [setState],
  )

  const setTotal = useCallback(
    (total: number) => {
      setState((prev) => ({ ...prev, total }))
    },
    [setState],
  )

  const setCurrentPage = useCallback(
    (page: number) => {
      setState((prev) => ({ ...prev, currentPage: page }))
    },
    [setState],
  )

  const setLoading = useCallback(
    (loading: boolean) => {
      setState((prev) => ({ ...prev, loading }))
    },
    [setState],
  )

  const setError = useCallback(
    (error: string | null) => {
      setState((prev) => ({ ...prev, error }))
    },
    [setState],
  )

  const openEditor = useCallback(
    (doc: any | null, mode: 'create' | 'edit') => {
      setState((prev) => ({ ...prev, isEditorOpen: true, editorMode: mode, editingDocument: doc }))
    },
    [setState],
  )

  const closeEditor = useCallback(() => {
    setState((prev) => ({ ...prev, isEditorOpen: false, editingDocument: null }))
  }, [setState])

  return {
    ...state,
    setActiveCollection,
    setDocuments,
    setTotal,
    setCurrentPage,
    setLoading,
    setError,
    openEditor,
    closeEditor,
  }
}
