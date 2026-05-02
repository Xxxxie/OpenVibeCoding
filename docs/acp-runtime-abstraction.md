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
| askAnswers / toolConfirmation resume | ❌ 未接入 |
| ToolConfirm UI 回调 | ⚠️ 默认 allow_once |
| coding-mode 模板初始化 | ❌ 未集成 |
| 消息持久化到 tasks | ⚠️ 只 stream events 落库 |
| tool override 的版本升级 hash 匹配 | ✅ 已实现（hashFile 比较） |
| 首次安装报告日志 | ✅ 已输出 |

## 10. 后续方向

1. **接 ToolConfirm UI**（1-2 天）
2. **askAnswers / resume 流程**（2-3 天）
3. **消息持久化对齐 Tencent 路线**（2-3 天）
4. **更多 ACP agent**（Claude Code / Gemini / Qwen Code；每个 1-2 天，runtime 骨架复用）
5. **前端 Runtime 选择器**（0.5 天）

## 11. 引用

- Agent Client Protocol: https://agentclientprotocol.com
- OpenCode Custom Tools: https://opencode.ai/docs/custom-tools/
- OpenCode Agents: https://opencode.ai/docs/agents/
- OpenCode ACP: https://opencode.ai/docs/acp/
- 源码调研备忘录: `/Users/yang/git/coding-agent-template/docs/opencode-acp-integration-memo.md`
