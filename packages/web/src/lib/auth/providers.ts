/**
 * Get the list of enabled authentication providers
 */
export function getEnabledAuthProviders(): {
  github: boolean
  local: boolean
} {
  return {
    github: true,
    local: true,
  }
}
