# @tencent-ai/agent-sdk 项目使用调研报告

**项目根目录**: `/Users/yang/git/coding-agent-template`  
**生成日期**: 2026-05-01  

---

## 1. SDK 核心使用方式

### 1.1 Import 位置与关键 API

#### 主要导入文件
- **文件**: `/packages/server/src/agent/cloudbase-agent.service.ts` (2200+ 行)
- **SDK 导入**:
  ```typescript
  import { query, ExecutionError } from '@tencent-ai/agent-sdk'
  ```

#### 关键导出 API 及用法

| API | 用途 | 位置 |
|-----|------|------|
| `query()` | 创建 agent 查询迭代器，驱动整个 agent 执行流程 | L1429 |
| `ExecutionError` | SDK 内部中断异常（如 interrupt=true 时抛出） | L1556 |
| `supportedModels()` | 获取平台支持的模型列表 | L64 |

#### 核心调用代码

```typescript
// ─── SDK 查询配置 (cloudbase-agent.service.ts, L1176-1426)
const queryArgs = {
  prompt,                           // 用户提示词
  options: {
    model: modelId,                 // 模型 ID（如 'glm-5.1'）
    permissionMode: sdkPermissionMode,  // 权限模式: 'bypassPermissions' | 'plan'
    allowDangerouslySkipPermissions: true,  // 跳过权限检查开关
    maxTurns: 500,                  // 最大对话轮数
    cwd: actualCwd,                 // 本地工作目录
    sessionId: conversationId,      // 会话 ID（resume 时关键）
    resume: hasHistory ? conversationId : undefined,  // 恢复历史标志
    persistSession: !hasHistory,    // 新会话持久化
    includePartialMessages: true,   // 包含部分消息（流式）
    systemPrompt: { append: '...' },  // 系统提示词（可追加）
    mcpServers: { cloudbase: sdkServer },  // MCP 服务配置
    abortController,                // 中止控制器
    canUseTool: async (toolName, input, _options) => { /* 工具权限回调 */ },
    hooks: {
      PreToolUse: [/* 工具执行前 hook */]
    },
    env: envVars,                   // 传入 CLI 的环境变量
    stderr: (data) => { /* 标准错误回调 */ },
    settingSources: ['project'],    // 设置源
    disallowedTools: ['AskUserQuestion'],  // 禁用工具列表
  }
}

const q = query(queryArgs as any)

// ─── 消息循环迭代 (L1451-1543)
for await (const message of q) {
  switch (message.type) {
    case 'system':    // 系统消息（session_id）
    case 'error':     // 错误消息
    case 'stream_event':  // SDK 内部流事件
    case 'user':      // 工具执行结果
    case 'assistant': // 模型响应（含工具调用）
    case 'result':    // 本轮执行结果
  }
}
```

### 1.2 Model 支持

```typescript
// 静态模型列表（L49-58）
const STATIC_MODELS = [
  { id: 'minimax-m2.7', name: 'MiniMax-M2.7' },
  { id: 'glm-5.1', name: 'GLM-5.1' },
  { id: 'kimi-k2.6', name: 'Kimi-K2.6' },
  { id: 'deepseek-v3-2-volc', name: 'DeepSeek-V3.2' },
  // ...
]

// 默认模型
const DEFAULT_MODEL = 'glm-5.1'  // L25
```

---

## 2. SDK 改造点（Patch 机制）

### 2.1 Patch 文件位置与内容

- **文件**: `/patches/@tencent-ai__agent-sdk@0.3.68.patch` (85 行)
- **配置**: `package.json` L52-54 注册了 pnpm 补丁

### 2.2 Patch 改造的三个拦截点

#### (1) **Skill 加载器拦截** (L11-30 of patch)
```javascript
// 注入环境变量: CODEBUDDY_SKILL_LOADER_OVERRIDE
// 目标: 覆盖 SDK 的 loadSkills / scanSkillsDirectory / parseSkillFile 方法
(function(){
  var _m = process.env.CODEBUDDY_SKILL_LOADER_OVERRIDE;  // override 模块路径
  if (!_m) return;
  // 拦截三个方法：
  // - loadSkills()
  // - scanSkillsDirectory()
  // - parseSkillFile()
  // 注入自定义逻辑（e.g., 扫描项目/用户技能）
})();
```
**用途**: 支持项目级和用户级技能加载，不仅仅是 SDK 内置技能

**对应实现文件**:
- `packages/server/src/util/skill-loader-override.ts` (编译到 `dist/util/skill-loader-override.cjs`)
- 在 `launchAgent()` 中通过 `envVars.CODEBUDDY_SKILL_LOADER_OVERRIDE` 传入

#### (2) **会话存储拦截** (L41-51 of patch)
```javascript
// 注入环境变量: CODEBUDDY_SESSION_STORE_OVERRIDE
// 目标: 覆盖 SDK 的 SessionStore.prototype 行为
(function(){
  var _ss = process.env.CODEBUDDY_SESSION_STORE_OVERRIDE;
  if (!_ss) return;
  var _mod = require(_ss);
  if (typeof _mod.overrideSessionStore === "function") {
    _mod.overrideSessionStore(tL.prototype);  // 在 SessionStore 原型上拦截
  }
})();
```
**用途**: 自定义会话持久化（JSONL 格式转换、CloudBase 同步等）

#### (3) **工具执行拦截** (L61-81 of patch)
```javascript
// 注入环境变量: CODEBUDDY_TOOL_OVERRIDE
// 目标: 在 SDK 工具管理器初始化后，覆盖工具集
(function(){
  var _t = process.env.CODEBUDDY_TOOL_OVERRIDE;
  if (!_t) return;
  var _mod = require(_t);
  if (typeof _mod.overrideTools === "function") {
    // 在 ToolManager.init() 后注入，修改 this.toolMap
    _mod.overrideTools(this.toolMap);
  }
})();
```
**用途**: 重定向工具调用到沙箱（CloudBase SCF 函数）

**对应实现文件**:
- `packages/server/src/sandbox/tool-override.ts` (编译到 `dist/sandbox/tool-override.cjs`)
- 通过 `envVars.CODEBUDDY_TOOL_OVERRIDE` 和 `envVars.CODEBUDDY_TOOL_OVERRIDE_CONFIG` 传入

### 2.3 Patch 版本与应用

```json
// package.json
"patchedDependencies": {
  "@tencent-ai/agent-sdk@0.3.68": "patches/@tencent-ai__agent-sdk@0.3.68.patch"
}
```
- **SDK 版本**: `0.3.68`（固定）
- **应用方式**: `pnpm install` 时自动应用（via `patch-package`）

---

## 3. Agent 核心能力使用点

### 3.1 ACP (Agent Communication Protocol) 协议

#### 协议层面
- **是否使用**: **是** ✓
- **位置**: `/packages/server/src/routes/acp.ts` (全 ACP 路由实现)

#### 关键 ACP 消息类型（来自 SDK）

SDK 的 `message.type` 枚举（在消息循环中）:

```typescript
// 系统级消息
message.type === 'system'        // session_id 初始化
message.type === 'error'         // 执行错误

// 核心业务消息
message.type === 'stream_event'  // SDK 流事件（含 thinking / tool_use / text_delta 等）
message.type === 'user'          // 工具结果（tool_result 块）
message.type === 'assistant'     // 模型响应（tool_use、text 块）
message.type === 'result'        // 执行完成标志
```

#### 消息转换管道

**Raw SDK Message → ExtendedSessionUpdate (DB 格式) → ACP SSE (前端格式)**

```typescript
// CloudbaseAgentService.convertToSessionUpdate() [L420-522]
AgentCallbackMessage (SDK 内部)
  ↓
ExtendedSessionUpdate (适配 ACP 协议)
  ↓
SSE Stream (前端订阅)
  
例:
{type: 'text', content: 'hello'}
  → {sessionUpdate: 'agent_message_chunk', content: {type: 'text', text: 'hello'}}
  → SSE: {'jsonrpc': '2.0', 'method': 'session/update', 'params': {...}}
```

### 3.2 SSE 流式输出处理

#### 流消息类型映射（L420-522）

| SDK 回调类型 | sessionUpdate 值 | 说明 |
|-----------|-----------------|------|
| `text` | `agent_message_chunk` | 文本流片段 |
| `thinking` | `thinking` | 思考块内容 |
| `tool_use` | `tool_call` | 工具调用开始 |
| `tool_input_update` | `tool_call_update` | 工具参数更新 |
| `tool_result` | `tool_call_update` | 工具执行结果 |
| `error` | `log` (level=error) | 错误日志 |
| `artifact` | `artifact` | 部署 URL / 二维码等 |
| `ask_user` | `ask_user` | 用户问卷 |
| `tool_confirm` | `tool_confirm` | 工具确认请求 |
| `agent_phase` | `agent_phase` | 代理执行阶段 |

#### 流处理管道

```
SDK message loop
  ↓
wrappedCallback (L759-795)  // 统一回调入口
  ↓
convertToSessionUpdate()     // 转换为 ACP 格式
  ↓
eventBuffer.push()          // 缓冲到内存
  ↓
persistenceService.appendStreamEvents()  // 异步刷到 DB
  ↓
liveCallback() → SSE stream // 同步发给前端
```

### 3.3 工具调用处理与权限拦截

#### 权限框架（Permission Model）

**三层权限检查**:

1. **canUseTool 回调** (L1195-1321)
   - 工具调用前的**异步权限决策**
   - 返回 `{behavior: 'allow'|'deny'|'block', interrupt: true}`

2. **PreToolUse Hook** (L1322-1417)
   - MCP 工具（mcp__ 前缀）的前置拦截
   - 返回 `{continue: true/false, decision: 'block'|undefined}`

3. **会话级白名单** (sessionPermissions)
   - `sessionPermissions.isAllowed()` 检查
   - `sessionPermissions.allowAlways()` 记录许可

#### 写工具确认机制

**WRITE_TOOLS 集合** (L195-207):
```typescript
const WRITE_TOOLS = new Set([
  'writeNoSqlDatabaseStructure',
  'writeNoSqlDatabaseContent',
  'executeWriteSQL',
  'modifyDataModel',
  'createFunction',
  'updateFunctionCode',
  'updateFunctionConfig',
  'invokeFunction',
])
```

**确认流程**:
```
Agent 调用写工具 (e.g., executeWriteSQL)
  ↓
canUseTool 判断:
  - 白名单中 → {behavior: 'allow'} → 直接执行
  - Resume + toolConfirmation 中 → {behavior: 'allow'|'deny'} → 按用户决策
  - 首次调用 → wrappedCallback({type: 'tool_confirm'}) → 等待用户确认（Interrupt）
  ↓
前端展示 ToolConfirm 对话框
  ↓
用户确认后 → cloudbaseAgentService.launchAgent() 再次启动 resume 流程
```

### 3.4 MCP (Model Context Protocol) 集成

#### MCP 服务配置

**位置**: L1155-1157
```typescript
const mcpServers: Record<string, any> = {}
if (sandboxMcpClient) {
  mcpServers.cloudbase = sandboxMcpClient.sdkServer  // SDK-wrapped MCP server
}
```

#### MCP 服务来源

```
sandboxMcpClient = await createSandboxMcpClient({
  sandbox: SandboxInstance,
  getCredentials: () => ({ cloudbaseEnvId, secretId, secretKey, ... }),
  workspaceFolderPaths: actualCwd,
  ...
})
  ↓
mcpClient 内部:
  - 通过 HTTP API 与沙箱通信
  - 支持的工具: cloudbase_* (数据库、函数、存储、托管等)
  - 工具结果经 tool-override 重定向
```

#### MCP 工具规范化

```typescript
// normalizeToolName() [session-permissions.ts]
'mcp__cloudbase__executeWriteSQL' → 'executeWriteSQL'
// 用于权限检查和白名单匹配
```

### 3.5 AskUserQuestion 中断机制

#### 工作流 (L1198-1211)

```typescript
if (toolName === 'AskUserQuestion') {
  wrappedCallback({
    type: 'ask_user',
    id: toolUseId,
    input: { questions: [...] },
  })
  return {
    behavior: 'deny',
    message: '等待用户回答问题',
    interrupt: true,  // 中断执行
  }
}
```

#### Resume 处理 (L668-738)

```
askAnswers 场景（用户填表后）:
  ↓
persistenceService.updateToolResult()  // 写入用户回答
  ↓
restoreMessages()  // 从 DB 恢复含答案的历史
  ↓
query() resume  // 重新启动 agent
  ↓
SDK 看到 AskUserQuestion 的结果 → 继续执行（不再中断）
```

### 3.6 ExitPlanMode 工具与 Plan 模式

#### Plan 模式激活

```typescript
const sdkPermissionMode = requestedPermissionMode === 'plan' ? 'plan' : 'bypassPermissions'
// L1170：前端通过 permissionMode='plan' 切入 plan 模式
```

#### ExitPlanMode 处理 (L1221-1256)

```typescript
if (toolName === 'ExitPlanMode') {
  // 首次调用 → wrappedCallback({type: 'tool_confirm', ...}) → PlanModeCard 展示
  // Resume 后 → 根据用户决策:
  //   · allow / allow_always → SDK 自动切出 plan 模式，继续执行
  //   · deny → 继续停留 plan 模式
  //   · reject_and_exit_plan → 允许本次，后续前端传 permissionMode=default
}
```

---

## 4. Agent 抽象层与耦合度分析

### 4.1 当前架构与接口

#### 核心服务架构

```
CloudbaseAgentService (L416+)
  │
  ├─ chatStream() ─────────→ 启动 agent (返回 turnId, alreadyRunning)
  │
  ├─ launchAgent() ────────→ 后台执行（含沙箱管理、消息循环、持久化）
  │
  ├─ convertToSessionUpdate() → SDK callback → ACP 格式转换
  │
  ├─ handleStreamEvent() ──→ stream_event 解析
  ├─ handleToolResults() ──→ tool_result 聚合
  └─ handleAssistantToolUseInputs() → tool_use 输入序列化

persistence.service.ts
  ├─ restoreMessages() ────→ DB → JSONL（SDK resume）
  ├─ syncMessages() ───────→ JSONL → DB（完成后同步）
  └─ updateToolResult() ───→ 写入工具结果

EventBuffer (event-buffer.ts)
  └─ pushAndGetSeq() → 缓冲 ACP 事件到 DB
```

#### 可抽象的接口

```typescript
// 建议的 Agent 接口（目前不存在）
interface AgentAdapter {
  // 初始化 agent
  initialize(config: AgentConfig): Promise<void>

  // 执行 agent
  execute(prompt: string, options: AgentOptions): AsyncIterable<AgentMessage>

  // 中止执行
  abort(conversationId: string): Promise<void>

  // 恢复会话
  resume(conversationId: string, userInput: unknown): AsyncIterable<AgentMessage>
}

type AgentMessage = 
  | {type: 'text', content: string}
  | {type: 'tool_call', toolName: string, input: unknown}
  | {type: 'tool_result', toolUseId: string, result: unknown}
  | {type: 'ask_user', questions: Record<string, string>}
  | {type: 'done', result: unknown}
```

### 4.2 Session 与消息持久化耦合度

#### 耦合情形

| 组件 | 耦合点 | 是否易拆 |
|-----|-------|--------|
| `cloudbase-agent.service` | 直接调用 `query()` → 消息循环 | 😞 难（SDK 消息格式固定） |
| `persistence.service` | 依赖 JSONL → DB 映射 | 😐 中等（可通过 adapter 抽象） |
| `event-buffer` | 绑定 `ExtendedSessionUpdate` 格式 | 😐 中等（格式化层可独立） |
| `sandbox-mcp-proxy` | 实现 MCP server wrapping | 😐 中等（协议标准，可替换） |
| `tool-override.ts` | 工具重定向到沙箱 | 😞 难（与沙箱深度耦合） |

#### 关键耦合链

```
query() 消息类型 ← SDK 固定
  ↓
convertToSessionUpdate() ← 适配层（相对独立）
  ↓
ExtendedSessionUpdate ← 项目定义 (shared/types)
  ↓
StreamEvent → DB 存储 ← persistence.service 依赖此格式
  ↓
JSONL restore → 消息历史恢复 ← SDK resume 时读取
```

### 4.3 替换方案评估

#### 选项 A: 保持 @tencent-ai/agent-sdk，替换上层（推荐）

**可行性**: ✓ 高  
**工作量**: 🔴 中（主要改造 convertToSessionUpdate 和 persistence 层）

```typescript
// 新增 adapter 层
interface IAgentBackend {
  convertMessage(sdkMessage: any): ExtendedSessionUpdate | null
  persistMessage(sessionUpdate: ExtendedSessionUpdate): Promise<void>
  restoreHistory(conversationId: string): Promise<any[]>
}

class TencentAgentBackend implements IAgentBackend {
  // 当前 cloudbase-agent.service 的逻辑
}

class AnthropicAgentBackend implements IAgentBackend {
  // Claude agent SDK 的适配
}
```

#### 选项 B: 替换为 Anthropic Claude Agent SDK

**可行性**: ✓ 中  
**工作量**: 🟡 大（需要完全重写消息循环、工具拦截、权限系统）

```
@tencent-ai/agent-sdk          @anthropic-ai/claude-agent-sdk
    query()          ←→        createAgent() / agent.run()
  message loop       ←→        eventStream / generator
  canUseTool hook    ←→        toolUseHandler callback
```

**已有支持**: `/packages/server/src/agent/cloudbase-agent.service.ts` 已 import `@anthropic-ai/claude-agent-sdk`，但仅用于 `tool()` 和 `createSdkMcpServer()`（未深度集成）。

#### 选项 C: 完全自建 Agent 引擎

**可行性**: 😞 低  
**工作量**: 🔴🔴 极大（需要 LLM 推理集成、工具调用框架、流式处理、会话管理等）

---

## 5. 关键文件与代码路径

### 5.1 核心文件清单

| 文件 | 行数 | 主要职责 |
|-----|-----|---------|
| `/packages/server/src/agent/cloudbase-agent.service.ts` | 2200+ | **主入口**：Agent 调度、SDK 查询、消息循环、权限控制 |
| `/packages/server/src/agent/persistence.service.ts` | ? | 消息持久化、JSONL 转换、DB 同步 |
| `/packages/server/src/agent/event-buffer.ts` | 75 | 事件缓冲、自动 flush 机制 |
| `/packages/server/src/routes/acp.ts` | 500+ | ACP 协议路由（conversations、chat SSE） |
| `/packages/server/src/sandbox/sandbox-mcp-proxy.ts` | ? | MCP server wrapping、CloudBase 工具封装 |
| `/packages/server/src/sandbox/tool-override.ts` | ? | 工具重定向到沙箱 |
| `/packages/server/src/agent/session-permissions.ts` | ? | 权限检查、白名单管理 |
| `/patches/@tencent-ai__agent-sdk@0.3.68.patch` | 85 | SDK patch：工具/会话/技能拦截 |

### 5.2 关键方法签名

```typescript
// ─── Agent 生命周期 ───────────────────────
CloudbaseAgentService.chatStream(
  prompt: string,
  callback: AgentCallback | null,
  options: AgentOptions
): Promise<{ turnId: string; alreadyRunning: boolean }>

CloudbaseAgentService.launchAgent(
  prompt: string,
  liveCallback: AgentCallback | null,
  options: AgentOptions,
  assistantMessageId: string
): Promise<void>

// ─── 消息转换 ──────────────────────────
CloudbaseAgentService.convertToSessionUpdate(
  msg: AgentCallbackMessage,
  sessionId: string
): ExtendedSessionUpdate | null

// ─── 权限检查 ──────────────────────────
canUseTool(
  toolName: string,
  input: unknown,
  _options: unknown
): Promise<{
  behavior: 'allow' | 'deny' | 'block'
  message?: string
  interrupt?: boolean
}>
```

---

## 6. 快速集成要点

### 6.1 如何替换 SDK

**最小改动方案**:
1. 在 `launchAgent()` 中替换 `query()` 调用
2. 实现消息循环适配层（将新 SDK 的消息格式转换为 `AgentCallbackMessage`）
3. 保持 `convertToSessionUpdate()` 不变（这是核心格式适配）
4. 替换对应的 patch 文件（工具拦截等）

**代码位置**:
```typescript
// L1429: const q = query(queryArgs as any)
// 替换为:
// const q = await newAgentSdk.query(queryArgs)
// 然后在消息循环中统一转换
```

### 6.2 避免的陷阱

1. **会话 resume 数据格式**: SDK 期望特定的 JSONL 结构，replace 必须保持兼容
2. **工具权限拦截**: `canUseTool` 返回值格式由 SDK 定义，需精确适配
3. **Patch 加载顺序**: 工具/会话/技能拦截需要在 CLI 初始化**前**完成
4. **MCP 服务生命周期**: `sdkServer` 需要与 query 迭代器同步释放

---

## 总结

| 维度 | 现状 |
|-----|-----|
| **SDK 使用深度** | 深度集成（消息循环、权限系统、工具拦截） |
| **抽象程度** | 低（SDK 紧密耦合，难以热替换） |
| **Patch 复杂度** | 中等（3 个拦截点，针对特定 SDK 版本） |
| **可替换性** | 中等（可通过适配层替换，但需改造权限、消息循环、沙箱工具层） |
| **推荐替换方案** | 保持 SDK，通过 adapter 模式支持多个后端 |

