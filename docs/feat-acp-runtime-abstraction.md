# feat/acp-runtime-abstraction 变更说明 & 验收清单

> 分支：`feat/acp-runtime-abstraction`
> 基线：`origin/main`（c9b68f9）
> 14 commits，46 files changed，+5889 / -22

---

## 一、背景

在原有 Tencent SDK（`@tencent-ai/agent-sdk`）runtime 的基础上，新增 **OpenCode ACP runtime**。两个 runtime 通过 `IAgentRuntime` 接口并排注册，用户可在前端任务创建表单里切换。默认行为不变，没有安装 opencode CLI 时选择器不显示。

---

## 二、变更点

### 2.1 IAgentRuntime 抽象层

新增 `packages/server/src/agent/runtime/` 目录：

| 文件 | 说明 |
|---|---|
| `types.ts` | `IAgentRuntime` 接口 + `ChatStreamResult` |
| `registry.ts` | `AgentRuntimeRegistry`：注册 + resolve 策略 |
| `tencent-sdk-runtime.ts` | 原有 service 的薄 adapter（零逻辑改动） |
| `opencode-acp-runtime.ts` | ★ OpenCode runtime 主体 |
| `acp-transport.ts` | local stdio transport + `resolveOnPath`/fallbackBins |
| `opencode-installer.ts` | 全局 tool 幂等安装到 `~/.config/opencode/tools/` |
| `opencode-message-builder.ts` | 事件流累积 → `UnifiedMessagePart[]` + 历史 transcript |
| `pending-permission-registry.ts` | ToolConfirm 挂起/唤醒 |
| `pending-question-registry.ts` | AskUserQuestion HTTP 挂起/唤醒 |

**Runtime resolve 优先级**：`request params.runtime` > `task.selectedRuntime` > `AGENT_RUNTIME env` > `tencent-sdk`（默认）

---

### 2.2 沙箱隔离：全局 tool override + env 注入

`opencode acp` 子进程在 server 本地运行（agent 域），工具调用通过 custom tool `.ts` 文件的 `fetch` 路由到 SCF 沙箱（sandbox 域），agent/sandbox 严格分离。

```
opencode acp（本地）
  └─ custom tool write.ts → fetch SANDBOX_BASE_URL/api/tools/write
                               └─ SCF /tmp/workspace/<env>/<conv>/...（沙箱）
```

新增工具模板（`opencode-tool-templates/`）：`read.ts` `write.ts` `edit.ts` `bash.ts` `grep.ts` `glob.ts` `AskUserQuestion.ts`

- **安装时机**：`chatStream` 首次调用时惰性安装（hash 比对，只变更时覆盖）
- **env 注入**：spawn opencode 时通过 child env 传递 `SANDBOX_MODE`, `SANDBOX_BASE_URL`, `SANDBOX_AUTH_HEADERS_JSON`
- **强制重装**：`OPENCODE_TOOLS_FORCE_REINSTALL=1`

---

### 2.3 human-in-loop

| 能力 | 机制 |
|---|---|
| **ToolConfirm** | `requestPermission` ACP 回调 → 发 `tool_confirm` SSE → `PendingPermissionRegistry` 挂起 → 下轮 `toolConfirmation` resume |
| **AskUserQuestion** | custom tool `AskUserQuestion` → `POST /api/agent/internal/ask-user`（仅 127.0.0.1）→ `PendingQuestionRegistry` 挂起 → 下轮 `askAnswers` resume |

两者与现有前端 `ToolConfirmDialog` / `AskUserForm` 零改动对接（工具名、schema 与 Tencent 契约完全对齐）。

---

### 2.4 消息持久化

新增 `OpencodeMessageBuilder`，把 `AgentCallbackMessage` 事件流累积成 `UnifiedMessagePart[]`，写入 `vibe_agent_messages` 集合（与 Tencent SDK 同一张表）。

**落库时机**：
- `tool_use` 时 → flushToDb（挂起期间前端可见 tool_call 卡片）
- `tool_result` 时 → flushToDb
- `finalize` 时 → 最终写入 + 改 record status（`done`/`error`/`cancel`）

**多轮记忆**：`buildHistoryContextPrompt` 从 DB 读最近 N 轮 messages，格式化为 Markdown transcript 注入新 session prompt 前缀，解决 opencode 每次 newSession 空白上下文的问题。

---

### 2.5 前端 Runtime 选择器

- `GET /api/agent/runtimes` 公开 endpoint（无需认证）
- 任务创建表单：可用 runtime 数 `< 2` 时选择器完全不显示（零感知降级）；有多个时在 model 选择器旁边显示
- `task.selectedRuntime` 字段存 DB，发消息时自动沿用

---

### 2.6 技术质量改进

- **vitest 单元测试**（27 个）：`buildHistoryContextPrompt` 16 个、`resolveOnPath/getResolvedBin` 10 个
- **buildHistoryContextPrompt 格式**：`## Turn N` / `**User:**` / `[Tool call]` / `[Tool result] name — status (N bytes)`，安全截断（不截 JSON，不塞 tool_result 原始内容）
- **fallbackBins + resolveOnPath**：支持 `opencode-ai` 等 PATH 别名；`isAvailable()` 改为同步 `existsSync`
- **stream_events cleanup 修复**：OpenCode runtime `finally` 块加 `cleanupStreamEvents`，防止孤儿数据积累

---

### 2.7 改动文件清单

| 路径 | 类型 |
|---|---|
| `packages/server/src/agent/runtime/` 下 9 个新文件 | 新增 |
| `packages/server/src/agent/runtime/opencode-tool-templates/` 下 7 个 `.ts` | 新增 |
| `packages/server/src/agent/runtime/__tests__/` 下 3 个测试文件 | 新增 |
| `packages/server/vitest.config.ts` | 新增 |
| `packages/server/src/routes/acp.ts` | 修改（runtime 路由 + `/runtimes` endpoint + `/internal/ask-user`） |
| `packages/server/src/routes/tasks.ts` | 修改（接收 `selectedRuntime` 字段） |
| `packages/server/src/agent/persistence.service.ts` | 修改（+`setRecordParts` public） |
| `packages/server/src/db/types.ts` | 修改（+`selectedRuntime` 字段） |
| `packages/server/src/db/schema.ts` | 修改（+`selectedRuntime` 列，drizzle） |
| `packages/server/src/db/cloudbase/repositories.ts` | 修改（normalize + create 加 `selectedRuntime`） |
| `packages/server/src/index.ts` | 修改（启动时设置 `ASK_USER_BASE_URL`） |
| `packages/server/package.json` / `tsconfig.json` | 修改（+vitest、+acp/mcp sdk、排除 `__tests__`） |
| `packages/shared/src/types/agent.ts` | 修改（`SessionPromptParams` +`runtime` 字段） |
| `packages/web/src/components/task-form.tsx` | 修改（+runtime 选择器 UI） |
| `packages/web/src/components/home-page-content.tsx` | 修改（+`selectedRuntime` 透传） |

---

## 三、验收清单

### A. 基础环境

- [ ] `pnpm install` 无报错
- [ ] `pnpm build:server` 成功
- [ ] `pnpm build:web` 成功
- [ ] `pnpm lint` 无报错
- [ ] `cd packages/server && pnpm test` → **27/27** 通过

---

### B. Runtime 选择器 UI

- [ ] 启动 dev server，进入任务创建表单
- [ ] 默认状态（未装 opencode）：底部工具栏只显示 `CodeBuddy · [模型名]`，**不显示** runtime 选择器
- [ ] 装了 opencode CLI 时：底部出现 `· CodeBuddy (Default)▾`，点击可切换到 `OpenCode ACP`
- [ ] 选 `OpenCode ACP` 创建任务后，查 DB 该任务 `selectedRuntime = 'opencode-acp'`

---

### C. Tencent SDK runtime（回归验证，默认路径）

- [ ] 不选 runtime 创建任务，行为与之前完全一致
- [ ] 多轮对话正常
- [ ] ToolConfirm 对话框正常弹出 + 允许/拒绝后 agent 继续
- [ ] AskUserQuestion 表单正常弹出 + 答题后 agent 继续
- [ ] 任务完成后历史消息可读（vibe_agent_messages）

---

### D. OpenCode ACP runtime

> 前提：`opencode` CLI 已安装，`~/.config/opencode/opencode.json` 配置了可用模型（如 Moonshot Kimi）

**D1. 基础对话**

- [ ] 选 `OpenCode ACP` 发 prompt，前端实时看到流式文本
- [ ] 任务完成后 `GET /api/tasks/:id/messages` 能读到历史（user + assistant records，status=done）
- [ ] assistant record 的 `parts` 数组包含 `text` part

**D2. 沙箱隔离**

- [ ] 让 agent 执行写文件操作（如"创建 hello.txt"）
- [ ] 文件出现在沙箱（`/tmp/workspace/envId/convId/`），**不出现在 server 本机目录**
- [ ] `~/.config/opencode/tools/` 下有 `write.ts`, `read.ts` 等 6 个文件

**D3. ToolConfirm**

- [ ] 在项目 `.opencode/opencode.json` 里配置 `"permission": {"edit": "ask"}`
- [ ] 让 agent 写文件，前端出现"允许一次 / 总是允许 / 拒绝"对话框
- [ ] 点"允许一次" → agent 继续执行完成，历史可读
- [ ] 点"拒绝" → agent 收到拒绝反馈，正常结束

**D4. AskUserQuestion**

- [ ] Prompt 明确要求 LLM 用 AskUserQuestion 工具提问（如"请用 AskUserQuestion 问我选哪个框架，给出 React 和 Vue 两个选项"）
- [ ] 前端出现与 Tencent 相同的答题卡片（`AskUserQuestion` 工具名匹配）
- [ ] 填写答案提交后 agent 继续推理，回答引用用户选择

**D5. 多轮记忆**

- [ ] Turn 1：`hello 我叫王小明`
- [ ] Turn 2：`我叫什么` → agent 回答包含"王小明"
- [ ] Turn 3：要求 agent 用 AskUserQuestion 问 `1+1=?`，回答"2"
- [ ] Turn 4：`总结我的名字和对话历史` → 回答同时包含"王小明"和"1+1"或"2"

**D6. 消息历史（持久化验证）**

- [ ] 任务完成后关闭页面，重新打开同一任务，历史消息完整显示
- [ ] assistant 消息包含 `tool_call` + `tool_result` 卡片
- [ ] 挂起期间（等用户确认前）打开任务，能看到 `tool_call` 为 in_progress 状态
- [ ] 任务完成后 `vibe_agent_stream_events` 表里该 turn 的数据已清空

---

### E. 接口验证（可用 curl 快速跑）

```bash
# E1. runtimes 列表（无需 auth）
curl http://localhost:3001/api/agent/runtimes
# 期望:
# { "default": "tencent-sdk", "runtimes": [
#     { "name": "tencent-sdk",  "available": true },
#     { "name": "opencode-acp", "available": true/false }
#   ] }

# E2. runtime 选择器自动化 e2e（不依赖 LLM，约 10s）
cd packages/server
npx tsx --env-file=.env scripts/test-runtime-selector.mts
# 期望: 11 passed, 0 failed — OVERALL: PASS
```

---

### F. 兜底确认（不应改变的行为）

- [ ] 没安装 opencode CLI 时，系统默认走 tencent-sdk，用户无感知
- [ ] `vibe_agent_messages` 里已有的历史消息不受影响
- [ ] 前端 task-chat、AskUserForm、ToolConfirmDialog、PlanModeCard 等组件无变化
- [ ] 管理后台（`/admin`）、任务列表、沙箱 preview、git 相关功能不受影响
- [ ] 多 agent / multi-repo 任务创建路径正常（`selectedRuntime` 透传不报错）
