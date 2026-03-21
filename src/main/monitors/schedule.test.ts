import { describe, expect, it } from 'vitest'
import {
  buildMonitorTickThresholds,
  intervalToTicks,
  resolveMonitorInterval,
  resolveSnapshotInterval
} from './schedule'

describe('monitor schedule helpers', () => {
  it('uses documented defaults when config omits intervals', () => {
    expect(resolveMonitorInterval()).toBe(2000)
    expect(resolveSnapshotInterval()).toBe(30000)
  })

  it('derives tick thresholds from the configured monitor and snapshot intervals', () => {
    const thresholds = buildMonitorTickThresholds({
      monitorInterval: 5000,
      snapshotInterval: 45000
    })

    expect(thresholds.network).toBe(3)
    expect(thresholds.disk).toBe(6)
    expect(thresholds.git).toBe(12)
    expect(thresholds.snapshot).toBe(9)
    expect(thresholds.session).toBe(24)
  })

  it('never schedules snapshot polling faster than the base monitor loop', () => {
    expect(resolveSnapshotInterval({ monitorInterval: 4000, snapshotInterval: 1000 })).toBe(4000)
    expect(intervalToTicks(4000, 4000)).toBe(1)
  })
})
