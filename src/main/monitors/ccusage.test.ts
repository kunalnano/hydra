import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('os', () => ({
  homedir: vi.fn(() => '/Users/testuser')
}))

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn()
}))

import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { getCCUsage } from './ccusage'

const mockExistsSync = vi.mocked(existsSync)
const mockReadFileSync = vi.mocked(readFileSync)
const mockReaddirSync = vi.mocked(readdirSync)
const mockStatSync = vi.mocked(statSync)

const STATS_FILE = '/Users/testuser/.claude/stats-cache.json'
const PROJECTS_DIR = '/Users/testuser/.claude/projects'
const PROJECT_DIR = `${PROJECTS_DIR}/project-a`
const PROJECT_FILE = `${PROJECT_DIR}/session.jsonl`

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

function mockDirent(name: string, type: 'file' | 'dir'): { name: string; isFile: () => boolean; isDirectory: () => boolean } {
  return {
    name,
    isFile: () => type === 'file',
    isDirectory: () => type === 'dir'
  }
}

describe('getCCUsage', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-15T12:00:00-05:00'))
    mockExistsSync.mockReset()
    mockReadFileSync.mockReset()
    mockReaddirSync.mockReset()
    mockStatSync.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should parse stats-cache.json correctly', () => {
    mockReadFileSync.mockImplementation((path) => {
      if (path === STATS_FILE) return JSON.stringify(MOCK_STATS)
      throw new Error('ENOENT')
    })
    mockExistsSync.mockReturnValue(false)

    const result = getCCUsage()

    expect(result.available).toBe(true)
    expect(result.totalSessions).toBe(695)
    expect(result.totalMessages).toBe(49637)
    expect(result.totalCostUSD).toBeGreaterThan(0)
    expect(result.modelBreakdown).toHaveLength(1)
    expect(result.modelBreakdown[0].model).toBe('claude-opus-4-6')
    expect(result.source).toBe('stats-cache')
    expect(result.cacheStale).toBe(true)
  })

  it('should return unavailable state when no cache or live logs exist', () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT')
    })
    mockExistsSync.mockReturnValue(false)

    const result = getCCUsage()

    expect(result.available).toBe(false)
    expect(result.totalSessions).toBe(0)
    expect(result.totalCostUSD).toBe(0)
    expect(result.source).toBe('live-log')
  })

  it('should overlay stale cache with live usage from project logs', () => {
    const liveJsonl = [
      JSON.stringify({
        type: 'user',
        sessionId: 'session-1',
        timestamp: '2026-03-15T16:00:00.000Z',
        message: { role: 'user', content: 'check usage' }
      }),
      JSON.stringify({
        type: 'assistant',
        sessionId: 'session-1',
        requestId: 'req-1',
        timestamp: '2026-03-15T16:00:01.000Z',
        message: {
          id: 'msg-1',
          model: 'claude-opus-4-6',
          usage: {
            input_tokens: 10,
            output_tokens: 1,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0
          },
          content: [{ type: 'thinking' }]
        }
      }),
      JSON.stringify({
        type: 'assistant',
        sessionId: 'session-1',
        requestId: 'req-1',
        timestamp: '2026-03-15T16:00:02.000Z',
        message: {
          id: 'msg-1',
          model: 'claude-opus-4-6',
          usage: {
            input_tokens: 10,
            output_tokens: 20,
            cache_read_input_tokens: 30,
            cache_creation_input_tokens: 40
          },
          content: [{ type: 'tool_use', id: 'tool-1', name: 'Read', input: {} }]
        }
      })
    ].join('\n')

    mockReadFileSync.mockImplementation((path) => {
      if (path === STATS_FILE) return JSON.stringify(MOCK_STATS)
      if (path === PROJECT_FILE) return liveJsonl
      throw new Error(`ENOENT: ${path}`)
    })
    mockExistsSync.mockImplementation((path) => path === PROJECTS_DIR || path === PROJECT_DIR)
    mockReaddirSync.mockImplementation((path) => {
      if (path === PROJECTS_DIR) return [mockDirent('project-a', 'dir')] as never
      if (path === PROJECT_DIR) return [mockDirent('session.jsonl', 'file')] as never
      return [] as never
    })
    mockStatSync.mockImplementation((path) => {
      if (path === PROJECT_FILE) {
        return { mtimeMs: 1000, size: liveJsonl.length } as never
      }
      throw new Error(`ENOENT: ${path}`)
    })

    const result = getCCUsage({ forceLive: true })

    const expectedLiveCost =
      (10 / 1e6) * 15 +
      (20 / 1e6) * 75 +
      (30 / 1e6) * 1.5 +
      (40 / 1e6) * 18.75

    expect(result.source).toBe('hybrid')
    expect(result.cacheStale).toBe(true)
    expect(result.todayMessages).toBe(2)
    expect(result.todaySessions).toBe(1)
    expect(result.todayToolCalls).toBe(1)
    expect(result.liveDeltaCostUSD).toBeCloseTo(expectedLiveCost, 6)
    expect(result.totalCostUSD).toBeCloseTo(
      result.modelBreakdown.reduce((sum, model) => sum + model.costUSD, 0),
      6
    )
    expect(result.liveLastActivity).toBe('2026-03-15T16:00:02.000Z')
  })

  it('should build usage from live logs when stats-cache is missing', () => {
    const liveJsonl = [
      JSON.stringify({
        type: 'user',
        sessionId: 'session-9',
        timestamp: '2026-03-15T18:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'ship it' }] }
      }),
      JSON.stringify({
        type: 'assistant',
        sessionId: 'session-9',
        requestId: 'req-9',
        timestamp: '2026-03-15T18:00:02.000Z',
        message: {
          id: 'msg-9',
          model: 'claude-sonnet-4-5-20250929',
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0
          },
          content: [{ type: 'text', text: 'done' }]
        }
      })
    ].join('\n')

    mockReadFileSync.mockImplementation((path) => {
      if (path === PROJECT_FILE) return liveJsonl
      throw new Error(`ENOENT: ${path}`)
    })
    mockExistsSync.mockImplementation((path) => path === PROJECTS_DIR || path === PROJECT_DIR)
    mockReaddirSync.mockImplementation((path) => {
      if (path === PROJECTS_DIR) return [mockDirent('project-a', 'dir')] as never
      if (path === PROJECT_DIR) return [mockDirent('session.jsonl', 'file')] as never
      return [] as never
    })
    mockStatSync.mockImplementation((path) => {
      if (path === PROJECT_FILE) {
        return { mtimeMs: 2000, size: liveJsonl.length } as never
      }
      throw new Error(`ENOENT: ${path}`)
    })

    const result = getCCUsage({ forceLive: true })

    expect(result.available).toBe(true)
    expect(result.source).toBe('live-log')
    expect(result.totalSessions).toBe(1)
    expect(result.todayMessages).toBe(2)
    expect(result.todayToolCalls).toBe(0)
    expect(result.totalCostUSD).toBeGreaterThan(0)
  })
})
