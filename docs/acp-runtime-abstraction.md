# Agent Runtime 抽象层与 OpenCode ACP 集成

> 分支：`feat/acp-runtime-abstraction`
> 基线：`feature/refactor @ 17eca8e`
> 交付：2026-05-02
> 状态：已完成、全量 type-check / lint / build / e2e 通过

## 1. 目标

把服务端**具体 agent 实现**与**会话/流式/持久化基础设施**解耦：
- 原状：`routes/acp.ts` 直接调用 `cloudbaseAgentService.chatStream`（基于 patch 过的 `@tencent-ai/agent-sdk`）
- 重构：通过 `IAgentRuntime` 接口抽象，可在 `tencent-sdk` / `opencode-acp` 之间切换
- 为将来接入 Codex / Gemini CLI / Claude Code ACP 铺路

**首个备选 agent**：OpenCode (`opencode acp`，模型无关，支持 Moonshot Kimi、OpenAI、Anthropic 等)。

## 2. 架构

```
┌───────────────────────────────────────────────────────────────────────┐
│ routes/acp.ts                                                         │
│                                                                       │
│   /chat & /acp(session/prompt) ────► agentRuntimeRegistry.resolve()  │
│                                             │                         │
│                                             ▼                         │
│                              ┌──────────────────────────────┐         │
│                              │ IAgentRuntime                │         │
│                              │  name / isAvailable()        │         │
│                              │  getSupportedModels()        │         │
│                              │  chatStream(prompt, cb, opt) │         │
│                              └──────────────┬───────────────┘         │
│                                             │                         │
│                        ┌────────────────────┼──────────────────────┐  │
│                        ▼                    ▼                      ▼  │
│           ┌──────────────────┐  ┌──────────────────────┐  (未来扩展) │
│           │ TencentSdkRuntime│  │  OpencodeAcpRuntime  │             │
│           │  (进程内，现状)  │  │  (spawn opencode acp)│             │
│           │                  │  │                      │             │
│           │ 委托给           │  │ ClientSideConnection │             │
│           │ cloudbaseAgent   │  │ NDJSON over stdio    │             │
│           │ Service          │  │                      │             │
│           └──────────────────┘  └──────────────────────┘             │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

**流事件翻译**：所有 runtime 统一把自己的内部事件流翻译为 `AgentCallbackMessage`（`text` / `thinking` / `tool_use` / `tool_result` / `result` / `error` / `agent_phase` / ...），由 `CloudbaseAgentService.convertToSessionUpdate()` 统一转为 ACP `SessionUpdate` → 前端无感知。

## 3. 新增文件

```
packages/server/src/agent/runtime/
├── types.ts                  # IAgentRuntime 接口、ChatStreamResult、RuntimeSelectorOptions
├── tencent-sdk-runtime.ts    # 将 cloudbaseAgentService 包装为 IAgentRuntime（极薄 adapter）
├── opencode-acp-runtime.ts   # spawn `opencode acp`、ACP 握手、事件翻译
├── registry.ts               # AgentRuntimeRegistry：注册、选择策略、可用性检查
└── index.ts                  # 公共导出

packages/server/scripts/
├── test-opencode-runtime.mts # e2e#1: 直接调用 runtime，验证工具调用、文件写入
├── test-acp-http-e2e.mts     # e2e#2: 起 server，验证 /runtimes 公开端点
└── test-acp-chat-http.mts    # e2e#3: 完整 HTTP SSE，mock auth 走 /chat-test
```

## 4. 改动现有文件

| 文件 | 改动 |
|---|---|
| `packages/server/package.json` | + `@agentclientprotocol/sdk@^0.21.0` |
| `packages/server/src/routes/acp.ts` | 1) 从 `cloudbaseAgentService.chatStream` → `runtime.chatStream`（`/chat` 与 `handleSessionPrompt` 两处）<br>2) 新增 `GET /api/agent/runtimes` 列出已注册 runtime<br>3) `/runtimes` 与 `/health` / `/config` 一起放入 auth 豁免名单 |
| `packages/shared/src/types/agent.ts` | `SessionPromptParams.runtime?: string` 新增字段 |

## 5. IAgentRuntime 接口

```ts
export interface IAgentRuntime {
  readonly name: string
  isAvailable(): Promise<boolean>
  getSupportedModels(): Promise<ModelInfo[]>
  chatStream(prompt: string, callback: AgentCallback | null, options: AgentOptions): Promise<ChatStreamResult>
}

export interface ChatStreamResult {
  turnId: string         // assistantMessageId
  alreadyRunning: boolean
}
```

**行为约定**（所有实现者必须遵守）：
1. `chatStream` 同步返回 `{ turnId, alreadyRunning }`（不等 agent 跑完）
2. 后台 fire-and-forget 跑 agent，通过 `callback` 实时推送 `AgentCallbackMessage`
3. 完成时推送 `type: 'result'`
4. abort 时推送 `type: 'error', content: 'Aborted'`
5. callback 调用顺序需保持单调时间序

## 6. Runtime 选择策略

`AgentRuntimeRegistry.resolve(opts)` 按优先级：
1. `opts.explicitRuntime`（来自请求 body 的 `runtime` 字段 / task 记录）
2. `process.env.AGENT_RUNTIME`（部署级 override）
3. `process.env.AGENT_RUNTIME_DEFAULT` 或内置默认 `tencent-sdk`

**前端用法**：
```typescript
// 发 prompt 时传入 runtime
fetch('/api/agent/chat', {
  method: 'POST',
  body: JSON.stringify({
    prompt: '...',
    conversationId: '...',
    runtime: 'opencode-acp',  // 或 'tencent-sdk'
  })
})

// 或者通过 session/prompt (JSON-RPC) 的 params.runtime
```

**列出可用 runtime**（用于前端选择器）：
```
GET /api/agent/runtimes
→ {"default":"tencent-sdk","runtimes":[
    {"name":"tencent-sdk","available":true},
    {"name":"opencode-acp","available":true}
  ]}
```

## 7. OpencodeAcpRuntime 细节

### 依赖
- `@agentclientprotocol/sdk@^0.21.0`
- 系统装了 `opencode-ai` CLI（`npm i -g opencode-ai`）
- 模型 provider 配置见 `~/.config/opencode/opencode.json`
- API key 见 `~/.local/share/opencode/auth.json`

### 模型配置示例（Moonshot Kimi）
```json
// ~/.config/opencode/opencode.json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "moonshot": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Moonshot",
      "options": { "baseURL": "https://api.moonshot.cn/v1" },
      "models": {
        "kimi-k2-0905-preview": { "name": "Kimi K2 (0905)" },
        "kimi-k2-turbo-preview": { "name": "Kimi K2 Turbo" }
      }
    }
  }
}
```

```json
// ~/.local/share/opencode/auth.json
{
  "moonshot": { "type": "api", "key": "sk-xxx" }
}
```

### 环境变量
- `OPENCODE_BIN`：opencode 可执行路径，默认 `opencode`
- `OPENCODE_DEFAULT_MODEL`：默认模型，默认 `moonshot/kimi-k2-0905-preview`
- `OPENCODE_ACP_DEBUG=1`：打印 opencode stderr 与未识别事件

### ACP 流程
```
spawn opencode acp --cwd <cwd>
  │
  ▼
ClientSideConnection (NDJSON over stdio)
  │
  ├─ initialize { protocolVersion: 1, clientCapabilities: { fs, terminal: false } }
  ├─ newSession { cwd, mcpServers: [] }
  ├─ unstable_setSessionModel { sessionId, modelId }  # best-effort
  └─ prompt { sessionId, prompt: [{ type: 'text', text }] }
     │
     ▼
  session/update 事件流 → handleSessionUpdate → emit AgentCallbackMessage
     │
     ▼
  callback → 前端 SSE + stream events 落库
```

### ACP SessionUpdate → AgentCallbackMessage 映射

| ACP `sessionUpdate` | AgentCallbackMessage `type` | 备注 |
|---|---|---|
| `agent_message_chunk` (text) | `text` | 流式正文 |
| `agent_thought_chunk` (text) | `thinking` | 思考链 |
| `tool_call` | `tool_use` | title → name，rawInput → input |
| `tool_call_update` (in_progress) | `tool_input_update` | 中间状态 |
| `tool_call_update` (completed/failed) | `tool_result` | is_error = (status === 'failed') |
| `plan` | `thinking` (文本化) | 首版极简处理 |
| `available_commands_update` / `usage_update` / `current_mode_update` | 静默吞掉 | 噪声 |

### 权限请求
OpenCode 用 `requestPermission` 请求权限（edit / bash / webfetch 等工具）。
当前实现：**自动 allow_once**（与 PoC 一致）。

TODO：接入真实的 ToolConfirm UI 回调（复用 `askAnswers` / `toolConfirmation` 机制），
需要把 ACP `requestPermission` 映射到 `AgentCallbackMessage.type='tool_confirm'`，
并在收到用户决策后重新 resolve promise。**当前首版未做**，但框架已留接口。

## 8. 首版已知限制

OpenCode runtime 实现为**最小可用**，暂不覆盖以下现有 Tencent SDK 特性：

| 特性 | 状态 |
|---|---|
| askAnswers resume（AskUserQuestion） | ❌ 未实现 |
| toolConfirmation resume（ToolConfirm UI） | ❌ 未实现（默认 allow_once） |
| 沙箱 (SCF) 集成 | ❌ 进程内本地执行，OpenCode 的 read/write/bash 走本地文件系统 |
| coding-mode 初始化（dev server / preview proxy） | ❌ 未集成 |
| 消息持久化到 CloudBase tasks collection | ⚠️ 只持久化 stream events，不落 messages 表 |
| git-archive / persistence.syncMessages | ❌ 未集成 |
| maxTurns | ❌ 交给 opencode 自己控制 |
| permissionMode（plan 模式） | ❌ 可通过 session/set_mode 映射，但未接线 |

**这些限制不影响首版验证架构可行性**。如果要投产 OpenCode 为主 runtime，需要补足上述项——但**架构本身对此开放**（IAgentRuntime 接口足够表达所有能力，实现方自行决定是否支持）。

## 9. 测试结果

### e2e#1: `test-opencode-runtime.mts`（直接调 runtime）
```
[e2e] workdir = /tmp/opencode-runtime-e2e
[e2e] available = true
[tool_use ▶] write id=write:0 input={}
[tool_result ◯] tool_use_id=write:0 is_error=false out={"output":"Wrote file successfully."...}
[result] {"stopReason":"end_turn","usage":null}
hello.txt content: "hello from runtime"
  text events:        PASS (2)
  tool_use events:    PASS (1)
  tool_result events: PASS (1)
  result events:      PASS (1)
  file created:       PASS
OVERALL: PASS
```

### e2e#2: `test-acp-http-e2e.mts`（起 server，公开端点）
```
/health = { status: 'ok', service: 'acp' }
/runtimes = {
  "default": "tencent-sdk",
  "runtimes": [
    { "name": "tencent-sdk", "available": true },
    { "name": "opencode-acp", "available": true }
  ]
}
  /health: PASS
  /runtimes: PASS (opencode-acp registered)
```

### e2e#3: `test-acp-chat-http.mts`（完整 HTTP SSE，mock auth）
```
status=200 content-type=text/event-stream
received 21 SSE events
event type distribution: {
  "update:agent_phase": 2,
  "update:agent_message_chunk": 18,
  "DONE": 1
}
agent text: 我是OpenCode，一个运行在您计算机上的交互式通用AI代理，专注于通过实际行动
  stream completed with [DONE]: PASS
  received agent text:          PASS
OVERALL: PASS
```

### 质量校验
- `pnpm type-check` ✅
- `pnpm lint` ✅
- `pnpm build` (server + web) ✅
- `pnpm format` ✅（无格式化差异）

## 10. 如何运行 e2e 测试

```bash
# 前提：
#   1. npm i -g opencode-ai
#   2. ~/.config/opencode/opencode.json 配好 moonshot provider
#   3. ~/.local/share/opencode/auth.json 有 moonshot key
#   4. packages/server/.env 填好 TCB_*（仅 e2e#2/#3 需要）

cd packages/server

# e2e #1: runtime 层（最快，~60s）
npx tsx scripts/test-opencode-runtime.mts

# e2e #2: HTTP 公开端点（~10s）
npx tsx --env-file=.env scripts/test-acp-http-e2e.mts

# e2e #3: 完整 SSE chat 流（~30s）
npx tsx --env-file=.env scripts/test-acp-chat-http.mts
```

## 11. 后续路线图

1. **完善 OpencodeAcpRuntime**（2-3 天）
   - 实现 ToolConfirm 回调映射（`requestPermission` → `tool_confirm` → 用户决策 → resolve）
   - 接入 `askAnswers` / `toolConfirmation` resume 机制
   - 消息持久化到 tasks（参考 cloudbase-agent.service 的 `preSavePendingRecords` / `syncMessages`）

2. **SCF 沙箱化 OpenCode**（1-2 天）
   - 打一个含 opencode-ai 的 SCF 镜像
   - 改 OpencodeAcpRuntime，支持通过 CloudBase Gateway 转发 stdio 到 SCF
   - 所有 read/write/bash 自动在沙箱内执行，和现有 SCF 架构一致

3. **接入更多 agent**（每个 1-2 天）
   - Claude Code ACP (`@agentclientprotocol/claude-agent-acp`)
   - Gemini CLI (`gemini --experimental-acp`)
   - Codex CLI（一旦确认其 ACP 启动方式）

4. **前端 UI**（0.5-1 天）
   - Task 创建表单 + Settings 里加 runtime 选择器
   - 基于 `GET /api/agent/runtimes` 动态列出

## 12. 设计决策

### 为什么 TencentSdkRuntime 是极薄 adapter 而不是重写？
`cloudbase-agent.service.ts` 2200 行里沉淀了大量沙箱、coding-mode、persistence、askAnswers/toolConfirmation 业务。重写风险太高、收益有限。Adapter 模式确保 100% 行为兼容，零回归。

### 为什么 ACP runtime 每次都 spawn 新进程？
OpenCode 本身支持单进程多 session，理论上可复用。但这会带来：
- 进程生命周期管理复杂度（何时 kill？）
- session 清理（opencode 里跑完不会自动 gc）
- 凭证泄露风险（一个进程服务多用户）

首版选**每次新 spawn**，启动成本约 1-2s，可接受。后续可加进程池。

### 为什么 runtime 层不引入 IPersistence / ISandbox 子抽象？
YAGNI。首版只证明"能切 agent"。Tencent runtime 直接用 `cloudbaseAgentService`（深度耦合 CloudBase），OpenCode runtime 只用 stream events（最小耦合）。等真正接入第 3 个 runtime、发现共同痛点再抽象。

### 为什么 `convertToSessionUpdate` 还留在 CloudbaseAgentService 的静态方法？
它的输入是标准的 `AgentCallbackMessage`，输出是 ACP `SessionUpdate`，与任何 runtime 无关。保留静态位置避免过度重构（搬家会改 routes/acp.ts 的 import）。将来可以挪到 `agent/acp-event.ts` 或类似文件。

## 13. 引用

- Agent Client Protocol: https://agentclientprotocol.com
- OpenCode: https://github.com/sst/opencode
- ACP SDK: https://www.npmjs.com/package/@agentclientprotocol/sdk
- 深度分析备忘录: `docs/opencode-acp-integration-memo.md`（首轮调研，已印证）
