/** Dashboard API base path configuration */
let _apiBase = '/api'

export function setApiBase(base: string) {
  _apiBase = base
}

export function getApiBase(): string {
  return _apiBase
}
