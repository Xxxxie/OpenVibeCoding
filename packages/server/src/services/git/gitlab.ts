import got, { Options as GotOptions } from 'got'
import { GIT_OPEN_VIBE_CODING_DESCRIPTION } from '../../constant'

export class GitlabService {
  private baseURL: string
  private auth: string
  private owner: string
  private oauth: boolean
  private gotRequest: (
    url: string,
    config: GotOptions,
    opts?: { rawError: boolean },
  ) => Promise<{ body: any; statusCode: any; headers: any }>

  constructor({
    auth,
    owner,
    gotRequest = got,
    oauth = true,
  }: {
    auth?: string
    owner: string
    gotRequest?: (
      url: string,
      config: GotOptions,
      opts?: { rawError: boolean },
    ) => Promise<{ body: any; statusCode: any; headers: any }>
    oauth?: boolean
  }) {
    this.auth = auth || ''
    this.owner = owner
    this.baseURL = 'https://gitlab.com/api/v4'
    this.gotRequest = gotRequest || ((url, options) => got(url, options))
    this.oauth = oauth
  }

  // 封装的 got 请求方法
  private async api(
    config: {
      url: string
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
      json?: any
      searchParams?: Record<string, any>
      responseType?: any
    },
    opts?: { rawError: boolean },
  ) {
    const headers = this.oauth
      ? {
          Authorization: `Bearer ${this.auth}`,
        }
      : { 'Private-Token': this.auth }
    const url = `${this.baseURL}/${config.url}`
    const gotConfig = {
      method: config.method || 'GET',
      ...(config.json && { json: config.json }),
      searchParams: config.searchParams,
      headers,
      responseType: config.responseType || ('json' as const),
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
      const projectPath = encodeURIComponent(`${this.owner}/${repo}`)
      const res: any = await this.api({
        url: `projects/${projectPath}`,
        method: 'GET',
      })

      const targetBranch = branch || res.body.default_branch

      // 如果用户指定了分支，检查分支是否存在，不存在则创建
      if (branch && branch !== res.body.default_branch) {
        await this.ensureBranchExists({ repo, branch, defaultBranch: res.body.default_branch })
      }

      return { name: res.body.name, default_branch: res.body.default_branch, branch: targetBranch }
    }

    // 仓库不存在，创建新仓库
    const res: any = await this.api({
      url: 'projects',
      method: 'POST',
      json: {
        name: repo,
        path: repo,
        description: GIT_OPEN_VIBE_CODING_DESCRIPTION,
        visibility: 'public',
        initialize_with_readme: true,
        ...(branch ? { default_branch: branch } : {}),
      },
    })

    const defaultBranch = res.body.default_branch

    // GitLab 支持创建时直接指定 default_branch，如果指定的 branch 和创建后的不一致，则手动创建
    if (branch && branch !== defaultBranch) {
      await this.ensureBranchExists({ repo, branch, defaultBranch })
    }

    return { default_branch: defaultBranch, name: res.body.name, branch: branch || defaultBranch }
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
    const projectPath = encodeURIComponent(`${this.owner}/${repo}`)
    try {
      await this.api(
        {
          url: `projects/${projectPath}/repository/branches/${encodeURIComponent(branch)}`,
          method: 'GET',
        },
        { rawError: true },
      )
      // 分支已存在，无需创建
    } catch (error: any) {
      if (error.response?.statusCode === 404) {
        // 分支不存在，基于默认分支创建新分支
        await this.api({
          url: `projects/${projectPath}/repository/branches`,
          method: 'POST',
          json: {
            branch,
            ref: defaultBranch,
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
          url: `projects/${encodeURIComponent(`${this.owner}/${repo}`)}`,
          method: 'GET',
        },
        { rawError: true },
      )
      return true
    } catch (error: any) {
      if (error.response?.statusCode === 404) {
        return false
      }
      throw error
    }
  }
}
