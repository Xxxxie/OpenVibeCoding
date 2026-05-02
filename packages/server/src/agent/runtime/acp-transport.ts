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
import { ndJsonStream, type Stream } from '@agentclientprotocol/sdk'

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

const LOCAL_OPENCODE_BIN = process.env.OPENCODE_BIN || 'opencode'
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
  return new Promise((resolve, reject) => {
    const child = spawn(LOCAL_OPENCODE_BIN, ['acp', '--cwd', cwd], {
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
