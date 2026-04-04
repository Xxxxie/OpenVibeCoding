import { Hono } from 'hono'
import { db } from '../db/client'
import { keys, accounts, users } from '../db/schema'
import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { encrypt, decrypt } from '../lib/crypto'
import { requireAuth, type AppEnv } from '../middleware/auth'

type Provider = 'openai' | 'gemini' | 'cursor' | 'anthropic' | 'aigateway'

const VALID_PROVIDERS: Provider[] = ['openai', 'gemini', 'cursor', 'anthropic', 'aigateway']

// Map agents to their required providers
const AGENT_PROVIDER_MAP: Record<string, Provider | null> = {
  claude: 'aigateway',
  codex: 'aigateway',
  copilot: null, // uses GitHub token
  cursor: 'cursor',
  gemini: 'gemini',
  opencode: 'openai',
}

function isAnthropicModel(model: string): boolean {
  return ['claude', 'sonnet', 'opus'].some((p) => model.toLowerCase().includes(p))
}

function isOpenAIModel(model: string): boolean {
  return ['gpt', 'openai'].some((p) => model.toLowerCase().includes(p))
}

function isGeminiModel(model: string): boolean {
  return model.toLowerCase().includes('gemini')
}

async function getUserGitHubToken(userId: string): Promise<string | null> {
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

async function getUserApiKey(userId: string, provider: Provider): Promise<string | undefined> {
  const systemKeys: Record<Provider, string | undefined> = {
    openai: process.env.OPENAI_API_KEY,
    gemini: process.env.GEMINI_API_KEY,
    cursor: process.env.CURSOR_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    aigateway: process.env.AI_GATEWAY_API_KEY,
  }

  try {
    const userKey = await db
      .select({ value: keys.value })
      .from(keys)
      .where(and(eq(keys.userId, userId), eq(keys.provider, provider)))
      .limit(1)

    if (userKey[0]?.value) {
      return decrypt(userKey[0].value)
    }
  } catch {
    // fall through to system key
  }

  return systemKeys[provider]
}

const app = new Hono<AppEnv>()

// GET /api/api-keys - List API keys for the current user
app.get('/', async (c) => {
  try {
    const authErr = requireAuth(c)
    if (authErr) return authErr
    const session = c.get('session')!
    const userId = session.user.id

    const userKeys = await db
      .select({
        provider: keys.provider,
        createdAt: keys.createdAt,
      })
      .from(keys)
      .where(eq(keys.userId, userId))

    return c.json({ success: true, apiKeys: userKeys })
  } catch (error) {
    console.error('Error fetching API keys:', error)
    return c.json({ error: 'Failed to fetch API keys' }, 500)
  }
})

// POST /api/api-keys - Save (upsert) an API key
app.post('/', async (c) => {
  try {
    const authErr = requireAuth(c)
    if (authErr) return authErr
    const session = c.get('session')!
    const userId = session.user.id

    const body = await c.req.json()
    const { provider, apiKey } = body as { provider: Provider; apiKey: string }

    if (!provider || !apiKey) {
      return c.json({ error: 'Provider and API key are required' }, 400)
    }

    if (!VALID_PROVIDERS.includes(provider)) {
      return c.json({ error: 'Invalid provider' }, 400)
    }

    const existing = await db
      .select()
      .from(keys)
      .where(and(eq(keys.userId, userId), eq(keys.provider, provider)))
      .limit(1)

    const encryptedKey = encrypt(apiKey)

    if (existing.length > 0) {
      await db
        .update(keys)
        .set({ value: encryptedKey, updatedAt: Date.now() })
        .where(and(eq(keys.userId, userId), eq(keys.provider, provider)))
    } else {
      await db.insert(keys).values({
        id: nanoid(),
        userId,
        provider,
        value: encryptedKey,
      })
    }

    return c.json({ success: true })
  } catch (error) {
    console.error('Error saving API key:', error)
    return c.json({ error: 'Failed to save API key' }, 500)
  }
})

// DELETE /api/api-keys?provider=xxx - Delete an API key
app.delete('/', async (c) => {
  try {
    const authErr = requireAuth(c)
    if (authErr) return authErr
    const session = c.get('session')!
    const userId = session.user.id

    const provider = c.req.query('provider') as Provider

    if (!provider) {
      return c.json({ error: 'Provider is required' }, 400)
    }

    await db.delete(keys).where(and(eq(keys.userId, userId), eq(keys.provider, provider)))

    return c.json({ success: true })
  } catch (error) {
    console.error('Error deleting API key:', error)
    return c.json({ error: 'Failed to delete API key' }, 500)
  }
})

// GET /api/api-keys/check?agent=xxx&model=xxx - Check if API key is available for agent
app.get('/check', async (c) => {
  try {
    const agent = c.req.query('agent')
    const model = c.req.query('model')

    if (!agent) {
      return c.json({ error: 'Agent parameter is required' }, 400)
    }

    if (!(agent in AGENT_PROVIDER_MAP)) {
      return c.json({ error: 'Invalid agent' }, 400)
    }

    // Copilot uses GitHub token
    if (agent === 'copilot') {
      const session = c.get('session')
      const userId = session?.user?.id
      const githubToken = userId ? await getUserGitHubToken(userId) : null
      return c.json({
        success: true,
        hasKey: !!githubToken,
        provider: 'github',
        agentName: 'Copilot',
      })
    }

    let provider = AGENT_PROVIDER_MAP[agent]

    // Override provider based on model for multi-provider agents
    if (model && (agent === 'cursor' || agent === 'opencode')) {
      if (isAnthropicModel(model)) {
        provider = 'anthropic'
      } else if (isGeminiModel(model)) {
        provider = 'gemini'
      } else if (isOpenAIModel(model)) {
        provider = 'aigateway'
      }
    }

    const session = c.get('session')
    const userId = session?.user?.id

    const apiKey = userId ? await getUserApiKey(userId, provider!) : process.env[`${provider!.toUpperCase()}_API_KEY`]
    const hasKey = !!apiKey

    return c.json({
      success: true,
      hasKey,
      provider,
      agentName: agent.charAt(0).toUpperCase() + agent.slice(1),
    })
  } catch (error) {
    console.error('Error checking API key:', error)
    return c.json({ error: 'Failed to check API key' }, 500)
  }
})

export default app
