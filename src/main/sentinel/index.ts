import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { BrowserWindow } from 'electron'
import type { SystemState, SentinelAlert, SentinelStatus } from '../../shared/types'
import { IPC_CHANNELS } from '../../shared/types'
import { defaultRules, type SentinelRule } from './rules'
import { dispatchAlert, type NotifyChannelConfig } from './notify'

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

function loadConfig(): SentinelConfig {
  // Try bundled config, then fallback to defaults
  const paths = [
    join(__dirname, 'sentinel', 'config.json'),
    join(__dirname, '..', 'src', 'main', 'sentinel', 'config.json'),
    join(process.cwd(), 'src', 'main', 'sentinel', 'config.json')
  ]

  for (const p of paths) {
    if (existsSync(p)) {
      try {
        return JSON.parse(readFileSync(p, 'utf-8'))
      } catch {
        continue
      }
    }
  }

  return {
    enabled: true,
    pollIntervalMs: 30000,
    channels: { macos_notification: true, slack_webhook: null, vault_log: true },
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
