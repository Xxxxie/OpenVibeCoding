# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- **Agent 统一选择器**：合并静态 CodeBuddy 标签和 runtime 选择器为统一 Agent `<Select>`，支持 CodeBuddy / OpenCode / MiMo 三个 agent 切换
- **Per-Agent 模型选择**：每个 agent 独立模型列表，切换 agent 时自动校验 selectedModel，不存在则选列表第一个
- **MiMo 模型集成**：新增 MiMo（小米）provider 配置，支持 mimo-v2.5-pro（含图片理解）、mimo-v2.5、TTS 系列模型
- **项目级配置隔离**：OpenCode tool 安装目录改为项目级 `.opencode/tools/`，spawn 时注入 `OPENCODE_CONFIG_DIR`
- **ACP runtime 返回模型列表**：`GET /api/agent/runtimes` 每个 runtime 新增 `models` 数组
- **图片输入支持**：全栈支持多模态图片输入
- **CloudBase MCP 集成**：全局 CloudBase MCP HTTP server，复用 Express 端口，零额外 TCP 开销；支持 stdio 和 HTTP 两种模式
- **预览错误自动修复**：preview 错误时自动触发修复流程
- **stopReason 友好提示**：refusal/max_tokens 时注入用户可读的友好提示
- **SSE stopReason 透传**：透传真实 stopReason 到 SSE 终结报文
- **暂停图标**：SSE stream 中止但仍有 pending loading 状态时显示 paused 图标

### Fixed

- **ACP 完成后发送按钮卡住**：SSE `[DONE]` 后未更新 `task.status`，现已在流结束时更新为 `done` 或 `error`
- **SSE 寿命跟随 agent 寿命**：去掉 10/30 分钟硬超时，避免长任务被强制中断
- **SDK 空响应无限循环**（patch）：GLM 模型在 tool_result 后返回空 end_turn 导致 SDK agent loop 无限空转；新增 `_emptyResponseCount` 熔断器，连续 3 次空响应后强制完成
- **Server auto-resume 空轮检测**：连续 2 次 dry resume（无内容产出）后立即停止，避免浪费模型调用
- **ExecutionError 不再被吞**：按 stopReason='error' 正确收尾
- **askAnswers/toolConfirmation 路由修复**：必须路由到 runtime.chatStream resume 分支
- **MCP CloudBase 认证修复**：改用当前登录用户 apiKey，sessionJwe 鉴权复用
- **ERR_HTTP_HEADERS_SENT**：用 x-hono-already-sent 防止重复发送
- **archiveToGit 修复**：移到 finally 块，error/cancel 场景也归档
- **生产镜像修复**：移除已迁移目录的 cp 步骤 + 拷贝 .opencode/
- **文件浏览器 Cmd+C 冲突**：全局快捷键不再拦截用户已选中文本的复制操作

### Changed

- **`CODING_AGENTS` 静态列表**：前端静态 agent 列表 + 后端 availability check 驱动 disabled 状态
- **多 agent 共享 runtime**：`opencode` 和 `mimo` 均映射 `opencode-acp` runtime
- **tool overrides 迁移**：移至 `.opencode/tools/`，简化 installer

## [0.1.0] - 2026-04-10

### Added

- OpenCode ACP Runtime 集成（IAgentRuntime 抽象 + 沙箱隔离 + 多轮记忆 + 持久化）
- 前端 Runtime 选择器 UI
- human-in-loop 支持（ToolConfirm + AskUserQuestion）
- 消息持久化与多轮记忆
- vitest 单元测试（27 个）
