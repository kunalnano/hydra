import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { HydraConfig } from '../shared/types'

const CONFIG_DIR = join(homedir(), '.config', 'hydra')
const CONFIG_FILE = 'config.json'

const DEFAULT_CONFIG: HydraConfig = {
  gitRepoPaths: [],
  monitorInterval: 2000,
  snapshotInterval: 30000,
  yenneferStyle: 'adaptive'
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
  let config: HydraConfig
  try {
    const configPath = getConfigPath()
    if (!existsSync(configPath)) {
      config = { ...DEFAULT_CONFIG }
    } else {
      const raw = readFileSync(configPath, 'utf-8')
      const parsed = JSON.parse(raw)
      config = { ...DEFAULT_CONFIG, ...parsed }
    }
  } catch {
    config = { ...DEFAULT_CONFIG }
  }
  // .env overrides config file for lmStudioUrl
  if (process.env.LM_STUDIO_URL && !config.lmStudioUrl) {
    config.lmStudioUrl = process.env.LM_STUDIO_URL
  }
  return config
}

export function saveConfig(config: HydraConfig): void {
  ensureConfigDir()
  const configPath = getConfigPath()
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
}
