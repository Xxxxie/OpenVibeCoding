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
export { tencentSdkRuntime, TencentSdkRuntime } from './tencent-sdk-runtime.js'
export { opencodeAcpRuntime, OpencodeAcpRuntime } from './opencode-acp-runtime.js'
