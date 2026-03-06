import { describe, it, expect, vi } from 'vitest'

// Mock fs before importing the module
vi.mock('fs', () => ({
  readFileSync: vi.fn()
}))

import { getCCUsage } from './ccusage'
import { readFileSync } from 'fs'

const mockReadFileSync = vi.mocked(readFileSync)

const MOCK_STATS = {
  version: 2,
  lastComputedDate: '2026-02-15',
  dailyActivity: [
    { date: '2026-02-14', messageCount: 1286, sessionCount: 3, toolCallCount: 202 },
    { date: '2026-02-15', messageCount: 5420, sessionCount: 5, toolCallCount: 882 }
  ],
  dailyModelTokens: [
    { date: '2026-02-14', tokensByModel: { 'claude-opus-4-6': 79131 } },
    { date: '2026-02-15', tokensByModel: { 'claude-opus-4-6': 251624 } }
  ],
  modelUsage: {
    'claude-opus-4-6': {
      inputTokens: 240464,
      outputTokens: 129085,
      cacheReadInputTokens: 225143353,
      cacheCreationInputTokens: 13032901
    }
  },
  totalSessions: 695,
  totalMessages: 49637
}

describe('getCCUsage', () => {
  it('should parse stats-cache.json correctly', () => {
    mockReadFileSync.mockReturnValue(JSON.stringify(MOCK_STATS))
    const result = getCCUsage()

    expect(result.available).toBe(true)
    expect(result.totalSessions).toBe(695)
    expect(result.totalMessages).toBe(49637)
    expect(result.totalCostUSD).toBeGreaterThan(0)
    expect(result.modelBreakdown).toHaveLength(1)
    expect(result.modelBreakdown[0].model).toBe('claude-opus-4-6')
  })

  it('should return unavailable state when file is missing', () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT')
    })
    const result = getCCUsage()

    expect(result.available).toBe(false)
    expect(result.totalSessions).toBe(0)
    expect(result.totalCostUSD).toBe(0)
  })

  it('should handle malformed JSON gracefully', () => {
    mockReadFileSync.mockReturnValue('not json')
    const result = getCCUsage()

    expect(result.available).toBe(false)
  })

  it('should calculate opus pricing correctly', () => {
    mockReadFileSync.mockReturnValue(JSON.stringify(MOCK_STATS))
    const result = getCCUsage()
    const opus = result.modelBreakdown.find((m) => m.model === 'claude-opus-4-6')!

    // Opus: $15/M in, $75/M out, $1.50/M cache read, $18.75/M cache write
    const expectedCost =
      (240464 / 1e6) * 15 +
      (129085 / 1e6) * 75 +
      (225143353 / 1e6) * 1.5 +
      (13032901 / 1e6) * 18.75

    expect(opus.costUSD).toBeCloseTo(expectedCost, 2)
  })
})
