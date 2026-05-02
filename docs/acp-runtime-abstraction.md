# Agent Runtime 抽象层 + OpenCode ACP + 沙箱隔离

> 分支：`feat/acp-runtime-abstraction`
> 基线：`feature/refactor @ 17eca8e`
> 最终架构：**全局 tool override + per-session env 注入**
> 状态：type-check / lint / build + 4 组 e2e 全通过

## 1. 目标

- 抽象 `IAgentRuntime` 接口，让 server 可在不同 agent 实现（Tencent SDK / OpenCode ACP / 未来的 Claude Code ACP / Gemini CLI 等）之间切换
- OpenCode runtime 严格遵守 **agent 与 sandbox 分离**原则
  - Agent 进程在 server 本地（负责 LLM 决策）
  - 所有文件/shell 工具调用转发到 SCF 沙箱（负责执行）
- 模板化配置：全局一次安装，per-session 只注入动态凭证

## 2. 架构

```
┌─────────────────────────────────────────────────────────────────┐
│ Server 启动                                                       │
│   └─ ensureOpencodeToolsInstalled()                             │
│        └─ 把 read/write/bash/edit/grep/glob .ts 模板拷到          │
│           ~/.config/opencode/tools/                              │
│           (opencode 读取全局配置，custom 覆盖 builtin)            │
├─────────────────────────────────────────────────────────────────┤
│ 每次 chatStream                                                   │
│                                                                   │
│   1. scfSandboxManager.getOrCreate()  ← 沙箱实例                 │
│   2. spawn `opencode acp --cwd <临时目录>`                        │
│      env: {                                                       │
│        SANDBOX_MODE=1,                                           │
│        SANDBOX_BASE_URL=<沙箱 HTTPS>,                            │
│        SANDBOX_AUTH_HEADERS_JSON=<凭证 JSON>,                    │
│      }                                                            │
│   3. opencode 子进程加载 ~/.config/opencode/tools/read.ts 等      │
│      custom tools 覆盖 builtin read/write/...                    │
│      tools 内 process.env.SANDBOX_* 读取本 session 凭证          │
│   4. ACP 握手 → session/new → prompt → 收 session/update 流       │
│                                                                   │
│   工具调用流：                                                     │
│     LLM ──► "write" tool                                         │
│              └─ 实际调 ~/.config/opencode/tools/write.ts         │
│                 └─ process.env.SANDBOX_MODE === '1'              │
│                    └─ fetch SANDBOX_BASE_URL/api/tools/write     │
│                       └─ 沙箱容器写文件（隔离目录）                │
└─────────────────────────────────────────────────────────────────┘
```

## 3. 核心原理（实测验证）

### 3.1 OpenCode 的 custom tool 覆盖规则

OpenCode 在 `~/.config/opencode/tools/` 和 `.opencode/tools/` 查找 `.ts` / `.js` 文件。
- **文件名即工具名**：`read.ts` → tool `read`
- **同名 custom tool 覆盖 builtin**（实测已 PASS，见 §5）
- 官方文档："If a custom tool uses the same name as a built-in tool, the custom tool takes priority."

### 3.2 OpenCode spawn 时的 env 传递链

源码 `packages/opencode/src/mcp/index.ts`:
```ts
StdioClientTransport({
  env: { ...process.env, ...(cmd === "opencode" ? { BUN_BE_BUN: "1" } : {}), ...mcp.environment }
})
```

OpenCode 启动子进程（tool 执行、MCP server）时会**继承 opencode 父进程的 env**。
因此：server → spawn opencode 时注入 env → opencode → tool 执行 → 所有层级都能 `process.env.SANDBOX_*` 读到。

### 3.3 为什么 `.ts` 而不是 `.js` 安装？

tsup 打包出的 `.js` 文件仍保留 `import { z } from 'zod'`。当前版本的 opencode binary **不能解析 `.js` 里的外部 import**，会静默忽略文件（tool 不注册）。

而 opencode **原生支持 `.ts` 文件**（内置 TypeScript loader），能正确处理 `import { z } from 'zod'`（zod 作为 opencode 依赖一并打包在 binary 内）。

所以 installer 直接拷贝 `.ts` 源文件，不走 tsup 编译。

## 4. 文件清单

### 新增
```
packages/server/src/agent/runtime/
├── types.ts                            # IAgentRuntime 接口
├── registry.ts                         # AgentRuntimeRegistry 选择策略
├── tencent-sdk-runtime.ts              # Tencent SDK 薄 adapter
├── opencode-acp-runtime.ts             # OpenCode runtime 主体（env 注入）
├── opencode-installer.ts               # 全局 tool 幂等安装
├── acp-transport.ts                    # local stdio transport
├── opencode-tool-templates/            # ★ tool override 源模板
│   ├── read.ts    (SANDBOX_MODE=1 → sandbox HTTP, else local fs)
│   ├── write.ts
│   ├── edit.ts
│   ├── bash.ts
│   ├── grep.ts
│   └── glob.ts
└── index.ts

packages/server/scripts/
├── test-opencode-runtime.mts           # e2e#1: 本地无沙箱
├── test-acp-http-e2e.mts               # e2e#2: HTTP 公开端点
├── test-acp-chat-http.mts              # e2e#3: 完整 HTTP SSE chat
└── test-opencode-sandbox-e2e.mts       # ★ e2e#4: 沙箱隔离（真实 SCF）
```

### 改动
| 文件 | 改动 |
|---|---|
| `packages/server/package.json` | + `@agentclientprotocol/sdk`, + `@modelcontextprotocol/sdk`（保留，供将来 MCP 复用）；build 脚本：拷贝 tool 模板 .ts → dist/ |
| `packages/server/tsconfig.json` | 排除 `opencode-tool-templates/**`（独立语义，不参与 server bundle） |
| `packages/server/src/routes/acp.ts` | 通过 registry 选 runtime + `GET /api/agent/runtimes` |
| `packages/shared/src/types/agent.ts` | `SessionPromptParams.runtime?: string` |

### 删除
- ~~`sandbox-mcp-bridge.ts`~~（原 MCP 桥 server，已被 direct tool override 替代）
- ~~`opencode-session-config.ts`~~（原 per-session 写 `.opencode/opencode.json`，已被全局配置替代）

## 5. 关键决策与实测

### 决策 1：全局安装 vs per-session 写配置

| 方案 | 优点 | 缺点 |
|---|---|---|
| ~~per-session `.opencode/opencode.json`~~ | 完全隔离 | 每次写文件、opencode 重复解析 |
| **全局 `~/.config/opencode/`** ★ | 只写一次；opencode 缓存加载 | 需 installer 幂等 + version 检测 |

### 决策 2：工具实现走 MCP bridge vs tool override

| 方案 | 工具名 | 进程数 | 复杂度 |
|---|---|---|---|
| ~~MCP bridge（第 3 个子进程）~~ | `sbx_read`, `sbx_write` | server + opencode + mcp_bridge | 高 |
| **tool override（直接覆盖）** ★ | `read`, `write`（LLM 原生熟悉） | server + opencode | 低 |

### 决策 3：凭证传递方式

| 方案 | 凭证位置 | 生命周期 |
|---|---|---|
| ~~config 文件 `environment` 字段~~ | 磁盘（even per-session tmp） | 直到文件删除 |
| **spawn env 注入** ★ | 进程 env | 进程退出即消失 |

## 6. e2e 测试结果

### e2e#1: 本地无沙箱（`test-opencode-runtime.mts`）
```
[OpencodeAcpRuntime] installed opencode tools to /Users/yang/.config/opencode/tools:
    installed=read,write,edit,bash,grep,glob

[tool_use ▶] write id=write:0
[tool_result ◯] out="Wrote 18 bytes to /private/tmp/opencode-runtime-e2e/hello.txt"
  ^^^^^^^^^^^^^ 这是我们 custom write.ts 的输出格式（builtin 不这么写）

hello.txt content: "hello from runtime"
OVERALL: PASS
```

### e2e#2: HTTP 公开端点（`test-acp-http-e2e.mts`）
```
/health: PASS
/runtimes: {"default":"tencent-sdk","runtimes":[...]}
```

### e2e#3: 完整 HTTP SSE chat（`test-acp-chat-http.mts`）
```
28 SSE events (agent_phase×2, agent_message_chunk×25, DONE×1)
agent text: 我是OpenCode，一个运行在您计算机上的交互式通用AI助手...
OVERALL: PASS
```

### ★ e2e#4: 沙箱隔离（`test-opencode-sandbox-e2e.mts`, 真实 SCF）
```
[tool_use ▶] name=write
[tool_result ◯] out="{path: /tmp/workspace/huming-test-.../sandbox-e2e-v2-.../hello-sandbox-v2-.txt, bytesWritten: 22, diff: ...}"
  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  沙箱 HTTP API 返回格式，证明确实走了沙箱（不是本地 fs）

sandbox file content = "1: hello from v2 vusknorg"   ← 独立调沙箱 /api/tools/read 验证
local /tmp/hello-sandbox-v2-*.txt exists = false     ← 本地干净

  LLM used 'write' tool:      PASS (count=1)
  sandbox file has content:   PASS
  local NOT polluted:         PASS
OVERALL: PASS
```

**沙箱隔离完全工作**：LLM 调的是 `write`（不是 `sbx_write`），工具内部读 env 走 HTTP 到沙箱，文件写在沙箱容器内，本地文件系统毫无污染。

## 7. 如何运行

```bash
# 前提
npm i -g opencode-ai
# ~/.config/opencode/opencode.json 配好 provider（Moonshot / Anthropic / OpenAI…）
# ~/.local/share/opencode/auth.json 填 API key

cd packages/server

# 首次运行时，runtime 会自动把 tool 模板装到 ~/.config/opencode/tools/
# 如果需要强制重装：OPENCODE_TOOLS_FORCE_REINSTALL=1 pnpm dev

# e2e#1 本地模式 (~90s)
npx tsx scripts/test-opencode-runtime.mts

# e2e#2 HTTP endpoints (~10s)
npx tsx --env-file=.env scripts/test-acp-http-e2e.mts

# e2e#3 SSE chat (~60s)
npx tsx --env-file=.env scripts/test-acp-chat-http.mts

# ★ e2e#4 沙箱 (~180s, 需真实 SCF)
npx tsx --env-file=.env scripts/test-opencode-sandbox-e2e.mts

# ★ e2e#5 ToolConfirm 交互式权限确认 (~90s, 纯本地)
npx tsx scripts/test-tool-confirm-e2e.mts
```

## 8. Env 变量

### runtime 侧
| 变量 | 默认 | 作用 |
|---|---|---|
| `OPENCODE_BIN` | `opencode` | opencode 可执行路径 |
| `OPENCODE_DEFAULT_MODEL` | `moonshot/kimi-k2-0905-preview` | 默认模型 |
| `SANDBOX_WORKSPACE_ROOT` | `.` | LLM 看到的沙箱工作目录 |
| `OPENCODE_TOOLS_INSTALL_DIR` | `~/.config/opencode/tools` | 全局 tools 安装目录 |
| `OPENCODE_TOOLS_FORCE_REINSTALL` | - | `=1` 强制重装（版本升级） |
| `OPENCODE_SKIP_TOOLS_INSTALL` | - | `=1` 跳过安装（测试场景用） |
| `OPENCODE_TOOL_TEMPLATE_DIR` | 自动推断 | 覆盖模板源路径 |
| `OPENCODE_ACP_DEBUG` | - | `=1` 开启详细日志 |
| `AGENT_RUNTIME` / `AGENT_RUNTIME_DEFAULT` | `tencent-sdk` | runtime 选择 |

### spawn 时自动注入到 opencode 子进程（由 runtime 控制）
| 变量 | 作用 |
|---|---|
| `SANDBOX_MODE` | `1` 启用 HTTP 转发，`0` 走本地 fs |
| `SANDBOX_BASE_URL` | 沙箱 base URL（由 `scfSandboxManager.getOrCreate` 获取） |
| `SANDBOX_AUTH_HEADERS_JSON` | 沙箱 auth headers JSON |

## 9. 首版限制

| 特性 | 状态 |
|---|---|
| ToolConfirm UI 回调 | ✅ **已接入** — 见 §12 |
| ToolConfirmation resume 流程 | ✅ **已接入** — 见 §12 |
| AskUserQuestion（询问用户） | ✅ **已接入** — 见 §13 |
| askAnswers resume | ✅ **已接入** — 见 §13 |
| coding-mode 模板初始化 | ❌ 未集成 |
| 消息持久化到 tasks | ⚠️ 只 stream events 落库 |
| tool override 的版本升级 hash 匹配 | ✅ 已实现（hashFile 比较） |
| 首次安装报告日志 | ✅ 已输出 |

## 10. 后续方向

1. ~~接 ToolConfirm UI~~ ✅ 完成
2. ~~AskUserQuestion resume 流程~~ ✅ 完成
3. **消息持久化对齐 Tencent 路线**（2-3 天）
4. **更多 ACP agent**（Claude Code / Gemini / Qwen Code；每个 1-2 天，runtime 骨架复用）
5. **前端 Runtime 选择器**（0.5 天）

## 11. 引用

- Agent Client Protocol: https://agentclientprotocol.com
- OpenCode Custom Tools: https://opencode.ai/docs/custom-tools/
- OpenCode Agents: https://opencode.ai/docs/agents/
- OpenCode ACP: https://opencode.ai/docs/acp/
- OpenCode Permissions: https://opencode.ai/docs/permissions/
- 源码调研备忘录: `/Users/yang/git/coding-agent-template/docs/opencode-acp-integration-memo.md`

---

## 12. ToolConfirm 交互式权限确认（已实现）

### 12.1 问题

OpenCode 的 ACP agent 在触发敏感工具（如 edit/write）时会调用 client 的 `session/request_permission`，这是 JSON-RPC **请求/响应**模式，agent 会一直 await client 返回 outcome。

首版实现（allow_once）是自动放行，等价于"无权限系统"。目标：对接现有前端 ToolConfirmDialog，让用户决定。

### 12.2 架构

```
┌─────────────────────────────────────────────────────────────┐
│ Round 1: chatStream(prompt)                                 │
│                                                             │
│   runtime.launchAgent                                       │
│     ↓ spawn opencode                                        │
│   opencode LLM 决定调用 write                               │
│     ↓ session/request_permission                            │
│   runtime requestPermission handler                         │
│     ├─ emit tool_confirm (SSE push 给前端)                  │
│     └─ registerPending(convId, interruptId, options)        │
│         └─ await pending（handler suspended）               │
│   [opencode 子进程挂起]                                     │
│   [第一轮 SSE 流仍活跃但无新事件；前端展示确认卡片]           │
└─────────────────────────────────────────────────────────────┘

                        ↓ 用户点击"允许"

┌─────────────────────────────────────────────────────────────┐
│ Round 2: chatStream('', { toolConfirmation })              │
│                                                             │
│   runtime.chatStream                                        │
│     ↓ 发现 isAgentRunning=true + toolConfirmation           │
│     ↓ resolvePending(convId, interruptId, action)          │
│         └─ pending Promise resolve                         │
│     ↓ updateLiveCallback (新 SSE 流替换旧的)                │
│   [opencode 收到 outcome，继续执行]                         │
│   [session/update 流从卡住处继续，第二轮 SSE 推事件]         │
│   [最终推 result 事件，agent 完成]                          │
└─────────────────────────────────────────────────────────────┘
```

### 12.3 核心代码

**`pending-permission-registry.ts`**：
- `registerPending(convId, interruptId, options)` → 返回 pending Promise
- `resolvePending(convId, interruptId, action)` → 查 options 映射 optionId，resolve Promise
- `rejectPendingForConversation(convId)` → 错误/abort 时清理
- PermissionAction → ACP optionId 映射（`allow` → `allow_once`，`deny` → `reject_once`, …）

**`opencode-acp-runtime.ts`** 关键改动：
- `requestPermission` handler：发 `tool_confirm` + `await registerPending(...)`
- `chatStream` 入口：检测 resume 场景（isAgentRunning + toolConfirmation），调 `resolvePending`，不 spawn 新进程
- `liveCallbacks` map：跨 SSE 流维护 callback，emit 时动态取（因为 resume 的 callback 来自新 HTTP 请求）
- 错误路径：`catch` 里 `rejectPendingForConversation` 避免 opencode 子进程卡死

### 12.4 前端集成（零改动）

前端已有完整的 ToolConfirmDialog + `confirmTool(action)` 逻辑（原为 Tencent runtime 设计）。只要 SessionUpdate 的 tag 是 `'tool_confirm'`，前端就会弹卡片。

我们的 runtime 通过 `CloudbaseAgentService.convertToSessionUpdate()` 转换 AgentCallbackMessage → ACP SessionUpdate，tool_confirm 类型已被正确映射，**前端完全不需要改**。

### 12.5 e2e 验证

`scripts/test-tool-confirm-e2e.mts` 完整验证：

```
Round 1 → 10295ms 时 LLM 触发 write → 11197ms 收到 tool_confirm
                                 ↓
      [agent 挂起 3 秒无响应]
                                 ↓
Round 2 → resolvePending('write:0', 'allow') → alreadyRunning=true
     14304ms 后 tool_result 出现（表明 opencode 真的被唤醒继续执行）
     15885ms 收到最终 result: end_turn
     文件实际写入："hi from tc e2e" ✓

断言：
  tool_confirm received:        PASS
  agent suspended after it:     PASS (no 'result' for 3s)
  round2 took resume path:      PASS (alreadyRunning=true)
  tool_result after resume:     PASS
  final result event:           PASS
  no error event:               PASS
  file has expected content:    PASS
OVERALL: PASS
```

### 12.6 已知边界

- **触发机制依赖 opencode permission 配置**：只有 `opencode.json` 里配置 `permission.edit: 'ask'` 的工具才会发 `requestPermission`。未配置的工具默认 `allow`，直接放行，前端看不到确认卡片。
- **Custom tool override 绕开 permission 系统**：`~/.config/opencode/tools/write.ts` 覆盖 builtin write 后，permission 检查是内置代码路径，custom tool 是独立路径，**不会触发 requestPermission**。沙箱场景里的 write 转发就无权限拦截（这是预期行为：沙箱本身就隔离，无需再加一层）。
- **Resume 不超时**：runtime 目前没有"挂起超过 N 分钟自动 reject"机制。如果用户长时间不回应，opencode 子进程会一直占用。未来可加 `PENDING_TIMEOUT_MS`。
- **多路径挂起**：同一 conversation 同时只能一个 pending（opencode 串行执行工具）。registry 内部已防重，但多路 SSE 断开重连场景未深度测试。

---

## 13. AskUserQuestion（已实现）

### 13.1 问题

OpenCode 内置 `question` tool（`packages/opencode/src/tool/question.ts`），但：
- 在 ACP 模式默认禁用（`OPENCODE_CLIENT=acp` 导致 tool registry 不注册）
- 即便开启，opencode 的 ACP agent 层 **没有订阅** `Question.Event.Asked`
  事件总线，LLM 调 question tool 时 `Deferred` 永远不会 resolve，agent 会死锁

结论：**OpenCode 原生 ACP 不支持 AskUserQuestion**。需要我们自己实现。

### 13.2 设计：Custom tool + 内部 HTTP endpoint

与 ToolConfirm（§12）的 ACP JSON-RPC 挂起不同，AskUserQuestion 通过**内部 HTTP 回调**挂起：

```
┌─ Round 1 ─────────────────────────────────────────────────────────────┐
│                                                                        │
│  opencode 子进程 LLM 调 question 工具                                   │
│   ↓                                                                    │
│  ~/.config/opencode/tools/question.ts (custom override)                │
│   ↓ execute 里 fetch                                                   │
│  POST http://127.0.0.1:<port>/api/agent/internal/ask-user              │
│        headers: X-Internal-Token: <shared token>                       │
│        body: { conversationId, toolCallId, questions }                 │
│   ↓                                                                    │
│  server handler:                                                       │
│    1. emitForConversation(convId, {type:'ask_user', id, input})       │
│       → AgentCallbackMessage → 前端 SSE(sessionUpdate='ask_user')     │
│    2. registerPendingQuestion(convId, toolCallId, res)                │
│       → HTTP response 挂起（不 send）                                 │
│                                                                        │
│  [前端 AskUserForm 展示；用户填写；Round 1 的 SSE 流"轻松"等待]          │
└────────────────────────────────────────────────────────────────────────┘

┌─ Round 2 ─────────────────────────────────────────────────────────────┐
│                                                                        │
│  前端 submit answers → POST /session/prompt                           │
│    body.askAnswers = { <toolCallId>: { toolCallId, answers } }       │
│                                                                        │
│  routes/acp.ts 透传 options.askAnswers                                │
│   ↓                                                                    │
│  runtime.chatStream                                                   │
│    isAgentRunning + options.askAnswers 非空                           │
│     → resolvePendingQuestion(convId, toolCallId, answers)             │
│     → HTTP res.json({ ok: true, answers })                           │
│                                                                        │
│  [opencode 子进程 question.ts execute 的 fetch 收到响应]                │
│   ↓                                                                    │
│  tool output: "User answered: \"Which DB?\" → PostgreSQL. You can..." │
│   ↓                                                                    │
│  LLM 继续推理，引用用户答案                                            │
│   ↓                                                                    │
│  最终 result → 第二轮 SSE 流关闭                                       │
└────────────────────────────────────────────────────────────────────────┘
```

### 13.3 核心代码

**`pending-question-registry.ts`**：独立于 permission registry，因为：
- Permission 存 ACP JSON-RPC Promise resolver
- Question 存 HTTP response resolver（用户填答案后 res.json 返回 opencode 子进程）

**`opencode-tool-templates/question.ts`**：新增 custom tool
- 参数 schema 与 opencode 原生 question tool 一致（`header`/`question`/`options`/`multiple`）
- execute 内 fetch 内部 endpoint，阻塞等答案
- 返回格式化文本 + metadata.answers

**`routes/acp.ts`**：新增 `POST /api/agent/internal/ask-user`
- 认证：X-Internal-Token（仅 127.0.0.1 回环）
- 中间件豁免 `requireUserEnv`（它是 agent 内部调用，不走用户会话）
- 挂起 HTTP response 10 分钟，超时 408

**`opencode-acp-runtime.ts`**：
- spawn 时注入 `ASK_USER_URL`/`ASK_USER_TOKEN`/`ASK_USER_CONVERSATION_ID`
- `chatStream` resume 分支处理 `options.askAnswers`
- 暴露 `emitForConversation` 给 routes 用（推 ask_user 给前端 SSE）

### 13.4 e2e 验证

`scripts/test-ask-user-e2e.mts`：

```
Round 1:
  +11670ms  tool_use id=question:0 name=question
  +15092ms  ★ ask_user id=question:0 questions=[{header:Database, options:[PostgreSQL, MySQL]}]
  [agent suspended 3s no result]

模拟用户选 "PostgreSQL"

Round 2 (askAnswers):
  alreadyRunning=true
  +18149ms  tool_result: "User answered: Which database to use? → PostgreSQL..."
  +20341ms  tool_use skill (LLM 继续调用后续工具)
  +36349ms  result: end_turn
  LLM 文本: "Great! You've chosen PostgreSQL. Let me provide recommendations..."

  ask_user received:             PASS
  agent suspended after:         PASS (no result 3s)
  round2 resume path:            PASS (alreadyRunning=true)
  tool_result with user answer:  PASS
  final result event:            PASS
  no error event:                PASS
  text mentions answer:          PASS (bonus)
OVERALL: PASS
```

### 13.5 已知边界

- **LLM 的主动性依赖 prompt 明确指示**：默认 Moonshot/Kimi 倾向于自己拍板，不会主动提问。需要在用户 prompt 里写"请使用 question 工具征询我..."才会调用。对于生产 UX，建议在 system prompt 里明确鼓励 question 工具的使用场景。
- **超时 10 分钟**：可通过 `ASK_USER_TIMEOUT_MS` env 覆盖。超时后 opencode tool 拿到 `408` 响应，会把 "timeout" 告知 LLM，由 LLM 决定是否重试。
- **token 静态**：runtime 首次 `getAskUserToken()` 调用时生成，此后不变。服务进程重启会重新生成。生产部署下应通过 env 显式注入稳定 token。
- **多路 SSE 重连**：Round 1 SSE 断了后，用户重连 GET /observe/:sessionId 能继续收事件，但已经 emit 过的 ask_user 不会重放（它已落 stream events DB，由 observe 的 replay 逻辑带出）。
