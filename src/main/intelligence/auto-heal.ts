import type { SystemState, AutoHealEvent } from '../../shared/types'
import type { HealRule } from './rules'

export interface PreviousState {
  state: SystemState
  timestamp: number
}

const CPU_THRESHOLD = 90
const MEMORY_THRESHOLD = 90
const COOLDOWN_MS = 60_000 // Don't re-fire the same rule within 60s

// Tracks last fire time per rule+target combo
const lastFired = new Map<string, number>()

export function resetCooldowns(): void {
  lastFired.clear()
}

function shouldFire(ruleId: string, target: string): boolean {
  const key = `${ruleId}:${target}`
  const last = lastFired.get(key)
  const now = Date.now()
  if (last && now - last < COOLDOWN_MS) return false
  lastFired.set(key, now)
  return true
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

  return events
}
