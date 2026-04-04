import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { db } from '../db/client'
import { users, accounts, tasks, connectors, keys } from '../db/schema'
import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { encryptJWE } from '../lib/session'
import { encrypt } from '../lib/crypto'
import type { AppEnv, AppSession } from '../middleware/auth'

const SESSION_COOKIE_NAME = 'nex_session'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 // 1 year in seconds

function generateState(): string {
  return nanoid(32)
}

const githubAuth = new Hono<AppEnv>()

// GET /api/auth/github/signin - Redirect to GitHub OAuth (connect flow for existing users)
githubAuth.get('/signin', async (c) => {
  const session = c.get('session')
  if (!session?.user) {
    return c.redirect('/')
  }

  const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID
  const origin = new URL(c.req.url).origin
  const redirectUri = `${origin}/api/auth/github/callback`

  if (!clientId) {
    return c.redirect('/?error=github_not_configured')
  }

  const state = generateState()
  const next = c.req.query('next') ?? '/'
  const redirectTo = next.startsWith('/') ? next : '/'

  setCookie(c, 'github_oauth_redirect_to', redirectTo, {
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 60 * 10,
    sameSite: 'Lax',
  })
  setCookie(c, 'github_oauth_state', state, {
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 60 * 10,
    sameSite: 'Lax',
  })
  setCookie(c, 'github_oauth_user_id', session.user.id, {
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 60 * 10,
    sameSite: 'Lax',
  })

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'repo,read:user,user:email',
    state: state,
  })

  return c.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`)
})

// GET /api/auth/github/callback - Handle OAuth callback
githubAuth.get('/callback', async (c) => {
  const code = c.req.query('code')
  const state = c.req.query('state')

  const authMode = getCookie(c, 'github_auth_mode') ?? null
  const isSignInFlow = authMode === 'signin'

  const storedState = getCookie(c, authMode ? 'github_auth_state' : 'github_oauth_state') ?? null
  const storedRedirectTo = getCookie(c, authMode ? 'github_auth_redirect_to' : 'github_oauth_redirect_to') ?? null
  const storedUserId = getCookie(c, 'github_oauth_user_id') ?? null

  if (isSignInFlow) {
    if (!code || !state || storedState !== state || !storedRedirectTo) {
      return c.text('Invalid OAuth state', 400)
    }
  } else {
    if (!code || !state || storedState !== state || !storedRedirectTo || !storedUserId) {
      return c.text('Invalid OAuth state', 400)
    }
  }

  const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID
  const clientSecret = process.env.GITHUB_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return c.text('GitHub OAuth not configured', 500)
  }

  try {
    // Exchange code for access token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
      }),
    })

    if (!tokenResponse.ok) {
      console.error('[GitHub Callback] Token exchange failed')
      return c.text('Failed to exchange code for token', 400)
    }

    const tokenData = (await tokenResponse.json()) as {
      access_token: string
      scope: string
      token_type: string
      error?: string
      error_description?: string
    }

    if (!tokenData.access_token) {
      console.error('[GitHub Callback] Failed to get GitHub access token')
      return c.text(
        `Failed to authenticate with GitHub: ${tokenData.error_description || tokenData.error || 'Unknown error'}`,
        400,
      )
    }

    // Fetch GitHub user info
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    })

    const githubUser = (await userResponse.json()) as {
      login: string
      id: number
      email: string | null
      name: string | null
      avatar_url: string
    }

    if (isSignInFlow) {
      // SIGN-IN FLOW: Create or update user, create session

      // Fetch email if not public
      let email = githubUser.email
      if (!email) {
        try {
          const emailsResponse = await fetch('https://api.github.com/user/emails', {
            headers: {
              Authorization: `Bearer ${tokenData.access_token}`,
              Accept: 'application/vnd.github.v3+json',
            },
          })
          if (emailsResponse.ok) {
            const emails = (await emailsResponse.json()) as Array<{
              email: string
              primary: boolean
              verified: boolean
            }>
            const primaryEmail = emails.find((e) => e.primary && e.verified)
            email = primaryEmail?.email || emails[0]?.email || null
          }
        } catch {
          // ignore
        }
      }

      // Upsert user in DB
      const now = Date.now()
      const externalId = `${githubUser.id}`
      const encryptedToken = encrypt(tokenData.access_token)

      const existing = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.provider, 'github'), eq(users.externalId, externalId)))
        .limit(1)

      let userId: string
      if (existing.length > 0) {
        userId = existing[0].id
        await db
          .update(users)
          .set({
            accessToken: encryptedToken,
            scope: tokenData.scope,
            username: githubUser.login,
            email: email || undefined,
            name: githubUser.name || githubUser.login,
            avatarUrl: githubUser.avatar_url,
            updatedAt: now,
            lastLoginAt: now,
          })
          .where(eq(users.id, userId))
      } else {
        userId = nanoid()
        await db.insert(users).values({
          id: userId,
          provider: 'github',
          externalId: externalId,
          accessToken: encryptedToken,
          scope: tokenData.scope,
          username: githubUser.login,
          email: email || undefined,
          name: githubUser.name || githubUser.login,
          avatarUrl: githubUser.avatar_url,
          createdAt: now,
          updatedAt: now,
          lastLoginAt: now,
        })
      }

      const session: AppSession = {
        created: now,
        authProvider: 'github',
        user: {
          id: userId,
          username: githubUser.login,
          email: email || undefined,
          name: githubUser.name || githubUser.login,
          avatar: githubUser.avatar_url,
        },
      }

      const sessionValue = await encryptJWE(session, '1y')

      // Clean up cookies
      deleteCookie(c, 'github_auth_state', { path: '/' })
      deleteCookie(c, 'github_auth_redirect_to', { path: '/' })
      deleteCookie(c, 'github_auth_mode', { path: '/' })

      // Set session cookie
      setCookie(c, SESSION_COOKIE_NAME, sessionValue, {
        path: '/',
        maxAge: COOKIE_MAX_AGE,
        httpOnly: true,
        sameSite: 'Lax',
        secure: process.env.NODE_ENV === 'production',
      })

      return c.redirect(storedRedirectTo!)
    } else {
      // CONNECT FLOW: Add GitHub account to existing user
      const encryptedToken = encrypt(tokenData.access_token)

      const existingAccount = await db
        .select()
        .from(accounts)
        .where(and(eq(accounts.provider, 'github'), eq(accounts.externalUserId, `${githubUser.id}`)))
        .limit(1)

      if (existingAccount.length > 0) {
        const connectedUserId = existingAccount[0].userId

        if (connectedUserId !== storedUserId) {
          // Merge accounts: transfer everything from old user to new user
          await db.update(tasks).set({ userId: storedUserId! }).where(eq(tasks.userId, connectedUserId))
          await db.update(connectors).set({ userId: storedUserId! }).where(eq(connectors.userId, connectedUserId))
          await db.update(accounts).set({ userId: storedUserId! }).where(eq(accounts.userId, connectedUserId))
          await db.update(keys).set({ userId: storedUserId! }).where(eq(keys.userId, connectedUserId))
          await db.delete(users).where(eq(users.id, connectedUserId))

          await db
            .update(accounts)
            .set({
              userId: storedUserId!,
              accessToken: encryptedToken,
              scope: tokenData.scope,
              username: githubUser.login,
              updatedAt: Date.now(),
            })
            .where(eq(accounts.id, existingAccount[0].id))
        } else {
          // Same user, just update the token
          await db
            .update(accounts)
            .set({
              accessToken: encryptedToken,
              scope: tokenData.scope,
              username: githubUser.login,
              updatedAt: Date.now(),
            })
            .where(eq(accounts.id, existingAccount[0].id))
        }
      } else {
        await db.insert(accounts).values({
          id: nanoid(),
          userId: storedUserId!,
          provider: 'github',
          externalUserId: `${githubUser.id}`,
          accessToken: encryptedToken,
          scope: tokenData.scope,
          username: githubUser.login,
        })
      }

      // Clean up cookies
      if (authMode) {
        deleteCookie(c, 'github_auth_state', { path: '/' })
        deleteCookie(c, 'github_auth_redirect_to', { path: '/' })
        deleteCookie(c, 'github_auth_mode', { path: '/' })
      } else {
        deleteCookie(c, 'github_oauth_state', { path: '/' })
        deleteCookie(c, 'github_oauth_redirect_to', { path: '/' })
      }
      deleteCookie(c, 'github_oauth_user_id', { path: '/' })

      return c.redirect(storedRedirectTo!)
    }
  } catch (error) {
    console.error('[GitHub Callback] OAuth callback error:', error)
    return c.text('Failed to complete GitHub authentication', 500)
  }
})

// GET /api/auth/github/status - Check GitHub connection status
githubAuth.get('/status', async (c) => {
  const session = c.get('session')

  if (!session?.user) {
    return c.json({ connected: false })
  }

  if (!session.user.id) {
    console.error('GitHub status check: session.user.id is undefined')
    return c.json({ connected: false })
  }

  try {
    // Check if user has GitHub as connected account
    const account = await db
      .select({
        username: accounts.username,
        createdAt: accounts.createdAt,
      })
      .from(accounts)
      .where(and(eq(accounts.userId, session.user.id), eq(accounts.provider, 'github')))
      .limit(1)

    if (account.length > 0) {
      return c.json({
        connected: true,
        username: account[0].username,
        connectedAt: account[0].createdAt,
      })
    }

    // Check if user signed in with GitHub (primary account)
    const user = await db
      .select({
        username: users.username,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(and(eq(users.id, session.user.id), eq(users.provider, 'github')))
      .limit(1)

    if (user.length > 0) {
      return c.json({
        connected: true,
        username: user[0].username,
        connectedAt: user[0].createdAt,
      })
    }

    return c.json({ connected: false })
  } catch (error) {
    console.error('Error checking GitHub connection status:', error)
    return c.json({ connected: false, error: 'Failed to check status' }, 500)
  }
})

// POST /api/auth/github/disconnect - Disconnect GitHub account
githubAuth.post('/disconnect', async (c) => {
  const session = c.get('session')

  if (!session?.user) {
    return c.json({ error: 'Not authenticated' }, 401)
  }

  if (!session.user.id) {
    console.error('Session user.id is undefined')
    return c.json({ error: 'Invalid session - user ID missing' }, 400)
  }

  // Can only disconnect if user didn't sign in with GitHub
  if (session.authProvider === 'github') {
    return c.json({ error: 'Cannot disconnect primary authentication method' }, 400)
  }

  try {
    await db.delete(accounts).where(and(eq(accounts.userId, session.user.id), eq(accounts.provider, 'github')))
    return c.json({ success: true })
  } catch (error) {
    console.error('Error disconnecting GitHub:', error)
    return c.json({ error: 'Failed to disconnect' }, 500)
  }
})

export default githubAuth
