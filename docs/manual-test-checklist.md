# 手动回归测试清单

> 范围：ACP 重构相关的 7 个 Phase（P1–P7）。每次大变更后走一遍，防止功能退化。
>
> 预计耗时：首次 ~60 分钟；熟练后 ~30 分钟。

---

## 0. 前置准备

### 0.1 确认服务运行

```bash
lsof -iTCP -sTCP:LISTEN -P | grep node
```

期望看到：

- **3001**：后端 API（`/api/**`）
- **5174**（或 5173）：Vite dev server（前端 UI）
- **8899**：Gateway（可选）

若后端未启动：到仓库根跑 `pnpm --filter @coder/server dev`
若前端未启动：到仓库根跑 `pnpm --filter @coder/web dev`

> ⚠️ 本清单假定服务已在跑，**不要**让 AI Agent 自己启动 dev server。

### 0.2 浏览器登录

- 地址：`http://localhost:5174`
- 账号：`yanghang`
- 密码：`yang@1234`

### 0.3 打开调试面板（推荐）

- `F12` 或 `Cmd+Opt+I` → 打开 DevTools
- 勾选 Network 面板「Preserve log」
- 过滤 `acp` 方便观察 SSE 流

### 0.4 准备 3 个测试 Task

建议预先创建 3 个 task，避免测试时反复新建：

- `test-p1`（权限卡片验证）
- `test-p6`（工具渲染样式验证）
- `test-p7`（subagent 嵌套验证）

---

## 1. P1 — 权限白名单（四值决策）

> `PermissionAction = 'allow' | 'allow_always' | 'deny' | 'reject_and_exit_plan'`

| # | 用例 | 触发方式 | 预期 |
|---|---|---|---|
| 1.1 | 首次写工具 → 弹审批 | `create a cloud function named hello, code: exports.main = async () => ({msg:"hi"})` | 输入框上方出现 `InterruptionCard`，含 3 按钮：**允许 / 总是允许（本会话）/ 拒绝** |
| 1.2 | 允许一次 | 点「允许」 | 工具执行；**同名工具下次仍然弹** |
| 1.3 | 总是允许 | 再次创建/更新函数，点「总是允许」 | 本轮执行 |
| 1.4 | 白名单命中 | 1.3 之后，再次让模型创建函数 | **不再弹确认**，直接执行 |
| 1.5 | 拒绝 | 让模型调敏感工具，点「拒绝」 | 工具记录「用户拒绝」，模型用文字继续（不重试同一调用） |
| 1.6 | 热重启清空 | 改 server 任一 `.ts` 保存触发 tsx watch 重启 | 之前「总是允许」过的工具**又开始弹**（已知限制） |

### 排查
- 弹不出卡片：Network 查 SSE 中是否有 `sessionUpdate:"tool_confirm"` 事件
- 白名单不生效：后端日志看 `SessionPermissionsManager.isAllowed`

---

## 2. P2 — Plan 模式 + ExitPlanMode

| # | 用例 | 触发方式 | 预期 |
|---|---|---|---|
| 2.1 | 模型自发进 Plan | `研究一下这个项目的 acp 协议是怎么工作的，不要急着写代码` | 模型调 `ExitPlanMode` → 弹 `PlanModeCard`（🚀 紫色 + 3 按钮） |
| 2.2 | Plan 内容 Markdown | 观察卡片内容 | 是带缩进/列表/代码块的格式化 Markdown，不是裸 JSON |
| 2.3 | 开始编码 (`allow_always`) | 点「是，开始编码」 | 退出 Plan 模式，模型开始执行真实工具 |
| 2.4 | 继续规划 (`deny`) | 点「继续规划」 | 模型继续分析，产出新 plan，**不执行工具** |
| 2.5 | 退出 Plan (`reject_and_exit_plan`) | 点「退出 Plan 模式」 | 下一轮 `permissionMode=default`，模型可执行但不再主动进 plan |
| 2.6 | 🔴 手动进 Plan UI 缺失 | 无 | 输入框旁缺 Plan 模式开关按钮（已知缺口） |

### 排查
- Plan 内容显示为 JSON：检查 `plan-content.ts` 的 `extractPlanContent` 是否识别到该 schema
- 三按钮点击无效：Network 观察 `session/prompt` 是否带 `toolConfirmation.payload.action`

---

## 3. P3 — AcpClient（协议层）

| # | 用例 | 触发方式 | 预期 |
|---|---|---|---|
| 3.1 | 流式吐字 | 任意 prompt | 字符逐步出现，非一次性显示 |
| 3.2 | 取消 | 长任务中点「停止」按钮 | 立刻停下，无报错；指示器复位 |
| 3.3 | 断线重连 | 发送 prompt 后，刷新浏览器 F5 | 自动 reconnect，继续收剩余流 |
| 3.4 | 并发 409 抢占 | 开两个 tab 同一 task 同时发 prompt | 第二个进 observe 模式；不会重复启动 |
| 3.5 | 5xx 自动重试 | （构造难）| 开发时 kill/restart 后端 → 前端应指数退避重试 |

### 排查
- 流式卡顿：Network EventStream tab 看原始 SSE 事件时序
- 重连失败：Console 看 `AcpStreamError`

---

## 4. P4 — Agent Phase 指示器

输入框上方的 `AgentStatusIndicator`，5 种 phase：

| # | Phase | 触发 | 预期图标 + 文案 |
|---|---|---|---|
| 4.1 | `preparing` | prompt 刚发送 | 🚀 蓝色「准备中...」 |
| 4.2 | `model_responding` | 模型吐字 | ✨ 紫色「模型响应中...」 |
| 4.3 | `tool_executing` (Bash) | `run bash: ls` | 🔨 橙色「执行 Bash 中...」 |
| 4.4 | `tool_executing` (Task) | `use Task tool ...` | 🔨 橙色「执行 Task 中...」 |
| 4.5 | `compacting` | 非常长的对话（难触发） | 📦 灰色「正在压缩上下文...」 |
| 4.6 | `idle` | turn 完成 | **指示器消失**，不残留 |
| 4.7 | turn 切换复位 | 连续发 2 条消息 | 第 2 条不会残留第 1 条的「执行 XX 中」 |

### 排查
- 指示器不出现：Network 查是否有 `sessionUpdate:"agent_phase"` 事件
- 残留不消失：`useChatStream.exitStreaming` 的 `setAgentPhase(IDLE_PHASE)` 是否被调用

---

## 5. P6 — 工具渲染注册表

### 5.1 专属渲染器

| # | 工具 | 触发 prompt | 预期 |
|---|---|---|---|
| 5.1.1 | **Bash** | `run bash: ls /tmp` | `$ ls /tmp` 终端风格，输出等宽字体 |
| 5.1.2 | **Read** | `read /tmp/sample.ts` | 路径 + offset/limit 标签；代码按扩展名语法高亮 |
| 5.1.3 | **Write** | `write /tmp/hello.ts with console.log("hi")` | 路径 + 完整内容 + TypeScript 语法高亮 |
| 5.1.4 | **Edit** | `edit /tmp/sample.ts to change "foo" to "bar"` | **git-diff-view 双栏红绿 diff**（关键特性） |
| 5.1.5 | **Grep** | `grep "agent" in packages/shared` | 查询 pattern + 匹配行数 |
| 5.1.6 | **Glob** | `glob "**/*.ts"` | pattern + 文件数量 |
| 5.1.7 | **WebFetch** | `fetch https://example.com` | URL + 标题 |
| 5.1.8 | **WebSearch** | `search for "typescript 5.5 news"` | 查询词 + 结果列表 |
| 5.1.9 | **TodoWrite** | `create a todo list with 3 items` | ☐/☑ 勾选列表样式 |
| 5.1.10 | **Task** | 见 P7 用例 | 紫色 SubagentCard（不走普通渲染器） |

### 5.2 通用行为

| # | 用例 | 触发 | 预期 |
|---|---|---|---|
| 5.2.1 | MCP 前缀剥离 | 任意 `mcp__cloudbase__xxx` 工具 | 卡片标题显示 `xxx`，不是 `mcp__cloudbase__xxx` |
| 5.2.2 | 未注册工具 fallback | 非标工具 | 走 `default.tsx`，不崩溃 |
| 5.2.3 | 执行中 pending 态 | 长任务 | 左侧旋转 loader |
| 5.2.4 | 失败态 | 故意让工具出错 | 红色边框 |
| 5.2.5 | 折叠/展开 | 点卡片头部 | toggle 展开收起 |

### 5.3 Dev 预览页

- 浏览器打开：`http://localhost:5174/__preview/tool-renderers`
- 预期：一页列出所有渲染器样本（开发用，不影响生产）

---

## 6. P7 — Subagent 嵌套

| # | 用例 | 触发 prompt | 预期 |
|---|---|---|---|
| 6.1 | 单层嵌套 | `Use Task tool to spawn a subagent that runs bash: echo hi` | 紫 SubagentCard，展开后 1 个 Bash 子卡片 |
| 6.2 | 并行子工具 | `Use Task tool to spawn ONE subagent. Ask it to run echo apple AND echo banana in two separate Bash calls` | 紫 SubagentCard 内 2 个 Bash 并排 |
| 6.3 | 执行中默认展开 | 长 subagent 任务 | 运行时自动展开，完成后自动折叠 |
| 6.4 | 折叠/展开 | 点紫色头部 | toggle |
| 6.5 | 失败态 | 故意让子工具失败 | 红色边框 |
| 6.6 | 子工具计数 | 观察头部 | `· N tools` 文字 |
| 6.7 | 自引用防御 | 任意 Task 调用 | Task 自己 result 不会被误当作自己的子部件（不会产生空子卡片） |
| 6.8 | 三层嵌套 | `Use Task tool. In its prompt, tell subagent it MUST itself call Task tool to spawn nested sub-subagent running bash: echo deep` | 🟡 模型常偷懒不会主动嵌套；若真嵌套，外层紫卡展开后**内层也是紫卡**而非灰卡 |

### 排查
- 子工具消失：React DevTools 看 `agentMessage.parts`，确认 `parentToolCallId` 字段存在
- 三层丢失：`subagent-card.tsx:140` 的 `tc.toolName === 'Task'` 递归分支是否命中

---

## 7. 综合用例（覆盖多 Phase）

### 用例 A：极端综合回归

**Prompt**：
```
Investigate the project structure first (don't write code).
Use Task tool to spawn a general-purpose subagent, which should:
  1. Glob for all .ts files in packages/shared
  2. Read the first file it finds
  3. Run bash: wc -l on that file
Then report findings.
```

**应覆盖**：
- ✅ P4：`preparing → model_responding → tool_executing(Task) → tool_executing(Bash) → idle`
- ✅ P7：紫 SubagentCard，内含 3 个子工具（Glob / Read / Bash）
- ✅ P6：每个子工具用各自的专属渲染器
- ✅ P2（可能）：若触发 ExitPlanMode → Plan 卡片

### 用例 B：白名单 + Plan 组合

1. 进入 Plan 模式（自发）
2. 批准开始编码
3. 连续让模型创建 3 个云函数
4. 第 1 次点「总是允许」
5. 观察：第 2、3 次**不再弹确认**

### 用例 C：流式 + 取消 + 重连

1. 发一个需 1 分钟以上的长任务
2. 10 秒后点「停止」
3. 再发一条短 prompt → 预期正常
4. 长任务途中刷新浏览器 → 预期自动 reconnect 继续流

---

## 8. 容易退化的位置（重点观察）

1. **流式字符拼接**：发长 prompt，中间字是否**丢失或错位**
2. **工具状态切换**：`pending → completed` / `pending → failed`，边框颜色是否正确变
3. **AskUserQuestion 提交**：提交后 input 是否被锁，回答后能否正常继续
4. **长对话滚动**：多轮后新消息是否自动滚到底
5. **切 tab 回来**：task 切走再切回，状态是否丢失
6. **Plan 内容乱序**：极端网络抖动下 `toolConfirmation.planContent` 是否还能渲染

---

## 9. 排查工具箱

### 9.1 Network 面板
- 过滤 `acp` → 查看 SSE 流
- EventStream tab 看原始 JSON-RPC 事件
- 对比事件类型：`tool_call` / `tool_call_update` / `tool_result` / `agent_phase` / `tool_confirm`

### 9.2 React DevTools
- 找到 `TaskChat` 组件
- 检查 `agentMessage.parts` / `agentPhase` / `planMode` state
- 复制 JSON 到文本文件可方便 diff

### 9.3 Console
- 看 warning/error
- 特别关注 `AcpStreamError` / `Parent not found` 等前端自有 warn

### 9.4 服务端日志
- 查看 terminal 里 tsx watch 的输出
- 留意 `SessionPermissionsManager` 相关日志

---

## 10. 检查清单（打勾用）

```
P1 权限白名单
[ ] 1.1 首次写工具弹审批
[ ] 1.2 允许一次
[ ] 1.3 总是允许
[ ] 1.4 白名单命中
[ ] 1.5 拒绝

P2 Plan 模式
[ ] 2.1 模型自发进 Plan
[ ] 2.2 Plan 内容 Markdown
[ ] 2.3 开始编码
[ ] 2.4 继续规划
[ ] 2.5 退出 Plan

P3 AcpClient
[ ] 3.1 流式吐字
[ ] 3.2 取消
[ ] 3.3 断线重连
[ ] 3.4 并发 409 抢占

P4 Agent Phase
[ ] 4.1 preparing
[ ] 4.2 model_responding
[ ] 4.3 tool_executing(Bash)
[ ] 4.4 tool_executing(Task)
[ ] 4.6 idle 不残留
[ ] 4.7 turn 切换复位

P6 工具渲染
[ ] 5.1.1 Bash
[ ] 5.1.2 Read
[ ] 5.1.3 Write 语法高亮
[ ] 5.1.4 Edit git-diff-view
[ ] 5.1.5 Grep
[ ] 5.1.6 Glob
[ ] 5.1.9 TodoWrite
[ ] 5.2.1 MCP 前缀剥离
[ ] 5.3   dev 预览页全覆盖

P7 Subagent
[ ] 6.1 单层嵌套
[ ] 6.2 并行子工具
[ ] 6.3 执行中默认展开
[ ] 6.4 折叠/展开
[ ] 6.7 自引用防御

综合
[ ] A 极端综合回归
[ ] B 白名单 + Plan
[ ] C 流式 + 取消 + 重连
```

---

## 11. 发现问题后

1. **截图 + 描述**：把现象、预期、实际写清楚
2. **附 SSE 日志**：Network → 对应 SSE 流 → 右键 → Copy Response
3. **附 React state**：React DevTools → Copy props/state
4. **本地复现 prompt**：把诱导的完整 prompt 贴进来
5. **提 Issue** 或直接记到 `docs/REFACTOR-PLAN.md` 的「已知问题」小节

---

## 维护

- 每新增一个 Phase / 重大 feature，同步到本文件
- 每发现一个用户回归 bug，追加到对应 phase 小节下
- 清单过长后，用 `grep -c '\[ \]'` 估算剩余项数
