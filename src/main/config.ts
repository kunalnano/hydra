import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { HelmConfig } from '../shared/types'

const CONFIG_DIR = join(homedir(), '.config', 'helm')
const LEGACY_CONFIG_DIR = join(homedir(), '.config', 'hydra')
const CONFIG_FILE = 'config.json'

const DEFAULT_CONFIG: HelmConfig = {
  gitRepoPaths: [],
  monitorInterval: 2000,
  snapshotInterval: 30000,
  yenneferStyle: 'adaptive',
  vaultRagEndpoint: 'http://127.0.0.1:8742',
  vaultPath: join(homedir(), 'Documents', 'ai', 'obsidian-vault'),
  vaultRagLocation: 'local',
  vaultRagRemoteHost: 'stormbreaker',
  vaultRagAutoCheck: true
}

export function getConfigPath(): string {
  return join(CONFIG_DIR, CONFIG_FILE)
}

export function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true })
  }
}

function migrateFromLegacy(): void {
  const legacyPath = join(LEGACY_CONFIG_DIR, CONFIG_FILE)
  const newPath = join(CONFIG_DIR, CONFIG_FILE)
  if (existsSync(legacyPath) && !existsSync(newPath)) {
    ensureConfigDir()
    copyFileSync(legacyPath, newPath)
    console.log('Migrated config from ~/.config/hydra to ~/.config/helm')
  }
}

export function loadConfig(): HelmConfig {
  migrateFromLegacy()
  let config: HelmConfig
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

  const envLmStudioUrl = process.env.LM_STUDIO_URL?.trim()
  if (envLmStudioUrl) {
    config.lmStudioUrl = envLmStudioUrl
  }

  return config
}

export function saveConfig(config: HelmConfig): void {
  ensureConfigDir()
  const configPath = getConfigPath()
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
}
