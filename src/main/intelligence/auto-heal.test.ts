import { describe, it, expect, beforeEach } from 'vitest'
import { evaluateRules, resetCooldowns, type PreviousState } from './auto-heal'
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
})
