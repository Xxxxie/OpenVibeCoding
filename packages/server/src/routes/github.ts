import { Hono } from 'hono'
import { getDb } from '../db/index.js'
import { decrypt, encrypt } from '../lib/crypto'
import { Octokit } from '@octokit/rest'
import { nanoid } from 'nanoid'
import type { AppEnv } from '../middleware/auth'

const github = new Hono<AppEnv>()

// Helper: get GitHub token for the current session user
async function getGitHubToken(userId: string): Promise<string | null> {
  try {
    // Check connected GitHub account first
    const account = await getDb().accounts.findByUserIdAndProvider(userId, 'github')

    if (account?.accessToken) {
      return decrypt(account.accessToken)
    }

    // Fall back to primary GitHub sign-in
    const user = await getDb().users.findById(userId)

    if (user?.provider === 'github' && user.accessToken) {
      return decrypt(user.accessToken)
    }

    return null
  } catch (error) {
    console.error('Error fetching user GitHub token:', error)
    return null
  }
}

// GET /api/github/user - Get authenticated GitHub user
github.get('/user', async (c) => {
  try {
    const session = c.get('session')
    if (!session?.user?.id) {
      return c.json({ error: 'GitHub not connected' }, 401)
    }

    const token = await getGitHubToken(session.user.id)
    if (!token) {
      return c.json({ error: 'GitHub not connected' }, 401)
    }

    const response = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    })

    if (!response.ok) {
      throw new Error('GitHub API error')
    }

    const user = await response.json()

    return c.json({
      login: user.login,
      name: user.name,
      avatar_url: user.avatar_url,
    })
  } catch (error) {
    console.error('Error fetching GitHub user:', error)
    return c.json({ error: 'Failed to fetch user data' }, 500)
  }
})

// GET /api/github/repos - List repos for a given owner
github.get('/repos', async (c) => {
  try {
    const session = c.get('session')
    if (!session?.user?.id) {
      return c.json({ error: 'GitHub not connected' }, 401)
    }

    const token = await getGitHubToken(session.user.id)
    if (!token) {
      return c.json({ error: 'GitHub not connected' }, 401)
    }

    const owner = c.req.query('owner')
    if (!owner) {
      return c.json({ error: 'Owner parameter is required' }, 400)
    }

    // Check if this is the authenticated user's repos
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    })

    let isAuthenticatedUser = false
    if (userResponse.ok) {
      const user = await userResponse.json()
      isAuthenticatedUser = user.login === owner
    }

    interface GitHubRepo {
      name: string
      full_name: string
      description?: string
      private: boolean
      clone_url: string
      updated_at: string
      language?: string
    }

    const allRepos: GitHubRepo[] = []
    let page = 1
    const perPage = 100

    while (true) {
      let apiUrl: string

      if (isAuthenticatedUser) {
        apiUrl = `https://api.github.com/user/repos?sort=name&direction=asc&per_page=${perPage}&page=${page}&visibility=all&affiliation=owner`
      } else {
        const orgResponse = await fetch(`https://api.github.com/orgs/${owner}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.v3+json',
          },
        })

        if (orgResponse.ok) {
          apiUrl = `https://api.github.com/orgs/${owner}/repos?sort=name&direction=asc&per_page=${perPage}&page=${page}`
        } else {
          apiUrl = `https://api.github.com/users/${owner}/repos?sort=name&direction=asc&per_page=${perPage}&page=${page}`
        }
      }

      const response = await fetch(apiUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      })

      if (!response.ok) {
        throw new Error('GitHub API error')
      }

      const repos = await response.json()

      if (repos.length === 0) {
        break
      }

      allRepos.push(...repos)

      if (repos.length < perPage) {
        break
      }

      page++
    }

    // Remove duplicates and sort alphabetically
    const uniqueRepos = allRepos.filter(
      (repo, index, self) => index === self.findIndex((r) => r.full_name === repo.full_name),
    )
    uniqueRepos.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))

    return c.json(
      uniqueRepos.map((repo) => ({
        name: repo.name,
        full_name: repo.full_name,
        description: repo.description,
        private: repo.private,
        clone_url: repo.clone_url,
        updated_at: repo.updated_at,
        language: repo.language,
      })),
    )
  } catch (error) {
    console.error('Error fetching GitHub repositories:', error)
    return c.json({ error: 'Failed to fetch repositories' }, 500)
  }
})

// GET /api/github/user-repos - List user repos with pagination and search
github.get('/user-repos', async (c) => {
  try {
    const session = c.get('session')
    if (!session?.user?.id) {
      return c.json({ error: 'GitHub not connected' }, 401)
    }

    const token = await getGitHubToken(session.user.id)
    if (!token) {
      return c.json({ error: 'GitHub not connected' }, 401)
    }

    const page = parseInt(c.req.query('page') || '1', 10)
    const perPage = parseInt(c.req.query('per_page') || '25', 10)
    const search = c.req.query('search') || ''

    // Get authenticated user
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    })

    if (!userResponse.ok) {
      return c.json({ error: 'Failed to fetch user' }, 401)
    }

    const user = await userResponse.json()
    const username = user.login

    interface GitHubRepo {
      name: string
      full_name: string
      description?: string
      private: boolean
      clone_url: string
      updated_at: string
      language?: string
      owner: { login: string }
    }

    interface GitHubSearchResult {
      total_count: number
      incomplete_results: boolean
      items: GitHubRepo[]
    }

    if (search.trim()) {
      const searchQuery = encodeURIComponent(`${search} in:name user:${username} fork:true`)
      const searchUrl = `https://api.github.com/search/repositories?q=${searchQuery}&sort=updated&order=desc&per_page=${perPage}&page=${page}`

      const searchResponse = await fetch(searchUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      })

      if (!searchResponse.ok) {
        throw new Error('Failed to search repositories')
      }

      const searchResult: GitHubSearchResult = await searchResponse.json()

      return c.json({
        repos: searchResult.items.map((repo) => ({
          name: repo.name,
          full_name: repo.full_name,
          owner: repo.owner.login,
          description: repo.description,
          private: repo.private,
          clone_url: repo.clone_url,
          updated_at: repo.updated_at,
          language: repo.language,
        })),
        page,
        per_page: perPage,
        has_more: searchResult.total_count > page * perPage,
        total_count: searchResult.total_count,
        username,
      })
    }

    const githubPerPage = 100
    const githubPage = Math.ceil((page * perPage) / githubPerPage)

    const apiUrl = `https://api.github.com/user/repos?sort=updated&direction=desc&per_page=${githubPerPage}&page=${githubPage}&visibility=all&affiliation=owner,organization_member`

    const response = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    })

    if (!response.ok) {
      throw new Error('Failed to fetch repositories')
    }

    const repos: GitHubRepo[] = await response.json()

    const offsetInGithubPage = ((page - 1) * perPage) % githubPerPage
    const slicedRepos = repos.slice(offsetInGithubPage, offsetInGithubPage + perPage)
    const hasMore = repos.length === githubPerPage || slicedRepos.length === perPage

    return c.json({
      repos: slicedRepos.map((repo) => ({
        name: repo.name,
        full_name: repo.full_name,
        owner: repo.owner.login,
        description: repo.description,
        private: repo.private,
        clone_url: repo.clone_url,
        updated_at: repo.updated_at,
        language: repo.language,
      })),
      page,
      per_page: perPage,
      has_more: hasMore,
      username,
    })
  } catch (error) {
    console.error('Error fetching user repositories:', error)
    return c.json({ error: 'Failed to fetch repositories' }, 500)
  }
})

// GET /api/github/orgs - List user organizations
github.get('/orgs', async (c) => {
  try {
    const session = c.get('session')
    if (!session?.user?.id) {
      return c.json({ error: 'GitHub not connected' }, 401)
    }

    const token = await getGitHubToken(session.user.id)
    if (!token) {
      return c.json({ error: 'GitHub not connected' }, 401)
    }

    const response = await fetch('https://api.github.com/user/orgs', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    })

    if (!response.ok) {
      throw new Error('GitHub API error')
    }

    const orgs = await response.json()

    interface GitHubOrg {
      login: string
      name?: string
      avatar_url: string
    }

    return c.json(
      (orgs as GitHubOrg[]).map((org) => ({
        login: org.login,
        name: org.name || org.login,
        avatar_url: org.avatar_url,
      })),
    )
  } catch (error) {
    console.error('Error fetching GitHub organizations:', error)
    return c.json({ error: 'Failed to fetch organizations' }, 500)
  }
})

// POST /api/github/repos/create - Create a new GitHub repository
github.post('/repos/create', async (c) => {
  try {
    const session = c.get('session')
    if (!session?.user?.id) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const token = await getGitHubToken(session.user.id)
    if (!token) {
      return c.json({ error: 'GitHub token not found. Please reconnect your GitHub account.' }, 401)
    }

    const body = await c.req.json()
    const { name, description, private: isPrivate, owner, template } = body

    if (!name || typeof name !== 'string') {
      return c.json({ error: 'Repository name is required' }, 400)
    }

    const repoNamePattern = /^[a-zA-Z0-9._-]+$/
    if (!repoNamePattern.test(name)) {
      return c.json(
        { error: 'Repository name can only contain alphanumeric characters, periods, hyphens, and underscores' },
        400,
      )
    }

    const octokit = new Octokit({ auth: token })

    try {
      let repo

      if (owner) {
        const { data: user } = await octokit.users.getAuthenticated()

        if (user.login === owner) {
          repo = await octokit.repos.createForAuthenticatedUser({
            name,
            description: description || undefined,
            private: isPrivate || false,
            auto_init: true,
          })
        } else {
          try {
            repo = await octokit.repos.createInOrg({
              org: owner,
              name,
              description: description || undefined,
              private: isPrivate || false,
              auto_init: true,
            })
          } catch (error: unknown) {
            if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
              return c.json(
                { error: 'Organization not found or you do not have permission to create repositories' },
                403,
              )
            }
            throw error
          }
        }
      } else {
        repo = await octokit.repos.createForAuthenticatedUser({
          name,
          description: description || undefined,
          private: isPrivate || false,
          auto_init: true,
        })
      }

      // If a template is selected, populate the repository
      if (template) {
        try {
          await populateRepoFromTemplate(octokit, repo.data.owner.login, repo.data.name, template)
        } catch (error) {
          console.error('Error populating repository from template:', error)
          // Don't fail - repo was created successfully
        }
      }

      return c.json({
        success: true,
        name: repo.data.name,
        full_name: repo.data.full_name,
        clone_url: repo.data.clone_url,
        html_url: repo.data.html_url,
        private: repo.data.private,
      })
    } catch (error: unknown) {
      console.error('GitHub API error:', error)

      if (error && typeof error === 'object' && 'status' in error) {
        if (error.status === 422) {
          return c.json({ error: 'Repository already exists or name is invalid' }, 422)
        }
        if (error.status === 403) {
          return c.json({ error: 'You do not have permission to create repositories in this organization' }, 403)
        }
      }

      throw error
    }
  } catch (error) {
    console.error('Error creating repository:', error)
    return c.json({ error: 'Failed to create repository' }, 500)
  }
})

// POST /api/github/verify-repo - Verify repository access
github.post('/verify-repo', async (c) => {
  try {
    const session = c.get('session')
    if (!session?.user?.id) {
      return c.json({ error: 'GitHub not connected' }, 401)
    }

    const token = await getGitHubToken(session.user.id)
    if (!token) {
      return c.json({ error: 'GitHub not connected' }, 401)
    }

    // verify-repo accepts params via query or body
    let owner = c.req.query('owner')
    let repo = c.req.query('repo')

    if (!owner || !repo) {
      try {
        const body = await c.req.json()
        owner = owner || body.owner
        repo = repo || body.repo
      } catch {
        // no body
      }
    }

    if (!owner || !repo) {
      return c.json({ error: 'Owner and repo parameters are required' }, 400)
    }

    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    })

    if (!response.ok) {
      if (response.status === 404) {
        return c.json({ accessible: false, error: 'Repository not found' })
      }
      return c.json({ accessible: false, error: 'Failed to verify repository' })
    }

    const repoData = await response.json()

    return c.json({
      accessible: true,
      owner: {
        login: repoData.owner.login,
        name: repoData.owner.login,
        avatar_url: repoData.owner.avatar_url,
      },
      repo: {
        name: repoData.name,
        full_name: repoData.full_name,
        description: repoData.description,
        private: repoData.private,
        clone_url: repoData.clone_url,
        language: repoData.language,
      },
    })
  } catch (error) {
    console.error('Error verifying GitHub repository:', error)
    return c.json({ accessible: false, error: 'Failed to verify repository' }, 500)
  }
})

// ─── Template helpers ─────────────────────────────────────────────────────────

interface RepoTemplate {
  id: string
  name: string
  description: string
  cloneUrl?: string
  image?: string
}

async function copyFilesRecursively(
  octokit: Octokit,
  sourceOwner: string,
  sourceRepoName: string,
  sourcePath: string,
  repoOwner: string,
  repoName: string,
  basePath: string,
) {
  try {
    const { data: contents } = await octokit.repos.getContent({
      owner: sourceOwner,
      repo: sourceRepoName,
      path: sourcePath,
    })

    if (!Array.isArray(contents)) {
      return
    }

    for (const item of contents) {
      if (item.type === 'file' && item.download_url) {
        try {
          const response = await fetch(item.download_url)
          if (!response.ok) {
            throw new Error('Failed to fetch file')
          }
          const content = await response.text()

          const relativePath = basePath
            ? item.path.startsWith(basePath + '/')
              ? item.path.substring(basePath.length + 1)
              : item.name
            : item.path

          await octokit.repos.createOrUpdateFileContents({
            owner: repoOwner,
            repo: repoName,
            path: relativePath,
            message: `Add ${relativePath} from template`,
            content: Buffer.from(content).toString('base64'),
          })
        } catch (error) {
          console.error('Error copying file:', error)
        }
      } else if (item.type === 'dir') {
        await copyFilesRecursively(octokit, sourceOwner, sourceRepoName, item.path, repoOwner, repoName, basePath)
      }
    }
  } catch (error) {
    console.error('Error processing directory:', error)
  }
}

async function populateRepoFromTemplate(octokit: Octokit, repoOwner: string, repoName: string, template: RepoTemplate) {
  if (!template.cloneUrl) {
    return
  }

  const cloneMatch = template.cloneUrl.match(/github\.com\/([\w-]+)\/([\w-]+?)(?:\.git)?$/)
  if (!cloneMatch) {
    throw new Error('Invalid clone URL')
  }

  const [, sourceOwner, sourceRepoName] = cloneMatch

  try {
    await copyFilesRecursively(octokit, sourceOwner, sourceRepoName, '', repoOwner, repoName, '')
  } catch (error) {
    console.error('Error populating repository from template:', error)
    throw error
  }
}

export default github
