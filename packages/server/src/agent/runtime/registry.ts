/**
 * AgentRuntimeRegistry
 *
 * 集中管理所有 IAgentRuntime 实例 + 提供选择策略。
 *
 * 选择优先级（高到低）：
 *   1. 显式参数（如 routes/acp.ts 从请求 body / task 记录读取的 runtime 字段）
 *   2. 环境变量 AGENT_RUNTIME（部署级 override）
 *   3. registry 默认 runtime（本地开发期）
 *
 * 注册：默认包含 codebuddy + opencode-acp，可通过 register() 扩展。
 * 向后兼容：'tencent-sdk' 作为 'codebuddy' 的别名。
 */

import type { IAgentRuntime, RuntimeSelectorOptions } from './types.js'
import { codebuddyRuntime } from './codebuddy-runtime.js'
import { opencodeAcpRuntime } from './opencode-acp-runtime.js'

const DEFAULT_RUNTIME = process.env.AGENT_RUNTIME_DEFAULT || 'codebuddy'

class AgentRuntimeRegistry {
  private runtimes = new Map<string, IAgentRuntime>()

  constructor() {
    // 默认注册的 runtime
    this.register(codebuddyRuntime)
    this.register(opencodeAcpRuntime)
    // 向后兼容别名：DB 中已存的 'tencent-sdk' 能正确 resolve
    this.runtimes.set('tencent-sdk', codebuddyRuntime)
  }

  register(runtime: IAgentRuntime): void {
    this.runtimes.set(runtime.name, runtime)
  }

  get(name: string): IAgentRuntime | undefined {
    return this.runtimes.get(name)
  }

  list(): IAgentRuntime[] {
    // 去重：别名不重复列出
    const seen = new Set<IAgentRuntime>()
    for (const r of this.runtimes.values()) {
      seen.add(r)
    }
    return Array.from(seen)
  }

  /**
   * 根据选择策略返回应使用的 runtime。
   * 不做可用性检查（调用方自行检查或 runtime 在 chatStream 中报错）。
   */
  resolve(options: RuntimeSelectorOptions = {}): IAgentRuntime {
    const candidates = [options.explicitRuntime, process.env.AGENT_RUNTIME, DEFAULT_RUNTIME].filter(Boolean) as string[]

    for (const name of candidates) {
      const r = this.runtimes.get(name)
      if (r) return r
    }

    // 兜底：返回任何已注册的 runtime
    const fallback = this.runtimes.get('codebuddy') ?? this.runtimes.values().next().value
    if (!fallback) throw new Error('No agent runtime registered')
    return fallback
  }

  /**
   * 如果调用方需要确认 runtime 真实可用（如启动时探测）。
   */
  async resolveWithAvailability(options: RuntimeSelectorOptions = {}): Promise<IAgentRuntime> {
    const r = this.resolve(options)
    const available = await r.isAvailable()
    if (!available && r.name !== 'codebuddy') {
      // 不可用 → 退回默认 codebuddy
      const fallback = this.runtimes.get('codebuddy')
      if (fallback) return fallback
    }
    return r
  }
}

export const agentRuntimeRegistry = new AgentRuntimeRegistry()
