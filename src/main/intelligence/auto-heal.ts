import type { SystemState, AutoHealEvent } from '../../shared/types'
import type { HealRule } from './rules'

export interface PreviousState {
  state: SystemState
  timestamp: number
}

const CPU_THRESHOLD = 90
const MEMORY_THRESHOLD = 90
const DISK_THRESHOLD = 85
const BATTERY_LOW_THRESHOLD = 20
const RAM_CLIMB_THRESHOLD = 15 // percent increase over sliding window
const COOLDOWN_MS = 60_000 // Don't re-fire the same rule within 60s

// Tracks last fire time per rule+target combo
const lastFired = new Map<string, number>()

// RAM history ring buffer for climb rate detection (stores usagePercent values)
const memoryHistory: number[] = []
const MAX_MEMORY_HISTORY = 300 // 300 snapshots at 2s interval = 10 minutes

export function resetCooldowns(): void {
  lastFired.clear()
}

export function resetMemoryHistory(): void {
  memoryHistory.length = 0
}

function shouldFire(ruleId: string, target: string): boolean {
  const key = `${ruleId}:${target}`
  const last = lastFired.get(key)
  const now = Date.now()
  if (last && now - last < COOLDOWN_MS) return false
  lastFired.set(key, now)
  return true
}

/**
 * Check if RAM usage has climbed >15% over the sliding window.
 * Compares oldest value in the window to the current value.
 */
export function checkRamClimbRate(currentMemPercent: number): number | null {
  memoryHistory.push(currentMemPercent)
  if (memoryHistory.length > MAX_MEMORY_HISTORY) {
    memoryHistory.splice(0, memoryHistory.length - MAX_MEMORY_HISTORY)
  }

  if (memoryHistory.length < 10) return null // Need at least some history

  const oldest = memoryHistory[0]
  const climb = currentMemPercent - oldest

  if (climb > RAM_CLIMB_THRESHOLD) return climb
  return null
}

export function evaluateRules(
  current: SystemState,
  previous: PreviousState | null,
  rules: HealRule[]
): AutoHealEvent[] {
  if (!previous) return []

  const events: AutoHealEvent[] = []
  const enabledIds = new Set(rules.filter((r) => r.enabled).map((r) => r.id))
  const prev = previous.state
  const lateNight = current.isLateNight ?? false

  // Rule: process_disappeared
  if (enabledIds.has('process_disappeared')) {
    const currentNames = new Set(current.processes.map((p) => p.name))
    for (const group of prev.processes) {
      if (
        group.type === 'project' &&
        !currentNames.has(group.name) &&
        shouldFire('process_disappeared', group.name)
      ) {
        events.push({
          timestamp: Date.now(),
          rule: 'process_disappeared',
          action: 'notify_only',
          target: group.name,
          success: true,
          message: `Process group "${group.name}" disappeared (was using ports: ${group.ports.join(', ') || 'none'})`
        })
      }
    }
  }

  // Rule: port_disappeared
  if (enabledIds.has('port_disappeared')) {
    const currentListening = new Set(
      current.ports.filter((p) => p.state === 'LISTEN').map((p) => p.port)
    )
    const prevListening = prev.ports.filter((p) => p.state === 'LISTEN')
    for (const port of prevListening) {
      if (!currentListening.has(port.port) && shouldFire('port_disappeared', String(port.port))) {
        events.push({
          timestamp: Date.now(),
          rule: 'port_disappeared',
          action: 'notify_only',
          target: `port ${port.port} (${port.process})`,
          success: true,
          message: `Port ${port.port} (${port.process}) stopped listening`
        })
      }
    }
  }

  // Rule: high_cpu
  if (
    enabledIds.has('high_cpu') &&
    current.cpu.usage > CPU_THRESHOLD &&
    shouldFire('high_cpu', 'system')
  ) {
    events.push({
      timestamp: Date.now(),
      rule: 'high_cpu',
      action: 'notify_only',
      target: 'system',
      success: true,
      message: `CPU usage at ${current.cpu.usage.toFixed(1)}% (threshold: ${CPU_THRESHOLD}%)`
    })
  }

  // Rule: high_memory
  if (
    enabledIds.has('high_memory') &&
    current.memory.usagePercent > MEMORY_THRESHOLD &&
    shouldFire('high_memory', 'system')
  ) {
    events.push({
      timestamp: Date.now(),
      rule: 'high_memory',
      action: 'notify_only',
      target: 'system',
      success: true,
      message: `Memory usage at ${current.memory.usagePercent.toFixed(1)}% (threshold: ${MEMORY_THRESHOLD}%)`
    })
  }

  // Rule: disk_critical
  if (enabledIds.has('disk_critical') && current.disk) {
    for (const mount of current.disk.mounts) {
      if (
        mount.usagePercent >= DISK_THRESHOLD &&
        shouldFire('disk_critical', mount.mount)
      ) {
        events.push({
          timestamp: Date.now(),
          rule: 'disk_critical',
          action: 'notify_only',
          target: mount.mount,
          success: true,
          message: `Disk "${mount.mount}" at ${mount.usagePercent}% (threshold: ${DISK_THRESHOLD}%)`
        })
      }
    }
  }

  // Rule: low_battery
  if (
    enabledIds.has('low_battery') &&
    current.battery?.hasBattery &&
    !current.battery.charging &&
    current.battery.percent <= BATTERY_LOW_THRESHOLD &&
    shouldFire('low_battery', 'battery')
  ) {
    events.push({
      timestamp: Date.now(),
      rule: 'low_battery',
      action: 'notify_only',
      target: 'battery',
      success: true,
      message: `Battery at ${current.battery.percent}% and discharging`
    })
  }

  // Rule: ram_climb_rate
  if (enabledIds.has('ram_climb_rate')) {
    const climb = checkRamClimbRate(current.memory.usagePercent)
    if (climb !== null && shouldFire('ram_climb_rate', 'system')) {
      events.push({
        timestamp: Date.now(),
        rule: 'ram_climb_rate',
        action: 'notify_only',
        target: 'system',
        success: true,
        message: `Memory climbing: +${climb.toFixed(1)}% over sliding window (threshold: ${RAM_CLIMB_THRESHOLD}%)`
      })
    }
  }

  // Late-night suppression: filter out non-critical events during late hours
  if (lateNight) {
    return events.filter((e) => {
      // Keep critical rules even at night
      const criticalRules = ['process_disappeared', 'port_disappeared', 'disk_critical', 'low_battery']
      return criticalRules.includes(e.rule)
    })
  }

  return events
}
