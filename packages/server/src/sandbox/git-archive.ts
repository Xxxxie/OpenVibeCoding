/**
 * Git Archive Service
 *
 * Simplified version for pushing changes to git archive repo.
 * - Uses env vars directly: GIT_ARCHIVE_REPO, GIT_ARCHIVE_TOKEN, GIT_ARCHIVE_USER
 * - Uses sandbox's git_push API endpoint
 */

import type { SandboxInstance } from './scf-sandbox-manager.js'

// ─── Types ────────────────────────────────────────────────────────

export interface GitArchiveConfig {
  /** Git 仓库 URL，例如：https://cnb.cool/tcb-playground/workspace-archive */
  repo: string
  /** Git 用户名（可选），用于沙箱中的 Git 认证 */
  user?: string
  /** Git 访问 Token */
  token: string
  /** CNB API 域名，例如：https://api.cnb.cool */
  apiDomain: string
}

// ─── Config from env vars ────────────────────────────────────────

function getConfig(): GitArchiveConfig | null {
  const repo = process.env.GIT_ARCHIVE_REPO
  const token = process.env.GIT_ARCHIVE_TOKEN
  const user = process.env.GIT_ARCHIVE_USER

  if (!repo || !token) {
    return null
  }

  // Extract API domain from repo URL
  // https://cnb.cool/tcb-playground/workspace-archive -> https://api.cnb.cool
  let apiDomain = 'https://api.cnb.cool'
  try {
    const url = new URL(repo)
    apiDomain = `https://api.${url.hostname}`
  } catch {
    // Use default
  }

  return { repo, token, user, apiDomain }
}

/**
 * 从仓库 URL 提取 repo 路径
 * "https://cnb.cool/tcb-playground/workspace-archive" → "tcb-playground/workspace-archive"
 */
function getRepoPath(repoUrl: string): string {
  return new URL(repoUrl).pathname.replace(/^\//, '')
}

// ─── Public API ──────────────────────────────────────────────────

/**
 * 检查 Git 归档是否已配置
 */
export function isGitArchiveConfigured(): boolean {
  const config = getConfig()
  return !!(config?.repo && config?.token)
}

/**
 * 将沙箱中的变更推送到 Git 归档仓库
 *
 * 通过沙箱的 /api/tools/git_push 端点执行 git 操作
 *
 * @param sandbox 沙箱实例
 * @param conversationId 会话 ID（用作分支名）
 * @param prompt 用户提示（用于生成 commit message）
 */
export async function archiveToGit(
  sandbox: SandboxInstance,
  conversationId: string | undefined,
  prompt: string,
): Promise<void> {
  if (!conversationId) return

  const config = getConfig()
  if (!config) {
    console.log('[GitArchive] Not configured, skipping archive')
    return
  }

  try {
    const promptSummary = prompt.slice(0, 50).replace(/\n/g, ' ')
    const commitMessage = `${conversationId}: ${promptSummary}`

    const gitPushRes = await sandbox.request('/api/tools/git_push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: commitMessage }),
      signal: AbortSignal.timeout(30_000),
    })

    if (gitPushRes.ok) {
      console.log('[GitArchive] Push completed')
    } else {
      console.warn(`[GitArchive] Push failed: status=${gitPushRes.status}`)
    }
  } catch (err) {
    console.error('[GitArchive] Error:', (err as Error)?.message)
  }
}

/**
 * 删除远端归档分支（分支名 = sessionId）
 *
 * 通过 CNB HTTP API 直接删除，无需本地 git 仓库。
 * DELETE {apiDomain}/{repo}/-/git/branches/{branch}
 *
 * @param sessionId 要删除的分支名（即 session ID）
 */
export async function deleteArchiveBranch(sessionId: string): Promise<void> {
  const config = getConfig()
  if (!config) {
    return // Git 归档未配置，跳过
  }

  const repoPath = getRepoPath(config.repo)
  const apiUrl = `${config.apiDomain}/${repoPath}/-/git/branches/${encodeURIComponent(sessionId)}`

  const res = await fetch(apiUrl, {
    method: 'DELETE',
    headers: {
      Accept: 'application/vnd.cnb.api+json',
      Authorization: config.token,
    },
    signal: AbortSignal.timeout(15_000),
  })

  if (res.ok || res.status === 404) {
    // 200/204 = 删除成功, 404 = 分支不存在（等价于已删除）
    console.log(`[GitArchive] Branch deleted: ${sessionId} (status=${res.status})`)
  } else {
    const body = await res.text().catch(() => '')
    const msg = `[GitArchive] Delete failed: ${sessionId} (status=${res.status}, body=${body})`
    console.warn(msg)
    throw new Error(msg)
  }
}

/**
 * 批量删除远端归档分支
 *
 * @param sessionIds 要删除的分支名列表
 */
export async function deleteArchiveBranches(sessionIds: string[]): Promise<void> {
  if (sessionIds.length === 0) return

  if (!isGitArchiveConfigured()) return

  // 并发删除，但限制并发数避免 CNB API 压力
  const CONCURRENCY = 5
  for (let i = 0; i < sessionIds.length; i += CONCURRENCY) {
    const batch = sessionIds.slice(i, i + CONCURRENCY)
    await Promise.allSettled(batch.map((id) => deleteArchiveBranch(id)))
  }
}
