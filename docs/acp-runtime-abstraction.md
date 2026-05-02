# Agent Runtime 抽象层 + OpenCode ACP + 沙箱集成

> 分支：`feat/acp-runtime-abstraction`
> 基线：`feature/refactor @ 17eca8e`
> 交付：2026-05-02
> 状态：已完成，type-check / lint / build / 4 组 e2e 全通过

## 1. 目标

两阶段目标：

**阶段 A（已完成）**：抽象 `IAgentRuntime` 接口，把 server 与具体 agent 实现解耦。Tencent SDK 作为默认 runtime；新增 OpenCode ACP runtime 作为第二个实现。

**阶段 B（本次完成）**：让 OpenCode runtime 严格遵守 **agent/sandbox 分离原则**：
- Agent（opencode acp 子进程）只负责 LLM 决策，跑在 server 本地
- 所有文件/shell 工具调用通过一个 MCP bridge 桥接到 SCF 沙箱 HTTP API
- OpenCode 的内置 `read/write/bash/edit` 工具被禁用，只能用 `sbx_*` MCP 工具

## 2. 架构

```
┌──────────────────────────────────────────────────────────────────────┐
│ Server 进程（agent 域）                                               │
│                                                                      │
│   routes/acp.ts                                                      │
│      │                                                               │
│      ▼                                                               │
│   IAgentRuntime  ──►  TencentSdkRuntime (in-process)                │
│      │                                                               │
│      └─►  OpencodeAcpRuntime                                         │
│              │                                                       │
│              ├─ 准备 per-session 临时目录:                           │
│              │   /tmp/opencode-session-<uuid>/                       │
│              │    └── .opencode/opencode.json                        │
│              │        • agent.sandboxed.tools = { read:false, ... } │
│              │        • mcp.sbx = { command: node bridge.js, ... }   │
│              │                                                       │
│              ├─ spawn opencode acp --cwd <临时目录>                  │
│              │    └─ opencode 读到配置，禁用内置工具                 │
│              │       spawn MCP bridge 作为子进程                     │
│              │                                                       │
│              ├─ ACP 握手 → session/new → setSessionMode('sandboxed')│
│              │                                                       │
│              └─ session/update 事件 → AgentCallbackMessage → SSE    │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
            ┌────────────────────────────────────────────┐
            │ sandbox-mcp-bridge.js (Node 子进程)         │
            │                                            │
            │   MCP stdio server                         │
            │   env: SANDBOX_BASE_URL, AUTH_HEADERS      │
            │                                            │
            │   tools: sbx_read / sbx_write / sbx_bash / │
            │           sbx_edit / sbx_glob / sbx_grep   │
            │                                            │
            │   each call → fetch SANDBOX_BASE_URL/...   │
            └──────────────────────┬─────────────────────┘
                                   │
                                   │ HTTPS (Bearer + Scope headers)
                                   ▼
            ┌───────────────────────────────────────────┐
            │ Sandbox (SCF 容器, sandbox 域)             │
            │                                           │
            │   /api/tools/read                         │
            │   /api/tools/write                        │
            │   /api/tools/bash                         │
            │   /api/tools/edit                         │
            │                                           │
            │   cwd: /tmp/workspace/<env>/<conv>        │
            │   (scope 隔离目录, 强制相对路径)           │
            └───────────────────────────────────────────┘
```

### 关键分离

| 层 | 进程 | 负责 | 不负责 |
|---|---|---|---|
| Agent | opencode (server 本地) | LLM 决策、调用 MCP 工具 | 文件 IO、shell |
| Bridge | sandbox-mcp-bridge.js | MCP → HTTP 翻译、凭证注入 | LLM、执行 |
| Sandbox | SCF 容器 | 执行 read/write/bash | 模型、网络决策 |

## 3. 文件清单

### 新增
```
packages/server/src/agent/runtime/
├── types.ts                       # IAgentRuntime 接口
├── registry.ts                    # AgentRuntimeRegistry + 选择策略
├── tencent-sdk-runtime.ts         # Tencent SDK 薄 adapter
├── opencode-acp-runtime.ts        # OpenCode runtime 主体
├── opencode-session-config.ts     # per-session 工作目录 + opencode.json 生成
├── acp-transport.ts               # stdio transport 工厂
├── sandbox-mcp-bridge.ts          # ★ 独立进程：MCP server → 沙箱 HTTP 桥
└── index.ts                       # 公共导出

packages/server/scripts/
├── test-opencode-runtime.mts       # e2e#1: 本地模式直调 runtime
├── test-acp-http-e2e.mts           # e2e#2: HTTP 公开端点
├── test-acp-chat-http.mts          # e2e#3: 完整 SSE HTTP 流
└── test-opencode-sandbox-e2e.mts   # ★ e2e#4: 沙箱隔离验证（真实 SCF）

docs/
└── acp-runtime-abstraction.md      # 本文档
```

### 改动
| 文件 | 改动 |
|---|---|
| `packages/server/package.json` | +`@agentclientprotocol/sdk`、+`@modelcontextprotocol/sdk`；build 脚本加 sandbox-mcp-bridge.ts |
| `packages/server/src/routes/acp.ts` | 通过 registry 选 runtime；新增 `GET /api/agent/runtimes`；`/runtimes` 加入 auth 豁免 |
| `packages/shared/src/types/agent.ts` | `SessionPromptParams.runtime?: string` |

## 4. IAgentRuntime 接口

```ts
export interface IAgentRuntime {
  readonly name: string
  isAvailable(): Promise<boolean>
  getSupportedModels(): Promise<ModelInfo[]>
  chatStream(prompt: string, callback: AgentCallback | null, options: AgentOptions): Promise<ChatStreamResult>
}

export interface ChatStreamResult {
  turnId: string
  alreadyRunning: boolean
}
```

### 行为约定
1. `chatStream` 同步返回 `{ turnId, alreadyRunning }`
2. 后台 fire-and-forget 跑 agent，通过 `callback` 推送 `AgentCallbackMessage`
3. 完成时推送 `type: 'result'`；abort 时推送 `type: 'error', content: 'Aborted'`
4. callback 调用保持时间序

## 5. Runtime 选择

```ts
// 选择优先级：
// 1. body.runtime / params.runtime  (请求级 override)
// 2. process.env.AGENT_RUNTIME       (部署级 override)
// 3. AGENT_RUNTIME_DEFAULT 或 'tencent-sdk'
const runtime = agentRuntimeRegistry.resolve({ explicitRuntime: body.runtime })
```

**前端选择 runtime**：
```
POST /api/agent/chat
{ "prompt": "...", "runtime": "opencode-acp" }
```

**列出可用 runtime**：`GET /api/agent/runtimes`（公开端点）
```json
{
  "default": "tencent-sdk",
  "runtimes": [
    { "name": "tencent-sdk",  "available": true },
    { "name": "opencode-acp", "available": true }
  ]
}
```

## 6. OpencodeAcpRuntime 运行模式

### 模式 A：有 `envId`（生产 / 沙箱模式）
1. `scfSandboxManager.getOrCreate(convId, envId)` 获取/创建沙箱
2. 创建临时目录 `/tmp/opencode-session-<uuid>/`
3. 写 `.opencode/opencode.json`：
   - 定义 agent `sandboxed`（`mode: primary`，`tools: { read:false, write:false, bash:false, edit:false, grep:false, glob:false, webfetch:false, patch:false, sbx_*:true }`）
   - 定义 `mcp.sbx`：local stdio，command `["node", "<path>/sandbox-mcp-bridge.js"]`，env 传 `SANDBOX_BASE_URL` + `SANDBOX_AUTH_HEADERS_JSON`
4. 写 AGENTS.md：system prompt 告诉模型用 `sbx_*` 相对路径
5. spawn `opencode acp --cwd <临时目录>`
6. ACP 握手、setSessionMode('sandboxed')、set model、prompt
7. 会话结束清理临时目录

### 模式 B：无 `envId`（本地开发）
1. **不**禁用内置工具（opencode 就用本地文件系统）
2. 使用 `options.cwd` 作为 opencode 的 cwd（不创建临时目录，仅在其下写 `.opencode/opencode.json` 空配置）
3. 其余 ACP 流程相同

## 7. Sandbox MCP Bridge

独立进程（`sandbox-mcp-bridge.js`），通过 stdio 实现 MCP 协议，对外暴露：

| 工具 | 转发到 | 说明 |
|---|---|---|
| `read` | POST /api/tools/read | 读文件 |
| `write` | POST /api/tools/write | 写文件 |
| `edit` | POST /api/tools/edit | 字符串替换 |
| `bash` | POST /api/tools/bash | shell 命令 |
| `glob` | POST /api/tools/glob | 文件匹配 |
| `grep` | POST /api/tools/grep | 内容搜索 |

OpenCode 在给工具命名时会加 MCP server 名前缀，因此 LLM 看到的是 `sbx_read`、`sbx_write` 等。

### 沙箱路径约束
**必须使用相对路径**。沙箱侧的 `/api/tools/*` 对所有绝对路径返回 `403 Path traversal blocked`。
相对路径会被解析到 scope 隔离目录 `/tmp/workspace/<envId>/<conversationId>/`。

AGENTS.md 已明确告诉模型这一点；bridge 不做路径转换（让沙箱自己判定最稳）。

## 8. 测试结果

### e2e#1: 本地模式（`test-opencode-runtime.mts`）
```
[e2e] event counts: {
  "agent_phase": 2,
  "tool_use": 1,
  "tool_input_update": 1,
  "tool_result": 1,
  "text": 2,
  "result": 1
}
hello.txt content: "hello from runtime"
PASS: file created with correct content
OVERALL: PASS
```

### e2e#2: HTTP 公开端点（`test-acp-http-e2e.mts`）
```
/health: PASS
/runtimes: PASS (opencode-acp registered)
```

### e2e#3: 完整 HTTP SSE（`test-acp-chat-http.mts`）
```
status=200 content-type=text/event-stream
received 21 SSE events
update:agent_message_chunk: 18
update:agent_phase: 2
DONE: 1
agent text: 我是OpenCode，一个运行在您计算机上的交互式通用AI代理...
OVERALL: PASS
```

### ★ e2e#4: 沙箱隔离（`test-opencode-sandbox-e2e.mts`）
```
[tool_use ▶] name=sbx_write id=sbx_write:0
[tool_result ◯] out={"output":"Wrote file successfully."}
[result] sandbox={ baseUrl: ".../sandbox-shared", conversationId: "sandbox-e2e-..." }

[sandbox-e2e] sandbox file content = "1: hello from sandbox i24jd6en"
[sandbox-e2e] local /tmp/hello-sandbox-...txt exists = false

  text events:                 PASS
  result event:                PASS
  used sbx_* tools:            PASS (count=1)
  did NOT use builtin tools:   PASS (count=0)
  sandbox file has expected:   PASS
  local NOT polluted:          PASS
OVERALL: PASS
```

这个 e2e 真实跑通了**完整链路**：
- LLM（Moonshot Kimi） → MCP sbx_write → sandbox-mcp-bridge → SCF /api/tools/write → 沙箱文件系统
- 直接调沙箱 /api/tools/read **独立验证**文件确实在沙箱里
- 本地 /tmp/ 文件系统**未被污染**

### 质量校验
- `pnpm type-check` ✅（所有包）
- `pnpm lint` ✅
- `pnpm build` ✅（server + web）
- `pnpm format` ✅

## 9. 首版限制

| 特性 | 状态 |
|---|---|
| askAnswers resume（AskUserQuestion） | ❌ 未实现 |
| toolConfirmation resume（ToolConfirm UI 对接） | ❌ 默认 allow_once |
| coding-mode 模板初始化（vite dev server） | ❌ 未集成 |
| git-archive / syncMessages DB 持久化 | ❌ 仅 stream events 落库 |
| maxTurns / cancel 细节 | ⚠️ 只基础 abort |
| permissionMode ('plan') | ⚠️ 可接 set_session_mode，未接线 |
| OpenCode agent 的工具允许列表 wildcard 语法 | ✅ `sbx_*: true` 已验证 |

## 10. 如何运行

```bash
# 前提
npm i -g opencode-ai
# ~/.config/opencode/opencode.json 配好 moonshot（或其他 provider）
# ~/.local/share/opencode/auth.json 放 API key
# packages/server/.env 填 TCB_* 等
# pnpm install + pnpm build:server

cd packages/server

# e2e#1 本地模式 (~60s)
npx tsx scripts/test-opencode-runtime.mts

# e2e#2 HTTP 公开端点 (~10s)
npx tsx --env-file=.env scripts/test-acp-http-e2e.mts

# e2e#3 HTTP SSE (~60s)
npx tsx --env-file=.env scripts/test-acp-chat-http.mts

# e2e#4 沙箱隔离 ★ (~90s, 需要真实 SCF 环境)
npx tsx --env-file=.env scripts/test-opencode-sandbox-e2e.mts
```

## 11. 设计决策

### 为什么不把 opencode 塞到沙箱里？
违反 agent/sandbox 分离原则：
- agent（决策）应在受控 server 环境里，便于集中管理凭证、监控、升级
- sandbox（执行）是"纯体力活"容器，应尽量纯净、快速启停
- 把 agent 塞沙箱会让 sandbox 镜像臃肿、重启成本大、依赖版本难管控

### 为什么用 MCP 而不是 ACP client 回调？
调研发现 OpenCode 的 ACP agent **不发 `fs/*` / `terminal/*` 回调**（所有内置工具在其进程内执行）。
MCP 是 OpenCode 会主动调用的唯一可插拔扩展点。

### 为什么 per-session 临时目录（而不是全局 opencode.json）？
- 不同 session 有不同的沙箱凭证（不同 user、不同 env）
- opencode 读 cwd 下 `.opencode/opencode.json` 覆盖全局，天然做到 per-session 隔离
- 避免 session 间 race condition（并发时互不干扰）

### 为什么 MCP bridge 是独立 .js 文件（而不是嵌入 runtime）？
- OpenCode 期望 MCP server 是独立可执行（command + args）
- 独立文件让 bridge 本身可被外部用户 inspect、debug、单独测
- tsup bundle 出一份自包含的 js，部署只多一个文件

### 为什么 LLM 看到的工具名是 `sbx_*`（不是 `sandbox_*`）？
OpenCode 给 MCP 工具自动加 `<server_name>_` 前缀。
我们把 server 名定为 `sbx`（短）、工具名就是 `read`/`write`/...，合成结果简洁。
之前用 `sandbox_write` 会变成 `sbx_sandbox_write`，冗余。

## 12. 后续路线

1. **接 ToolConfirm UI**（1-2 天）
   把 ACP `requestPermission` 与 MCP tool 执行前的确认映射到现有前端 ToolConfirm 组件。

2. **消息持久化对齐 Tencent 路线**（2-3 天）
   参考 `cloudbase-agent.service.ts` 的 `preSavePendingRecords` / `syncMessages` 做同样落库。

3. **接更多 ACP agent**（每个 1-2 天）
   Claude Code ACP、Gemini CLI、Qwen Code。都能复用 `OpencodeAcpRuntime` 的代码骨架，只需改启动命令。

4. **前端 Runtime 选择器**（0.5 天）
   Task 创建表单加下拉，基于 `GET /runtimes` 动态列出。

5. **生产部署**（镜像打包、环境变量管理）
   `sandbox-mcp-bridge.js` 已随 server 一起 build 到 dist，部署跟着走。
   opencode 可通过镜像 `RUN npm i -g opencode-ai` 或 lazy install 策略。

## 13. 引用

- Agent Client Protocol: https://agentclientprotocol.com
- OpenCode: https://github.com/sst/opencode
- OpenCode Agent config: https://opencode.ai/docs/agents/
- Model Context Protocol: https://modelcontextprotocol.io
- 深度调研备忘录: `/Users/yang/git/coding-agent-template/docs/opencode-acp-integration-memo.md`
