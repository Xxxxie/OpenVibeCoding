import { atom } from 'jotai'
import type { BucketInfo } from '../services/storage'

export const activeBucketAtom = atom<BucketInfo | null>(null)
export const storagePrefixAtom = atom<string>('')
