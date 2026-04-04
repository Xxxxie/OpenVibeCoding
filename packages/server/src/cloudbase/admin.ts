import { AuthSupervisor } from '@cloudbase/toolbox'
import CloudBase from '@cloudbase/manager-node'
import type { AuthState, DeviceCodeInfo, EnvCandidate } from '@coder/shared'

const auth = AuthSupervisor.getInstance({})

// ─── 内部状态 ───────────────────────────────────────────

let authState: AuthState = { authStatus: 'IDLE' }
let pendingLoginPromise: Promise<void> | null = null

// ─── Device Code Login ──────────────────────────────────

/**
 * 发起 Device Code Flow 登录。
 * 拿到 device code 后立即返回（不等用户完成授权）。
 * Toolbox 后台会持续轮询，用户完成授权后自动写入本地 credential。
 */
export async function startDeviceLogin(): Promise<AuthState> {
  // 如果已有 pending 流程且 device code 还在，直接返回
  if (authState.authStatus === 'PENDING' && authState.deviceCode) {
    return { ...authState }
  }

  // 如果已登录，直接返回 READY
  const loginState = await auth.getLoginState()
  if (loginState) {
    authState = { authStatus: 'READY' }
    return { ...authState }
  }

  // 创建 Promise 等待 device code 就绪
  let resolveCode: (() => void) | undefined
  let rejectCode: ((reason?: unknown) => void) | undefined
  const codeReady = new Promise<void>((resolve, reject) => {
    resolveCode = resolve
    rejectCode = reject
  })

  let deviceCodeInfo: DeviceCodeInfo | undefined

  // 启动 Device Flow（不 await 整个流程）
  pendingLoginPromise = auth
    .loginByWebAuth({
      flow: 'device',
      onDeviceCode: (info: any) => {
        deviceCodeInfo = {
          user_code: info.user_code,
          verification_uri: info.verification_uri,
          expires_in: info.expires_in,
        }
        authState = {
          authStatus: 'PENDING',
          deviceCode: deviceCodeInfo,
        }
        resolveCode?.()
      },
    })
    .then(() => {
      // 后台登录完成
      authState = { ...authState, authStatus: 'READY' }
      pendingLoginPromise = null
    })
    .catch((err: any) => {
      authState = {
        authStatus: 'ERROR',
        error: err?.message || String(err),
      }
      pendingLoginPromise = null
      // 如果在拿到 device code 之前就失败了
      if (!deviceCodeInfo) {
        rejectCode?.(err)
      }
    })

  // 只等 device code 就绪（或启动失败）
  try {
    await codeReady
  } catch (err: any) {
    return {
      authStatus: 'ERROR',
      error: err?.message || '设备码登录初始化失败',
    }
  }

  return { ...authState }
}

// ─── 查询当前状态 ────────────────────────────────────────

/**
 * 查询当前 auth 状态。
 * 如果 PENDING 状态下 toolbox 后台已完成授权，会自动切换为 READY。
 */
export async function getAuthStatus(): Promise<AuthState> {
  // 如果 PENDING，检查 toolbox 是否已完成
  if (authState.authStatus === 'PENDING') {
    const loginState = await auth.getLoginState()
    if (loginState) {
      authState = { ...authState, authStatus: 'READY' }
    }
  }

  // 如果 IDLE，检查是否已有登录态（与 tcb login 共享凭证）
  if (authState.authStatus === 'IDLE') {
    const loginState = await auth.getLoginState()
    if (loginState) {
      authState = { authStatus: 'READY' }
    }
  }

  return { ...authState }
}

// ─── 获取环境列表 ────────────────────────────────────────

export async function listEnvs(): Promise<EnvCandidate[]> {
  const loginState = await auth.getLoginState()
  if (!loginState) {
    console.log('[listEnvs] No login state, returning empty list')
    return []
  }

  const manager = new CloudBase({
    secretId: (loginState as any).secretId,
    secretKey: (loginState as any).secretKey,
    token: (loginState as any).token,
    proxy: process.env.http_proxy,
  })

  // 方案1: 使用 DescribeEnvs（排除 weda/baas 等非标环境）
  try {
    const result = await manager.commonService('tcb', '2018-06-08').call({
      Action: 'DescribeEnvs',
      Param: {
        EnvTypes: ['weda', 'baas'],
        IsVisible: false,
        Channels: ['dcloud', 'iotenable', 'tem', 'scene_module'],
      },
    })
    const envList = result?.EnvList || result?.Data?.EnvList || []
    if (envList.length > 0) {
      return envList
        .filter((item: any) => item?.EnvId)
        .map((item: any) => ({
          envId: item.EnvId,
          alias: item.Alias,
          region: item.Region,
          status: item.Status,
        }))
    }
  } catch (err: any) {
    console.error('[listEnvs] DescribeEnvs failed:', err?.message || err)
  }

  // 方案2: 降级到 manager.env.listEnvs()（不带过滤条件）
  try {
    const fallback = await manager.env.listEnvs()
    const envList = (fallback as any)?.EnvList || []
    if (envList.length > 0) {
      return envList
        .filter((item: any) => item?.EnvId)
        .map((item: any) => ({
          envId: item.EnvId,
          alias: item.Alias,
          region: item.Region,
          status: item.Status,
        }))
    }
  } catch (err: any) {
    console.error('[listEnvs] Fallback listEnvs failed:', err?.message || err)
  }

  // 方案3: 不带任何过滤条件调用 DescribeEnvs
  try {
    const result = await manager.commonService('tcb', '2018-06-08').call({
      Action: 'DescribeEnvs',
      Param: {},
    })
    const envList = result?.EnvList || result?.Data?.EnvList || []
    return envList
      .filter((item: any) => item?.EnvId)
      .map((item: any) => ({
        envId: item.EnvId,
        alias: item.Alias,
        region: item.Region,
        status: item.Status,
      }))
  } catch (err: any) {
    console.error('[listEnvs] DescribeEnvs without filter also failed:', err?.message || err)
    return []
  }
}

// ─── 退出登录 ────────────────────────────────────────────

export async function logout(): Promise<void> {
  // 1. 调用 toolbox 的 logout
  try {
    await auth.logout()
  } catch (err: any) {
    console.log('[logout] auth.logout() failed (ignored):', err?.message)
  }

  // 2. 物理清理 ~/.config/.cloudbase 下的登录态文件
  try {
    const os = await import('node:os')
    const fs = await import('node:fs')
    const path = await import('node:path')

    const cloudbaseDir = path.join(os.homedir(), '.config', '.cloudbase')
    if (fs.existsSync(cloudbaseDir)) {
      const files = fs.readdirSync(cloudbaseDir)
      for (const file of files) {
        const filePath = path.join(cloudbaseDir, file)
        try {
          const stat = fs.statSync(filePath)
          if (stat.isFile()) {
            fs.unlinkSync(filePath)
          }
        } catch {
          // 跳过无法删除的文件
        }
      }
    }
  } catch (err: any) {
    console.log('[logout] Cleanup .cloudbase directory failed (ignored):', err?.message)
  }

  // 3. 重置内部状态
  authState = { authStatus: 'IDLE' }
  pendingLoginPromise = null
}
