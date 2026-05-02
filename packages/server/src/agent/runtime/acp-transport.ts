/**
 * ACP Transport 抽象
 *
 * 把"启动 opencode acp 进程 + 建立 NDJSON stdio 通道"的具体机制
 * 与 runtime 的事件翻译层解耦。
 *
 * 当前只有一种 transport：
 *
 *  LocalStdioTransport：spawn 本地 `opencode acp` 子进程，pipe stdin/stdout 为 NDJSON Stream
 *
 * 为什么不做"在沙箱里跑 opencode"的 transport？
 *   - Agent 与 Sandbox 应严格分离（agent 负责决策、sandbox 负责执行）
 *   - 把 agent 塞进沙箱违反这一原则
 *   - 正确的隔离方式：让 agent 在 server 本地跑，但把它的工具调用桥接到沙箱
 *     （见 sandbox-mcp-bridge.ts + opencode-agent-config.ts）
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import { delimiter } from 'node:path'
import path from 'node:path'
import { ndJsonStream, type Stream } from '@agentclientprotocol/sdk'

// ─── Bin resolution ─────────────────────────────────────────────────────────

/**
 * 在 PATH 各目录下查找指定 bin 名，返回第一个命中的**绝对路径**，找不到返回 null。
 * 纯同步 fs 检查，无子进程。
 */
export function resolveOnPath(bin: string): string | null {
  const dirs = (process.env.PATH ?? '').split(delimiter)
  const exts = process.platform === 'win32' ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';') : ['']
  for (const dir of dirs) {
    if (!dir) continue
    for (const ext of exts) {
      const full = path.join(dir, bin + ext)
      if (existsSync(full)) return full
    }
  }
  return null
}

/**
 * Fallback 候选列表（按优先级排列）。
 *
 *   1. OPENCODE_BIN env：允许完全覆盖（绝对路径或 bin 名均可）
 *   2. 'opencode'：官方包名
 *   3. 'opencode-ai'：npm 包名（`npm i -g opencode-ai` 安装后 bin 叫 opencode-ai）
 */
const OPENCODE_BIN_CANDIDATES = ['opencode', 'opencode-ai'] as const

/**
 * 模块级缓存。undefined = 未初始化；null = 找不到；string = 解析到的绝对路径。
 * 第一次调用时扫 PATH，此后 O(1) 返回。
 */
let _resolvedBin: string | null | undefined = undefined

/**
 * 解析可用的 opencode 可执行路径。
 *
 * 优先级：
 *   1. OPENCODE_BIN env（如果是绝对路径且存在，直接返回；否则当 bin 名走 resolveOnPath）
 *   2. 按 OPENCODE_BIN_CANDIDATES 顺序在 PATH 里查找
 *
 * 结果被模块级缓存，进程内只扫一次。测试时通过 vi.resetModules() 清除缓存。
 */
export function getResolvedBin(): string | null {
  if (_resolvedBin !== undefined) return _resolvedBin

  const envOverride = process.env.OPENCODE_BIN
  if (envOverride) {
    // 如果是绝对路径，直接检查；否则当 bin 名走 resolveOnPath
    if (path.isAbsolute(envOverride)) {
      if (existsSync(envOverride)) {
        _resolvedBin = envOverride
        return _resolvedBin
      }
      // env 里的绝对路径不存在 → 降到 fallback 继续找
    } else {
      const resolved = resolveOnPath(envOverride)
      if (resolved) {
        _resolvedBin = resolved
        return _resolvedBin
      }
    }
  }

  // Fallback 候选
  for (const bin of OPENCODE_BIN_CANDIDATES) {
    const resolved = resolveOnPath(bin)
    if (resolved) {
      _resolvedBin = resolved
      return _resolvedBin
    }
  }

  _resolvedBin = null
  return null
}

// ─── Core Interfaces ────────────────────────────────────────────────────────

export interface AcpTransport {
  /** ACP SDK 使用的双向 NDJSON 流 */
  readonly stream: Stream
  /**
   * 等待底层进程退出。transport 实现应在进程退出时 resolve 此 promise，
   * 用于 runtime 检测异常退出并上报 error。
   */
  readonly exit: Promise<{ code: number | null; signal: NodeJS.Signals | null }>
  /**
   * 主动关闭 transport（杀进程 + 关闭流）。幂等。
   */
  close(): void
}

export interface AcpTransportFactoryContext {
  /** 工作目录（对应 opencode acp --cwd）。可以是一个临时目录，用来放自定义 agent 配置 */
  cwd: string
  /** abort 信号；transport 实现必须监听并在 abort 时触发 close() */
  signal: AbortSignal
  /** 调试开关：透传到 transport 的 stderr 打印行为 */
  debug?: boolean
  /** 附加环境变量（如 OPENCODE_CONFIG 指向 per-session 配置文件） */
  env?: Record<string, string>
}

export type AcpTransportFactory = (ctx: AcpTransportFactoryContext) => Promise<AcpTransport>

// ─── Local stdio transport ──────────────────────────────────────────────────

const LOCAL_SPAWN_TIMEOUT_MS = 15_000

export const createLocalStdioTransport: AcpTransportFactory = async (ctx) => {
  const child = await spawnLocalOpencode(ctx.cwd, ctx.signal, ctx.debug ?? false, ctx.env)

  const stream = ndJsonStream(
    new WritableStream<Uint8Array | string>({
      write(chunk) {
        return new Promise((resolve, reject) => {
          const data = typeof chunk === 'string' ? chunk : Buffer.from(chunk)
          child.stdin.write(data, (err) => (err ? reject(err) : resolve()))
        })
      },
      close() {
        try {
          child.stdin.end()
        } catch {
          /* noop */
        }
      },
    }),
    new ReadableStream<Uint8Array>({
      start(controller) {
        child.stdout.on('data', (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)))
        child.stdout.on('end', () => {
          try {
            controller.close()
          } catch {
            /* noop */
          }
        })
        child.stdout.on('error', (err) => controller.error(err))
      },
    }),
  )

  const exit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.on('exit', (code, sig) => resolve({ code, signal: sig }))
  })

  return {
    stream,
    exit,
    close() {
      try {
        child.kill('SIGTERM')
      } catch {
        /* noop */
      }
    },
  }
}

async function spawnLocalOpencode(
  cwd: string,
  signal: AbortSignal,
  debug: boolean,
  extraEnv?: Record<string, string>,
): Promise<ChildProcessWithoutNullStreams> {
  // 用 getResolvedBin() 代替之前的硬编码常量，支持 fallback 候选
  const bin = getResolvedBin()
  if (!bin) {
    throw new Error(
      `opencode CLI not found. Install via: npm i -g opencode-ai\n` +
        `Or set OPENCODE_BIN env to the absolute path.`,
    )
  }

  return new Promise((resolve, reject) => {
    const child = spawn(bin, ['acp', '--cwd', cwd], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...(extraEnv ?? {}) },
    })

    let settled = false
    const onAbort = () => {
      try {
        child.kill('SIGTERM')
      } catch {
        /* noop */
      }
    }
    signal.addEventListener('abort', onAbort)

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        try {
          child.kill('SIGKILL')
        } catch {
          /* noop */
        }
        reject(new Error('opencode acp spawn timeout'))
      }
    }, LOCAL_SPAWN_TIMEOUT_MS)

    child.on('error', (err) => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        reject(err)
      }
    })

    child.on('spawn', () => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        resolve(child)
      }
    })

    child.stderr?.on('data', (chunk) => {
      if (debug) {
        process.stderr.write('[opencode stderr] ' + chunk.toString())
      }
    })
  })
}

// ─── Transport Registry ─────────────────────────────────────────────────────

export type AcpTransportKind = 'local-stdio'

const FACTORIES: Record<AcpTransportKind, AcpTransportFactory> = {
  'local-stdio': createLocalStdioTransport,
}

export function getAcpTransportFactory(kind: AcpTransportKind): AcpTransportFactory {
  const f = FACTORIES[kind]
  if (!f) throw new Error(`Unknown ACP transport kind: ${kind}`)
  return f
}

export function resolveAcpTransportKind(_opts: { kind?: AcpTransportKind } = {}): AcpTransportKind {
  // 目前只有一种 transport，保留函数签名以便未来扩展（例如 WebSocket 转发给远端 agent 集群）
  return 'local-stdio'
}
