import { describe, it, expect } from 'vitest'
import { parseDfOutput } from './disk'

const SAMPLE_DF_OUTPUT = `Filesystem     1024-blocks      Used Available Capacity  Mounted on
/dev/disk3s1s1   489825072  21345678 123456789    15%    /
/dev/disk3s5     489825072 400000000  89825072    82%    /System/Volumes/Data
devfs                  245       245         0   100%    /dev`

describe('parseDfOutput', () => {
  it('parses df -Pk output into mount entries', () => {
    const result = parseDfOutput(SAMPLE_DF_OUTPUT)
    // devfs should be filtered out
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({
      filesystem: '/dev/disk3s1s1',
      mount: '/',
      totalBytes: 489825072 * 1024,
      usedBytes: 21345678 * 1024,
      availableBytes: 123456789 * 1024,
      usagePercent: 15
    })
    expect(result[1].mount).toBe('/System/Volumes/Data')
    expect(result[1].usagePercent).toBe(82)
  })

  it('returns empty array for empty output', () => {
    expect(parseDfOutput('')).toEqual([])
  })

  it('returns empty array for header-only output', () => {
    const headerOnly = 'Filesystem     1024-blocks      Used Available Capacity  Mounted on'
    expect(parseDfOutput(headerOnly)).toEqual([])
  })

  it('skips zero-size filesystems', () => {
    const output = `Filesystem     1024-blocks      Used Available Capacity  Mounted on
tmpfs                    0         0         0     0%    /tmp
/dev/sda1        100000000  50000000  50000000    50%    /`
    const result = parseDfOutput(output)
    expect(result).toHaveLength(1)
    expect(result[0].mount).toBe('/')
  })

  it('handles high usage correctly', () => {
    const output = `Filesystem     1024-blocks      Used Available Capacity  Mounted on
/dev/sda1        100000000  95000000   5000000    95%    /`
    const result = parseDfOutput(output)
    expect(result).toHaveLength(1)
    expect(result[0].usagePercent).toBe(95)
  })

  it('handles mount points with spaces', () => {
    const output = `Filesystem     1024-blocks      Used Available Capacity  Mounted on
/dev/sda1        100000000  50000000  50000000    50%    /Volumes/My Drive`
    const result = parseDfOutput(output)
    expect(result).toHaveLength(1)
    expect(result[0].mount).toBe('/Volumes/My Drive')
  })
})
