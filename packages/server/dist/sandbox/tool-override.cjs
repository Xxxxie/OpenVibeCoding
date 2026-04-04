"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/sandbox/tool-override.ts
var tool_override_exports = {};
__export(tool_override_exports, {
  overrideTools: () => overrideTools
});
module.exports = __toCommonJS(tool_override_exports);
async function callToolApiRaw(baseUrl, toolName, headers, params) {
  const res = await fetch(`${baseUrl}/api/tools/${toolName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(params)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`tool API returned ${res.status}: ${text}`);
  }
  return await res.json();
}
function formatBashResult(r, command) {
  const output = r.output ?? "";
  const exitCode = r.exitCode ?? null;
  const timedOut = r.timedOut ?? false;
  let content = `Command: ${command}
Stdout: ${output || "(empty)"}
Stderr: (empty)
Exit Code: ${exitCode ?? "(none)"}
Signal: (none)`;
  if (timedOut) content += "\n\n[Process timed out]";
  return { content, renderer: { type: "text", value: output || "No output available" } };
}
function formatReadResult(r) {
  if (r.type === "directory") {
    const entries = r.entries ?? [];
    return { content: entries.join("\n") || "(empty directory)" };
  }
  if (r.type === "image") {
    return {
      content: JSON.stringify({ type: r.type, path: r.path, mime: r.mime, base64: r.base64 })
    };
  }
  const content = r.content ?? "";
  const message = r.message ?? "";
  return {
    title: `Read ${r.totalLines ?? "?"} lines`,
    content: message ? `${content}
${message}` : content,
    renderer: { type: "code" }
  };
}
function formatWriteResult(r) {
  const action = r.created ? "created and wrote to new" : "overwrote";
  return {
    title: `Wrote ${r.bytesWritten ?? "?"} bytes`,
    content: `Successfully ${action} file: ${r.path}`,
    renderer: { type: "code" }
  };
}
function formatEditResult(r) {
  return {
    title: r.message ?? "Edit applied successfully.",
    content: `Successfully edited file: ${r.path}`,
    renderer: { type: "diff" }
  };
}
function formatSearchResult(r) {
  return { content: r.output ?? "No results" };
}
var RESULT_FORMATTERS = {
  bash: (r, p) => formatBashResult(r, p.command),
  read: (r) => formatReadResult(r),
  write: (r) => formatWriteResult(r),
  edit: (r) => formatEditResult(r),
  glob: (r) => formatSearchResult(r),
  grep: (r) => formatSearchResult(r)
};
async function callToolApi(baseUrl, apiToolName, headers, params, rawParams) {
  const resp = await callToolApiRaw(baseUrl, apiToolName, headers, params);
  if (!resp.success) {
    const errorMessage = resp.error ?? "Tool execution failed";
    return { content: errorMessage, error: errorMessage };
  }
  const formatter = RESULT_FORMATTERS[apiToolName];
  if (formatter) {
    return formatter(resp.result, rawParams ?? params);
  }
  return { content: JSON.stringify(resp.result, null, 2) };
}
function makeNormalizers() {
  return {
    // CLI: { file_path, content } → API: { path, content }
    write: (p) => ({ ...p, path: p.file_path ?? p.path, content: p.content }),
    // CLI: { file_path, offset, limit } → API: { path, offset, limit }
    read: (p) => ({ ...p, path: p.file_path ?? p.path }),
    // CLI: { file_path, old_string, new_string, replace_all }
    //   → API: { path, oldString, newString, replaceAll }
    edit: (p) => ({
      ...p,
      path: p.file_path ?? p.path,
      oldString: p.old_string ?? p.oldString,
      newString: p.new_string ?? p.newString,
      ...p.replace_all != null ? { replaceAll: p.replace_all } : {}
    })
  };
}
var TOOL_NAME_MAPPING = {
  Read: "read",
  Write: "write",
  Edit: "edit",
  Glob: "glob",
  Grep: "grep"
};
var THROW_ON_ERROR_TOOLS = /* @__PURE__ */ new Set(["Write", "Edit"]);
var SANDBOX_REQUIRED_TOOLS = [
  ...Object.keys(TOOL_NAME_MAPPING),
  "MultiEdit",
  "Bash",
  "BashOutput",
  "TaskOutput",
  "TaskStop",
  "KillShell"
];
var ptyTaskRegistry = /* @__PURE__ */ new Map();
var ansiRegex = (function() {
  const ST = "(?:\\u0007|\\u001B\\u005C|\\u009C)";
  const osc = `(?:\\u001B\\][\\s\\S]*?${ST})`;
  const csi = "[\\u001B\\u009B][[\\]()#;?]*(?:\\d{1,4}(?:[;:]\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~]";
  return new RegExp(`${osc}|${csi}`, "g");
})();
function stripAnsi(raw) {
  const cleaned = raw.replace(ansiRegex, "");
  const lines = cleaned.split("\n").map((line) => {
    const crIdx = line.lastIndexOf("\r");
    return crIdx >= 0 ? line.slice(crIdx + 1) : line;
  });
  const result = [];
  let emptyCount = 0;
  for (const line of lines) {
    if (line.trim() === "") {
      emptyCount++;
      if (emptyCount <= 1) result.push(line);
    } else {
      emptyCount = 0;
      result.push(line);
    }
  }
  return result.join("\n");
}
async function drainPtyOutput(baseUrl, headers, taskId) {
  const task = ptyTaskRegistry.get(taskId);
  if (!task || task.exited) return;
  const MAX_ROUNDS = 50;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await fetch(`${baseUrl}/api/tools/pty_read_output`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ pid: task.pid, afterSeq: task.nextSeq, limit: 256 })
    });
    if (!res.ok) {
      if (res.status === 404 || res.status === 400) {
        task.exited = true;
        task.status = "failed";
        task.endTime = Date.now();
      }
      return;
    }
    const data = await res.json();
    const result = data?.result;
    if (!result) return;
    let hasNewEvents = false;
    for (const { event } of result.events ?? []) {
      hasNewEvents = true;
      if (event?.data?.pty) {
        const raw = Buffer.from(event.data.pty, "base64").toString();
        task.stdout += stripAnsi(raw);
      }
      if (event?.end) {
        task.exited = true;
        task.status = event.end.exitCode === 0 ? "completed" : "failed";
        task.endTime = Date.now();
      }
    }
    if (result.nextSeq != null) task.nextSeq = result.nextSeq;
    if (result.exited) {
      task.exited = true;
      if (task.status === "running") {
        task.status = "completed";
        task.endTime = Date.now();
      }
    }
    if (!hasNewEvents || task.exited) return;
  }
}
async function listSandboxProcesses(baseUrl, headers) {
  try {
    const res = await fetch(`${baseUrl}/e2b-compatible/process.Process/List`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: "{}"
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data?.processes ?? []).filter((p) => p.pid).map((p) => ({
      pid: p.pid,
      cmd: p.config?.cmd ?? "",
      args: p.config?.args ?? []
    }));
  } catch {
    return [];
  }
}
async function ensurePtyTask(taskId, baseUrl, headers) {
  const existing = ptyTaskRegistry.get(taskId);
  if (existing) return existing;
  const pid = Number(taskId);
  if (!pid || isNaN(pid)) return null;
  const processes = await listSandboxProcesses(baseUrl, headers);
  const found = processes.find((p) => p.pid === pid);
  if (!found) return null;
  const restored = {
    pid,
    title: `(restored) ${found.cmd} ${found.args.join(" ")}`.trim(),
    startTime: Date.now(),
    status: "running",
    nextSeq: 0,
    stdout: "",
    exited: false
  };
  ptyTaskRegistry.set(taskId, restored);
  return restored;
}
async function bashInBackground(baseUrl, headers, command) {
  const createRes = await fetch(`${baseUrl}/api/tools/pty_create`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ cmd: "/bin/bash", args: ["-i", "-l"], cols: 220, rows: 50 })
  });
  if (!createRes.ok) {
    const text = await createRes.text().catch(() => "");
    throw new Error(`pty_create failed: ${createRes.status} ${text}`);
  }
  const pid = (await createRes.json())?.result?.pid;
  if (!pid) throw new Error("pty_create returned no pid");
  const taskId = String(pid);
  ptyTaskRegistry.set(taskId, {
    pid,
    title: command,
    startTime: Date.now(),
    status: "running",
    nextSeq: 0,
    stdout: "",
    exited: false
  });
  const inputB64 = Buffer.from(command + "\n").toString("base64");
  await fetch(`${baseUrl}/api/tools/pty_send_input`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ pid, inputBase64: inputB64 })
  }).catch(() => {
  });
  return {
    content: `Command: ${command}
Status: Moved to background with ID: ${taskId}
Current Output: (no output yet)`
  };
}
async function killPtyTask(baseUrl, headers, task, taskId) {
  try {
    const res = await fetch(`${baseUrl}/api/tools/pty_kill`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ pid: task.pid, signal: "SIGKILL" })
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`pty_kill failed: ${res.status} ${text}`);
    }
    task.exited = true;
    task.status = "failed";
    task.endTime = Date.now();
    return { content: `Shell ${taskId} (pid=${task.pid}) has been killed.` };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { content: `Failed to kill shell ${taskId}: ${msg}` };
  }
}
function overrideTools(toolMap) {
  const configStr = process.env.CODEBUDDY_TOOL_OVERRIDE_CONFIG;
  console.error(
    `[ToolOverride] overrideTools called, configStr=${configStr ? "present" : "missing"}, toolMap.size=${toolMap.size}`
  );
  if (!configStr) {
    disableSandboxTools(toolMap);
    return;
  }
  let config;
  try {
    config = JSON.parse(configStr);
  } catch {
    disableSandboxTools(toolMap);
    return;
  }
  if (!config.url) {
    disableSandboxTools(toolMap);
    return;
  }
  const baseUrl = config.url.replace(/\/mcp\/?$/, "").replace(/\/api\/?$/, "");
  const headers = config.headers || {};
  const normalizers = makeNormalizers();
  let overriddenCount = 0;
  const pendingOverrides = /* @__PURE__ */ new Map();
  function overrideTool(name, overrideFn) {
    const tool = toolMap.get(name);
    if (tool) {
      overrideFn(tool);
      overriddenCount++;
    } else {
      pendingOverrides.set(name, overrideFn);
    }
  }
  const originalSet = toolMap.set.bind(toolMap);
  toolMap.set = function(key, value) {
    const result = originalSet(key, value);
    const pending = pendingOverrides.get(key);
    if (pending) {
      pendingOverrides.delete(key);
      pending(value);
      overriddenCount++;
    }
    return result;
  };
  for (const [cliToolName, apiToolName] of Object.entries(TOOL_NAME_MAPPING)) {
    overrideTool(cliToolName, (tool) => {
      tool.execute = async (params, _context, _extra) => {
        const normalizer = normalizers[apiToolName];
        const normalizedParams = normalizer ? normalizer(params) : params;
        const result = await callToolApi(baseUrl, apiToolName, headers, normalizedParams, params);
        if (result.error && THROW_ON_ERROR_TOOLS.has(cliToolName)) {
          throw new Error(`${cliToolName} error: ${result.error}`);
        }
        return result;
      };
    });
  }
  const editNormalizer = normalizers["edit"];
  overrideTool("MultiEdit", (multiEditTool) => {
    multiEditTool.execute = async (params, _context, _extra) => {
      const filePath = params.file_path ?? params.path;
      const edits = params.edits ?? [];
      if (!edits.length) {
        return { content: "No edits provided." };
      }
      const results = [];
      for (const edit of edits) {
        const singleEditParams = {
          file_path: filePath,
          old_string: edit.old_string ?? edit.oldString,
          new_string: edit.new_string ?? edit.newString,
          ...edit.replace_all != null ? { replace_all: edit.replace_all } : {}
        };
        const normalizedParams = editNormalizer(singleEditParams);
        const result = await callToolApi(baseUrl, "edit", headers, normalizedParams);
        if (result.error) {
          throw new Error(`Edit failed for ${filePath}: ${result.error}`);
        }
        results.push(result.content ?? "");
      }
      return { content: results.join("\n") };
    };
  });
  overrideTool("Bash", (bashTool) => {
    bashTool.execute = async (params) => {
      const { command, timeout, run_in_background } = params;
      try {
        if (run_in_background) {
          return await bashInBackground(baseUrl, headers, command);
        }
        const result = await callToolApi(baseUrl, "bash", headers, { command, timeout }, params);
        return result;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        const errMsg = `Bash: sandbox execution failed: ${msg}`;
        return { content: errMsg, error: errMsg };
      }
    };
  });
  const formatDuration = (ms) => {
    if (ms < 1e3) return `${ms}ms`;
    const s = Math.floor(ms / 1e3);
    const m = Math.floor(s / 60);
    return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
  };
  async function formatPtyTaskOutput(taskId, filter) {
    const task = await ensurePtyTask(taskId, baseUrl, headers);
    if (!task) return null;
    await drainPtyOutput(baseUrl, headers, taskId).catch(() => {
    });
    const duration = (task.endTime ?? Date.now()) - task.startTime;
    let stdout = task.stdout;
    if (filter) {
      try {
        const re = new RegExp(filter, "i");
        stdout = stdout.split("\n").filter((line) => re.test(line)).join("\n");
      } catch {
        return { content: `Invalid regex pattern: ${filter}` };
      }
    }
    const lines = [
      `Shell ID: ${taskId}`,
      `Command: ${task.title}`,
      `Status: ${task.status}`,
      `Duration: ${formatDuration(duration)}`,
      `Timestamp: ${(/* @__PURE__ */ new Date()).toISOString()}`,
      "",
      `Stdout (${filter ? "filtered" : "full"}):`,
      stdout || "(no output)",
      "",
      "Stderr: (no output)"
    ];
    if (task.status === "running") {
      lines.push(
        "",
        "<system-reminder>",
        `Background Bash ${taskId} (command: ${task.title}) (status: ${task.status}) Has new output available. You can check its output using the BashOutput tool.`,
        "</system-reminder>"
      );
    }
    return { content: lines.join("\n") };
  }
  overrideTool("BashOutput", (bashOutputTool) => {
    const originalBashOutputExecute = bashOutputTool.execute;
    bashOutputTool.execute = async (params, context, extra) => {
      const { shell_id, filter } = params;
      const result = await formatPtyTaskOutput(String(shell_id), filter);
      if (result) return result;
      return originalBashOutputExecute.call(bashOutputTool, params, context, extra);
    };
  });
  overrideTool("TaskOutput", (taskOutputTool) => {
    const originalTaskOutputExecute = taskOutputTool.execute;
    taskOutputTool.execute = async (params, context, extra) => {
      const taskId = String(params.task_id || params.shell_id || "");
      const task = await ensurePtyTask(taskId, baseUrl, headers);
      if (task) {
        const shouldBlock = params.block !== false;
        const timeout = Number(params.timeout) || 6e4;
        if (shouldBlock && task.status === "running") {
          const deadline = Date.now() + Math.min(timeout, 6e5);
          while (Date.now() < deadline) {
            await drainPtyOutput(baseUrl, headers, taskId).catch(() => {
            });
            if (task.exited || task.status !== "running") break;
            await new Promise((r) => setTimeout(r, 500));
          }
        }
        const result = await formatPtyTaskOutput(taskId, params.filter);
        if (result) return result;
      }
      return originalTaskOutputExecute.call(taskOutputTool, params, context, extra);
    };
  });
  overrideTool("TaskStop", (taskStopTool) => {
    const originalTaskStopExecute = taskStopTool.execute;
    taskStopTool.execute = async (params, context, extra) => {
      const taskId = String(params.task_id || params.shell_id || "");
      const task = await ensurePtyTask(taskId, baseUrl, headers);
      if (!task) return originalTaskStopExecute.call(taskStopTool, params, context, extra);
      return killPtyTask(baseUrl, headers, task, taskId);
    };
  });
  overrideTool("KillShell", (killShellTool) => {
    const originalKillExecute = killShellTool.execute;
    killShellTool.execute = async (params, context, extra) => {
      const shellId = String(params.shell_id || "");
      const task = await ensurePtyTask(shellId, baseUrl, headers);
      if (!task) return originalKillExecute.call(killShellTool, params, context, extra);
      return killPtyTask(baseUrl, headers, task, shellId);
    };
  });
  console.error(`[ToolOverride] ${overriddenCount} tool(s) overridden, baseUrl=${baseUrl}`);
}
var NO_SANDBOX_MESSAGE = "This tool is disabled because no sandbox environment is available. File system operations and command execution require a sandbox to run safely.";
function disableSandboxTools(toolMap) {
  let disabledCount = 0;
  const pendingDisables = /* @__PURE__ */ new Map();
  function disableTool(name, disableFn) {
    const tool = toolMap.get(name);
    if (tool) {
      disableFn(tool);
      disabledCount++;
    } else {
      pendingDisables.set(name, disableFn);
    }
  }
  const originalSet = toolMap.set.bind(toolMap);
  toolMap.set = function(key, value) {
    const result = originalSet(key, value);
    const pending = pendingDisables.get(key);
    if (pending) {
      pendingDisables.delete(key);
      pending(value);
      disabledCount++;
    }
    return result;
  };
  for (const toolName of SANDBOX_REQUIRED_TOOLS) {
    disableTool(toolName, (tool) => {
      tool.execute = async () => {
        const msg = `${toolName}: ${NO_SANDBOX_MESSAGE}`;
        if (THROW_ON_ERROR_TOOLS.has(toolName)) {
          throw new Error(msg);
        }
        return { content: msg, error: msg };
      };
    });
  }
  console.error(`[ToolOverride] ${disabledCount} tool(s) disabled (no sandbox environment)`);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  overrideTools
});
