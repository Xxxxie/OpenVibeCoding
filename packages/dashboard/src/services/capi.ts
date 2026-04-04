/// <reference types="vite/client" />

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

interface CapiRequest {
  service: string
  version: string
  action: string
  params?: Record<string, unknown>
  region?: string
}

class CapiClient {
  private base: string

  constructor(base = API_BASE) {
    this.base = base
  }

  async call<T = any>(req: CapiRequest): Promise<T> {
    const r = await fetch(`${this.base}/capi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(req),
    })
    const data = await r.json()
    if (!r.ok || data.error) throw new Error(data.error || '请求失败')
    return data.result
  }

  // 便捷方法：TCB
  tcb<T = any>(action: string, params?: Record<string, unknown>, region = 'ap-shanghai') {
    return this.call<T>({ service: 'tcb', version: '20180608', action, params, region })
  }

  // 便捷方法：CAM
  cam<T = any>(action: string, params?: Record<string, unknown>) {
    return this.call<T>({ service: 'cam', version: '20190116', action, params, region: '' })
  }

  // 便捷方法：STS（获取临时密钥）
  sts<T = any>(action: string, params?: Record<string, unknown>) {
    return this.call<T>({ service: 'sts', version: '20180813', action, params, region: '' })
  }
}

export const capiClient = new CapiClient()
