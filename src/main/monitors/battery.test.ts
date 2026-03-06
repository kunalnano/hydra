import { describe, it, expect } from 'vitest'
import { parsePmsetOutput } from './battery'

describe('parsePmsetOutput', () => {
  it('parses battery discharging status', () => {
    const output = `Now drawing from 'Battery Power'
 -InternalBattery-0 (id=1234)\t42%; discharging; 1:30 remaining present: true`

    const result = parsePmsetOutput(output)
    expect(result.hasBattery).toBe(true)
    expect(result.percent).toBe(42)
    expect(result.charging).toBe(false)
    expect(result.source).toBe('battery')
  })

  it('parses battery charging status', () => {
    const output = `Now drawing from 'AC Power'
 -InternalBattery-0 (id=5678)\t87%; charging; 0:42 remaining present: true`

    const result = parsePmsetOutput(output)
    expect(result.hasBattery).toBe(true)
    expect(result.percent).toBe(87)
    expect(result.charging).toBe(true)
    expect(result.source).toBe('ac')
  })

  it('parses fully charged battery', () => {
    const output = `Now drawing from 'AC Power'
 -InternalBattery-0 (id=5678)\t100%; charged; 0:00 remaining present: true`

    const result = parsePmsetOutput(output)
    expect(result.hasBattery).toBe(true)
    expect(result.percent).toBe(100)
    expect(result.charging).toBe(false)
    expect(result.source).toBe('ac')
  })

  it('handles "not charging" state', () => {
    const output = `Now drawing from 'AC Power'
 -InternalBattery-0 (id=5678)\t80%; not charging present: true`

    const result = parsePmsetOutput(output)
    expect(result.hasBattery).toBe(true)
    expect(result.percent).toBe(80)
    expect(result.charging).toBe(false)
  })

  it('returns no battery for empty output', () => {
    const result = parsePmsetOutput('')
    expect(result.hasBattery).toBe(false)
    expect(result.percent).toBe(0)
  })

  it('returns no battery when no InternalBattery line present', () => {
    const output = `Now drawing from 'AC Power'`
    const result = parsePmsetOutput(output)
    expect(result.hasBattery).toBe(false)
    expect(result.source).toBe('ac')
  })

  it('parses low battery correctly', () => {
    const output = `Now drawing from 'Battery Power'
 -InternalBattery-0 (id=1234)\t5%; discharging; 0:10 remaining present: true`

    const result = parsePmsetOutput(output)
    expect(result.hasBattery).toBe(true)
    expect(result.percent).toBe(5)
    expect(result.charging).toBe(false)
    expect(result.source).toBe('battery')
  })
})
