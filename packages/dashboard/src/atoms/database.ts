import { atom } from 'jotai'

export interface DatabaseState {
  activeCollection: string | null
  collections: string[]
  documents: any[]
  total: number
  currentPage: number
  pageSize: number
  searchQuery: string
  loading: boolean
  error: string | null
  isEditorOpen: boolean
  editorMode: 'create' | 'edit'
  editingDocument: Record<string, unknown> | null
}

const initialState: DatabaseState = {
  activeCollection: null,
  collections: [],
  documents: [],
  total: 0,
  currentPage: 1,
  pageSize: 50,
  searchQuery: '',
  loading: false,
  error: null,
  isEditorOpen: false,
  editorMode: 'create',
  editingDocument: null,
}

export const databaseStateAtom = atom<DatabaseState>(initialState)
