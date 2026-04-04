import { Hono } from 'hono'
import { Octokit } from '@octokit/rest'
import { db } from '../db/client'
import { tasks, accounts, users } from '../db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { decrypt } from '../lib/crypto'
import { requireAuth, type AppEnv } from '../middleware/auth'

const app = new Hono<AppEnv>()

// Helper: get GitHub token for the current session user
async function getGitHubToken(userId: string): Promise<string | null> {
  try {
    const account = await db
      .select({ accessToken: accounts.accessToken })
      .from(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.provider, 'github')))
      .limit(1)

    if (account[0]?.accessToken) {
      return decrypt(account[0].accessToken)
    }

    const user = await db
      .select({ accessToken: users.accessToken })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.provider, 'github')))
      .limit(1)

    if (user[0]?.accessToken) {
      return decrypt(user[0].accessToken)
    }

    return null
  } catch {
    return null
  }
}

// GET /api/repos/:owner/:repo/commits
app.get('/:owner/:repo/commits', async (c) => {
  try {
    const owner = c.req.param('owner')
    const repo = c.req.param('repo')

    const session = c.get('session')
    const token = session?.user?.id ? await getGitHubToken(session.user.id) : null

    if (!token) {
      return c.json({ error: 'GitHub authentication required' }, 401)
    }

    const octokit = new Octokit({ auth: token })
    const { data: commits } = await octokit.rest.repos.listCommits({
      owner,
      repo,
      per_page: 30,
    })

    return c.json({ commits })
  } catch (error) {
    console.error('Error fetching commits:', error)
    return c.json({ error: 'Failed to fetch commits' }, 500)
  }
})

// GET /api/repos/:owner/:repo/issues
app.get('/:owner/:repo/issues', async (c) => {
  try {
    const owner = c.req.param('owner')
    const repo = c.req.param('repo')

    const session = c.get('session')
    const token = session?.user?.id ? await getGitHubToken(session.user.id) : null

    if (!token) {
      return c.json({ error: 'GitHub authentication required' }, 401)
    }

    const octokit = new Octokit({ auth: token })
    const { data: issues } = await octokit.rest.issues.listForRepo({
      owner,
      repo,
      state: 'open',
      per_page: 30,
    })

    const filteredIssues = issues.filter((issue) => !issue.pull_request)

    return c.json({ issues: filteredIssues })
  } catch (error) {
    console.error('Error fetching issues:', error)
    return c.json({ error: 'Failed to fetch issues' }, 500)
  }
})

// GET /api/repos/:owner/:repo/pull-requests
app.get('/:owner/:repo/pull-requests', async (c) => {
  try {
    const owner = c.req.param('owner')
    const repo = c.req.param('repo')

    const session = c.get('session')
    const token = session?.user?.id ? await getGitHubToken(session.user.id) : null

    if (!token) {
      return c.json({ error: 'GitHub authentication required' }, 401)
    }

    const octokit = new Octokit({ auth: token })
    const { data: pullRequests } = await octokit.rest.pulls.list({
      owner,
      repo,
      state: 'open',
      per_page: 30,
      sort: 'updated',
      direction: 'desc',
    })

    return c.json({ pullRequests })
  } catch (error) {
    console.error('Error fetching pull requests:', error)
    return c.json({ error: 'Failed to fetch pull requests' }, 500)
  }
})

// GET /api/repos/:owner/:repo/pull-requests/:pr_number/check-task
app.get('/:owner/:repo/pull-requests/:pr_number/check-task', async (c) => {
  try {
    const authErr = requireAuth(c)
    if (authErr) return authErr
    const session = c.get('session')!
    const userId = session.user.id

    const owner = c.req.param('owner')
    const repo = c.req.param('repo')
    const prNumberStr = c.req.param('pr_number')
    const prNumber = parseInt(prNumberStr, 10)

    if (isNaN(prNumber)) {
      return c.json({ error: 'Invalid PR number' }, 400)
    }

    const repoUrl = `https://github.com/${owner}/${repo}`

    const existingTasks = await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, userId),
          eq(tasks.prNumber, prNumber),
          eq(tasks.repoUrl, repoUrl),
          isNull(tasks.deletedAt),
        ),
      )
      .limit(1)

    return c.json({
      hasTask: existingTasks.length > 0,
      taskId: existingTasks.length > 0 ? existingTasks[0].id : null,
    })
  } catch (error) {
    console.error('Error checking for existing task:', error)
    return c.json({ error: 'Failed to check for existing task' }, 500)
  }
})

// PATCH /api/repos/:owner/:repo/pull-requests/:pr_number/close
app.patch('/:owner/:repo/pull-requests/:pr_number/close', async (c) => {
  try {
    const owner = c.req.param('owner')
    const repo = c.req.param('repo')
    const prNumberStr = c.req.param('pr_number')
    const prNumber = parseInt(prNumberStr, 10)

    if (isNaN(prNumber)) {
      return c.json({ error: 'Invalid pull request number' }, 400)
    }

    const session = c.get('session')
    const token = session?.user?.id ? await getGitHubToken(session.user.id) : null

    if (!token) {
      return c.json({ error: 'GitHub authentication required' }, 401)
    }

    const octokit = new Octokit({ auth: token })
    const { data: pullRequest } = await octokit.rest.pulls.update({
      owner,
      repo,
      pull_number: prNumber,
      state: 'closed',
    })

    return c.json({ pullRequest })
  } catch (error) {
    console.error('Error closing pull request:', error)
    return c.json({ error: 'Failed to close pull request' }, 500)
  }
})

export default app
