export interface AuthConfig {
  providers: string[]
  githubMode: 'direct' | 'cloudbase'
  tcbEnvId?: string
}

let cachedConfig: AuthConfig = { providers: ['local', 'github'], githubMode: 'direct', tcbEnvId: '' }

export function setAuthConfig(config: AuthConfig) {
  cachedConfig = config
}

/**
 * Get the list of enabled authentication providers
 */
export function getEnabledAuthProviders(): {
  github: boolean
  local: boolean
} {
  return {
    github: cachedConfig.providers.includes('github'),
    local: cachedConfig.providers.includes('local'),
  }
}

/**
 * Get GitHub auth mode: 'direct' (self-managed OAuth) or 'cloudbase' (CloudBase identity source)
 */
export function getGitHubAuthMode(): 'direct' | 'cloudbase' {
  return cachedConfig.githubMode
}

/**
 * Get CloudBase environment ID (from server-side TCB_ENV_ID)
 */
export function getTcbEnvId(): string {
  return cachedConfig.tcbEnvId || ''
}
