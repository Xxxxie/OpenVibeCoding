import type { DatabaseProvider } from './types'
import { createDrizzleProvider } from './drizzle/repositories'
import { createCloudBaseProvider } from './cloudbase/repositories'

export type { DatabaseProvider } from './types'
export * from './types'

let _provider: DatabaseProvider | null = null

/**
 * Get the database provider instance, lazily created based on DB_PROVIDER env var.
 * Defaults to 'cloudbase'. Set DB_PROVIDER=drizzle for SQLite.
 */
export function getDb(): DatabaseProvider {
  if (_provider) return _provider

  const backend = process.env.DB_PROVIDER || 'cloudbase'

  if (backend === 'drizzle') {
    _provider = createDrizzleProvider()
  } else {
    _provider = createCloudBaseProvider()
  }

  return _provider
}
