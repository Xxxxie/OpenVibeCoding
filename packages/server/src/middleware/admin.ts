import { Context, Next } from 'hono'
import { requireAuth, type AppEnv } from './auth'
import { getDb } from '../db/index.js'
import { deleteCookie } from 'hono/cookie'

/**
 * Require admin role
 */
export async function requireAdmin(c: Context<AppEnv>, next: Next) {
  const authErr = requireAuth(c)
  if (authErr) return authErr

  const session = c.get('session')!
  const db = getDb()
  const user = await db.users.findById(session.user.id)

  if (!user || user.role !== 'admin') {
    return c.json({ error: 'Admin access required' }, 403)
  }

  if (user.status === 'disabled') {
    return c.json({ error: 'Account is disabled' }, 403)
  }

  // Set admin user info for downstream use
  c.set('adminUser', user)

  await next()
}

/**
 * Check if user is disabled
 */
export async function checkUserStatus(c: Context<AppEnv>, next: Next) {
  const session = c.get('session')

  if (session?.user?.id) {
    const db = getDb()
    const user = await db.users.findById(session.user.id)
    if (user?.status === 'disabled') {
      // Clear session
      deleteCookie(c, 'nex_session', { path: '/' })
      return c.json({ error: 'Account has been disabled', reason: user.disabledReason }, 403)
    }
  }

  await next()
}
