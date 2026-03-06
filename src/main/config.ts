import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { HydraConfig } from '../shared/types'

const CONFIG_DIR = join(homedir(), '.config', 'hydra')
const CONFIG_FILE = 'config.json'

const DEFAULT_CONFIG: HydraConfig = {
  gitRepoPaths: [],
  monitorInterval: 2000,
  snapshotInterval: 30000
}

export function getConfigPath(): string {
  return join(CONFIG_DIR, CONFIG_FILE)
}

export function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true })
  }
}

export function loadConfig(): HydraConfig {
  try {
    const configPath = getConfigPath()
    if (!existsSync(configPath)) {
      return { ...DEFAULT_CONFIG }
    }
    const raw = readFileSync(configPath, 'utf-8')
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_CONFIG, ...parsed }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export function saveConfig(config: HydraConfig): void {
  ensureConfigDir()
  const configPath = getConfigPath()
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
}
