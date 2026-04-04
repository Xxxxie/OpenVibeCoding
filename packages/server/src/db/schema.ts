import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const now = () => Date.now()

// ─── Users ───────────────────────────────────────────────────────────────────

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    provider: text('provider').notNull(), // 'github' | 'local'
    externalId: text('external_id').notNull(),
    accessToken: text('access_token').notNull().default(''),
    refreshToken: text('refresh_token'),
    scope: text('scope'),
    username: text('username').notNull(),
    email: text('email'),
    name: text('name'),
    avatarUrl: text('avatar_url'),
    createdAt: integer('created_at').notNull().$defaultFn(now),
    updatedAt: integer('updated_at').notNull().$defaultFn(now),
    lastLoginAt: integer('last_login_at').notNull().$defaultFn(now),
  },
  (table) => ({
    providerExternalIdUnique: uniqueIndex('users_provider_external_id_idx').on(table.provider, table.externalId),
  }),
)

// ─── Local Credentials ────────────────────────────────────────────────────────

export const localCredentials = sqliteTable('local_credentials', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  passwordHash: text('password_hash').notNull(),
  createdAt: integer('created_at').notNull().$defaultFn(now),
  updatedAt: integer('updated_at').notNull().$defaultFn(now),
})

// ─── Tasks ───────────────────────────────────────────────────────────────────

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  prompt: text('prompt').notNull(),
  title: text('title'),
  repoUrl: text('repo_url'),
  selectedAgent: text('selected_agent').default('claude'),
  selectedModel: text('selected_model'),
  installDependencies: integer('install_dependencies', { mode: 'boolean' }).default(false),
  maxDuration: integer('max_duration').default(parseInt(process.env.MAX_SANDBOX_DURATION || '300', 10)),
  keepAlive: integer('keep_alive', { mode: 'boolean' }).default(false),
  enableBrowser: integer('enable_browser', { mode: 'boolean' }).default(false),
  status: text('status').notNull().default('pending'),
  progress: integer('progress').default(0),
  logs: text('logs'), // JSON string of LogEntry[]
  error: text('error'),
  branchName: text('branch_name'),
  sandboxId: text('sandbox_id'),
  agentSessionId: text('agent_session_id'),
  sandboxUrl: text('sandbox_url'),
  previewUrl: text('preview_url'),
  prUrl: text('pr_url'),
  prNumber: integer('pr_number'),
  prStatus: text('pr_status'),
  prMergeCommitSha: text('pr_merge_commit_sha'),
  mcpServerIds: text('mcp_server_ids'), // JSON string of string[]
  createdAt: integer('created_at').notNull().$defaultFn(now),
  updatedAt: integer('updated_at').notNull().$defaultFn(now),
  completedAt: integer('completed_at'),
  deletedAt: integer('deleted_at'),
})

// ─── Connectors ───────────────────────────────────────────────────────────────

export const connectors = sqliteTable('connectors', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  type: text('type').notNull().default('remote'), // 'local' | 'remote'
  baseUrl: text('base_url'),
  oauthClientId: text('oauth_client_id'),
  oauthClientSecret: text('oauth_client_secret'),
  command: text('command'),
  env: text('env'),
  status: text('status').notNull().default('disconnected'), // 'connected' | 'disconnected'
  createdAt: integer('created_at').notNull().$defaultFn(now),
  updatedAt: integer('updated_at').notNull().$defaultFn(now),
})

// ─── Accounts ─────────────────────────────────────────────────────────────────

export const accounts = sqliteTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull().default('github'), // 'github'
    externalUserId: text('external_user_id').notNull(),
    accessToken: text('access_token').notNull(),
    refreshToken: text('refresh_token'),
    expiresAt: integer('expires_at'),
    scope: text('scope'),
    username: text('username').notNull(),
    createdAt: integer('created_at').notNull().$defaultFn(now),
    updatedAt: integer('updated_at').notNull().$defaultFn(now),
  },
  (table) => ({
    userIdProviderUnique: uniqueIndex('accounts_user_id_provider_idx').on(table.userId, table.provider),
  }),
)

// ─── Keys ────────────────────────────────────────────────────────────────────

export const keys = sqliteTable(
  'keys',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(), // 'anthropic' | 'openai' | 'cursor' | 'gemini' | 'aigateway'
    value: text('value').notNull(),
    createdAt: integer('created_at').notNull().$defaultFn(now),
    updatedAt: integer('updated_at').notNull().$defaultFn(now),
  },
  (table) => ({
    userIdProviderUnique: uniqueIndex('keys_user_id_provider_idx').on(table.userId, table.provider),
  }),
)

// ─── CloudBase User Resources ───────────────────────────────────────────────

export const userResources = sqliteTable('user_resources', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('pending'),
  envId: text('env_id'),
  camUsername: text('cam_username'),
  camSecretId: text('cam_secret_id'),
  camSecretKey: text('cam_secret_key'),
  policyId: integer('policy_id'),
  failStep: text('fail_step'),
  failReason: text('fail_reason'),
  createdAt: integer('created_at').notNull().$defaultFn(now),
  updatedAt: integer('updated_at').notNull().$defaultFn(now),
})

// ─── Settings ────────────────────────────────────────────────────────────────

export const settings = sqliteTable(
  'settings',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    value: text('value').notNull(),
    createdAt: integer('created_at').notNull().$defaultFn(now),
    updatedAt: integer('updated_at').notNull().$defaultFn(now),
  },
  (table) => ({
    userIdKeyUnique: uniqueIndex('settings_user_id_key_idx').on(table.userId, table.key),
  }),
)

// ─── Deployments ─────────────────────────────────────────────────────────────

export const deployments = sqliteTable(
  'deployments',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    type: text('type').notNull(), // 'web' | 'miniprogram'

    // For web deployments
    url: text('url'),
    path: text('path'), // Extracted URL path for deduplication

    // For miniprogram deployments
    qrCodeUrl: text('qr_code_url'),
    pagePath: text('page_path'),
    appId: text('app_id'),

    // Metadata
    label: text('label'), // Optional display name
    metadata: text('metadata'), // JSON string for additional fields

    createdAt: integer('created_at').notNull().$defaultFn(now),
    updatedAt: integer('updated_at').notNull().$defaultFn(now),
    deletedAt: integer('deleted_at'),
  },
  (table) => ({
    // Indexes for faster queries (deduplication handled in application logic)
    taskIdIdx: index('deployments_task_id_idx').on(table.taskId),
    taskTypePathIdx: index('deployments_task_type_path_idx').on(table.taskId, table.type, table.path),
  }),
)
