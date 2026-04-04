import { Hono } from 'hono'
import {
  getBuckets,
  listStorageFiles,
  listHostingFiles,
  getDownloadUrl,
  deleteFile,
  deleteHostingFile,
} from '../cloudbase/storage.js'

const router = new Hono()

// 获取存储桶信息
router.get('/buckets', async (c) => {
  try {
    return c.json(await getBuckets())
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// 列出文件（bucketType=storage|static）
router.get('/files', async (c) => {
  try {
    const prefix = c.req.query('prefix') || ''
    const bucketType = c.req.query('bucketType') || 'storage'
    const cdnDomain = c.req.query('cdnDomain') || ''

    const files = bucketType === 'static' ? await listHostingFiles(prefix, cdnDomain) : await listStorageFiles(prefix)

    return c.json(files)
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// 获取文件下载链接（云存储）
router.get('/url', async (c) => {
  try {
    const path = c.req.query('path') || ''
    if (!path) return c.json({ error: '缺少 path 参数' }, 400)
    return c.json({ url: await getDownloadUrl(path) })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// 删除文件
router.delete('/files', async (c) => {
  try {
    const { path, bucketType } = await c.req.json()
    if (!path) return c.json({ error: '缺少 path 参数' }, 400)
    if (bucketType === 'static') {
      await deleteHostingFile(path)
    } else {
      await deleteFile(path)
    }
    return c.json({ success: true })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

export default router
