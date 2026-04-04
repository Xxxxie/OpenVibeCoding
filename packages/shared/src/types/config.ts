// ─── Auth 相关类型 ─────────────────────────────────────

export type AuthStatus = 'IDLE' | 'PENDING' | 'READY' | 'ERROR' | 'EXPIRED'

export interface DeviceCodeInfo {
  user_code: string
  verification_uri?: string
  expires_in: number
}

export interface EnvCandidate {
  envId: string
  alias?: string
  region?: string
  status?: string
}

export interface AuthState {
  authStatus: AuthStatus
  deviceCode?: DeviceCodeInfo
  envId?: string
  envCandidates?: EnvCandidate[]
  error?: string
}

// ─── LLM 配置 ──────────────────────────────────────────

export interface LlmConfig {
  endpoint?: string
  apiKey?: string
  model?: string
  authToken?: string
}

// ─── Cloudbase 配置 ────────────────────────────────────

export interface CloudbaseConfig {
  envId: string
  region?: string
}

// ─── 本地持久化配置 ────────────────────────────────────

export interface CoderConfig {
  cloudbase?: CloudbaseConfig
  llm?: LlmConfig
  server?: {
    port: number
  }
}

// ─── Setup Status ──────────────────────────────────────

export interface SetupStatus {
  cloudbaseConfigured: boolean
  llmConfigured: boolean
  envId?: string
  region?: string
}

// ─── Database Types ────────────────────────────────────

export interface CollectionInfo {
  CollectionName: string
  Count: number
  Size: number
  IndexCount: number
  IndexSize: number
}

export interface CollectionListResult {
  collections: CollectionInfo[]
  total: number
}

export interface DocumentQueryResult {
  documents: Record<string, unknown>[]
  total: number
  page: number
  pageSize: number
}
