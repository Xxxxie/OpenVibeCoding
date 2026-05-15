import got, { Options as GotOptions } from 'got'
import { GitHubService } from './github'
import { GiteeService } from './gitee'
import { GitlabService } from './gitlab'

export interface IGitOptions {
  platform: string
  owner: string
  repo: string
  branch?: string
  auth?: string
}

export function parseGitUrl(repoUrl: string): { platform: string; owner: string; repo: string } | null {
  try {
    const url = new URL(repoUrl)
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length < 2) return null

    const hostMap: Record<string, string> = {
      'github.com': 'github',
      'gitee.com': 'gitee',
      'gitlab.com': 'gitlab',
    }

    const platform = hostMap[url.hostname] || url.hostname.replace(/\..*$/, '')
    const owner = parts[0]
    const repo = parts[1].replace(/\.git$/, '')

    return { platform, owner, repo }
  } catch {
    return null
  }
}

export class GitService {
  private gitOptions: IGitOptions | null
  private gotRequest: (
    url: string,
    config: GotOptions,
    opts?: { rawError: boolean },
  ) => Promise<{ body: any; statusCode: any; headers: any }>

  constructor({
    repoUrl,
    branch,
    gotRequest,
  }: {
    repoUrl: string
    branch: string
    gotRequest?: (
      url: string,
      config: GotOptions,
      opts?: { rawError: boolean },
    ) => Promise<{ body: any; statusCode: any; headers: any }>
  }) {
    const gitOptions = parseGitUrl(repoUrl)
    if (!gitOptions) {
      throw new Error(`Invalid git url: ${repoUrl}`)
    }
    const auth = process.env.GIT_PERSONAL_AUTH

    if (!gitOptions || !auth) {
      this.gitOptions = null
    } else {
      this.gitOptions = {
        ...gitOptions,
        branch,
        auth,
      }
    }

    this.gotRequest = gotRequest || ((url, options) => got(url, options))
  }

  /**
   * 有则复用，无则创建仓库
   * - 仓库已存在: 直接获取仓库信息返回，如果指定了 branch 则检查/创建分支
   * - 仓库不存在: 创建新仓库，如果指定了 branch 则作为默认分支
   */
  async createOrGetRepo() {
    const { repo, branch } = this.gitOptions!

    const gitService = this.getGitService()

    return gitService.createOrGetRepo({ repo, branch })
  }

  private getGitService() {
    const { platform, auth, owner } = this.gitOptions!

    if (platform === 'github') {
      return new GitHubService({
        auth,
        owner,
        gotRequest: this.gotRequest,
      })
    } else if (platform === 'gitee') {
      return new GiteeService({
        auth,
        owner,
        gotRequest: this.gotRequest,
      })
    } else if (platform === 'gitlab') {
      return new GitlabService({
        auth,
        owner,
        gotRequest: this.gotRequest,
      })
    } else {
      throw new Error(`Unsupported git platform: ${platform}`)
    }
  }
}
