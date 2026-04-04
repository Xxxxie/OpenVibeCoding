/// <reference types="vite/client" />

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

export interface BucketInfo {
  type: 'storage' | 'static'
  name: string
  label: string
  bucket: string
  region: string
  cdnDomain: string
  customDomain?: string
  isPublic: boolean
}

export interface FileInfo {
  key: string
  name: string
  size: number
  lastModified: string
  isDir: boolean
  fileId?: string // 云存储: cloud://envId/xxx
  publicUrl?: string // 静态托管: https://cdnDomain/xxx
}

class StorageAPI {
  private base: string

  constructor(base = API_BASE) {
    this.base = base
  }

  async getBuckets(): Promise<BucketInfo[]> {
    const r = await fetch(`${this.base}/storage/buckets`, { credentials: 'include' })
    if (!r.ok) throw new Error(await r.text())
    return r.json()
  }

  async listFiles(prefix = '', bucket: BucketInfo): Promise<FileInfo[]> {
    const p = new URLSearchParams({
      prefix,
      bucketType: bucket.type,
      cdnDomain: bucket.cdnDomain,
    })
    const r = await fetch(`${this.base}/storage/files?${p}`, { credentials: 'include' })
    if (!r.ok) throw new Error(await r.text())
    return r.json()
  }

  async getDownloadUrl(path: string): Promise<string> {
    const p = new URLSearchParams({ path })
    const r = await fetch(`${this.base}/storage/url?${p}`, { credentials: 'include' })
    if (!r.ok) throw new Error(await r.text())
    const data = await r.json()
    return data.url
  }

  async deleteFile(path: string, bucketType: 'storage' | 'static'): Promise<void> {
    const r = await fetch(`${this.base}/storage/files`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ path, bucketType }),
    })
    if (!r.ok) throw new Error(await r.text())
  }
}

export const storageAPI = new StorageAPI()
