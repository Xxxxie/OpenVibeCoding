import { Hono } from 'hono'
import { getDb } from '../db/index.js'
import { nanoid } from 'nanoid'
import { encrypt, decrypt } from '../lib/crypto'
import { requireAuth, type AppEnv } from '../middleware/auth'

const app = new Hono<AppEnv>()

// GET /api/miniprogram - List all miniprogram apps for user
app.get('/', async (c) => {
  const authErr = requireAuth(c)
  if (authErr) return authErr
  const session = c.get('session')!
  const userId = session.user.id

  const apps = await getDb().miniprogramApps.findByUserId(userId)

  // Mask privateKey in list response
  const masked = apps.map((app) => ({
    ...app,
    privateKey: '***',
  }))

  return c.json({ success: true, data: masked })
})

// POST /api/miniprogram - Create a new miniprogram app
app.post('/', async (c) => {
  const authErr = requireAuth(c)
  if (authErr) return authErr
  const session = c.get('session')!
  const userId = session.user.id
  const body = await c.req.json()

  const { name, appId, privateKey, description } = body
  if (!name || !appId || !privateKey) {
    return c.json({ error: 'name, appId, and privateKey are required' }, 400)
  }

  const app = await getDb().miniprogramApps.create({
    id: nanoid(),
    userId,
    name,
    appId,
    privateKey: encrypt(privateKey),
    description: description || null,
  })

  return c.json({ success: true, data: { ...app, privateKey: '***' } }, 201)
})

// PATCH /api/miniprogram/:id - Update a miniprogram app
app.patch('/:id', async (c) => {
  const authErr = requireAuth(c)
  if (authErr) return authErr
  const session = c.get('session')!
  const userId = session.user.id
  const { id } = c.req.param()
  const body = await c.req.json()

  const existing = await getDb().miniprogramApps.findByIdAndUserId(id, userId)
  if (!existing) return c.json({ error: 'Not found' }, 404)

  const update: Record<string, unknown> = {}
  if (body.name !== undefined) update.name = body.name
  if (body.appId !== undefined) update.appId = body.appId
  if (body.privateKey !== undefined) update.privateKey = encrypt(body.privateKey)
  if (body.description !== undefined) update.description = body.description

  const updated = await getDb().miniprogramApps.update(id, userId, update)
  return c.json({ success: true, data: updated ? { ...updated, privateKey: '***' } : null })
})

// DELETE /api/miniprogram/:id - Delete a miniprogram app
app.delete('/:id', async (c) => {
  const authErr = requireAuth(c)
  if (authErr) return authErr
  const session = c.get('session')!
  const userId = session.user.id
  const { id } = c.req.param()

  const existing = await getDb().miniprogramApps.findByIdAndUserId(id, userId)
  if (!existing) return c.json({ error: 'Not found' }, 404)

  await getDb().miniprogramApps.delete(id, userId)
  return c.json({ success: true, message: 'Deleted' })
})

// GET /api/miniprogram/by-appid/:appId - Lookup by appId (internal use for deploy tool)
app.get('/by-appid/:appId', async (c) => {
  const authErr = requireAuth(c)
  if (authErr) return authErr
  const session = c.get('session')!
  const userId = session.user.id
  const { appId } = c.req.param()

  const record = await getDb().miniprogramApps.findByAppIdAndUserId(appId, userId)
  if (!record) return c.json({ error: 'Not found' }, 404)

  return c.json({
    success: true,
    data: {
      ...record,
      privateKey: decrypt(record.privateKey),
    },
  })
})

export default app
