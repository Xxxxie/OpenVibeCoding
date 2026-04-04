/// <reference types="vite/client" />

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

export interface FunctionInfo {
  name: string
  runtime: string
  status: string
  codeSize: number
  description: string
  addTime: string
  modTime: string
  memSize: number
  timeout: number
  type: string
}

export const functionsAPI = {
  async list(): Promise<FunctionInfo[]> {
    const r = await fetch(`${API_BASE}/functions`)
    if (!r.ok) throw new Error(await r.text())
    return r.json()
  },

  async invoke(name: string, data?: any): Promise<any> {
    const r = await fetch(`${API_BASE}/functions/${encodeURIComponent(name)}/invoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data || {}),
    })
    if (!r.ok) throw new Error(await r.text())
    return r.json()
  },
}
