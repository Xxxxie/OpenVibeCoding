import { Hono } from 'hono'
import { getDb } from '../db/index.js'
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
    const account = await getDb().accounts.findByUserIdAndProvider(userId, 'github')

    if (account?.accessToken) {
      return decrypt(account.accessToken)
    }

    const user = await getDb().users.findById(userId)

    if (user?.provider === 'github' && user.accessToken) {
      return decrypt(user.accessToken)
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
    const userKey = await getDb().keys.findByUserIdAndProvider(userId, provider)

    if (userKey?.value) {
      return decrypt(userKey.value)
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

    const userKeys = await getDb().keys.findByUserId(userId)

    return c.json({
      success: true,
      apiKeys: userKeys.map((k) => ({ provider: k.provider, createdAt: k.createdAt })),
    })
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

    const encryptedKey = encrypt(apiKey)

    await getDb().keys.upsert({
      id: nanoid(),
      userId,
      provider,
      value: encryptedKey,
    })

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

    await getDb().keys.delete(userId, provider)

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
