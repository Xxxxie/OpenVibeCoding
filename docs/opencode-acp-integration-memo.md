# OpenCode ACP Integration Memo

> Source: `sst/opencode` @ branch `dev` (commit captured 2026-05-01).
> Inspection scope: `packages/opencode/src/acp/**`, `packages/opencode/src/cli/cmd/acp.ts`, supporting server / tool / permission modules. File and line citations below are against that branch.
>
> **TL;DR**: OpenCode's `acp` command is **not** a thin ACP agent that delegates I/O to the client. It boots the full OpenCode runtime (HTTP server + internal tool registry + filesystem + shell) inside the same process and exposes a JSON-RPC façade over stdio. Builtin tools (`read`, `write`, `edit`, `bash`, `grep`, `glob`, `webfetch`, …) execute locally against the *agent's* filesystem/shell. The ACP `connection.*` callbacks are used only for **presentation** (streaming `session/update` notifications, `session/request_permission`), and — in one narrow case — `fs/write_text_file` is called to push the post-approval edit back to the editor. `fs/read_text_file`, `terminal/*`, `fs/write_text_file` for arbitrary tool writes are **not** consumed.

---

## 1. 启动与传输

| Item | Value | Source |
| --- | --- | --- |
| CLI entry | `opencode acp` (registered via yargs `cmd`) | `packages/opencode/src/cli/cmd/acp.ts:12-21` |
| Working directory flag | `--cwd` (defaults to `process.cwd()`) | `packages/opencode/src/cli/cmd/acp.ts:16-20` |
| Transport | NDJSON over stdio (`ndJsonStream` from `@agentclientprotocol/sdk`). **Not** LSP-style `Content-Length` framing. | `packages/opencode/src/cli/cmd/acp.ts:4, 55` |
| Stream wiring | `process.stdout` → `WritableStream`, `process.stdin` → `ReadableStream`, glued via `ndJsonStream`, then an `AgentSideConnection` is constructed | `packages/opencode/src/cli/cmd/acp.ts:32-60` |
| Lifecycle | Blocks on `process.stdin` `end`/`error`; no heartbeat/reconnect logic | `packages/opencode/src/cli/cmd/acp.ts:63-67` |
| Sidecar HTTP server | `Server.listen()` is started **inside the acp process** at `127.0.0.1:<random port>` (port 0) *before* stdio transport is wired; `createOpencodeClient` is then used by the ACP agent to talk to itself via localhost HTTP. | `packages/opencode/src/cli/cmd/acp.ts:24-30`, `packages/opencode/src/cli/network.ts:6-15, 44-62` |
| Server auth | HTTP Basic via `OPENCODE_SERVER_USERNAME` / `OPENCODE_SERVER_PASSWORD`. In ACP mode the env var isn't set so auth is effectively off (loopback only). | `packages/opencode/src/server/middleware.ts` (AuthMiddleware) |
| Env switch | `process.env.OPENCODE_CLIENT = "acp"` is set before bootstrap — gates feature flags elsewhere (e.g. `QuestionTool`, see §5.2). | `packages/opencode/src/cli/cmd/acp.ts:23` |

**Error handling**: per-method `.catch()` logs errors via `@opencode-ai/core/util/log`; no protocol-level reconnect. `SIGTERM/SIGINT` graceful shutdown mentioned in the README (`packages/opencode/src/acp/README.md`) is **not present** in today's code (README references a `server.ts` that no longer exists — see §9).

---

## 2. 依赖 SDK / 协议版本

| Item | Value | Source |
| --- | --- | --- |
| SDK | `@agentclientprotocol/sdk@0.16.1` | `packages/opencode/package.json` (dependencies) |
| Reported `protocolVersion` | `1` (advertised in `initialize` response) | `packages/opencode/src/acp/agent.ts:554-555` |
| OpenCode itself version | 1.14.31 (at current HEAD of `dev`) | `packages/opencode/package.json` (version) |
| ACP agent exported name | `{ name: "OpenCode", version: InstallationVersion }` | `packages/opencode/src/acp/agent.ts:573-576` |

---

## 3. Agent-side 方法实现（OpenCode 作为 agent 响应）

Implemented in `class Agent implements ACPAgent` — `packages/opencode/src/acp/agent.ts:140-1548`.

| ACP method | Handler | File:line | Notes |
| --- | --- | --- | --- |
| `initialize` | `initialize()` | `packages/opencode/src/acp/agent.ts:534-578` | Returns `protocolVersion: 1`, advertises capabilities (below), one `authMethod` (`id: "opencode-login"`), `agentInfo: { name: "OpenCode", version }`. **Note**: `clientCapabilities` from the request is *not* stored on `this` — see §9 limitation. |
| `authenticate` | `authenticate()` | `packages/opencode/src/acp/agent.ts:580-582` | **Throws** `"Authentication not implemented"` — despite advertising `opencode-login`. See issue #24846. |
| `session/new` | `newSession()` | `packages/opencode/src/acp/agent.ts:584-617` | Calls `sdk.session.create` over the internal HTTP server; registers MCP servers; returns `sessionId`, `models`, `modes`, `configOptions`, `_meta` |
| `session/load` | `loadSession()` | `packages/opencode/src/acp/agent.ts:619-687` | Fetches stored messages and **replays full history** via `processMessage()` as `session/update` notifications; updates usage. |
| `session/list` | `listSessions()` | `packages/opencode/src/acp/agent.ts:689-732` | Cursor based (`time.updated`), page size 100. |
| `session/fork` (`unstable_forkSession`) | `unstable_forkSession()` | `packages/opencode/src/acp/agent.ts:734-797` | Forks upstream session; replays history. |
| `session/resume` (`unstable_resumeSession`) | `unstable_resumeSession()` | `packages/opencode/src/acp/agent.ts:799-828` | No replay — just re-registers session + sends usage. |
| `session/set_model` (`unstable_setSessionModel`) | `unstable_setSessionModel()` | `packages/opencode/src/acp/agent.ts:1286-1306` | Parses `provider/model[/variant]`. |
| `session/set_mode` | `setSessionMode()` | `packages/opencode/src/acp/agent.ts:1308-1315` | Backed by OpenCode "agents" (the TUI's agent *modes*, not sub-agents). |
| `session/set_config_option` | `setSessionConfigOption()` | `packages/opencode/src/acp/agent.ts:1317-1353` | Supports `configId ∈ {"model","mode"}`. |
| `session/prompt` | `prompt()` | `packages/opencode/src/acp/agent.ts:1355-1536` | Main entry point. Normalises ACP content blocks (`text`/`image`/`resource_link`/`resource`) → internal parts, intercepts slash commands (`/compact` handled natively; other `/<cmd>` dispatched to `sdk.session.command`), else calls `sdk.session.prompt`. Returns `{ stopReason: "end_turn", usage, _meta }`. |
| `session/cancel` | `cancel()` | `packages/opencode/src/acp/agent.ts:1538-1547` | Calls `sdk.session.abort`. |

### Advertised `agentCapabilities`

```ts
{
  loadSession: true,
  mcpCapabilities: { http: true, sse: true },
  promptCapabilities: { embeddedContext: true, image: true },
  sessionCapabilities: { fork: {}, list: {}, resume: {} },
}
```
Source: `packages/opencode/src/acp/agent.ts:556-571`.

**Not advertised**: streaming audio, tool call authorisation (`toolCallAuth`), and the experimental per-message `configOptions` etc. Check the SDK version `0.16.1` for the authoritative Capability schema.

---

## 4. Client-side 方法调用（OpenCode → client 请求）⭐

This is the **most important section for integration planning**. Searching `packages/opencode/src/acp/agent.ts` for every `this.connection.*` call:

| ACP client method | How often / what triggers it | File:line |
| --- | --- | --- |
| `session/update` (notification) | High-volume stream. Used for `tool_call`, `tool_call_update`, `agent_message_chunk`, `agent_thought_chunk`, `user_message_chunk`, `plan`, `usage_update`, `available_commands_update`. Pushed from two sources: (a) real-time events from OpenCode's internal Bus (`message.part.updated`, `message.part.delta`) in `handleEvent()`; (b) replay in `processMessage()` during `session/load` / `session/fork`. | `agent.ts:117-129` (usage), `agent.ts:273-530` (live events), `agent.ts:830-1106` (replay), `agent.ts:1119-1134` (`tool_call` pending), `agent.ts:1256-1264` (commands update) |
| `session/request_permission` | When OpenCode's internal `Permission.ask()` is triggered by a tool (see §6) the bus fires `permission.asked`; the ACP handler forwards it. | `agent.ts:192-270` (especially `agent.ts:202-213`) |
| `fs/write_text_file` | **Only one call site.** After the user approves an `edit` permission, OpenCode applies the diff itself and pushes the resulting content to the client (so the editor can refresh open buffers). This is a cosmetic re-sync, **not the actual file write** — the file is already written via Node `fs` by the time this fires. | `agent.ts:239-253` |
| `fs/read_text_file` | **Not called anywhere.** `ReadTool` reads through `AppFileSystem.Service` → Node streams (`createReadStream`). Confirmed by reading `packages/opencode/src/tool/read.ts`. | — (absent) |
| `terminal/create`, `terminal/output`, `terminal/wait_for_exit`, `terminal/kill`, `terminal/release` | **Not called anywhere.** `BashTool` spawns a local child process via Effect's `ChildProcess.make` (shell, stdin ignored, stdout/stderr captured as streams). No PTY, no ACP terminal capability consumed. | — (absent; `packages/opencode/src/tool/bash.ts`) |

> **Key implication for integrators**: If your goal is to let the ACP client enforce filesystem boundaries (the stated motivation for ACP's `fs/*` and `terminal/*` methods — "Client runs tools, agent only decides"), **OpenCode does not do that**. A sandbox around OpenCode must be imposed externally (container, worktree confinement at the filesystem layer, `--cwd`).

Grep confirmation (from a local clone of the file):

```
$ grep -nE "connection\.(readTextFile|writeTextFile|createTerminal|terminal|requestPermission)" agent.ts
247:                void this.connection.writeTextFile({
```

(No hits for terminal or readTextFile.)

---

## 5. 工具执行路径（内置工具 → ACP 回调 真实映射）⭐

### 5.1 How a tool call flows in ACP mode

```
ACP client ──(session/prompt)──► Agent.prompt()
                                        │
                                        ▼
                         sdk.session.prompt(...)  [HTTP → loopback]
                                        │
                                        ▼
                        OpenCode server → internal session loop
                                        │
                                        ▼
                    Tool executed via ToolRegistry (read / write / bash / …)
                                        │  (uses Node fs, child_process, ripgrep, …)
                                        ▼
                    Bus events: message.part.updated / delta / permission.asked
                                        │
                                        ▼
                Agent.handleEvent() subscribes via sdk.global.event (SSE stream)
                                        │
                                        ▼
                connection.sessionUpdate(...) / connection.requestPermission(...)
                                        │
                                        ▼
                                   ACP client
```

Key source references:
- Event pump: `packages/opencode/src/acp/agent.ts:164-188` (`runEventSubscription()` calling `sdk.global.event({ signal })`).
- Session.prompt: `packages/opencode/src/acp/agent.ts:1471-1482`.
- Tool registry wiring: `packages/opencode/src/tool/registry.ts:98-200` (all builtins are instantiated and executed in-process).
- `ReadTool` uses `AppFileSystem.Service` + `createReadStream` locally — `packages/opencode/src/tool/read.ts` (confirmed: *no* ACP callback).
- `WriteTool` uses `fs.writeWithDirs` locally — `packages/opencode/src/tool/write.ts` (confirmed).
- `BashTool` uses `effect/unstable/process/ChildProcess.make` — `packages/opencode/src/tool/bash.ts` (confirmed: local `ChildProcess`, no PTY, no ACP terminal).

### 5.2 Tool registry details

All built-in tools are always enabled (modulo agent-mode filtering) — `packages/opencode/src/tool/registry.ts:184-200`:

```
invalid, bash, read, glob, grep, edit, write, task, fetch (webfetch),
todo, search (websearch), skill, patch (apply_patch), question, lsp, plan
```

**QuestionTool opt-in for ACP**: gated by
```ts
const questionEnabled = ["app","cli","desktop"].includes(Flag.OPENCODE_CLIENT) || Flag.OPENCODE_ENABLE_QUESTION_TOOL
```
Source: `packages/opencode/src/tool/registry.ts:181-182`. Because `acp.ts` sets `OPENCODE_CLIENT=acp`, the tool is **disabled by default**. Set `OPENCODE_ENABLE_QUESTION_TOOL=1` to enable (confirmed by `packages/opencode/src/acp/README.md`).

### 5.3 ACP-facing tool representation

Tool calls are **reported** to the client via `session/update` events with `sessionUpdate: "tool_call" | "tool_call_update"`. Tool output → `ToolCallContent` blocks (`type: "content"` with text, `type: "diff"` for edits). Mapping from internal tool name → ACP `ToolKind`:

| OpenCode tool | ACP kind | Location hint (`locations[]`) |
| --- | --- | --- |
| `bash` | `execute` | `[]` |
| `webfetch` | `fetch` | n/a |
| `edit`, `patch`, `write` | `edit` | `filePath` |
| `grep`, `glob`, `context7_*` | `search` | `path` |
| `read` | `read` | `filePath` |
| default | `other` | `[]` |

Source: `packages/opencode/src/acp/agent.ts:1550-1592`.

Special: `todowrite` tool output is additionally decoded and pushed as an ACP `plan` update — `packages/opencode/src/acp/agent.ts:375-400, 904-929`.

---

## 6. 权限模型

### Event plumbing

OpenCode has an internal `Permission` service (`packages/opencode/src/permission/index.ts`) that publishes two events on the in-process `Bus`:
- `permission.asked` — sent when a tool's `ctx.ask(...)` call cannot be resolved by the ruleset (no `allow` rule, no prior `always` approval).
- `permission.replied` — sent when `reply()` is called (including cascading `reject`/`always` replies within the same session).

The ACP event subscription handles `permission.asked` at `agent.ts:190-270`:
1. Serialises per-session via `this.permissionQueues` (a `Map<sessionID, Promise>`) so users aren't prompted for two things at once.
2. Calls `this.connection.requestPermission({ sessionId, toolCall: { toolCallId, title: permission.permission, rawInput: permission.metadata, kind, locations }, options: this.permissionOptions })`.
3. Translates the outcome back to OpenCode's `sdk.permission.reply` (`"once" | "always" | "reject"`).

### Which tools request permission

Inside tool implementations, each call site calls `ctx.ask(...)` with a permission name. From reading tool files and `permission/index.ts`:

- `edit`, `write`, `apply_patch` → permission name **`edit`** (grouped by `EDIT_TOOLS = ["edit","write","apply_patch"]` in permission/index).
- `bash` → permission name **`bash`** (request triggered from `tool/bash.ts`).
- `webfetch` → permission name **`webfetch`**.
- Other tools (`read`, `grep`, `glob`, `lsp`, `todo`, `task`, `plan`, `skill`, `question`, `websearch`) do **not** request permission in current code.
- MCP tools: permission name equals the tool id (generic fallback in `Permission.disabled()`).

### Permission options advertised

```ts
[
  { optionId: "once",   kind: "allow_once",   name: "Allow once" },
  { optionId: "always", kind: "allow_always", name: "Always allow" },
  { optionId: "reject", kind: "reject_once",  name: "Reject" },
]
```
Source: `packages/opencode/src/acp/agent.ts:150-154`.

### Configurable?

Yes — OpenCode's own `opencode.json` / config supports a `permission` ruleset (`Schema.Array(Rule)` in `permission/index.ts`) that evaluates `{ permission, pattern, action: "allow"|"deny"|"ask" }` against the tool call, **before** the ACP round-trip. If a pattern `allow`s, the client is never asked. If it `deny`s, the tool fails with `DeniedError`. See `permission/evaluate.ts` and `permission/arity.ts` (not read in full, but referenced from `index.ts`).

### Post-approval side effect (important)

After the user approves an `edit`, the agent re-reads the original file, applies the stored unified diff via `diff.applyPatch`, and pushes the result to the client via `connection.writeTextFile`. Source: `packages/opencode/src/acp/agent.ts:239-253`. **If the client supports `fs/write_text_file` this shows up as a duplicate write**; the real write will also happen inside `WriteTool`/`EditTool` through `AppFileSystem.Service`.

---

## 7. Session 管理

| Topic | Answer |
| --- | --- |
| ACP session registry | In-memory `Map<sessionId, ACPSessionState>` in `ACPSessionManager` (`packages/opencode/src/acp/session.ts:8-14`). One instance per `Agent`. |
| Backing store | `sdk.session.create` / `sdk.session.get` over the internal HTTP server (`packages/opencode/src/acp/session.ts:20-75`). The *actual* session persistence is OpenCode's own DB (SQLite / JSONL depending on build) — ACP just keeps a shallow in-mem map for CWD / MCP / model / variant / mode. |
| Multi-session per process | Yes — no `1:1` constraint. The ACP `Agent` instance holds all sessions. Event pump is a single loop shared by all sessions; events are dispatched by `part.sessionID`. |
| `session/load` | **Implemented** (`agent.ts:619-687`) — re-creates ACP state, replays the full message history as `session/update` notifications. README claims this is "basic support" / "doesn't restore actual conversation history", but the code does replay. |
| `session/list` | Implemented with cursor (`agent.ts:689-732`). |
| `session/fork` | Implemented as `unstable_forkSession` (`agent.ts:734-797`). Creates a divergent copy and replays history. |
| `session/resume` | Implemented as `unstable_resumeSession` (`agent.ts:799-828`). No replay. |
| `session/cancel` | Implemented (`agent.ts:1538-1547`) → `sdk.session.abort`. |
| Concurrent prompts in one session | `cancel` + permission queueing are the only concurrency controls; there's nothing preventing overlapping `prompt()` calls hitting `sdk.session.prompt` — OpenCode's server presumably serialises internally (not verified here). |

---

## 8. 配置 / 认证

### Config resolution

ACP mode **does** read OpenCode's configuration. `bootstrap(process.cwd(), ...)` in `acp.ts` initialises the full app runtime, which loads `opencode.json` / `.opencode/` config via `Config.Service`. Then `sdk.config.get({ directory })` is used at the per-request level so `--cwd` (or per-session `cwd`) picks up project-local config (`agent.ts:1601-1611`).

### Default model selection

`defaultModel()` at `packages/opencode/src/acp/agent.ts:1594-1654`:
1. If `ACPConfig.defaultModel` is set, use it. (It's never set — `ACP.init({ sdk })` at `acp.ts:56` passes no default.)
2. Read `config.model` from the resolved config.
3. Else enumerate `providers`, prefer `opencode` provider's `big-pickle`, else sort all models via `Provider.sort` and pick the first.
4. Fallback: `{ providerID: "opencode", modelID: "big-pickle" }`.

### Dynamic model / variant / mode switching

- Models: `session/set_model` (`setSessionModel`) — `agent.ts:1286-1306`. Accepts `"provider/model"` or `"provider/model/variant"`.
- Modes (OpenCode "agents"): `session/set_mode` — `agent.ts:1308-1315`. Validates against `AgentModule`'s list of non-hidden, non-subagent agents.
- `session/set_config_option` accepts `{ configId: "model" | "mode", value }` — `agent.ts:1317-1353`.
- Per-prompt `model` is **not** accepted as an ACP parameter; callers must call `session/set_model` before `session/prompt`. But `prompt()` does fall back to the session's current model (`agent.ts:1360-1364`).

### Authentication

- `initialize()` advertises one auth method `{ id: "opencode-login", ... }`, optionally with a `terminal-auth` `_meta` so clients can offer a CLI-launch button (`agent.ts:537-552`).
- `authenticate()` **throws `"Authentication not implemented"`** (`agent.ts:580-582`). This means ACP clients must either:
  - Rely on pre-existing OpenCode auth (user already ran `opencode auth login` locally so credentials exist under `~/.config/opencode`), OR
  - Ship API keys via env (`ANTHROPIC_API_KEY` etc.) at spawn time.
- Per-session `LoadAPIKeyError` is caught and converted to `RequestError.authRequired()` in `newSession`/`loadSession`/`forkSession`/`resumeSession` (`agent.ts:608-616`, `:678-686`, `:788-796`, `:819-827`).
- `OPENCODE_API_KEY` is **not referenced in the ACP code path** — it's an OpenCode Zen / "opencode" provider key, consumed by `Provider` modules. Standard AI-SDK env vars (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, …) work as usual because tools instantiate the AI SDK providers in-process.

### HTTP server auth (for the sidecar)

`OPENCODE_SERVER_PASSWORD` / `OPENCODE_SERVER_USERNAME` via Basic Auth. Unset by default → loopback only. See `packages/opencode/src/server/middleware.ts`.

---

## 9. 限制与已知问题

### From the in-repo README (`packages/opencode/src/acp/README.md`)

> The README is **stale**. It references `client.ts` and `server.ts`, which don't exist in the current `src/acp/` directory (only `agent.ts`, `session.ts`, `types.ts`, `README.md`). Treat the README as aspirational; trust `agent.ts` as ground truth.

Items the README lists as "Not Yet Implemented":
- Streaming responses → **Now implemented** (`message.part.delta` → `agent_message_chunk` / `agent_thought_chunk`).
- Tool call reporting → **Now implemented** (see §5.3).
- Session modes → **Now implemented** (`setSessionMode`).
- Terminal support → **Still not plumbed to ACP**; bash runs locally.
- Session persistence via `session/load` → **Implemented**, but tied to OpenCode's own storage.

### From GitHub issues / PRs (as of 2026-05-01, ranked by recency)

| # | Type | State | Summary |
| --- | --- | --- | --- |
| #24846 | Issue | open | `session/new` reported as "Method not found", `authenticate` returns "not implemented". Breaks Claudian (Obsidian) integration. The "not found" claim doesn't match current `dev` code — could be a release-lag issue. |
| #24815 / #24816 | Issue+PR | open | ACP `image` content with `https://` URIs silently dropped in `prompt()` around `agent.ts:1394` (only `http:` / `data:` handled). |
| #25127 / #25128 | Issue+PR | open | `tool_call_update` doesn't include image attachments. |
| #22674 | PR | open (older: #22606/#22609/#22290 closed) | Feature: **store `clientCapabilities` on initialize** and emit `fs/write_text_file` when a file is edited. Mostly what the current code already does for the edit-permission flow, but generalised. Indicates current code does *not* check `clientCapabilities.fs?.writeTextFile` before calling `connection.writeTextFile`. |
| #24008 | PR | open | ACP command argument parsing loses newlines. |
| #24340 | PR | closed | Variant config option exposure. |
| #23138 | PR | closed | Usage aggregation via SQL instead of message-list walk. Relevant if you expect `usage_update` events to be cheap. |
| #22192 / #22468 | PR | closed/merged | Duplicate user messages during ACP prompts — fixed. |
| #23948 | PR | open | Prefer semantic ACP tool title/input before completion. |
| #23294 | PR | closed | Structured output format via `_meta`. |

Other observations:
- **No heartbeat / keepalive** — the ACP connection lives as long as stdin does.
- **Event subscription is per-Agent, not per-session**. If it crashes, all sessions lose updates; the while-loop auto-reconnects (`agent.ts:173-188`) unless aborted.
- **`_meta` protocol extension**: OpenCode embeds a namespace `_meta: { opencode: { modelId, variant, availableVariants } }` in responses — clients not understanding the namespace can ignore it (`agent.ts:1760-1772`).
- **Slash commands intercepted in `prompt()`**: any user message starting with `/` is parsed and routed either to `sdk.session.command` or (for `compact`) `sdk.session.summarize`. Be aware this subverts normal prompting (`agent.ts:1443-1528`).

### Things I couldn't verify from source alone

- Whether the `@agentclientprotocol/sdk@0.16.1` SDK implements any client→agent streaming backpressure. Not relevant for implementing a client, but matters for throughput tuning.
- Exact behaviour when multiple parallel `session/prompt` calls target the same `sessionId`. No explicit guard in ACP code; would have to read `packages/opencode/src/session/session.ts`.
- Whether `session/cancel` is idempotent across repeated calls (not verified).

---

## 10. 集成建议（给想写 ACP client 的人）

1. **Transport**: Speak NDJSON, not LSP-style. Line-delimited JSON frames. `stdin` writes → agent, `stdout` reads ← agent. Everything you emit must be `\n`-terminated single-line JSON.
2. **Capability negotiation**: Advertise `fs.readTextFile: false, fs.writeTextFile: true` (OpenCode only ever *writes* to you, for the post-approval edit refresh). You do **not** need terminal capabilities — OpenCode will never call them. Advertising them is harmless.
3. **Do not assume the client owns the filesystem**. OpenCode will mutate files under `--cwd` on its own. If you need sandboxing, do it at spawn time (container, chroot, dedicated worktree). `--cwd` is the only knob you control.
4. **Auth**: Don't rely on `authenticate`. Two workable paths:
   - Spawn `opencode auth login` yourself (the `terminal-auth` `_meta` capability on `authMethods` is designed for this).
   - Provide provider API keys via env (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, …) or via a pre-populated config file.
5. **Model selection**: Call `session/set_model` after `session/new` if you want a specific model; don't put it in `session/prompt` (not a protocol field, and ignored by OpenCode). `variant` rides on the `modelId` as a third path segment (`provider/model/variant`).
6. **Session routing**: Single `opencode acp` process handles multiple sessions concurrently. Reuse the process; spin a new one only if you need a different auth/env surface.
7. **Streaming**: Subscribe to `session/update` for:
   - `agent_message_chunk`, `agent_thought_chunk` — text stream
   - `tool_call` + `tool_call_update` — tool timeline (rich enough to render: inputs, outputs, `content`/`diff` blocks, `rawInput`/`rawOutput`)
   - `plan` — todowrite plans
   - `usage_update` — token/cost meter
   - `available_commands_update` — slash command palette (arrives shortly after `session/new`, via `setTimeout(0)` at `agent.ts:1256-1264`)
   - `user_message_chunk` (replay only — live user parts are skipped at `agent.ts:459-464`)
8. **Permission UX**: Treat `session/request_permission` as user-facing and blocking. OpenCode serialises per-session, so one prompt at a time, but per-process you can get concurrent prompts across sessions.
9. **Image support**: Base64 data URLs and `http://` URIs work today; `https://` does **not** (issue #24815 open). Safest: pre-fetch and embed as `data:`.
10. **Slash commands**: If you implement your own `/foo` UI, remember OpenCode also interprets leading `/` in the text. Either strip the `/` before sending, or lean on OpenCode's command registry (`sdk.command.list` via `available_commands_update`).
11. **Error semantics**: Model/auth failures surface as JSON-RPC `RequestError.authRequired()`. Fatal tool errors arrive as `tool_call_update` with `status: "failed"` — they are *not* JSON-RPC errors and the `prompt()` call will still resolve with `stopReason: "end_turn"`.
12. **`OPENCODE_ENABLE_QUESTION_TOOL=1`**: Set this *only* if your client can respond to `QuestionTool` prompts (which currently also route through `permission.asked` / `session/request_permission` — verify in `packages/opencode/src/tool/question.ts` before shipping).

---

## 11. 源码文件引用（汇总）

- CLI entry: `packages/opencode/src/cli/cmd/acp.ts:12-70`
- Network defaults (sidecar HTTP): `packages/opencode/src/cli/network.ts:6-15, 44-62`
- Main ACP agent: `packages/opencode/src/acp/agent.ts:132-1548`
- Agent `initialize`: `packages/opencode/src/acp/agent.ts:534-578`
- Agent capabilities advertised: `packages/opencode/src/acp/agent.ts:556-571`
- Agent `authenticate` (not implemented): `packages/opencode/src/acp/agent.ts:580-582`
- Agent `newSession`: `packages/opencode/src/acp/agent.ts:584-617`
- Agent `loadSession` (with replay): `packages/opencode/src/acp/agent.ts:619-687`
- Agent `prompt` (command intercept + sdk.session.prompt): `packages/opencode/src/acp/agent.ts:1355-1536`
- Agent `cancel`: `packages/opencode/src/acp/agent.ts:1538-1547`
- Event subscription (bus → session/update): `packages/opencode/src/acp/agent.ts:164-188, 190-532`
- Permission handling (bus → request_permission → reply): `packages/opencode/src/acp/agent.ts:192-270`
- Post-approval `connection.writeTextFile` call (the ONLY fs callback): `packages/opencode/src/acp/agent.ts:239-253`
- Tool→ACP kind mapping: `packages/opencode/src/acp/agent.ts:1550-1592`
- Default model selection: `packages/opencode/src/acp/agent.ts:1594-1654`
- Session manager: `packages/opencode/src/acp/session.ts:1-115`
- ACP types: `packages/opencode/src/acp/types.ts:1-24`
- Stale internal README: `packages/opencode/src/acp/README.md`
- Tool registry (proves tools are local): `packages/opencode/src/tool/registry.ts:1-200`
- Local-fs read path: `packages/opencode/src/tool/read.ts`
- Local-fs write path: `packages/opencode/src/tool/write.ts`
- Local-process shell path: `packages/opencode/src/tool/bash.ts`
- Permission service (bus, rules, reply): `packages/opencode/src/permission/index.ts`
- HTTP auth middleware (Basic): `packages/opencode/src/server/middleware.ts`
- SDK version & deps: `packages/opencode/package.json`

---

## Bottom-line recommendation

If the value proposition you need is **"the client owns the filesystem and terminal; OpenCode only decides what to do"**, OpenCode ACP is **not** a good fit today. It is an ACP *presentation* layer — streaming, permission UX, and session metadata are protocol-grade, but the actual I/O happens inside the OpenCode process against the host it's running on.

If instead your multi-agent backend can give OpenCode a pre-prepared worktree (container, chroot, or just an isolated directory) and you only need ACP for UX/streaming/permissioning, the integration is straightforward: one long-lived `opencode acp` child per workspace (or per user), pre-seeded auth, and wire `session/update` into your existing UI. Expect to carry workarounds for #24815 (https images), #25127 (tool image attachments), and possibly #24008 (newline parsing) until those PRs land.
