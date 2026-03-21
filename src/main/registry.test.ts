import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import type { AgentRegistryEntry } from '../shared/types'

describe('agent-registry.json', () => {
  const raw = readFileSync(join(__dirname, 'data', 'agent-registry.json'), 'utf-8')
  const entries: AgentRegistryEntry[] = JSON.parse(raw)

  it('loads as valid JSON array', () => {
    expect(Array.isArray(entries)).toBe(true)
  })

  it('ships an empty seed registry by default', () => {
    expect(entries).toEqual([])
  })

  it('every entry has required fields', () => {
    for (const entry of entries) {
      expect(entry.id).toBeTruthy()
      expect(entry.name).toBeTruthy()
      expect(entry.type).toBeTruthy()
      expect(entry.status).toBeTruthy()
      expect(entry.era.start).toBeTruthy()
      expect(entry.description).toBeTruthy()
      expect(Array.isArray(entry.stack)).toBe(true)
      expect(Array.isArray(entry.keyOutputs)).toBe(true)
      expect(Array.isArray(entry.tags)).toBe(true)
      expect(typeof entry.impactScore).toBe('number')
      expect(entry.impactScore).toBeGreaterThanOrEqual(1)
      expect(entry.impactScore).toBeLessThanOrEqual(100)
    }
  })

  it('has unique IDs', () => {
    const ids = entries.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has valid status values', () => {
    const validStatuses = ['active', 'retired', 'stalled', 'dead', 'evolved']
    for (const entry of entries) {
      expect(validStatuses).toContain(entry.status)
    }
  })

  it('parentAgent references exist in registry', () => {
    const ids = new Set(entries.map((e) => e.id))
    for (const entry of entries) {
      if (entry.parentAgent) {
        expect(ids.has(entry.parentAgent)).toBe(true)
      }
    }
  })

  it('seed file contains no bundled personal agent history', () => {
    expect(entries.find((e) => e.id === 'helm')).toBeUndefined()
  })
})
