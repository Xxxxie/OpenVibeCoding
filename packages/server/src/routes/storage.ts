import { Hono } from 'hono'
import { requireUserEnv, type AppEnv } from '../middleware/auth.js'
import type { CloudBaseCredentials } from '../cloudbase/database.js'
import {
  getBuckets,
  listStorageFiles,
  listHostingFiles,
  getDownloadUrl,
  deleteFile,
  deleteHostingFile,
} from '../cloudbase/storage.js'
import { createManager } from '../cloudbase/database.js'
// @ts-ignore — COS SDK has no bundled types in some versions
import COS from 'cos-nodejs-sdk-v5'

const router = new Hono<AppEnv>()

function getCreds(c: any): CloudBaseCredentials {
  const { envId, credentials } = c.get('userEnv')!
  return {
    envId,
    secretId: credentials.secretId,
    secretKey: credentials.secretKey,
    sessionToken: credentials.sessionToken,
  }
}

router.get('/buckets', requireUserEnv, async (c) => {
  try {
    return c.json(await getBuckets(getCreds(c)))
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

router.get('/files', requireUserEnv, async (c) => {
  try {
    const prefix = c.req.query('prefix') || ''
    const bucketType = c.req.query('bucketType') || 'storage'
    const cdnDomain = c.req.query('cdnDomain') || ''
    const creds = getCreds(c)

    const files =
      bucketType === 'static' ? await listHostingFiles(creds, prefix, cdnDomain) : await listStorageFiles(creds, prefix)

    return c.json(files)
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

router.get('/url', requireUserEnv, async (c) => {
  try {
    const path = c.req.query('path') || ''
    if (!path) return c.json({ error: '缺少 path 参数' }, 400)
    return c.json({ url: await getDownloadUrl(getCreds(c), path) })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

router.delete('/files', requireUserEnv, async (c) => {
  try {
    const { path, bucketType } = await c.req.json()
    if (!path) return c.json({ error: '缺少 path 参数' }, 400)
    const creds = getCreds(c)
    if (bucketType === 'static') {
      await deleteHostingFile(creds, path)
    } else {
      await deleteFile(creds, path)
    }
    return c.json({ success: true })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// ---------------------------------------------------------------------------
// GET /api/storage/presign?key=xxx&bucketType=static|storage
// Generate a presigned PUT URL for COS bucket (static hosting or cloud storage).
// Returns: { presignedUrl, cdnUrl }
// ---------------------------------------------------------------------------
router.get('/presign', requireUserEnv, async (c) => {
  try {
    const key = c.req.query('key')
    const bucketType = c.req.query('bucketType') || 'storage'
    if (!key) return c.json({ error: 'key is required' }, 400)

    const creds = getCreds(c)
    const manager = createManager(creds)

    let bucket: string
    let region: string
    let cdnDomain = ''

    if (bucketType === 'static') {
      const hostingInfo = await manager.hosting.getInfo().catch(() => null)
      const hosting = hostingInfo?.[0]
      if (!hosting?.Bucket) return c.json({ error: 'Static hosting not configured' }, 404)
      bucket = hosting.Bucket as string
      region = (hosting as any).Regoin as string
      cdnDomain = hosting.CdnDomain as string
    } else {
      const { EnvInfo } = await manager.env.getEnvInfo()
      const storage = EnvInfo?.Storages?.[0]
      if (!storage?.Bucket) return c.json({ error: 'Cloud storage not configured' }, 404)
      bucket = storage.Bucket
      region = storage.Region ?? ''
      cdnDomain = (storage as any).CdnDomain || ''
    }

    const cos = new COS({
      SecretId: creds.secretId,
      SecretKey: creds.secretKey,
      ...(creds.sessionToken ? { SecurityToken: creds.sessionToken } : {}),
    })

    const presignedUrl = await new Promise<string>((resolve, reject) => {
      cos.getObjectUrl(
        { Bucket: bucket, Region: region, Key: key, Method: 'PUT', Sign: true, Expires: 1800 },
        (err: any, data: any) => (err ? reject(err) : resolve(data.Url)),
      )
    })

    const cdnUrl = cdnDomain ? `https://${cdnDomain}/${key}` : presignedUrl
    return c.json({ presignedUrl, cdnUrl })
  } catch (e: any) {
    console.error('[storage/presign] error:', e)
    return c.json({ error: e.message }, 500)
  }
})

export default router
