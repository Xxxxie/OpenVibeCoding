/**
 * CodeBuddyRuntime
 *
 * 把现有 `CloudbaseAgentService`（基于 @tencent-ai/agent-sdk）包装成 IAgentRuntime。
 * 继承 BaseAgentRuntime 获取沙箱/MCP/系统提示等公共设施（当前仍委托到 cloudbase-agent.service.ts，
 * 其内部已包含完整的沙箱+MCP 逻辑，后续迁移到 runAgent 中复用基类设施）。
 *
 * runtime name: 'codebuddy'（向后兼容：registry 同时注册 'tencent-sdk' 别名）
 */

import type { AgentCallback, AgentOptions } from '@coder/shared'
import type { ChatStreamResult } from './types.js'
import { cloudbaseAgentService, getSupportedModels, type ModelInfo } from '../cloudbase-agent.service.js'
import { BaseAgentRuntime } from './base-runtime.js'

export class CodeBuddyRuntime extends BaseAgentRuntime {
  readonly name = 'codebuddy'

  async isAvailable(): Promise<boolean> {
    // CodeBuddy SDK 是 monorepo 内部依赖，安装即可用
    return true
  }

  async getSupportedModels(): Promise<ModelInfo[]> {
    return getSupportedModels()
  }

  async chatStream(prompt: string, callback: AgentCallback | null, options: AgentOptions): Promise<ChatStreamResult> {
    return cloudbaseAgentService.chatStream(prompt, callback, options)
  }
}

export const codebuddyRuntime = new CodeBuddyRuntime()

// ─── 向后兼容别名 ─────────────────────────────────────────────────────────
/** @deprecated Use CodeBuddyRuntime / codebuddyRuntime instead */
export const tencentSdkRuntime = codebuddyRuntime
/** @deprecated Use CodeBuddyRuntime instead */
export type TencentSdkRuntime = CodeBuddyRuntime
