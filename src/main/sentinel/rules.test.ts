import { describe, it, expect } from 'vitest'
import { defaultRules } from './rules'
import type { SystemState } from '../../shared/types'

function makeState(overrides: Partial<SystemState> = {}): SystemState {
  return {
    timestamp: Date.now(),
    processes: [],
    ports: [],
    agents: [],
    gitRepos: [],
    cpu: { usage: 30, cores: 8 },
    memory: { total: 16e9, used: 8e9, free: 8e9, usagePercent: 50 },
    ...overrides
  }
}

function getRule(id: string) {
  const rule = defaultRules.find((r) => r.id === id)
  if (!rule) throw new Error(`Rule ${id} not found`)
  return rule
}

describe('sentinel rules', () => {
  describe('agent-crash', () => {
    const rule = getRule('agent-crash')

    it('returns null when no previous state', () => {
      expect(rule.check(makeState(), null)).toBeNull()
    })

    it('returns null when agents are stable', () => {
      const agents = [{ id: 'a1', name: 'test', type: 'claude-code' as const, status: 'active' as const, source: 'process' as const, pid: 1234 }]
      const prev = makeState({ agents })
      const curr = makeState({ agents })
      expect(rule.check(curr, prev)).toBeNull()
    })

    it('fires when agent PID disappears', () => {
      const prev = makeState({
        agents: [{ id: 'a1', name: 'test', type: 'claude-code' as const, status: 'active' as const, source: 'process' as const, pid: 1234 }]
      })
      const curr = makeState({ agents: [] })
      const alert = rule.check(curr, prev)
      expect(alert).not.toBeNull()
      expect(alert!.severity).toBe('warning')
      expect(alert!.title).toBe('Agent disappeared')
    })
  })

  describe('high-cpu', () => {
    const rule = getRule('high-cpu')

    it('returns null on first poll', () => {
      const state = makeState({ cpu: { usage: 95, cores: 8 } })
      expect(rule.check(state, null)).toBeNull()
    })

    it('returns null when CPU is normal', () => {
      const prev = makeState({ cpu: { usage: 50, cores: 8 } })
      const curr = makeState({ cpu: { usage: 60, cores: 8 } })
      expect(rule.check(curr, prev)).toBeNull()
    })

    it('fires on 2 consecutive high CPU polls', () => {
      const prev = makeState({ cpu: { usage: 92, cores: 8 } })
      const curr = makeState({ cpu: { usage: 95, cores: 8 } })
      const alert = rule.check(curr, prev)
      expect(alert).not.toBeNull()
      expect(alert!.severity).toBe('warning')
    })

    it('does not fire if only current poll is high', () => {
      const prev = makeState({ cpu: { usage: 50, cores: 8 } })
      const curr = makeState({ cpu: { usage: 95, cores: 8 } })
      expect(rule.check(curr, prev)).toBeNull()
    })
  })

  describe('high-memory', () => {
    const rule = getRule('high-memory')

    it('returns null when memory is normal', () => {
      expect(rule.check(makeState(), null)).toBeNull()
    })

    it('fires when memory exceeds 85%', () => {
      const state = makeState({ memory: { total: 16e9, used: 14e9, free: 2e9, usagePercent: 87.5 } })
      const alert = rule.check(state, null)
      expect(alert).not.toBeNull()
      expect(alert!.severity).toBe('warning')
    })
  })

  describe('port-conflict', () => {
    const rule = getRule('port-conflict')

    it('returns null when no conflicts', () => {
      const state = makeState({
        ports: [
          { port: 3000, pid: 1, process: 'node', protocol: 'TCP' as const, state: 'LISTEN' as const, address: '0.0.0.0' },
          { port: 8080, pid: 2, process: 'python', protocol: 'TCP' as const, state: 'LISTEN' as const, address: '0.0.0.0' }
        ]
      })
      expect(rule.check(state, null)).toBeNull()
    })

    it('fires when two processes on same port', () => {
      const state = makeState({
        ports: [
          { port: 3000, pid: 1, process: 'node', protocol: 'TCP' as const, state: 'LISTEN' as const, address: '0.0.0.0' },
          { port: 3000, pid: 2, process: 'python', protocol: 'TCP' as const, state: 'LISTEN' as const, address: '0.0.0.0' }
        ]
      })
      const alert = rule.check(state, null)
      expect(alert).not.toBeNull()
      expect(alert!.severity).toBe('critical')
    })
  })

  describe('long-running-agent', () => {
    const rule = getRule('long-running-agent')

    it('returns null for short sessions', () => {
      const state = makeState({
        agents: [{ id: 'a1', name: 'test', type: 'claude-code' as const, status: 'active' as const, source: 'process' as const, uptime: 3600000 }]
      })
      expect(rule.check(state, null)).toBeNull()
    })

    it('fires for sessions over 2 hours', () => {
      const state = makeState({
        agents: [{ id: 'a1', name: 'test', type: 'claude-code' as const, status: 'active' as const, source: 'process' as const, uptime: 7500000 }]
      })
      const alert = rule.check(state, null)
      expect(alert).not.toBeNull()
      expect(alert!.severity).toBe('info')
    })
  })
})
