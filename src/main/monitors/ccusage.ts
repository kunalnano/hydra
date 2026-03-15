import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { CCUsageSource, CCUsageState, CCDailyEntry } from '../../shared/types'

const CLAUDE_DIR = join(homedir(), '.claude')
const STATS_FILE = join(CLAUDE_DIR, 'stats-cache.json')
const PROJECTS_DIR = join(CLAUDE_DIR, 'projects')

// Pricing per million tokens (USD)
const MODEL_PRICING: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  'claude-sonnet': { input: 3, output: 15, cacheRead: 0.30, cacheWrite: 3.75 },
  'claude-opus': { input: 15, output: 75, cacheRead: 1.50, cacheWrite: 18.75 },
  'claude-haiku': { input: 0.80, output: 4, cacheRead: 0.08, cacheWrite: 1 }
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

interface UsageTotals {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  costUSD: number
}

interface LiveDailyTotals {
  messages: number
  toolCalls: number
  tokens: number
  sessionIds: Set<string>
}

interface LiveUsageAggregate {
  totalMessages: number
  totalCostUSD: number
  totalSessions: Set<string>
  daily: Map<string, LiveDailyTotals>
  modelBreakdown: Map<string, UsageTotals>
  latestActivityAt: number
}

interface CachedLiveFile {
  mtimeMs: number
  size: number
  summary: LiveUsageAggregate
}

interface LiveUsageCache {
  cutoffMs: number
  files: Map<string, CachedLiveFile>
}

interface AssistantUsageRecord {
  timestampMs: number
  sessionId: string
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  hasToolUse: boolean
}

interface CCUsageOptions {
  forceLive?: boolean
}

let liveUsageCache: LiveUsageCache | null = null

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

function createEmptyDailyTotals(): LiveDailyTotals {
  return {
    messages: 0,
    toolCalls: 0,
    tokens: 0,
    sessionIds: new Set<string>()
  }
}

function createEmptyLiveAggregate(): LiveUsageAggregate {
  return {
    totalMessages: 0,
    totalCostUSD: 0,
    totalSessions: new Set<string>(),
    daily: new Map<string, LiveDailyTotals>(),
    modelBreakdown: new Map<string, UsageTotals>(),
    latestActivityAt: 0
  }
}

function createUnavailableState(source: CCUsageSource = 'stats-cache'): CCUsageState {
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
    timestamp: Date.now(),
    source,
    cacheStale: false,
    cacheUpdated: '',
    liveLastActivity: '',
    liveDeltaCostUSD: 0
  }
}

function getOrCreateDaily(map: Map<string, LiveDailyTotals>, date: string): LiveDailyTotals {
  const current = map.get(date)
  if (current) return current
  const next = createEmptyDailyTotals()
  map.set(date, next)
  return next
}

function addModelTotals(
  map: Map<string, UsageTotals>,
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
  cacheWriteTokens: number
): number {
  const family = getModelFamily(model)
  const costUSD = estimateCost(
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    family
  )
  const current = map.get(model) || {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    costUSD: 0
  }
  current.inputTokens += inputTokens
  current.outputTokens += outputTokens
  current.cacheReadTokens += cacheReadTokens
  current.cacheWriteTokens += cacheWriteTokens
  current.costUSD += costUSD
  map.set(model, current)
  return costUSD
}

function mergeLiveAggregate(target: LiveUsageAggregate, source: LiveUsageAggregate): void {
  target.totalMessages += source.totalMessages
  target.totalCostUSD += source.totalCostUSD
  target.latestActivityAt = Math.max(target.latestActivityAt, source.latestActivityAt)

  for (const sessionId of source.totalSessions) {
    target.totalSessions.add(sessionId)
  }

  for (const [date, daily] of source.daily) {
    const merged = getOrCreateDaily(target.daily, date)
    merged.messages += daily.messages
    merged.toolCalls += daily.toolCalls
    merged.tokens += daily.tokens
    for (const sessionId of daily.sessionIds) {
      merged.sessionIds.add(sessionId)
    }
  }

  for (const [model, totals] of source.modelBreakdown) {
    const current = target.modelBreakdown.get(model) || {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      costUSD: 0
    }
    current.inputTokens += totals.inputTokens
    current.outputTokens += totals.outputTokens
    current.cacheReadTokens += totals.cacheReadTokens
    current.cacheWriteTokens += totals.cacheWriteTokens
    current.costUSD += totals.costUSD
    target.modelBreakdown.set(model, current)
  }
}

function toLocalDateString(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseTimestampMs(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) return parsed
  }
  return 0
}

function isStatsCacheStale(lastComputedDate: string): boolean {
  if (!lastComputedDate) return true
  return lastComputedDate < toLocalDateString(new Date())
}

function endOfLocalDayMs(dateString: string): number {
  const parsed = new Date(`${dateString}T23:59:59.999`)
  const time = parsed.getTime()
  return Number.isNaN(time) ? 0 : time
}

function parseStatsCache(): StatsCache | null {
  try {
    const raw = readFileSync(STATS_FILE, 'utf-8')
    return JSON.parse(raw) as StatsCache
  } catch {
    return null
  }
}

function buildStateFromStats(stats: StatsCache): CCUsageState {
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

  const today = toLocalDateString(new Date())
  const todayActivity = stats.dailyActivity.find((entry) => entry.date === today)
  const todayTokenEntry = stats.dailyModelTokens.find((entry) => entry.date === today)
  const todayTokens = todayTokenEntry
    ? Object.values(todayTokenEntry.tokensByModel).reduce((sum, value) => sum + value, 0)
    : 0

  const last7Cutoff = new Date()
  last7Cutoff.setDate(last7Cutoff.getDate() - 7)
  const cutoffDate = toLocalDateString(last7Cutoff)
  const last7Days: CCDailyEntry[] = []
  for (const day of stats.dailyActivity) {
    if (day.date < cutoffDate) continue
    const tokenEntry = stats.dailyModelTokens.find((entry) => entry.date === day.date)
    last7Days.push({
      date: day.date,
      messages: day.messageCount,
      sessions: day.sessionCount,
      toolCalls: day.toolCallCount,
      tokens: tokenEntry
        ? Object.values(tokenEntry.tokensByModel).reduce((sum, value) => sum + value, 0)
        : 0
    })
  }

  const monthPrefix = today.slice(0, 7)
  let monthMessages = 0
  let monthSessions = 0
  let monthTokens = 0
  for (const day of stats.dailyActivity) {
    if (!day.date.startsWith(monthPrefix)) continue
    monthMessages += day.messageCount
    monthSessions += day.sessionCount
  }
  for (const day of stats.dailyModelTokens) {
    if (!day.date.startsWith(monthPrefix)) continue
    monthTokens += Object.values(day.tokensByModel).reduce((sum, value) => sum + value, 0)
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
    last7Days,
    modelBreakdown,
    lastUpdated: stats.lastComputedDate,
    timestamp: Date.now(),
    source: 'stats-cache',
    cacheStale: false,
    cacheUpdated: stats.lastComputedDate,
    liveLastActivity: '',
    liveDeltaCostUSD: 0
  }
}

function isSubagentFile(filePath: string): boolean {
  return filePath.includes(`${PROJECTS_DIR}/`) && filePath.includes('/subagents/')
}

function isCountableUserMessage(record: unknown): record is {
  sessionId?: string
  timestamp?: string | number
  sourceToolAssistantUUID?: string
  message?: { role?: string; content?: unknown }
} {
  if (!record || typeof record !== 'object') return false
  const candidate = record as {
    type?: string
    sourceToolAssistantUUID?: string
    message?: { role?: string; content?: unknown }
  }
  if (candidate.type !== 'user') return false
  if (candidate.sourceToolAssistantUUID) return false
  if (candidate.message?.role !== 'user') return false
  if (!Array.isArray(candidate.message.content)) return true
  return candidate.message.content.some(
    (item) => typeof item === 'string' || (item && typeof item === 'object' && 'text' in item)
  )
}

function parseAssistantUsage(record: unknown): AssistantUsageRecord | null {
  if (!record || typeof record !== 'object') return null
  const candidate = record as {
    type?: string
    sessionId?: string
    requestId?: string
    uuid?: string
    timestamp?: string | number
    message?: {
      id?: string
      model?: string
      usage?: {
        input_tokens?: number
        output_tokens?: number
        cache_read_input_tokens?: number
        cache_creation_input_tokens?: number
      }
      content?: { type?: string }[]
    }
  }

  if (candidate.type !== 'assistant' || !candidate.message?.usage) return null
  const timestampMs = parseTimestampMs(candidate.timestamp)
  const usage = candidate.message.usage

  return {
    timestampMs,
    sessionId: candidate.sessionId ?? '',
    model: candidate.message.model || 'claude-sonnet',
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
    hasToolUse: Array.isArray(candidate.message.content)
      ? candidate.message.content.some((item) => item?.type === 'tool_use')
      : false
  }
}

function parseProjectUsageFile(filePath: string, cutoffMs: number): LiveUsageAggregate {
  const summary = createEmptyLiveAggregate()
  let raw = ''
  try {
    raw = readFileSync(filePath, 'utf-8')
  } catch {
    return summary
  }

  const topLevelFile = !isSubagentFile(filePath)
  const assistantUsageByRequest = new Map<string, AssistantUsageRecord>()
  const lines = raw.split('\n')

  for (const line of lines) {
    if (!line.trim()) continue
    let record: unknown
    try {
      record = JSON.parse(line)
    } catch {
      continue
    }

    if (topLevelFile && isCountableUserMessage(record)) {
      const timestampMs = parseTimestampMs(record.timestamp)
      if (timestampMs > cutoffMs) {
        const date = toLocalDateString(new Date(timestampMs))
        const daily = getOrCreateDaily(summary.daily, date)
        daily.messages += 1
        if (record.sessionId) {
          daily.sessionIds.add(record.sessionId)
          summary.totalSessions.add(record.sessionId)
        }
        summary.totalMessages += 1
        summary.latestActivityAt = Math.max(summary.latestActivityAt, timestampMs)
      }
    }

    const assistantUsage = parseAssistantUsage(record)
    if (!assistantUsage || assistantUsage.timestampMs <= cutoffMs) continue

    const requestKeyBase =
      record && typeof record === 'object' && 'requestId' in record
        ? (record as { requestId?: string }).requestId
        : undefined
    const messageId =
      record && typeof record === 'object' && 'message' in record
        ? (record as { message?: { id?: string } }).message?.id
        : undefined
    const uuid =
      record && typeof record === 'object' && 'uuid' in record
        ? (record as { uuid?: string }).uuid
        : undefined

    const requestKey = [filePath, requestKeyBase || messageId || uuid || `${assistantUsage.timestampMs}`].join(':')
    assistantUsageByRequest.set(requestKey, assistantUsage)
  }

  for (const usage of assistantUsageByRequest.values()) {
    const date = toLocalDateString(new Date(usage.timestampMs))
    const tokens = usage.inputTokens + usage.outputTokens
    const daily = getOrCreateDaily(summary.daily, date)
    daily.tokens += tokens
    if (topLevelFile) {
      daily.messages += 1
      if (usage.hasToolUse) daily.toolCalls += 1
      if (usage.sessionId) {
        daily.sessionIds.add(usage.sessionId)
        summary.totalSessions.add(usage.sessionId)
      }
      summary.totalMessages += 1
    }

    summary.totalCostUSD += addModelTotals(
      summary.modelBreakdown,
      usage.model,
      usage.inputTokens,
      usage.outputTokens,
      usage.cacheReadTokens,
      usage.cacheWriteTokens
    )
    summary.latestActivityAt = Math.max(summary.latestActivityAt, usage.timestampMs)
  }

  return summary
}

function collectProjectJsonlFiles(directory: string): string[] {
  if (!existsSync(directory)) return []

  const results: string[] = []
  const entries = readdirSync(directory, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(directory, entry.name)
    if (entry.isDirectory()) {
      results.push(...collectProjectJsonlFiles(fullPath))
      continue
    }
    if (entry.isFile() && fullPath.endsWith('.jsonl')) {
      results.push(fullPath)
    }
  }
  return results
}

function getLiveUsageSince(cutoffMs: number): LiveUsageAggregate {
  const files = collectProjectJsonlFiles(PROJECTS_DIR)
  const nextCache: LiveUsageCache = {
    cutoffMs,
    files: new Map<string, CachedLiveFile>()
  }
  const previousCache = liveUsageCache && liveUsageCache.cutoffMs === cutoffMs ? liveUsageCache : null

  for (const filePath of files) {
    let fileStats: { mtimeMs: number; size: number }
    try {
      fileStats = statSync(filePath)
    } catch {
      continue
    }

    const previous = previousCache?.files.get(filePath)
    if (previous && previous.mtimeMs === fileStats.mtimeMs && previous.size === fileStats.size) {
      nextCache.files.set(filePath, previous)
      continue
    }

    nextCache.files.set(filePath, {
      mtimeMs: fileStats.mtimeMs,
      size: fileStats.size,
      summary: parseProjectUsageFile(filePath, cutoffMs)
    })
  }

  liveUsageCache = nextCache

  const aggregate = createEmptyLiveAggregate()
  for (const cached of nextCache.files.values()) {
    mergeLiveAggregate(aggregate, cached.summary)
  }
  return aggregate
}

function buildMergedLast7Days(
  baseline: CCDailyEntry[],
  liveDaily: Map<string, LiveDailyTotals>
): CCDailyEntry[] {
  const merged = new Map<string, CCDailyEntry>()
  for (const entry of baseline) {
    merged.set(entry.date, { ...entry })
  }

  const last7Cutoff = new Date()
  last7Cutoff.setDate(last7Cutoff.getDate() - 7)
  const cutoffDate = toLocalDateString(last7Cutoff)

  for (const [date, daily] of liveDaily) {
    if (date < cutoffDate) continue
    const current = merged.get(date) || {
      date,
      messages: 0,
      sessions: 0,
      toolCalls: 0,
      tokens: 0
    }
    current.messages += daily.messages
    current.sessions += daily.sessionIds.size
    current.toolCalls += daily.toolCalls
    current.tokens += daily.tokens
    merged.set(date, current)
  }

  return Array.from(merged.values()).sort((a, b) => a.date.localeCompare(b.date))
}

function buildStateFromLive(live: LiveUsageAggregate): CCUsageState {
  const today = toLocalDateString(new Date())
  const monthPrefix = today.slice(0, 7)
  const todayDaily = live.daily.get(today)

  let monthMessages = 0
  let monthTokens = 0
  const monthSessions = new Set<string>()
  for (const [date, daily] of live.daily) {
    if (!date.startsWith(monthPrefix)) continue
    monthMessages += daily.messages
    monthTokens += daily.tokens
    for (const sessionId of daily.sessionIds) monthSessions.add(sessionId)
  }

  return {
    available: live.totalCostUSD > 0 || live.totalMessages > 0 || live.modelBreakdown.size > 0,
    totalSessions: live.totalSessions.size,
    totalMessages: live.totalMessages,
    totalCostUSD: live.totalCostUSD,
    todayMessages: todayDaily?.messages ?? 0,
    todaySessions: todayDaily?.sessionIds.size ?? 0,
    todayToolCalls: todayDaily?.toolCalls ?? 0,
    todayTokens: todayDaily?.tokens ?? 0,
    monthMessages,
    monthSessions: monthSessions.size,
    monthTokens,
    last7Days: buildMergedLast7Days([], live.daily),
    modelBreakdown: Array.from(live.modelBreakdown.entries())
      .map(([model, totals]) => ({
        model,
        inputTokens: totals.inputTokens,
        outputTokens: totals.outputTokens,
        cacheReadTokens: totals.cacheReadTokens,
        cacheWriteTokens: totals.cacheWriteTokens,
        costUSD: totals.costUSD
      }))
      .sort((a, b) => b.costUSD - a.costUSD),
    lastUpdated: live.latestActivityAt ? new Date(live.latestActivityAt).toISOString() : '',
    timestamp: Date.now(),
    source: 'live-log',
    cacheStale: false,
    cacheUpdated: '',
    liveLastActivity: live.latestActivityAt ? new Date(live.latestActivityAt).toISOString() : '',
    liveDeltaCostUSD: live.totalCostUSD
  }
}

function mergeLiveIntoBaseline(base: CCUsageState, live: LiveUsageAggregate): CCUsageState {
  if (live.totalCostUSD <= 0 && live.totalMessages <= 0 && live.modelBreakdown.size === 0) {
    return {
      ...base,
      cacheStale: isStatsCacheStale(base.cacheUpdated),
      source: 'stats-cache'
    }
  }

  const today = toLocalDateString(new Date())
  const monthPrefix = today.slice(0, 7)
  const todayDaily = live.daily.get(today)
  const monthSessions = new Set<string>()
  let monthMessages = 0
  let monthTokens = 0
  for (const [date, daily] of live.daily) {
    if (!date.startsWith(monthPrefix)) continue
    monthMessages += daily.messages
    monthTokens += daily.tokens
    for (const sessionId of daily.sessionIds) monthSessions.add(sessionId)
  }

  const modelBreakdown = new Map<string, UsageTotals>()
  for (const model of base.modelBreakdown) {
    modelBreakdown.set(model.model, {
      inputTokens: model.inputTokens,
      outputTokens: model.outputTokens,
      cacheReadTokens: model.cacheReadTokens,
      cacheWriteTokens: model.cacheWriteTokens,
      costUSD: model.costUSD
    })
  }
  for (const [model, totals] of live.modelBreakdown) {
    const current = modelBreakdown.get(model) || {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      costUSD: 0
    }
    current.inputTokens += totals.inputTokens
    current.outputTokens += totals.outputTokens
    current.cacheReadTokens += totals.cacheReadTokens
    current.cacheWriteTokens += totals.cacheWriteTokens
    current.costUSD += totals.costUSD
    modelBreakdown.set(model, current)
  }

  return {
    ...base,
    available: true,
    totalSessions: base.totalSessions + live.totalSessions.size,
    totalMessages: base.totalMessages + live.totalMessages,
    totalCostUSD: base.totalCostUSD + live.totalCostUSD,
    todayMessages: base.todayMessages + (todayDaily?.messages ?? 0),
    todaySessions: base.todaySessions + (todayDaily?.sessionIds.size ?? 0),
    todayToolCalls: base.todayToolCalls + (todayDaily?.toolCalls ?? 0),
    todayTokens: base.todayTokens + (todayDaily?.tokens ?? 0),
    monthMessages: base.monthMessages + monthMessages,
    monthSessions: base.monthSessions + monthSessions.size,
    monthTokens: base.monthTokens + monthTokens,
    last7Days: buildMergedLast7Days(base.last7Days, live.daily),
    modelBreakdown: Array.from(modelBreakdown.entries())
      .map(([model, totals]) => ({
        model,
        inputTokens: totals.inputTokens,
        outputTokens: totals.outputTokens,
        cacheReadTokens: totals.cacheReadTokens,
        cacheWriteTokens: totals.cacheWriteTokens,
        costUSD: totals.costUSD
      }))
      .sort((a, b) => b.costUSD - a.costUSD),
    lastUpdated: live.latestActivityAt ? new Date(live.latestActivityAt).toISOString() : base.lastUpdated,
    timestamp: Date.now(),
    source: 'hybrid',
    cacheStale: true,
    liveLastActivity: live.latestActivityAt ? new Date(live.latestActivityAt).toISOString() : '',
    liveDeltaCostUSD: live.totalCostUSD
  }
}

export function getCCUsage(options: CCUsageOptions = {}): CCUsageState {
  const stats = parseStatsCache()
  const baseline = stats ? buildStateFromStats(stats) : null

  const shouldUseLive = options.forceLive || !baseline || isStatsCacheStale(baseline.cacheUpdated)
  if (!shouldUseLive) {
    return baseline || createUnavailableState('stats-cache')
  }

  const liveCutoffMs = baseline ? endOfLocalDayMs(baseline.cacheUpdated) : 0
  const live = getLiveUsageSince(liveCutoffMs)

  if (!baseline) {
    const liveState = buildStateFromLive(live)
    return liveState.available ? liveState : createUnavailableState('live-log')
  }

  return mergeLiveIntoBaseline(baseline, live)
}
