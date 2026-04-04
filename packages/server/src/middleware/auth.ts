import { Context, Next } from 'hono'
import { getCookie } from 'hono/cookie'
import { decryptJWE } from '../lib/session'

export interface SessionUser {
  id: string
  username: string
  email: string | undefined
  avatar: string
  name?: string
}

export interface AppSession {
  created: number
  authProvider: 'github' | 'vercel'
  user: SessionUser
}

export type AppEnv = {
  Variables: {
    session: AppSession | undefined
  }
}

const SESSION_COOKIE_NAME = 'nex_session'

export async function authMiddleware(c: Context<AppEnv>, next: Next) {
  const sessionCookie = getCookie(c, SESSION_COOKIE_NAME)
  if (sessionCookie) {
    try {
      const session = await decryptJWE<AppSession>(sessionCookie)
      c.set('session', session)
    } catch (e) {
      // Invalid session, continue without auth
    }
  }
  await next()
}

// Helper to require authentication
export function requireAuth(c: Context<AppEnv>) {
  const session = c.get('session')
  if (!session?.user?.id) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  return null
}
