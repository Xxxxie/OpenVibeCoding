/**
 * 单元测试：resolveOnPath / tryBins / getResolvedBin
 *
 * 用 vi.mock + vi.mocked 控制 fs.existsSync，vi.stubEnv 控制 PATH / OPENCODE_BIN。
 * 全程无真实 PATH 扫描、无子进程。
 *
 * 注意：vi.resetModules() 在每个 it 前清空 acp-transport 的模块缓存，
 *       确保每次 import 都拿到新实例（新的 _resolvedBin 缓存）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock node:fs 整体，这样 existsSync 可被控制
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn(),
  }
})

import * as fs from 'node:fs'

describe('resolveOnPath + getResolvedBin', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
    vi.mocked(fs.existsSync).mockReturnValue(false)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ── resolveOnPath ──────────────────────────────────────────────────────────

  it('resolveOnPath returns absolute path when bin found in PATH', async () => {
    vi.stubEnv('PATH', '/usr/local/bin:/usr/bin')
    vi.mocked(fs.existsSync).mockImplementation((p) => p === '/usr/local/bin/opencode')
    const { resolveOnPath } = await import('../acp-transport.js')
    expect(resolveOnPath('opencode')).toBe('/usr/local/bin/opencode')
  })

  it('resolveOnPath returns null when bin not found in any PATH dir', async () => {
    vi.stubEnv('PATH', '/usr/local/bin:/usr/bin')
    vi.mocked(fs.existsSync).mockReturnValue(false)
    const { resolveOnPath } = await import('../acp-transport.js')
    expect(resolveOnPath('opencode')).toBeNull()
  })

  it('resolveOnPath returns null when PATH is empty', async () => {
    vi.stubEnv('PATH', '')
    const { resolveOnPath } = await import('../acp-transport.js')
    expect(resolveOnPath('opencode')).toBeNull()
  })

  // ── getResolvedBin: OPENCODE_BIN env override ──────────────────────────────

  it('getResolvedBin returns OPENCODE_BIN env if it exists on disk', async () => {
    vi.stubEnv('OPENCODE_BIN', '/opt/custom/opencode')
    vi.mocked(fs.existsSync).mockImplementation((p) => p === '/opt/custom/opencode')
    const { getResolvedBin } = await import('../acp-transport.js')
    expect(getResolvedBin()).toBe('/opt/custom/opencode')
  })

  it('getResolvedBin skips OPENCODE_BIN env if file does not exist, falls back to PATH', async () => {
    vi.stubEnv('OPENCODE_BIN', '/opt/custom/opencode')
    vi.stubEnv('PATH', '/usr/local/bin')
    vi.mocked(fs.existsSync).mockImplementation((p) => p === '/usr/local/bin/opencode')
    const { getResolvedBin } = await import('../acp-transport.js')
    expect(getResolvedBin()).toBe('/usr/local/bin/opencode')
  })

  // ── getResolvedBin: fallback chain ─────────────────────────────────────────

  it('getResolvedBin finds "opencode" before fallback "opencode-ai"', async () => {
    vi.stubEnv('PATH', '/usr/local/bin')
    vi.mocked(fs.existsSync).mockImplementation((p) => p === '/usr/local/bin/opencode')
    const { getResolvedBin } = await import('../acp-transport.js')
    expect(getResolvedBin()).toBe('/usr/local/bin/opencode')
  })

  it('getResolvedBin falls back to "opencode-ai" when "opencode" is absent', async () => {
    vi.stubEnv('PATH', '/usr/local/bin')
    vi.mocked(fs.existsSync).mockImplementation((p) => p === '/usr/local/bin/opencode-ai')
    const { getResolvedBin } = await import('../acp-transport.js')
    expect(getResolvedBin()).toBe('/usr/local/bin/opencode-ai')
  })

  it('getResolvedBin returns null when all bins absent', async () => {
    vi.stubEnv('PATH', '/usr/local/bin')
    vi.mocked(fs.existsSync).mockReturnValue(false)
    const { getResolvedBin } = await import('../acp-transport.js')
    expect(getResolvedBin()).toBeNull()
  })
})

describe('isAvailable via getResolvedBin', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
    vi.mocked(fs.existsSync).mockReturnValue(false)
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('isAvailable returns true when getResolvedBin finds opencode', async () => {
    vi.stubEnv('PATH', '/usr/local/bin')
    vi.mocked(fs.existsSync).mockImplementation((p) => p === '/usr/local/bin/opencode')
    const { OpencodeAcpRuntime } = await import('../opencode-acp-runtime.js')
    const rt = new OpencodeAcpRuntime()
    expect(await rt.isAvailable()).toBe(true)
  })

  it('isAvailable returns false when getResolvedBin cannot find any opencode bin', async () => {
    vi.stubEnv('PATH', '/usr/local/bin')
    vi.mocked(fs.existsSync).mockReturnValue(false)
    const { OpencodeAcpRuntime } = await import('../opencode-acp-runtime.js')
    const rt = new OpencodeAcpRuntime()
    expect(await rt.isAvailable()).toBe(false)
  })
})
