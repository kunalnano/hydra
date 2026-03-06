import { describe, it, expect } from 'vitest'
import { isLateNight } from './time-context'

describe('isLateNight', () => {
  it('returns true at 22:00', () => {
    expect(isLateNight(new Date('2026-03-06T22:00:00'))).toBe(true)
  })

  it('returns true at 23:30', () => {
    expect(isLateNight(new Date('2026-03-06T23:30:00'))).toBe(true)
  })

  it('returns true at midnight', () => {
    expect(isLateNight(new Date('2026-03-06T00:00:00'))).toBe(true)
  })

  it('returns true at 04:59', () => {
    expect(isLateNight(new Date('2026-03-06T04:59:00'))).toBe(true)
  })

  it('returns false at 05:00', () => {
    expect(isLateNight(new Date('2026-03-06T05:00:00'))).toBe(false)
  })

  it('returns false at noon', () => {
    expect(isLateNight(new Date('2026-03-06T12:00:00'))).toBe(false)
  })

  it('returns false at 21:59', () => {
    expect(isLateNight(new Date('2026-03-06T21:59:00'))).toBe(false)
  })

  it('returns false at 08:00', () => {
    expect(isLateNight(new Date('2026-03-06T08:00:00'))).toBe(false)
  })
})
