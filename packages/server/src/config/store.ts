import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type { CoderConfig } from '@coder/shared'

const CONFIG_DIR = path.join(os.homedir(), '.coder')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')

function ensureDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
  }
}

export function loadConfig(): CoderConfig {
  ensureDir()
  if (!fs.existsSync(CONFIG_FILE)) {
    return {}
  }
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8')
    return JSON.parse(raw) as CoderConfig
  } catch {
    return {}
  }
}

export function saveConfig(config: CoderConfig): void {
  ensureDir()
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8')
}

export function updateConfig(partial: Partial<CoderConfig>): CoderConfig {
  const config = loadConfig()
  const updated = { ...config, ...partial }
  saveConfig(updated)
  return updated
}
