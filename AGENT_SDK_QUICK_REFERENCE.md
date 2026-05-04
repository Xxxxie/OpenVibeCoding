# @tencent-ai/agent-sdk 快速参考表

## 核心 API 速查

### query() 参数详解

```typescript
query({
  prompt: string,              // 用户输入
  options: {
    model: string,             // 'glm-5.1' | 'kimi-k2.6' | 'minimax-m2.7' 等
    permissionMode: string,    // 'bypassPermissions' | 'plan'
    cwd: string,               // 本地工作目录
    maxTurns: number,          // 默认 500
    resume?: string,           // 会话 ID（恢复历史时使用）
    persistSession?: boolean,   // 新会话时为 true
    sessionId: string,         // 唯一会话标识
    includePartialMessages: boolean,  // true 时流式输出
    systemPrompt: {
      append?: string          // 追加系统提示词
    },
    mcpServers?: {
      [key: string]: McpServer  // MCP 工具服务
    },
    canUseTool?: (name, input, options) => {
      behavior: 'allow' | 'deny' | 'block'
      interrupt?: boolean
      message?: string
    },
    hooks?: {
      PreToolUse: Array<{
        matcher: string  // 正则，如 '^mcp__'
        hooks: Function[]
      }>
    },
    env?: Record<string, string>,  // 传给 CLI 的环境变量
    disallowedTools?: string[],    // 禁用的工具
  }
})
```

### 消息循环类型

```typescript
for await (const message of q) {
  // message.type:
  // - 'system'       → { session_id: string }
  // - 'stream_event' → { event: { type, content_block?, delta? } }
  // - 'user'         → { message: { content: ContentBlock[] } }
  // - 'assistant'    → { message: { content: ContentBlock[] } }
  // - 'error'        → { error: string }
  // - 'result'       → { subtype: string, duration_ms: number }
}
```

---

## 文件映射表

### SDK 调用 ↔ 项目文件

| 功能 | SDK 方法 | 项目文件 | 关键代码行 |
|-----|---------|--------|----------|
| **Agent 启动** | `query()` | cloudbase-agent.service.ts | L1429 |
| **消息转换** | callback → message | cloudbase-agent.service.ts | L420-522 |
| **权限检查** | `canUseTool()` | cloudbase-agent.service.ts | L1195-1321 |
| **MCP 集成** | `mcpServers` 参数 | cloudbase-agent.service.ts | L1155-1157 |
| **工具拦截** | patch: tool override | tool-override.ts | envVar 注入 |
| **会话恢复** | `resume` 参数 | persistence.service.ts | restoreMessages() |
| **事件缓冲** | 回调集聚 | event-buffer.ts | pushAndGetSeq() |
| **SSE 转换** | ExtendedSessionUpdate | acp.ts | L462-622 |

---

## Patch 拦截点汇总

### 三个环境变量钩子

| 环境变量 | 目标类 | 拦截方法 | 用途 |
|---------|--------|---------|------|
| `CODEBUDDY_TOOL_OVERRIDE` | ToolManager | `overrideTools(toolMap)` | 工具重定向到沙箱 |
| `CODEBUDDY_SKILL_LOADER_OVERRIDE` | SkillLoader | `loadSkills() / scanSkillsDirectory() / parseSkillFile()` | 扫描项目/用户技能 |
| `CODEBUDDY_SESSION_STORE_OVERRIDE` | SessionStore | `overrideSessionStore(prototype)` | 自定义会话持久化 |

### Patch 文件
- 路径: `/patches/@tencent-ai__agent-sdk@0.3.68.patch`
- 大小: 85 行
- 应用: pnpm install 时自动应用（via patch-package）

---

## 消息类型对应表

### SDK 回调 → ACP sessionUpdate 映射

```
AgentCallbackMessage (SDK)           ExtendedSessionUpdate (ACP)
├─ { type: 'text' }                 → sessionUpdate: 'agent_message_chunk'
├─ { type: 'thinking' }             → sessionUpdate: 'thinking'
├─ { type: 'tool_use' }             → sessionUpdate: 'tool_call'
├─ { type: 'tool_input_update' }    → sessionUpdate: 'tool_call_update'
├─ { type: 'tool_result' }          → sessionUpdate: 'tool_call_update'
├─ { type: 'error' }                → sessionUpdate: 'log' (level: error)
├─ { type: 'artifact' }             → sessionUpdate: 'artifact'
├─ { type: 'ask_user' }             → sessionUpdate: 'ask_user'
├─ { type: 'tool_confirm' }         → sessionUpdate: 'tool_confirm'
└─ { type: 'agent_phase' }          → sessionUpdate: 'agent_phase'
```

---

## 权限决策流程图

```
Agent 调用工具 (toolName, input)
  ↓
① canUseTool() 同步检查
  ├─ 返回 allow → 继续执行
  ├─ 返回 deny/block + interrupt=true → 中断, emit tool_confirm
  └─ 返回 deny/block + interrupt=false → 拒绝
  ↓
② Resume 场景：用户确认后
  ├─ action='allow' → 执行
  ├─ action='allow_always' → 写白名单 + 执行
  ├─ action='deny' → 拒绝
  └─ action='reject_and_exit_plan' → 允许本次 + 退出 plan 模式
  ↓
③ PreToolUse Hook (MCP 工具)
  └─ 返回 {continue: true/false} → 最终决策
```

---

## WRITE_TOOLS 清单

需要确认的写操作工具集合（8 个）:

```
writeNoSqlDatabaseStructure  ← 修改 NoSQL 结构
writeNoSqlDatabaseContent    ← 修改 NoSQL 数据
executeWriteSQL              ← 执行 SQL 写入
modifyDataModel              ← 修改数据模型
createFunction               ← 创建云函数
updateFunctionCode           ← 更新函数代码
updateFunctionConfig         ← 更新函数配置
invokeFunction               ← 调用云函数
```

---

## SDK 版本与兼容性

| 维度 | 值 |
|-----|-----|
| 当前版本 | 0.3.68 |
| package.json 位置 | packages/server/package.json L26 |
| 依赖列表 | `@tencent-ai/agent-sdk: 0.3.68` |
| Node 版本要求 | >= 18 (推荐 22) |

---

## 故障排查速查表

| 问题 | 症状 | 检查点 |
|-----|------|--------|
| Agent 启动失败 | query() throw 异常 | 检查 model ID、cwd、permissions |
| 消息不同步 | SSE 流无响应 | 检查 eventBuffer.flush() 是否调用 |
| 工具执行超时 | tool 卡住 | 检查 ITERATION_TIMEOUT_MS (2min) |
| 会话 resume 失败 | "already running" | 检查 isAgentRunning() 状态 |
| 权限中断无反馈 | tool_confirm 未发出 | 检查 wrappedCallback 是否绑定 |
| MCP 工具不可用 | "Tool not found" | 检查 sandboxMcpClient 是否初始化 |
| Patch 未加载 | tool override 无效 | 运行 `pnpm install` 重新应用补丁 |

---

## 关键常量

```typescript
// 模型
DEFAULT_MODEL = 'glm-5.1'

// 超时
CONNECT_TIMEOUT_MS = 60_000         // 连接超时
ITERATION_TIMEOUT_MS = 2 * 60 * 1000  // 迭代超时
HEALTH_INTERVAL_MS = 2000            // 沙箱健康检查间隔

// 事件缓冲
MAX_BUFFER_SIZE = 10                 // 缓冲区大小
FLUSH_INTERVAL_MS = 500              // 自动 flush 间隔

// 权限
WRITE_TOOLS = Set(8)                 // 需确认的写工具

// Milestone 事件（触发立即 flush）
MILESTONE_SESSION_UPDATES = [
  'tool_call',
  'tool_call_update',
  'ask_user',
  'tool_confirm',
  'artifact'
]
```

---

## 导入路径

```typescript
// ✓ 正确
import { query, ExecutionError } from '@tencent-ai/agent-sdk'
import { CloudbaseAgentService } from '../agent/cloudbase-agent.service'
import { persistenceService } from '../agent/persistence.service'

// ✗ 错误（不存在的 export）
import { Agent, createAgent } from '@tencent-ai/agent-sdk'  // NOT exported
```

---

## 环境变量清单

项目传给 SDK CLI 的所有环境变量:

```typescript
envVars = {
  // 认证
  CODEBUDDY_API_KEY: string,           // API Key 模式
  CODEBUDDY_AUTH_TOKEN: string,        // OAuth token 模式
  CODEBUDDY_INTERNET_ENVIRONMENT?: string,  // 网络环境

  // 工具拦截
  CODEBUDDY_TOOL_OVERRIDE: string,     // 工具 override 模块路径
  CODEBUDDY_TOOL_OVERRIDE_CONFIG: string,  // 工具配置 (JSON)

  // 技能加载
  CODEBUDDY_SKILL_LOADER_OVERRIDE: string,  // 技能加载 override 模块路径
  CODEBUDDY_SANDBOX_CWD?: string,      // 沙箱工作目录
  // CODEBUDDY_BUNDLED_SKILLS_DIR: string,  // 捆绑技能目录 (注释)

  // 会话存储
  CODEBUDDY_SESSION_STORE_OVERRIDE?: string,  // 会话存储 override (未使用)
}
```

