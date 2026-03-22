import { readFileSync, existsSync } from 'fs'
import type { BrowserWindow } from 'electron'
import type { SystemState, SentinelAlert, SentinelStatus } from '../../shared/types'
import { IPC_CHANNELS } from '../../shared/types'
import { defaultRules, type SentinelRule } from './rules'
import { dispatchAlert, type NotifyChannelConfig } from './notify'
import { loadEnvironment, resolveMainAssetPath, resolvePathSetting } from '../app-paths'

interface SentinelConfig {
  enabled: boolean
  pollIntervalMs: number
  channels: NotifyChannelConfig
  rules: Record<string, { enabled: boolean; cooldownMs: number }>
}

// Cooldown tracking: ruleId -> last fire timestamp
const cooldowns = new Map<string, number>()
const recentAlerts: SentinelAlert[] = []
const MAX_RECENT_ALERTS = 100

let prevState: SystemState | null = null
let pollInterval: ReturnType<typeof setInterval> | null = null
let config: SentinelConfig | null = null
let rules: SentinelRule[] = []
let mainWindowRef: BrowserWindow | null = null
let getStateRef: (() => SystemState | null) | null = null

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

function loadConfig(): SentinelConfig {
  loadEnvironment()

  const configuredPath = process.env.HELM_SENTINEL_CONFIG_PATH?.trim()
  const paths = [
    configuredPath ? resolvePathSetting(configuredPath) : null,
    resolveMainAssetPath('sentinel', 'config.json')
  ].filter((value): value is string => Boolean(value))

  for (const p of paths) {
    if (existsSync(p)) {
      try {
        const parsed = JSON.parse(readFileSync(p, 'utf-8')) as SentinelConfig
        const slackWebhook = process.env.HELM_SENTINEL_SLACK_WEBHOOK?.trim()
        const macosNotification = parseBooleanEnv('HELM_SENTINEL_MACOS_NOTIFICATIONS')
        const vaultLogEnabled = parseBooleanEnv('HELM_SENTINEL_VAULT_LOG_ENABLED')
        const pollIntervalMs = parsePositiveIntEnv('HELM_SENTINEL_POLL_INTERVAL_MS')
        const vaultLogDir = process.env.HELM_SENTINEL_VAULT_LOG_DIR?.trim()

        return {
          ...parsed,
          pollIntervalMs: pollIntervalMs ?? parsed.pollIntervalMs,
          channels: {
            ...parsed.channels,
            macos_notification: macosNotification ?? parsed.channels.macos_notification,
            slack_webhook: slackWebhook || parsed.channels.slack_webhook,
            vault_log: vaultLogEnabled ?? parsed.channels.vault_log,
            vault_log_dir: vaultLogDir
              ? resolvePathSetting(vaultLogDir)
              : parsed.channels.vault_log_dir ?? null
          }
        }
      } catch {
        continue
      }
    }
  }

  const slackWebhook = process.env.HELM_SENTINEL_SLACK_WEBHOOK?.trim()
  const macosNotification = parseBooleanEnv('HELM_SENTINEL_MACOS_NOTIFICATIONS')
  const vaultLogEnabled = parseBooleanEnv('HELM_SENTINEL_VAULT_LOG_ENABLED')
  const pollIntervalMs = parsePositiveIntEnv('HELM_SENTINEL_POLL_INTERVAL_MS')
  const vaultLogDir = process.env.HELM_SENTINEL_VAULT_LOG_DIR?.trim()

  return {
    enabled: true,
    pollIntervalMs: pollIntervalMs ?? 30000,
    channels: {
      macos_notification: macosNotification ?? true,
      slack_webhook: slackWebhook || null,
      vault_log: vaultLogEnabled ?? true,
      vault_log_dir: vaultLogDir ? resolvePathSetting(vaultLogDir) : null
    },
    rules: {}
  }
}

function initRules(cfg: SentinelConfig): SentinelRule[] {
  return defaultRules.map((rule) => {
    const ruleConfig = cfg.rules[rule.id]
    if (ruleConfig) {
      return {
        ...rule,
        enabled: ruleConfig.enabled,
        cooldownMs: ruleConfig.cooldownMs
      }
    }
    return rule
  })
}

function isOnCooldown(ruleId: string, cooldownMs: number): boolean {
  const lastFired = cooldowns.get(ruleId)
  if (!lastFired) return false
  return Date.now() - lastFired < cooldownMs
}

function runChecks(state: SystemState): void {
  if (!config) return

  for (const rule of rules) {
    if (!rule.enabled) continue
    if (isOnCooldown(rule.id, rule.cooldownMs)) continue

    const alert = rule.check(state, prevState)
    if (alert) {
      cooldowns.set(rule.id, Date.now())
      recentAlerts.unshift(alert)
      if (recentAlerts.length > MAX_RECENT_ALERTS) recentAlerts.pop()

      dispatchAlert(alert, config.channels)

      // Broadcast to renderer
      if (mainWindowRef && !mainWindowRef.isDestroyed()) {
        mainWindowRef.webContents.send(IPC_CHANNELS.SENTINEL_ALERTS, alert)
      }

      console.log(`[sentinel] ${alert.severity}: ${alert.title} - ${alert.body}`)
    }
  }

  prevState = state
}

function poll(): void {
  if (!getStateRef) return
  const state = getStateRef()
  if (state) runChecks(state)
}

export function startSentinel(
  window: BrowserWindow,
  getState: () => SystemState | null
): void {
  config = loadConfig()
  if (!config.enabled) {
    console.log('[sentinel] Disabled by config')
    return
  }

  rules = initRules(config)
  mainWindowRef = window
  getStateRef = getState

  const enabledCount = rules.filter((r) => r.enabled).length
  console.log(`[sentinel] Started with ${enabledCount}/${rules.length} rules, polling every ${config.pollIntervalMs}ms`)

  pollInterval = setInterval(poll, config.pollIntervalMs)
}

export function stopSentinel(): void {
  if (pollInterval) {
    clearInterval(pollInterval)
    pollInterval = null
  }
  mainWindowRef = null
  getStateRef = null
  console.log('[sentinel] Stopped')
}

export function getSentinelStatus(): SentinelStatus {
  const oneHourAgo = Date.now() - 3600000
  const activeAlerts = recentAlerts.filter((a) => a.timestamp > oneHourAgo)

  return {
    enabled: config?.enabled ?? false,
    activeAlerts,
    lastPoll: prevState?.timestamp ?? 0,
    rulesEnabled: rules.filter((r) => r.enabled).length
  }
}

export function getSentinelAlerts(): SentinelAlert[] {
  return recentAlerts.slice()
}
