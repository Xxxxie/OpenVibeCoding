import got, { Options as GotOptions } from 'got'
import { GIT_OPEN_VIBE_CODING_DESCRIPTION } from '../../constant'

function isHttpError(error: unknown): error is { response?: { statusCode?: number } } {
  return typeof error === 'object' && error !== null && 'response' in error
}

export class GitHubService {
  private auth: string
  private owner: string
  private baseURL = 'https://api.github.com'
  private gotRequest: (
    url: string,
    config: GotOptions,
    opts?: { rawError: boolean },
  ) => Promise<{ body: any; statusCode: any; headers: any }>

  constructor({
    auth,
    owner,
    gotRequest,
  }: {
    auth?: string
    owner: string
    gotRequest?: (
      url: string,
      config: GotOptions,
      opts?: { rawError: boolean },
    ) => Promise<{ body: any; statusCode: any; headers: any }>
  }) {
    this.auth = auth || ''
    this.owner = owner
    this.gotRequest = gotRequest || ((url, options) => got(url, options))
  }

  private async api(
    config: {
      url: string
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
      json?: any
      searchParams?: Record<string, any>
      accept?: string // 允许自定义 Accept 头
    },
    opts?: { rawError: boolean },
  ) {
    const url = `${this.baseURL}/${config.url}`
    const gotConfig: GotOptions = {
      method: config.method || 'GET',
      ...(config.json && { json: config.json }),
      ...(config.searchParams && { searchParams: config.searchParams }),
      headers: {
        Accept: config.accept || 'application/vnd.github+json',
        Authorization: `Bearer ${this.auth}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'tcb-headless-service',
      },
      responseType: 'json' as const,
      timeout: {
        request: 15000,
      },
    }

    const response = await this.gotRequest(url, gotConfig, { rawError: opts?.rawError! })
    return response.body
  }

  async createOrGetRepo({ repo, branch }: { repo: string; branch?: string }) {
    const exist = await this.checkRepoExists({ repo })

    if (exist) {
      // 仓库已存在，直接获取信息返回
      const res = await this.api({
        url: `repos/${this.owner}/${repo}`,
        method: 'GET',
      })

      const targetBranch = branch || res.default_branch

      // 如果用户指定了分支，检查分支是否存在，不存在则创建
      if (branch && branch !== res.default_branch) {
        await this.ensureBranchExists({ repo, branch, defaultBranch: res.default_branch })
      }

      return { name: res.name, default_branch: res.default_branch, branch: targetBranch }
    }

    // 仓库不存在，创建新仓库
    const res = await this.api({
      url: 'user/repos',
      method: 'POST',
      json: {
        name: repo,
        description: GIT_OPEN_VIBE_CODING_DESCRIPTION,
        private: false,
        auto_init: true,
      },
    })

    const defaultBranch = res.default_branch

    // 如果用户指定了分支且不同于默认分支，基于默认分支创建新分支
    if (branch && branch !== defaultBranch) {
      await this.ensureBranchExists({ repo, branch, defaultBranch })
    }

    return { name: res.name, default_branch: defaultBranch, branch: branch || defaultBranch }
  }

  /**
   * 确保指定分支存在，如果不存在则基于默认分支创建
   */
  private async ensureBranchExists({
    repo,
    branch,
    defaultBranch,
  }: {
    repo: string
    branch: string
    defaultBranch: string
  }) {
    try {
      await this.api(
        {
          url: `repos/${this.owner}/${repo}/branches/${branch}`,
          method: 'GET',
        },
        { rawError: true },
      )
      // 分支已存在，无需创建
    } catch (error) {
      if (isHttpError(error) && error.response?.statusCode === 404) {
        // 分支不存在，获取默认分支的最新 commit SHA，然后创建新分支
        const refRes = await this.api({
          url: `repos/${this.owner}/${repo}/git/ref/heads/${defaultBranch}`,
          method: 'GET',
        })
        const sha = refRes.object.sha

        await this.api({
          url: `repos/${this.owner}/${repo}/git/refs`,
          method: 'POST',
          json: {
            ref: `refs/heads/${branch}`,
            sha,
          },
        })
      } else {
        throw error
      }
    }
  }

  private async checkRepoExists({ repo }: { repo: string }): Promise<boolean> {
    try {
      await this.api(
        {
          url: `repos/${this.owner}/${repo}`,
          method: 'GET',
        },
        { rawError: true },
      )
      return true
    } catch (error) {
      if (isHttpError(error) && error.response?.statusCode === 404) {
        return false
      }
      throw error
    }
  }
}
