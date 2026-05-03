# Changelog

本文件记录 `coding-agent-template` 面向用户/开发者的显著变更。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本遵循 [SemVer](https://semver.org/)。

## [2.1.0] — 2025-05-03

### Added

- **沙箱创建进度可见**: Coding 任务启动时，前端状态指示器现在会细分显示沙箱各阶段进度（镜像拉取 → 容器就绪 → 工作区初始化），不再全程显示"准备中..."。（`emitPhase('preparing', 'sandbox:xxx')` → `AgentStatusIndicator` 按阶段动态出文案）

- **Dev server 启动失败快速报错**: Coding 模式下，vite 或 npm install 失败时错误原因会立即透传给前端（`viteFailureReason`），不再等待 120s 超时才报错。预览 URL 也改为等待 `viteReady === true` 再返回，避免拿到 URL 后立即 502。

- **Default 模式任务分类**: Default Agent 现在会先判断任务类型再行动——对话/创作类需求直接输出文本，编程/工程类才调用工具。（`buildAppendPrompt` 为 default 模式注入 `task-classification` guideline，coding 模式不受影响）

- **子工作区隔离 (Scope API)**: 同一 session 内支持多个相互隔离的子工作区，通过 `X-Scope-Id` / `X-Scope-Template` 头控制；每个 scope 独立运行 vite dev server（端口 5173-5199 动态分配）；`GET /api/scope/info` 返回工作区路径和 vite 状态。

- **小程序部署进度轮询**: 小程序部署超过 60s 时接口异步返回 `{ async: true, jobId }`，客户端轮询 `GET /api/miniprogram/deploy/:jobId` 获取实时构建日志，不再因超时直接报错。

- **凭证安全加固**:
  - session 云凭证（SecretId/SecretKey/SessionToken）从明文 `.session-env.json` 改为 AES-256-GCM 加密存储（`src/session-env.ts`）
  - Git remote URL 不再嵌入 token，改用内存 credential helper 在 push/fetch 时动态注入，`git remote -v` 不再泄露凭证

- **ImageGen 图片生成**（Default 模式可用）: 生成的图片自动上传到 CloudBase 静态托管并返回 CDN 公开链接，Agent 在聊天中直接展示图片。前端 `ImageGen` / `ImageEdit` 工具卡片支持 Markdown 渲染，CDN 图片内联显示。（`GET /api/storage/presign?bucketType=static&key=xxx` 生成 COS 预签名 PUT URL，tool-override 直接 PUT 到 COS，不经过 server）

- **文件浏览器下载**: 右键菜单新增文件下载（直接流式返回）和文件夹下载（沙箱内 `zip -r` 打包后流式返回）。临时 zip 存放在 `.tmp/`（已 gitignore），传输完成后删除。

- **管理员用户管理 — API Key 列**: 用户列表新增 API Key 一列，支持复制和重置；管理员可为任意用户生成新 key（`POST /api/admin/users/:id/api-key/reset`）。新注册用户自动生成 API key。

- **CloudBase 数据库集合权限加固**: 所有系统集合（users/tasks/keys 等）在首次访问时自动通过 `ModifySafeRule(AclTag=ADMINONLY)` 设为管理员专用，阻止前端 Web SDK 直接读写。

### Fixed

- **Agent 响应消失** (`routes/acp.ts`): `removeAgent` 的 30s 延迟定时器可能误删新一轮同 conversationId 的注册条目，导致 SSE 轮询立即退出。改为携带 `turnId` 比对，stale 定时器跳过删除；poll loop 增加 3×500ms grace tick 让 eventBuffer 排空。

- **发送失败留下空消息** (`use-chat-stream.ts`): 消息发送失败时 UI 残留用户消息 + Agent 占位气泡。现在 `runPromptStream` 失败时同时移除两者并恢复输入框草稿；`acp-client.ts` 对非 `text/event-stream` 响应解析 JSON-RPC 错误抛 `AcpStreamError`，服务端同步拒绝（如"A prompt turn is already in progress"）可被前端正确识别。

- **历史任务打开崩溃**: 早期任务 doc 缺少 `mode`/`sandboxMode` 等字段。`CloudBaseTaskRepository` 统一走 `withTaskDefaults()` 补全默认值；`sandboxMode` 默认值改为 `'isolated'`（与新任务一致）。

- **npm install 中断后 ENOTEMPTY 死循环** (`vite-dev-manager.ts`): 上次强制中断的 npm install 会留下 `.xxx-ABCDEF` staging 目录，导致下次安装 `rename` 失败死循环。启动前自动检测并清理；npm install 遇到 ENOTEMPTY 时整删 `node_modules` 后重试。

- **Preview 302 重定向循环**: 移除 vite 的 `--base=/preview/{port}/` 参数，proxy 直接 strip 前缀后转发；区分 vite-managed 端口（保留完整路径）和普通端口（strip 前缀）的不同 proxy 策略。

- **HMR 热更新不生效**: vite 模板增加 `hmr: { clientPort: 443, protocol: 'wss' }`，浏览器 WebSocket 通过 CloudBase gateway 正确连接。

- **系统文件写入 scope 子目录**: `.capabilities`/`.mcporter`/`.skills` 在 scope 模式下被错误写入子目录。`buildSafeEnv`、`capabilityStorePath` 等统一改为解析 session root（`sessionRootFromWorkspace()`）。

- **Server 进程因沙箱连接中断崩溃**: `uncaughtException` 增加对 `EPIPE`/`ECONNRESET`/`ECONNREFUSED` 的静默处理；`unhandledRejection` 对 "Session not found" 静默降级。

- **scope/info 首次响应阻塞 ~59s**: `spawnVite` 将 tar 解压 + npm install 包裹在 `setImmediate` 中异步执行，HTTP handler 立即返回 `viteState: "starting"`，不再阻塞。

- **API Key 认证失效** (`middleware/auth.ts`): AES-CBC 每次加密产生不同密文，`findByApiKey(encrypt(plain))` 永远查不到用户。改为 API key 存储明文（`sak_xxx`，可吊销，DB 层已有 ADMINONLY 权限保护），`findByApiKey(plain)` 直接精确匹配。

### Changed

- **Coding 模板冷启动加速**: 沙箱镜像内模板只保留 `node_modules.tar.gz`（~33MB），去掉 `node_modules/`（~211MB）；`seedCodingTemplate` 拷贝速度提升 ~24x（3.7s → 150ms）。`node_modules.tar.gz` 改由模板 `postinstall` npm 脚本生成，保证缓存在所有依赖写入完成后才打包，不会出现"装一半"的脏包。

- **Skill 加载优化**: 沙箱 skill 扫描从串行 bash 调用（`ls -1`/`test -d`）改为 `ListDir` API（返回 `entry.type` 直接判断目录）；SKILL.md 读取改为 30 并发批量 + 两目录 `Promise.all`；请求数从 `2N+4` 串行降为 `2 + ceil(N/30)` 批量。

- **Sandbox 磁盘配额**: SCF 函数 DiskSize `1024` → `2048` MB。

- **Preview 健康检查降频**: 后台轮询间隔 15s → 30s；`visibilitychange` 监听，页面不可见时暂停，切回后立即检查一次。

- **⚠️ Breaking — Coding template 部署**: 模板已内置到沙箱镜像，`.env` 中的 `CODING_TEMPLATE_URL` 配置项已移除，初始化脚本也去掉了对应步骤。升级时请同步更新沙箱镜像版本。

- **Provisioning API 重命名** (sandbox 内部): `ensureWorkspace` / `ensureScope` → `ensureSessionRoot(sessionId)` / `ensureWorkspaceFor(sessionId, scopeId?, template)`，语义更清晰；`session/init` 改调 `ensureSessionRoot` 避免误触发 vite 启动。

---

## [2.0.0]

### Added

- **预览沙箱 & Browser 工具栏**: 新建 coding 模式任务后自动冷启动沙箱；右侧预览面板支持浏览器地址栏、刷新/返回/前进、设备尺寸切换；首次加载有骨架屏。
- **Agent Mode 任务切换**: 任务表单支持选择 `default` / `coding` 模式（单一 `Coding / Default` 药丸按钮）。
- **CAM 环境策略脚本**: 新增 `packages/server/src/scripts/refresh-policy.ts`，通过 CAM `UpdatePolicy` 把本地 policy 定义刷新到已部署 policyId，免重新 provision（约 1 分钟生效）。
- **TaskListPanel**: 聊天输入框上方新增可折叠任务进度面板，从 TaskCreate/TaskUpdate 工具调用提取任务列表（状态图标 + subject/activeForm + 进度计数）；TaskCreate/TaskUpdate/TaskList/TaskGet 工具卡片从消息流中隐藏，改为面板展示。
- **预览新窗口打开**: 编码模式预览工具栏新增 ExternalLink 按钮，点击在新窗口打开预览 URL，方便分享。
- **Coding mode dev server 改进**: 使用 PTY 启动 dev server；自动 patch vite.config.ts 适配 CloudBase 沙箱预览（`--base=/preview/`, `host 0.0.0.0`, `allowedHosts`）；跳过已有 package.json 但缺 node_modules 的重复 clone。
- **CAM NoSQL 数据库权限**: `buildUserEnvPolicyStatements` 新增 `tcb:QueryRecords / PutItem / UpdateItem / DeleteItem / CreateTable`（resource `*`）。

### Fixed

- **死循环: confirm-resume 工具调用**（核心）: 用户点击"允许"后 SDK 重复生成新 `callId` 再次触发 canUseTool → deny 的无限循环。综合 3 处修复：
  1. `restoreAssistantRecord` 按 `record.parts` 原序遍历，不再强制把 text part 放最后。
  2. `updateToolResult` 新增 `extraMetadata` 参数，自动剥离 SDK deny 标记（`providerData.skipRun / error`）并合并调用方补齐的字段。
  3. 方案 2 真实 MCP 执行后回填 baseline 等价 metadata（`providerData.{messageId, model, agent, toolResult{content, renderer}}` + 顶层 `sessionId`）。
     离线仿真 JSONL 与 baseline canonical identical；真机验证 SDK resume 不再重发，进入下一步调用。
- **AskUserQuestion resume 同步修复**: `askAnswers` 分支的 `updateToolResult` 补全与 toolConfirmation 相同的 providerData/sessionId。
- **乐观 UI: 允许/拒绝工具后本地即时反馈**: `handleConfirmTool` 在网络 resume 前插入本地 `tool_result`（deny→终态红叉；allow→`status:'executing'` 过渡态保持 Loader2），`apply-session-update` 只对 `'executing'` 占位做替换保证最终一致性。
- **AgentStatusIndicator 仅在最新 group 渲染**: 补 `isLatestGroup` 约束，避免下一轮对话时"模型响应中..."挂在历史 assistant 消息末尾。
- **刷新后恢复 InterruptionCard**: 从 DB `tool_result.metadata.status === 'incomplete'` 重建 `toolConfirm`，支持 `input` 为 JSON 字符串或对象两种容错。
- **confirmTool 后 UI 无反应**: resume 时把本地 `stream-xxx` 消息 id remap 到服务端 `assistantMessageId`，避免后续 SSE 找不到目标 message 而丢帧。
- **切换 task 交互态残留**: `use-chat-stream` 用 `prevTaskIdRef` 跳过 initial mount 的 reset，防止踩踏 `sendInitialPrompt` 已进入的 `streaming` 状态。
- **Phase 指示器 & 工具确认卡就地渲染**: `AgentStatusIndicator` 和 `InterruptionCard` 不再固定在输入框上方，改挂到对应 agentMessage 末尾并随滚动。
- **CAM policy 修复**: `buildUserEnvPolicyStatements` 删除非法 `flexdb:*`，新增 `tcb:CreateFunction / UpdateFunctionCode / GetFunction / InvokeFunction / ListFunctions`（resource `*`），`tcb:CreateFunction` 权限不再缺失。
- **UI 识别错误清理**: 删除 `task-form.tsx` 中重复的 `isCodingMode / mode` 定义与对象字面量重复 key；`Code` 图标引用改为已导入的 `Code2`；删除 `task-chat.tsx` 中重复的 `isCodingMode`。
- **Stream event cleanup 竞态**: 先 flush eventBuffer 再 cleanup stream events；cleanup 延迟到 `completeAgent()` 之后 600ms，让 poll loop 先排空剩余事件。
- **TCR docker login 子账号**: `setup-tcr.mjs` 通过 `STS.GetCallerIdentity` 获取 `callerUin`，子账号 docker login 用 `callerUin` 而非主账号 AppID。

### Changed

- `toolConfirmation` 真实执行从 sandbox 启动**之前**推迟到 sandbox + sandboxMcpClient ready **之后**，避免 sandbox 未就绪时写入占位文本误触发 SDK 重试。

---

### Chat-Detail 重构（ACP + UI）

本次重大版本面向 `chat-detail` 交互做系统性升级，借鉴官方 CodeBuddy Code 实现。目标：权限模型 / Plan 模式 / 协议层 / Phase 可视化 / 工具渲染 / Subagent 嵌套。

### P1 · 权限模型升级

- **`PermissionAction` 四值**: `allow` / `allow_always` / `deny` / `reject_and_exit_plan`。
- **`InterruptionCard`**: 新卡片 UI 替代旧 `ToolConfirmDialog` 弹窗，消息流内渲染，不打断上下文。
- **`sessionPermissions` 白名单**: 按 sessionId 维护"本会话总是允许"的工具名集合；`canUseTool` 命中白名单直接放行。
- **双入口协同**: `canUseTool` 与 `PreToolUse hook` 都过白名单，保持行为一致。
- 文件: `packages/server/src/agent/session-permissions.ts`（新）、`packages/web/src/components/chat/interruption-card.tsx`（新）、`packages/shared/src/types/agent.ts`、`cloudbase-agent.service.ts`、`use-chat-stream.ts`。

### P2 · PlanMode + ExitPlanMode

- **Plan 模式**: 前端传 `permissionMode: 'plan'`，SDK 切入 Plan；除 Read/Glob/Grep/ExitPlanMode 等只读工具外，写操作会被挡住。
- **`PlanModeCard`**: Rocket 图标 + 三按钮（允许执行 / 继续完善 / 拒绝退出）。
- **`plan-content.ts`**: 宽松提取器，兼容 `plan` / `allowedPrompts` / `steps` 三种 SDK 输出。
- **Plan 状态原子**: `planModeAtomFamily`（active / planContent / toolCallId），跨组件共享。
- 文件: `plan-mode-card.tsx`（新）、`plan-content.ts`（新）、`lib/atoms/plan-mode.ts`（新）、`shared/types/agent.ts`、`acp.ts`、`cloudbase-agent.service.ts`、`routes/acp.ts`、`use-chat-stream.ts`、`interruption-card.tsx`。

### P3 · 协议层独立（AcpClient）

- **`AcpClient` 类**: `initializeSession` / `request` / `notify` / `stream` (AsyncIterable) / `observe` (AsyncIterable) / `cancel`。
- **`fetch-with-retry`**: 5xx 与网络错误指数退避重试。
- **纯函数抽离**: `apply-session-update.ts` 从 223 行 switch 剥离；`use-chat-stream.ts` 由 785 行减到 446 行，SSE 解析全部迁到 `AcpClient.stream`。
- 文件: `lib/acp/acp-client.ts`（新）、`lib/acp/fetch-with-retry.ts`（新）、`lib/acp/index.ts`（新）、`hooks/apply-session-update.ts`（新）、`hooks/use-chat-stream.ts`。

### P4 · Agent Phase 可视化

- **服务端 `emitPhase` helper**: 在 5 处边界发射 `agent_phase` 事件（preparing / model_responding / tool_executing / compacting / idle）。
- **`AgentStatusIndicator`**: 4 种 phase 配 Rocket / Sparkles / Hammer / Archive 图标；`aria-live="polite"` 支持屏幕阅读器。
- **Timestamp 乱序防护**: `apply-session-update` 中 `case 'agent_phase'` 比较 ts，后到但时间更早的事件不覆盖。
- 文件: `agent-status-indicator.tsx`（新）、`cloudbase-agent.service.ts`、`shared/types/agent.ts` + `acp.ts`、`apply-session-update.ts`、`use-chat-stream.ts`、`task-chat.tsx`。

### P6 · 工具渲染注册表

- **`TOOL_RENDERERS` 注册表**: 10 个专属渲染器（Bash / Read / Write / Edit / Grep / Glob / Web / Todo / Task + default），各自提供 Icon、getSummary、renderInput、renderOutput。
- **Edit 渲染器集成 git-diff-view**: 文件编辑显示 before/after unified diff。
- **`default.renderer`**: 剥 MCP 外壳（解开 `[{type:'text',text:...}]` 取纯文本），JSON 参数折叠展开。
- **`ToolCallCard` 接入注册表**: 外部 API 保持不变，调用方（task-chat）零改动。
- **DEV 预览页**: `/__preview/tool-renderers`，可视化检查所有渲染器效果。
- 文件: `components/chat/tool-renderers/*`（新 11 个）、`tool-call-card.tsx`、`pages/tool-renderers-preview.tsx`（新 DEV-only）。

### P7 · Subagent 嵌套 UI

- **`SubagentCard`**: 紫色边框容器（`border-purple-500/40`）+ Bot 图标 + 子工具数量徽章，递归渲染支持多层嵌套。
- **`parent_tool_use_id` 透传**: SDK 顶层 → 5 个服务端 handler → `convertToSessionUpdate` 3 个 case → 前端 `MessagePart.parentToolCallId`。
- **自引用防御**: Task tool result.parent 指向自身时不再陷入无限嵌套。
- 文件: `subagent-card.tsx`（新）、`shared/types/agent.ts`、`cloudbase-agent.service.ts`、`types/task-chat.ts`、`apply-session-update.ts`。

### 其它

- **手动回归测试清单**: `docs/manual-test-checklist.md`（新），覆盖 P1-P7 所有典型交互路径。
- **P5 Checkpoint 回滚**: ⏳ 待开始（依赖服务端 git 集成）。

---

## 里程碑

| 里程碑 | 组成         | 状态     |
| ------ | ------------ | -------- |
| **M1** | P1 + P2 + P4 | ✅ 完成   |
| **M2** | P6 + P7      | ✅ 完成   |
| **M3** | P5           | ⏳ 待开始 |

详细实施计划与文件清单见 [`docs/REFACTOR-PLAN.md`](./docs/REFACTOR-PLAN.md)。
