import { Hono } from 'hono'
import { drizzleDb as db } from '../db/drizzle/client.js'
import { tasks } from '../db/schema'
import { eq, and, isNotNull } from 'drizzle-orm'
import { requireAuth, type AppEnv } from '../middleware/auth'

const GITHUB_REPO = 'vercel-labs/coding-agent-template'
const CACHE_DURATION_MS = 5 * 60 * 1000 // 5 minutes

let cachedStars: number | null = null
let lastFetch = 0

const app = new Hono<AppEnv>()

// GET /api/github-stars - Fetch GitHub star count (cached)
app.get('/github-stars', async (c) => {
  try {
    const now = Date.now()

    if (cachedStars !== null && now - lastFetch < CACHE_DURATION_MS) {
      return c.json({ stars: cachedStars })
    }

    const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'coding-agent-template',
      },
    })

    if (!response.ok) {
      throw new Error('GitHub API request failed')
    }

    const data = await response.json()
    cachedStars = data.stargazers_count
    lastFetch = now

    return c.json({ stars: cachedStars })
  } catch (error) {
    console.error('Error fetching GitHub stars:', error)
    return c.json({ stars: cachedStars || 1200 })
  }
})

// GET /api/sandboxes - List active sandboxes for the current user
app.get('/sandboxes', async (c) => {
  try {
    const authErr = requireAuth(c)
    if (authErr) return authErr
    const session = c.get('session')!
    const userId = session.user.id

    // This specialized query (isNotNull(sandboxId) + specific fields) doesn't map to a repository method
    const runningSandboxes = await db
      .select({
        id: tasks.id,
        taskId: tasks.id,
        prompt: tasks.prompt,
        repoUrl: tasks.repoUrl,
        branchName: tasks.branchName,
        sandboxId: tasks.sandboxId,
        sandboxUrl: tasks.sandboxUrl,
        createdAt: tasks.createdAt,
        status: tasks.status,
        keepAlive: tasks.keepAlive,
        maxDuration: tasks.maxDuration,
      })
      .from(tasks)
      .where(and(eq(tasks.userId, userId), isNotNull(tasks.sandboxId)))
      .orderBy(tasks.createdAt)

    return c.json({ sandboxes: runningSandboxes })
  } catch (error) {
    console.error('Error fetching sandboxes:', error)
    return c.json({ error: 'Failed to fetch sandboxes' }, 500)
  }
})

// GET /api/vercel/teams - Stub (Vercel OAuth removed)
app.get('/vercel/teams', (c) => {
  return c.json({ scopes: [] })
})

export default app
