import { describe, it, expect, beforeEach } from 'vitest'
import { evaluateRules, resetCooldowns, resetMemoryHistory, checkRamClimbRate, type PreviousState } from './auto-heal'
import { DEFAULT_RULES } from './rules'
import type { SystemState, ProcessGroup } from '../../shared/types'

function makeState(overrides: Partial<SystemState> = {}): SystemState {
  return {
    timestamp: Date.now(),
    processes: [],
    ports: [],
    agents: [],
    gitRepos: [],
    cpu: { usage: 30, cores: 10 },
    memory: { total: 32e9, used: 16e9, free: 16e9, usagePercent: 50 },
    ...overrides
  }
}

describe('evaluateRules', () => {
  beforeEach(() => {
    resetCooldowns()
    resetMemoryHistory()
  })

  it('should detect a disappeared dev server process group', () => {
    const devServer: ProcessGroup = {
      name: 'my-app',
      type: 'project',
      processes: [
        { pid: 100, user: 'me', cpu: 5, mem: 2, command: 'node server.js', name: 'node' }
      ],
      totalCpu: 5,
      totalMem: 2,
      ports: [3000]
    }

    const prev: PreviousState = {
      state: makeState({ processes: [devServer] }),
      timestamp: Date.now() - 5000
    }
    const current = makeState({ processes: [] })

    const events = evaluateRules(current, prev, DEFAULT_RULES)
    expect(events.length).toBeGreaterThanOrEqual(1)
    expect(events[0].rule).toBe('process_disappeared')
    expect(events[0].target).toContain('my-app')
  })

  it('should detect high CPU', () => {
    const prev: PreviousState = {
      state: makeState({ cpu: { usage: 50, cores: 10 } }),
      timestamp: Date.now() - 5000
    }
    const current = makeState({ cpu: { usage: 92, cores: 10 } })

    const events = evaluateRules(current, prev, DEFAULT_RULES)
    const cpuEvent = events.find((e) => e.rule === 'high_cpu')
    expect(cpuEvent).toBeDefined()
    expect(cpuEvent!.action).toBe('notify_only')
  })

  it('should detect high memory', () => {
    const prev: PreviousState = {
      state: makeState(),
      timestamp: Date.now() - 5000
    }
    const current = makeState({
      memory: { total: 32e9, used: 30e9, free: 2e9, usagePercent: 93 }
    })

    const events = evaluateRules(current, prev, DEFAULT_RULES)
    const memEvent = events.find((e) => e.rule === 'high_memory')
    expect(memEvent).toBeDefined()
  })

  it('should detect a port that stopped listening', () => {
    const prev: PreviousState = {
      state: makeState({
        ports: [
          { port: 3000, pid: 100, process: 'node', protocol: 'TCP', state: 'LISTEN', address: '*' }
        ]
      }),
      timestamp: Date.now() - 5000
    }
    const current = makeState({ ports: [] })

    const events = evaluateRules(current, prev, DEFAULT_RULES)
    const portEvent = events.find((e) => e.rule === 'port_disappeared')
    expect(portEvent).toBeDefined()
    expect(portEvent!.target).toContain('3000')
  })

  it('should return empty array when nothing changed', () => {
    const state = makeState()
    const prev: PreviousState = { state, timestamp: Date.now() - 5000 }
    const events = evaluateRules(state, prev, DEFAULT_RULES)
    expect(events).toEqual([])
  })

  it('should detect disk critical usage', () => {
    const prev: PreviousState = {
      state: makeState(),
      timestamp: Date.now() - 5000
    }
    const current = makeState({
      disk: {
        mounts: [
          {
            filesystem: '/dev/sda1',
            mount: '/',
            totalBytes: 100e9,
            usedBytes: 90e9,
            availableBytes: 10e9,
            usagePercent: 90
          }
        ],
        maxUsagePercent: 90,
        timestamp: Date.now()
      }
    })

    const events = evaluateRules(current, prev, DEFAULT_RULES)
    const diskEvent = events.find((e) => e.rule === 'disk_critical')
    expect(diskEvent).toBeDefined()
    expect(diskEvent!.target).toBe('/')
  })

  it('should detect low battery', () => {
    const prev: PreviousState = {
      state: makeState(),
      timestamp: Date.now() - 5000
    }
    const current = makeState({
      battery: {
        hasBattery: true,
        percent: 15,
        charging: false,
        source: 'battery',
        timestamp: Date.now()
      }
    })

    const events = evaluateRules(current, prev, DEFAULT_RULES)
    const batteryEvent = events.find((e) => e.rule === 'low_battery')
    expect(batteryEvent).toBeDefined()
    expect(batteryEvent!.message).toContain('15%')
  })

  it('should not fire low_battery when charging', () => {
    const prev: PreviousState = {
      state: makeState(),
      timestamp: Date.now() - 5000
    }
    const current = makeState({
      battery: {
        hasBattery: true,
        percent: 15,
        charging: true,
        source: 'ac',
        timestamp: Date.now()
      }
    })

    const events = evaluateRules(current, prev, DEFAULT_RULES)
    const batteryEvent = events.find((e) => e.rule === 'low_battery')
    expect(batteryEvent).toBeUndefined()
  })

  it('should suppress non-critical events during late night', () => {
    const prev: PreviousState = {
      state: makeState(),
      timestamp: Date.now() - 5000
    }
    // High CPU is non-critical, should be suppressed during late night
    const current = makeState({
      cpu: { usage: 95, cores: 10 },
      isLateNight: true
    })

    const events = evaluateRules(current, prev, DEFAULT_RULES)
    const cpuEvent = events.find((e) => e.rule === 'high_cpu')
    expect(cpuEvent).toBeUndefined()
  })

  it('should keep critical events during late night', () => {
    const prev: PreviousState = {
      state: makeState({
        ports: [
          { port: 3000, pid: 100, process: 'node', protocol: 'TCP', state: 'LISTEN', address: '*' }
        ]
      }),
      timestamp: Date.now() - 5000
    }
    const current = makeState({
      ports: [],
      isLateNight: true
    })

    const events = evaluateRules(current, prev, DEFAULT_RULES)
    const portEvent = events.find((e) => e.rule === 'port_disappeared')
    expect(portEvent).toBeDefined()
  })
})

describe('checkRamClimbRate', () => {
  beforeEach(() => {
    resetMemoryHistory()
  })

  it('returns null with insufficient history', () => {
    for (let i = 0; i < 5; i++) {
      expect(checkRamClimbRate(50)).toBeNull()
    }
  })

  it('detects a climb above threshold', () => {
    // Fill 10 snapshots at 50%
    for (let i = 0; i < 10; i++) {
      checkRamClimbRate(50)
    }
    // Now jump to 70% — climb of 20%
    const result = checkRamClimbRate(70)
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(20, 0)
  })

  it('returns null when climb is below threshold', () => {
    // Fill 10 snapshots at 50%
    for (let i = 0; i < 10; i++) {
      checkRamClimbRate(50)
    }
    // Small jump to 55% — climb of 5%, below 15% threshold
    const result = checkRamClimbRate(55)
    expect(result).toBeNull()
  })

  it('returns null when memory is decreasing', () => {
    // Fill 10 snapshots at 70%
    for (let i = 0; i < 10; i++) {
      checkRamClimbRate(70)
    }
    // Drop to 50%
    const result = checkRamClimbRate(50)
    expect(result).toBeNull()
  })
})
