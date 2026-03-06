import { readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { CCUsageState, CCDailyEntry } from '../../shared/types'

const CLAUDE_DIR = join(homedir(), '.claude')
const STATS_FILE = join(CLAUDE_DIR, 'stats-cache.json')

// Pricing per million tokens (USD)
const MODEL_PRICING: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  'claude-sonnet': { input: 3, output: 15, cacheRead: 0.30, cacheWrite: 3.75 },
  'claude-opus': { input: 15, output: 75, cacheRead: 1.50, cacheWrite: 18.75 },
  'claude-haiku': { input: 0.80, output: 4, cacheRead: 0.08, cacheWrite: 1 }
}

function getModelFamily(modelId: string): string {
  if (modelId.includes('opus')) return 'claude-opus'
  if (modelId.includes('haiku')) return 'claude-haiku'
  return 'claude-sonnet'
}

function estimateCost(
  inputTokens: number,
  outputTokens: number,
  cacheRead: number,
  cacheWrite: number,
  family: string
): number {
  const pricing = MODEL_PRICING[family] || MODEL_PRICING['claude-sonnet']
  return (
    (inputTokens / 1e6) * pricing.input +
    (outputTokens / 1e6) * pricing.output +
    (cacheRead / 1e6) * pricing.cacheRead +
    (cacheWrite / 1e6) * pricing.cacheWrite
  )
}

interface StatsCache {
  version: number
  lastComputedDate: string
  dailyActivity: { date: string; messageCount: number; sessionCount: number; toolCallCount: number }[]
  dailyModelTokens: { date: string; tokensByModel: Record<string, number> }[]
  modelUsage: Record<string, {
    inputTokens: number
    outputTokens: number
    cacheReadInputTokens: number
    cacheCreationInputTokens: number
  }>
  totalSessions: number
  totalMessages: number
}

export function getCCUsage(): CCUsageState {
  try {
    const raw = readFileSync(STATS_FILE, 'utf-8')
    const stats: StatsCache = JSON.parse(raw)

    // Total cost estimate across all models
    let totalCostUSD = 0
    const modelBreakdown: CCUsageState['modelBreakdown'] = []
    for (const [modelId, usage] of Object.entries(stats.modelUsage)) {
      const family = getModelFamily(modelId)
      const cost = estimateCost(
        usage.inputTokens,
        usage.outputTokens,
        usage.cacheReadInputTokens,
        usage.cacheCreationInputTokens,
        family
      )
      totalCostUSD += cost
      modelBreakdown.push({
        model: modelId,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadTokens: usage.cacheReadInputTokens,
        cacheWriteTokens: usage.cacheCreationInputTokens,
        costUSD: cost
      })
    }

    // Today's stats
    const today = new Date().toISOString().slice(0, 10)
    const todayActivity = stats.dailyActivity.find((d) => d.date === today)
    const todayTokenEntry = stats.dailyModelTokens.find((d) => d.date === today)
    let todayTokens = 0
    if (todayTokenEntry) {
      todayTokens = Object.values(todayTokenEntry.tokensByModel).reduce((a, b) => a + b, 0)
    }

    // Last 7 days for sparkline
    const last7: CCDailyEntry[] = []
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const cutoff = sevenDaysAgo.toISOString().slice(0, 10)

    for (const day of stats.dailyActivity) {
      if (day.date >= cutoff) {
        const tokenEntry = stats.dailyModelTokens.find((t) => t.date === day.date)
        const tokens = tokenEntry
          ? Object.values(tokenEntry.tokensByModel).reduce((a, b) => a + b, 0)
          : 0
        last7.push({
          date: day.date,
          messages: day.messageCount,
          sessions: day.sessionCount,
          toolCalls: day.toolCallCount,
          tokens
        })
      }
    }

    // This month's stats
    const thisMonth = today.slice(0, 7)
    let monthMessages = 0
    let monthSessions = 0
    let monthTokens = 0
    for (const day of stats.dailyActivity) {
      if (day.date.startsWith(thisMonth)) {
        monthMessages += day.messageCount
        monthSessions += day.sessionCount
      }
    }
    for (const day of stats.dailyModelTokens) {
      if (day.date.startsWith(thisMonth)) {
        monthTokens += Object.values(day.tokensByModel).reduce((a, b) => a + b, 0)
      }
    }

    return {
      available: true,
      totalSessions: stats.totalSessions,
      totalMessages: stats.totalMessages,
      totalCostUSD,
      todayMessages: todayActivity?.messageCount ?? 0,
      todaySessions: todayActivity?.sessionCount ?? 0,
      todayToolCalls: todayActivity?.toolCallCount ?? 0,
      todayTokens,
      monthMessages,
      monthSessions,
      monthTokens,
      last7Days: last7,
      modelBreakdown,
      lastUpdated: stats.lastComputedDate,
      timestamp: Date.now()
    }
  } catch {
    return {
      available: false,
      totalSessions: 0,
      totalMessages: 0,
      totalCostUSD: 0,
      todayMessages: 0,
      todaySessions: 0,
      todayToolCalls: 0,
      todayTokens: 0,
      monthMessages: 0,
      monthSessions: 0,
      monthTokens: 0,
      last7Days: [],
      modelBreakdown: [],
      lastUpdated: '',
      timestamp: Date.now()
    }
  }
}
