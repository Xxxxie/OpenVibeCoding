import { atom } from 'jotai'
import { atomWithStorage, atomFamily } from 'jotai/utils'

export interface GitHubConnection {
  connected: boolean
  username?: string
  connectedAt?: Date
}

export const githubConnectionAtom = atom<GitHubConnection>({ connected: false })
export const githubConnectionInitializedAtom = atom(false)

// Session atom re-export with extended type for original compatibility
export interface SessionUserInfo {
  user?: {
    id: string
    username: string
    email?: string
    avatar?: string
    name?: string
  }
  authProvider?: 'github' | 'vercel'
}

// Multi-repo mode atoms
export interface SelectedRepo {
  owner: string
  repo: string
  full_name: string
  clone_url: string
}

export const multiRepoModeAtom = atom<boolean>(false)
export const selectedReposAtom = atom<SelectedRepo[]>([])

// Agent selection atoms
export const lastSelectedAgentAtom = atomWithStorage<string | null>('last-selected-agent', null)
export const lastSelectedModelAtomFamily = atomFamily((agent: string) =>
  atomWithStorage<string | null>(`last-selected-model-${agent}`, null),
)

// GitHub cache atoms
interface GitHubRepo {
  name: string
  full_name: string
  description: string
  private: boolean
  clone_url: string
  language: string
}

export const githubReposAtomFamily = atomFamily((owner: string) =>
  atomWithStorage<GitHubRepo[] | null>(`github-repos-${owner}`, null),
)
