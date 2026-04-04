// Session types for compatibility with original components
export interface Session {
  created: number
  authProvider: 'github' | 'vercel' | 'local'
  user: {
    id: string
    username: string
    email?: string
    avatar?: string
    name?: string
  }
}

export interface Connector {
  id: string
  userId: string
  name: string
  description?: string | null
  type: 'local' | 'remote'
  baseUrl?: string | null
  oauthClientId?: string | null
  oauthClientSecret?: string | null
  command?: string | null
  env?: Record<string, string> | null
  status: 'connected' | 'disconnected'
  createdAt: number
  updatedAt: number
}
