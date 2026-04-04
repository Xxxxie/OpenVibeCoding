import CloudBase from '@cloudbase/manager-node'
import { AuthSupervisor } from '@cloudbase/toolbox'
import { loadConfig } from '../config/store.js'
import type { CollectionInfo, CollectionListResult, DocumentQueryResult } from '@coder/shared'

const auth = AuthSupervisor.getInstance({})

// ─── 获取 Manager 实例 ──────────────────────────────────

export async function getManager(): Promise<CloudBase> {
  // 优先使用环境变量（Dashboard 模式）
  if (process.env.TCB_SECRET_ID && process.env.TCB_ENV_ID) {
    return new CloudBase({
      secretId: process.env.TCB_SECRET_ID,
      secretKey: process.env.TCB_SECRET_KEY || '',
      token: process.env.TCB_TOKEN || '',
      envId: process.env.TCB_ENV_ID,
      proxy: process.env.http_proxy,
    })
  }

  // 回退到登录态
  const loginState = await auth.getLoginState()
  if (!loginState) throw new Error('未登录')
  const config = loadConfig()
  if (!config.cloudbase?.envId) throw new Error('未绑定环境')

  return new CloudBase({
    secretId: (loginState as any).secretId,
    secretKey: (loginState as any).secretKey,
    token: (loginState as any).token,
    envId: config.cloudbase.envId,
    proxy: process.env.http_proxy,
    region: config.cloudbase.region,
  })
}

// ─── 获取数据库实例 ID ──────────────────────────────────

async function getDatabaseInstanceId(manager: CloudBase): Promise<string> {
  const { EnvInfo } = await manager.env.getEnvInfo()
  if (!EnvInfo?.Databases?.[0]?.InstanceId) {
    throw new Error('无法获取数据库实例ID')
  }
  return EnvInfo.Databases[0].InstanceId
}

// ─── 集合管理 ───────────────────────────────────────────

export async function listCollections(): Promise<CollectionListResult> {
  const manager = await getManager()
  const result = await manager.database.listCollections({
    MgoOffset: 0,
    MgoLimit: 1000,
  })
  const collections: CollectionInfo[] = (result.Collections || []).map((c: any) => ({
    CollectionName: c.CollectionName,
    Count: c.Count,
    Size: c.Size,
    IndexCount: c.IndexCount,
    IndexSize: c.IndexSize,
  }))
  return {
    collections,
    total: result.Pager?.Total ?? collections.length,
  }
}

export async function createCollection(name: string): Promise<void> {
  const manager = await getManager()
  await manager.database.createCollection(name)
  // 等待集合就绪
  await waitForCollectionReady(manager, name)
}

export async function deleteCollection(name: string): Promise<void> {
  const manager = await getManager()
  await manager.database.deleteCollection(name)
}

// ─── 文档 CRUD ──────────────────────────────────────────

export async function queryDocuments(
  collection: string,
  page = 1,
  pageSize = 50,
  where?: Record<string, unknown>,
): Promise<DocumentQueryResult> {
  const manager = await getManager()
  const instanceId = await getDatabaseInstanceId(manager)
  const offset = (page - 1) * pageSize

  // 构建 MgoQuery：支持传入自定义 where 条件
  const mgoQuery = where && Object.keys(where).length > 0 ? JSON.stringify(where) : '{}'

  const result = await manager.commonService('tcb', '2018-06-08').call({
    Action: 'QueryRecords',
    Param: {
      TableName: collection,
      MgoQuery: mgoQuery,
      MgoLimit: pageSize,
      MgoOffset: offset,
      Tag: instanceId,
    },
  })

  const documents = (result.Data || []).map((item: unknown) => {
    if (typeof item === 'string') {
      try {
        const parsed = JSON.parse(item)
        return typeof parsed === 'object' && parsed !== null ? parsed : item
      } catch {
        return item
      }
    }
    return item
  }) as Record<string, unknown>[]

  return {
    documents,
    total: result.Pager?.Total ?? documents.length,
    page,
    pageSize,
  }
}

export async function insertDocument(collection: string, data: Record<string, unknown>): Promise<string> {
  const manager = await getManager()
  const instanceId = await getDatabaseInstanceId(manager)

  const result = await manager.commonService('tcb', '2018-06-08').call({
    Action: 'PutItem',
    Param: {
      TableName: collection,
      MgoDocs: [JSON.stringify(data)],
      Tag: instanceId,
    },
  })

  return result.InsertedIds?.[0] ?? ''
}

export async function updateDocument(collection: string, docId: string, data: Record<string, unknown>): Promise<void> {
  const manager = await getManager()
  const instanceId = await getDatabaseInstanceId(manager)

  // 移除 _id 字段，不允许更新
  const { _id, ...updateData } = data

  await manager.commonService('tcb', '2018-06-08').call({
    Action: 'UpdateItem',
    Param: {
      TableName: collection,
      MgoQuery: JSON.stringify({ _id: docId }),
      MgoUpdate: JSON.stringify({ $set: updateData }),
      MgoIsMulti: false,
      MgoUpsert: false,
      Tag: instanceId,
    },
  })
}

export async function deleteDocument(collection: string, docId: string): Promise<void> {
  const manager = await getManager()
  const instanceId = await getDatabaseInstanceId(manager)

  await manager.commonService('tcb', '2018-06-08').call({
    Action: 'DeleteItem',
    Param: {
      TableName: collection,
      MgoQuery: JSON.stringify({ _id: docId }),
      MgoIsMulti: false,
      Tag: instanceId,
    },
  })
}

// ─── 工具函数 ───────────────────────────────────────────

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

async function waitForCollectionReady(
  manager: CloudBase,
  name: string,
  timeoutMs = 10000,
  intervalMs = 500,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() <= deadline) {
    try {
      const result = await manager.database.checkCollectionExists(name)
      if (result.Exists) return
    } catch {
      // 继续轮询
    }
    if (Date.now() + intervalMs > deadline) break
    await delay(intervalMs)
  }
  throw new Error(`Collection ${name} creation timed out`)
}
