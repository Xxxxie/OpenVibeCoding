/**
 * TencentSdkRuntime
 *
 * 把现有 `CloudbaseAgentService`（基于 patch 过的 @tencent-ai/agent-sdk）包装成 IAgentRuntime。
 *
 * 设计权衡：
 * - 不动 `cloudbase-agent.service.ts` 的 2200 行实现，仅做委托。
 *   理由：现有逻辑已沉淀沙箱、coding-mode、persistence、askAnswers/toolConfirmation
 *   等大量业务，重构风险高；用 adapter 隔离。
 * - `convertToSessionUpdate` 仍由 routes/acp.ts 直接调用静态方法（暂不抽象）。
 *   理由：所有 runtime 产出的 AgentCallbackMessage 共用同一套转换规则，集中实现更易维护。
 */

import type { AgentCallback, AgentOptions } from '@coder/shared'
import type { ChatStreamResult, IAgentRuntime } from './types.js'
import { cloudbaseAgentService, getSupportedModels, type ModelInfo } from '../cloudbase-agent.service.js'

export class TencentSdkRuntime implements IAgentRuntime {
  readonly name = 'tencent-sdk'

  async isAvailable(): Promise<boolean> {
    // Tencent SDK 是 monorepo 内部依赖，安装即可用
    return true
  }

  async getSupportedModels(): Promise<ModelInfo[]> {
    return getSupportedModels()
  }

  async chatStream(prompt: string, callback: AgentCallback | null, options: AgentOptions): Promise<ChatStreamResult> {
    return cloudbaseAgentService.chatStream(prompt, callback, options)
  }
}

export const tencentSdkRuntime = new TencentSdkRuntime()
