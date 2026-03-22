import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { HelmConfig } from '../shared/types'
import type { HiveConfig, YenneferStyle } from '../shared/types'
import {
  loadEnvironment,
  resolveCommandOrPathSetting,
  resolvePathSetting
} from './app-paths'

const CONFIG_DIR = join(homedir(), '.config', 'helm')
const LEGACY_CONFIG_DIR = join(homedir(), '.config', 'hydra')
const CONFIG_FILE = 'config.json'

const DEFAULT_CONFIG: HelmConfig = {
  gitRepoPaths: [],
  monitorInterval: 2000,
  snapshotInterval: 30000,
  yenneferStyle: 'adaptive'
}

const VALID_YENNEFER_STYLES = new Set<YenneferStyle>([
  'adaptive',
  'throughput',
  'creative',
  'strict'
])

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

function parseListEnv(name: string): string[] | undefined {
  const rawValue = process.env[name]?.trim()
  if (!rawValue) return undefined

  const parsed = rawValue
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .map((value) => resolvePathSetting(value))

  return parsed.length > 0 ? parsed : undefined
}

function parseBooleanEnv(name: string): boolean | undefined {
  const rawValue = process.env[name]?.trim().toLowerCase()
  if (!rawValue) return undefined

  if (['1', 'true', 'yes', 'on'].includes(rawValue)) return true
  if (['0', 'false', 'no', 'off'].includes(rawValue)) return false
  return undefined
}

function parsePositiveIntEnv(name: string): number | undefined {
  const rawValue = process.env[name]?.trim()
  if (!rawValue) return undefined

  const parsed = Number.parseInt(rawValue, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined
  return parsed
}

function parsePathEnv(name: string): string | undefined {
  const rawValue = process.env[name]?.trim()
  if (!rawValue) return undefined
  return resolvePathSetting(rawValue)
}

function parseCommandOrPathEnv(name: string): string | undefined {
  const rawValue = process.env[name]?.trim()
  if (!rawValue) return undefined
  return resolveCommandOrPathSetting(rawValue)
}

function applyEnvOverrides(config: HelmConfig): HelmConfig {
  const envLmStudioUrl = process.env.LM_STUDIO_URL?.trim()
  const envGitRepoPaths = parseListEnv('HELM_GIT_REPO_PATHS')
  const envAgentFeedPaths = parseListEnv('HELM_AGENT_FEED_PATHS')
  const envLogFilePaths = parseListEnv('HELM_LOG_FILE_PATHS')
  const envStaffBinPath = parseCommandOrPathEnv('HELM_STAFF_BIN_PATH')
  const envNetworkTarget = process.env.HELM_NETWORK_TARGET?.trim()
  const envMonitorInterval = parsePositiveIntEnv('HELM_MONITOR_INTERVAL_MS')
  const envSnapshotInterval = parsePositiveIntEnv('HELM_SNAPSHOT_INTERVAL_MS')
  const envYenneferEnabled = parseBooleanEnv('HELM_YENNEFER_ENABLED')
  const envYenneferStyle = process.env.HELM_YENNEFER_STYLE?.trim() as
    | YenneferStyle
    | undefined
  const envHiveEnabled = parseBooleanEnv('HELM_HIVE_ENABLED')
  const envHiveSharedContextPath = parsePathEnv('HELM_HIVE_SHARED_CONTEXT_PATH')
  const envHiveSessionPrefix = process.env.HELM_HIVE_SESSION_PREFIX?.trim()
  const envHiveClaudeBinPath = parseCommandOrPathEnv('HELM_HIVE_CLAUDE_BIN_PATH')
  const envHiveIdleReclaimMinutes = parsePositiveIntEnv('HELM_HIVE_IDLE_RECLAIM_MINUTES')

  const nextConfig: HelmConfig = { ...config }

  if (envLmStudioUrl) nextConfig.lmStudioUrl = envLmStudioUrl
  if (envGitRepoPaths) nextConfig.gitRepoPaths = envGitRepoPaths
  if (envAgentFeedPaths) nextConfig.agentFeedPaths = envAgentFeedPaths
  if (envLogFilePaths) nextConfig.logFilePaths = envLogFilePaths
  if (envStaffBinPath) nextConfig.staffBinPath = envStaffBinPath
  if (envNetworkTarget) nextConfig.networkTarget = envNetworkTarget
  if (envMonitorInterval) nextConfig.monitorInterval = envMonitorInterval
  if (envSnapshotInterval) nextConfig.snapshotInterval = envSnapshotInterval
  if (envYenneferEnabled !== undefined) nextConfig.yenneferEnabled = envYenneferEnabled
  if (envYenneferStyle && VALID_YENNEFER_STYLES.has(envYenneferStyle)) {
    nextConfig.yenneferStyle = envYenneferStyle
  }

  if (
    envHiveEnabled !== undefined ||
    envHiveSharedContextPath ||
    envHiveSessionPrefix ||
    envHiveClaudeBinPath ||
    envHiveIdleReclaimMinutes
  ) {
    const hiveConfig: Partial<HiveConfig> = { ...(nextConfig.hive ?? {}) }
    if (envHiveEnabled !== undefined) hiveConfig.enabled = envHiveEnabled
    if (envHiveSharedContextPath) hiveConfig.sharedContextPath = envHiveSharedContextPath
    if (envHiveSessionPrefix) hiveConfig.tmuxSessionPrefix = envHiveSessionPrefix
    if (envHiveClaudeBinPath) hiveConfig.claudeBinPath = envHiveClaudeBinPath
    if (envHiveIdleReclaimMinutes) {
      hiveConfig.idleReclaimMinutes = envHiveIdleReclaimMinutes
    }
    nextConfig.hive = hiveConfig
  }

  return nextConfig
}

export function loadConfig(): HelmConfig {
  loadEnvironment()
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

  return applyEnvOverrides(config)
}

export function saveConfig(config: HelmConfig): void {
  ensureConfigDir()
  const configPath = getConfigPath()
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
}
