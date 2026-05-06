# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- **Agent 统一选择器**：合并静态 CodeBuddy 标签和 runtime 选择器为统一 Agent `<Select>`，支持 CodeBuddy / OpenCode / MiMo 三个 agent 切换
- **Per-Agent 模型选择**：每个 agent 独立模型列表，切换 agent 时自动校验 selectedModel，不存在则选列表第一个
- **MiMo 模型集成**：新增 MiMo（小米）provider 配置（`.opencode/opencode.json`），支持 mimo-v2.5-pro（含图片理解）、mimo-v2.5、TTS 系列模型，API Key 通过 `{env:MIMO_API_KEY}` 注入
- **MiMo Logo**：新增 MiMo 品牌 PNG 和 logo 组件，模型选择器中显示 MiMo provider 图标
- **项目级配置隔离**：OpenCode tool 安装目录从全局 `~/.config/opencode/tools/` 改为项目级 `.opencode/tools/`，spawn 时注入 `OPENCODE_CONFIG_DIR` 与用户全局配置隔离
- **`resolveProjectRoot()`**：自动检测 monorepo 根目录，支持 `OPENCODE_PROJECT_ROOT` env override
- **ACP runtime 返回模型列表**：`GET /api/agent/runtimes` 每个 runtime 新增 `models` 数组

### Fixed

- **ACP 完成后发送按钮卡住**：`observeStreamWithLiveCallback` 在 SSE `[DONE]` 后未更新 `task.status`，导致前端 `isAgentBusy` 始终为 true。现已在流结束时将 status 更新为 `done` 或 `error`

### Changed

- **`CODING_AGENTS` 静态列表**：采用 Method B，前端静态 agent 列表 + 后端 availability check 驱动 disabled 状态
- **多 agent 共享 runtime**：`opencode` 和 `mimo` 均映射 `opencode-acp` runtime，模型列表共享
- **`.gitignore`**：新增 `.opencode/tools/`（生成物不提交）
- **`.env.example`**：新增 `MIMO_API_KEY` 占位

## [0.1.0] - 2026-04-10

### Added

- OpenCode ACP Runtime 集成（IAgentRuntime 抽象 + 沙箱隔离 + 多轮记忆 + 持久化）
- 前端 Runtime 选择器 UI
- human-in-loop 支持（ToolConfirm + AskUserQuestion）
- 消息持久化与多轮记忆
- vitest 单元测试（27 个）
