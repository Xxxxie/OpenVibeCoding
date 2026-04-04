import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth.js'
import CloudBase from '@cloudbase/manager-node'
import type { AppEnv } from '../middleware/auth.js'

const router = new Hono<AppEnv>()

// 通用腾讯云 API 代理
// POST /api/capi
// Body: { service: 'tcb', action: 'DescribeEnvs', params: {} }
router.post('/', async (c) => {
  const authError = requireAuth(c)
  if (authError) return authError

  const secretId = process.env.TCB_SECRET_ID
  const secretKey = process.env.TCB_SECRET_KEY
  const envId = process.env.TCB_ENV_ID
  if (!secretId || !secretKey || !envId) {
    return c.json({ error: '服务端未配置密钥' }, 500)
  }

  let body: { service?: string; action?: string; params?: Record<string, unknown> }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: '无效的请求体' }, 400)
  }

  const { service, action, params = {} } = body

  if (!service || !action) {
    return c.json({ error: '缺少 service / action 参数' }, 400)
  }

  try {
    const app = new CloudBase({
      secretId,
      secretKey,
      envId,
    })

    const result = await app.commonService(service).call({
      Action: action,
      Param: params,
    })

    return c.json({ result })
  } catch (e: any) {
    return c.json({ error: e.message, code: e.code }, 500)
  }
})

export default router
