import { getManager } from './database.js'

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
  fileId?: string // 仅云存储: cloud://envId/xxx
  publicUrl?: string // 仅静态托管: https://cdnDomain/xxx
}

// 获取环境存储桶信息
export async function getBuckets(): Promise<BucketInfo[]> {
  const manager = await getManager()
  const { EnvInfo } = await manager.env.getEnvInfo()
  const envId = process.env.TCB_ENV_ID || ''
  const buckets: BucketInfo[] = []

  // 云存储（私有）
  const storage = EnvInfo?.Storages?.[0]
  if (storage) {
    buckets.push({
      type: 'storage',
      name: storage.Bucket ?? '',
      label: '云存储',
      bucket: storage.Bucket ?? '',
      region: storage.Region ?? '',
      cdnDomain: (storage as any).CdnDomain || '',
      isPublic: false,
    })
  }

  // 静态托管（公有读）
  try {
    const hostingInfo = await manager.hosting.getInfo()
    const hosting = hostingInfo?.[0]
    if (hosting) {
      buckets.push({
        type: 'static',
        name: hosting.Bucket || 'static',
        label: '静态托管',
        bucket: hosting.Bucket || '',
        region: (hosting as any).Regoin || storage?.Region || 'ap-shanghai',
        cdnDomain: hosting.CdnDomain || '',
        isPublic: true,
      })
    }
  } catch {
    // 静态托管未开启时忽略
    const staticStore = (EnvInfo as any)?.StaticStorages?.[0]
    if (staticStore) {
      buckets.push({
        type: 'static',
        name: staticStore.Bucket || 'static',
        label: '静态托管',
        bucket: staticStore.Bucket || '',
        region: staticStore.Region || storage?.Region || 'ap-shanghai',
        cdnDomain: staticStore.CdnDomain || '',
        isPublic: true,
      })
    }
  }

  return buckets
}

// 列出云存储文件（带 fileId）
export async function listStorageFiles(prefix: string = ''): Promise<FileInfo[]> {
  const manager = await getManager()
  const envId = process.env.TCB_ENV_ID || ''
  const files = await manager.storage.walkCloudDir(prefix)

  const fileMap = new Map<string, FileInfo>()

  for (const f of files) {
    const key = f.Key
    if (!key) continue

    const rel = prefix ? key.slice(prefix.length) : key
    if (!rel) continue

    const slashIdx = rel.indexOf('/')
    if (slashIdx !== -1 && slashIdx < rel.length - 1) {
      const dirName = rel.slice(0, slashIdx + 1)
      const dirKey = prefix + dirName
      if (!fileMap.has(dirKey)) {
        fileMap.set(dirKey, {
          key: dirKey,
          name: dirName.replace(/\/$/, ''),
          size: 0,
          lastModified: f.LastModified,
          isDir: true,
        })
      }
    } else {
      fileMap.set(key, {
        key,
        name: rel.replace(/\/$/, ''),
        size: Number(f.Size) || 0,
        lastModified: f.LastModified,
        isDir: false,
        fileId: `cloud://${envId}/${key}`,
      })
    }
  }

  return Array.from(fileMap.values())
}

// 列出静态托管文件（带公开 URL）
export async function listHostingFiles(prefix: string = '', cdnDomain: string = ''): Promise<FileInfo[]> {
  const manager = await getManager()
  const result = await manager.hosting.listFiles()
  const fileMap = new Map<string, FileInfo>()

  for (const f of result || []) {
    const key: string = (f as any).Key || ''
    if (!key) continue
    if (prefix && !key.startsWith(prefix)) continue

    const rel = prefix ? key.slice(prefix.length) : key
    if (!rel) continue

    const slashIdx = rel.indexOf('/')
    if (slashIdx !== -1 && slashIdx < rel.length - 1) {
      const dirName = rel.slice(0, slashIdx + 1)
      const dirKey = prefix + dirName
      if (!fileMap.has(dirKey)) {
        fileMap.set(dirKey, {
          key: dirKey,
          name: dirName.replace(/\/$/, ''),
          size: 0,
          lastModified: (f as any).LastModified || '',
          isDir: true,
        })
      }
    } else {
      const publicUrl = cdnDomain ? `https://${cdnDomain}/${key}` : ''
      fileMap.set(key, {
        key,
        name: rel.replace(/\/$/, ''),
        size: Number((f as any).Size) || 0,
        lastModified: (f as any).LastModified || '',
        isDir: false,
        publicUrl,
      })
    }
  }

  return Array.from(fileMap.values())
}

// 获取文件临时下载链接（云存储）
export async function getDownloadUrl(cloudPath: string): Promise<string> {
  const manager = await getManager()
  const result = await manager.storage.getTemporaryUrl([{ cloudPath, maxAge: 3600 }])
  return result?.[0]?.url || ''
}

// 删除文件（云存储）
export async function deleteFile(cloudPath: string): Promise<void> {
  const manager = await getManager()
  await manager.storage.deleteFile([cloudPath])
}

// 删除静态托管文件
export async function deleteHostingFile(cloudPath: string): Promise<void> {
  const manager = await getManager()
  await manager.hosting.deleteFiles({ cloudPath, isDir: false })
}
