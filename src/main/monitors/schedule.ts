export const DEFAULT_MONITOR_INTERVAL_MS = 2000
export const DEFAULT_SNAPSHOT_INTERVAL_MS = 30000

export const NETWORK_POLL_MS = 15000
export const DISK_POLL_MS = 30000
export const BATTERY_POLL_MS = 30000
export const GIT_POLL_MS = 60000
export const FIREWALL_POLL_MS = 60000
export const CCUSAGE_POLL_MS = 60000
export const SESSION_POLL_MS = 120000

interface IntervalConfig {
  monitorInterval?: number
  snapshotInterval?: number
}

export interface MonitorTickThresholds {
  network: number
  disk: number
  battery: number
  git: number
  firewall: number
  ccusage: number
  snapshot: number
  session: number
}

function sanitizeInterval(intervalMs: number | undefined, fallbackMs: number): number {
  if (typeof intervalMs !== 'number' || !Number.isFinite(intervalMs) || intervalMs <= 0) {
    return fallbackMs
  }

  return Math.floor(intervalMs)
}

export function resolveMonitorInterval(config?: IntervalConfig): number {
  return sanitizeInterval(config?.monitorInterval, DEFAULT_MONITOR_INTERVAL_MS)
}

export function resolveSnapshotInterval(config?: IntervalConfig): number {
  const monitorIntervalMs = resolveMonitorInterval(config)
  const snapshotIntervalMs = sanitizeInterval(
    config?.snapshotInterval,
    DEFAULT_SNAPSHOT_INTERVAL_MS
  )

  return Math.max(snapshotIntervalMs, monitorIntervalMs)
}

export function intervalToTicks(targetIntervalMs: number, tickIntervalMs: number): number {
  return Math.max(1, Math.ceil(targetIntervalMs / tickIntervalMs))
}

export function buildMonitorTickThresholds(config?: IntervalConfig): MonitorTickThresholds {
  const monitorIntervalMs = resolveMonitorInterval(config)
  const snapshotIntervalMs = resolveSnapshotInterval(config)

  return {
    network: intervalToTicks(NETWORK_POLL_MS, monitorIntervalMs),
    disk: intervalToTicks(DISK_POLL_MS, monitorIntervalMs),
    battery: intervalToTicks(BATTERY_POLL_MS, monitorIntervalMs),
    git: intervalToTicks(GIT_POLL_MS, monitorIntervalMs),
    firewall: intervalToTicks(FIREWALL_POLL_MS, monitorIntervalMs),
    ccusage: intervalToTicks(CCUSAGE_POLL_MS, monitorIntervalMs),
    snapshot: intervalToTicks(snapshotIntervalMs, monitorIntervalMs),
    session: intervalToTicks(SESSION_POLL_MS, monitorIntervalMs)
  }
}
