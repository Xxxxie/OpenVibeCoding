/**
 * Agent Runtime 抽象层 - 公共导出
 *
 * 使用方式：
 *   import { agentRuntimeRegistry } from '../agent/runtime/index.js'
 *   const runtime = agentRuntimeRegistry.resolve({ explicitRuntime: req.body.runtime })
 *   const { turnId, alreadyRunning } = await runtime.chatStream(prompt, callback, options)
 */

export type { IAgentRuntime, ChatStreamResult, RuntimeSelectorOptions, EmitFn } from './types.js'
export { agentRuntimeRegistry } from './registry.js'
export { codebuddyRuntime, CodeBuddyRuntime, tencentSdkRuntime, type TencentSdkRuntime } from './codebuddy-runtime.js'
export { opencodeAcpRuntime, OpencodeAcpRuntime } from './opencode-acp-runtime.js'
export { BaseAgentRuntime, type RuntimeContext } from './base-runtime.js'
export {
  WRITE_TOOLS,
  waitForSandboxHealth,
  initSandboxWorkspace,
  buildAppendPrompt,
  getPublishableKey,
  persistDeploymentFromArtifact,
  extractDeployUrl,
} from './base-runtime.js'
