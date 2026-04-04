import { atom } from 'jotai'
import { atomFamily } from 'jotai/utils'

export const taskPromptAtom = atom('')

// Per-task chat input atom family
// Each task gets its own writable atom
export const taskChatInputAtomFamily = atomFamily((_taskId: string) => atom(''))
