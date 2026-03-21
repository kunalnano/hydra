import { createHash } from 'crypto'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type {
  AgentGoal,
  AgentInfo,
  AgentStatus,
  AgentType,
  HelmConfig,
  TimelineEventRecord,
  TimelineEventType
} from '../../shared/types'

const WAITING_HEARTBEAT_MS = 2 * 60 * 1000
const STALE_HEARTBEAT_MS = 10 * 60 * 1000

export function getDefaultAgentFeedPaths(homeDir = homedir()): string[] {
  return [
    join(homeDir, '.config', 'helm', 'agents'),
    join(homeDir, '.config', 'hydra', 'agents'),
    join(homeDir, '.hydra', 'agents')
  ]
}

const DEFAULT_AGENT_FEED_PATHS = getDefaultAgentFeedPaths()

interface RawAgentState {
  agent_id?: unknown
  current_tick?: unknown
  session_id?: unknown
  session_start?: unknown
  last_heartbeat?: unknown
  total_ticks?: unknown
  total_actions?: unknown
  memory_count?: unknown
  goals?: unknown
  current_action?: unknown
  status?: unknown
}

interface RawTraceEvent {
  ts?: unknown
  agent_id?: unknown
  session_id?: unknown
  tick?: unknown
  event_type?: unknown
  tool?: unknown
  target?: unknown
  outcome?: unknown
  metadata?: unknown
  error?: unknown
  summary?: unknown
}

type VisibleTraceEventType = 'checkpoint' | 'error' | 'external_action' | 'goal_update' | 'tick_end'

export interface IngestibleTraceTimelineEvent extends TimelineEventRecord {
  ingestKey: string
}

export function getAgentFeedDirectories(config?: HelmConfig): string[] {
  const candidates =
    config?.agentFeedPaths && config.agentFeedPaths.length > 0
      ? config.agentFeedPaths
      : DEFAULT_AGENT_FEED_PATHS

  const unique = new Set<string>()
  for (const candidate of candidates) {
    if (!candidate) continue
    unique.add(candidate)
  }

  return [...unique].filter((dir) => existsSync(dir))
}

export function loadExternalAgents(config?: HelmConfig, now = Date.now()): AgentInfo[] {
  const agentsById = new Map<string, AgentInfo>()

  for (const directory of getAgentFeedDirectories(config)) {
    for (const entry of readdirSafe(directory)) {
      if (!entry.endsWith('.state.json')) continue

      const filePath = join(directory, entry)
      const parsed = parseAgentState(readTextSafe(filePath), filePath, now)
      if (!parsed) continue

      const existing = agentsById.get(parsed.id)
      if (!existing || (parsed.lastHeartbeat ?? 0) >= (existing.lastHeartbeat ?? 0)) {
        agentsById.set(parsed.id, parsed)
      }
    }
  }

  return [...agentsById.values()].sort((a, b) => {
    const heartbeatDelta = (b.lastHeartbeat ?? 0) - (a.lastHeartbeat ?? 0)
    if (heartbeatDelta !== 0) return heartbeatDelta
    return a.name.localeCompare(b.name)
  })
}

export function loadExternalAgentTimelineEvents(
  config?: HelmConfig
): IngestibleTraceTimelineEvent[] {
  const events: IngestibleTraceTimelineEvent[] = []

  for (const directory of getAgentFeedDirectories(config)) {
    for (const entry of readdirSafe(directory)) {
      if (!entry.endsWith('.trace.jsonl')) continue

      const filePath = join(directory, entry)
      const text = readTextSafe(filePath)
      if (!text) continue

      for (const [index, line] of text.split('\n').entries()) {
        const parsed = parseTraceLine(line, filePath, index + 1)
        if (parsed) events.push(parsed)
      }
    }
  }

  return events.sort((a, b) => a.timestamp - b.timestamp)
}

export function parseAgentState(
  rawText: string,
  _filePath: string,
  now = Date.now()
): AgentInfo | null {
  if (!rawText.trim()) return null

  let parsed: RawAgentState
  try {
    parsed = JSON.parse(rawText) as RawAgentState
  } catch {
    return null
  }

  const agentId = asString(parsed.agent_id)
  if (!agentId) return null

  const currentAction = asString(parsed.current_action)
  const lastHeartbeat = parseTimestamp(parsed.last_heartbeat)
  const sessionStart = parseTimestamp(parsed.session_start)
  const totalTicks = asNumber(parsed.total_ticks)

  return {
    id: `agent:${agentId}`,
    name: agentId,
    type: inferAgentType(agentId, currentAction),
    status: normalizeAgentStatus(parsed.status, lastHeartbeat, currentAction, now),
    source: 'state-file',
    agentId,
    sessionId: asString(parsed.session_id) || undefined,
    currentTick: asNumber(parsed.current_tick) ?? totalTicks ?? undefined,
    totalTicks: totalTicks ?? undefined,
    totalActions: asNumber(parsed.total_actions) ?? undefined,
    memoryCount: asNumber(parsed.memory_count) ?? undefined,
    currentAction: currentAction || undefined,
    lastHeartbeat: lastHeartbeat ?? undefined,
    uptime: sessionStart != null ? Math.max(0, now - sessionStart) : undefined,
    goals: parseGoals(parsed.goals)
  }
}

export function parseTraceLine(
  rawLine: string,
  filePath: string,
  lineNumber: number
): IngestibleTraceTimelineEvent | null {
  const line = rawLine.trim()
  if (!line) return null

  let parsed: RawTraceEvent
  try {
    parsed = JSON.parse(line) as RawTraceEvent
  } catch {
    return null
  }

  const eventType = asVisibleTraceEventType(parsed.event_type, parsed.summary)
  if (!eventType) return null

  const agentId = asString(parsed.agent_id)
  const timestamp = parseTimestamp(parsed.ts)
  if (!agentId || timestamp == null) return null

  const sessionId = asString(parsed.session_id) || undefined
  const tick = asNumber(parsed.tick) ?? undefined
  const tool = asString(parsed.tool) || undefined
  const target = asString(parsed.target) || undefined
  const outcome = asString(parsed.outcome) || undefined
  const summary = asString(parsed.summary) || undefined
  const error = asString(parsed.error) || undefined
  const metadata = isRecord(parsed.metadata) ? parsed.metadata : {}

  return {
    timestamp,
    type: mapTraceEventType(eventType),
    source: agentId,
    message: buildTraceMessage({
      agentId,
      tick,
      eventType,
      tool,
      target,
      outcome,
      metadata,
      error,
      summary
    }),
    metadata: JSON.stringify({
      agentId,
      sessionId,
      tick,
      eventType,
      tool,
      target,
      outcome,
      metadata,
      error,
      summary,
      sourceFile: filePath,
      lineNumber
    }),
    ingestKey: buildIngestKey({
      ts: timestamp,
      agentId,
      sessionId,
      tick,
      eventType,
      tool,
      target,
      outcome,
      error,
      summary,
      metadata
    })
  }
}

function normalizeAgentStatus(
  rawStatus: unknown,
  lastHeartbeat: number | null,
  currentAction: string | null,
  now: number
): AgentStatus {
  if (lastHeartbeat != null) {
    const age = now - lastHeartbeat
    if (age >= STALE_HEARTBEAT_MS) return 'unknown'
    if (age >= WAITING_HEARTBEAT_MS) return 'waiting'
  }

  const normalized = asString(rawStatus)?.toLowerCase()
  if (normalized === 'active') return 'active'
  if (normalized === 'busy') return 'busy'
  if (normalized === 'idle') return 'idle'
  if (normalized === 'waiting') return 'waiting'
  if (normalized === 'unknown') return 'unknown'

  if (currentAction) return 'busy'
  return 'active'
}

function inferAgentType(agentId: string, currentAction: string | null): AgentType {
  const haystack = `${agentId} ${currentAction ?? ''}`.toLowerCase()

  if (/\bcodex\b/.test(haystack)) return 'codex'
  if (/\bclaude\b/.test(haystack)) return 'claude-code'
  if (/\bgemini\b/.test(haystack)) return 'gemini'
  if (/\bcursor\b/.test(haystack)) return 'cursor'
  if (/\baider\b/.test(haystack)) return 'aider'
  if (/\bcontinue\b/.test(haystack)) return 'continue'
  if (/\bcopilot\b/.test(haystack)) return 'copilot'
  return 'other'
}

function parseGoals(rawGoals: unknown): AgentGoal[] | undefined {
  if (!Array.isArray(rawGoals)) return undefined

  const parsedGoals = rawGoals.flatMap((goal) => {
    if (!isRecord(goal)) return []
    const name = asString(goal.name)
    if (!name) return []

    return [
      {
        name,
        progress: clampProgress(asNumber(goal.progress)),
        priority: asNumber(goal.priority) ?? 999
      }
    ]
  })

  return parsedGoals.length > 0 ? parsedGoals.sort((a, b) => a.priority - b.priority) : undefined
}

function clampProgress(value: number | null): number {
  if (value == null || Number.isNaN(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function asVisibleTraceEventType(
  value: unknown,
  summary: unknown
): VisibleTraceEventType | null {
  const normalized = asString(value)
  if (!normalized) return null

  if (normalized === 'external_action') return 'external_action'
  if (normalized === 'goal_update') return 'goal_update'
  if (normalized === 'checkpoint') return 'checkpoint'
  if (normalized === 'error') return 'error'
  if (normalized === 'tick_end' && asString(summary)) return 'tick_end'
  return null
}

function mapTraceEventType(eventType: VisibleTraceEventType): TimelineEventType {
  if (eventType === 'external_action') return 'agent_action'
  if (eventType === 'error') return 'agent_error'
  return 'agent_update'
}

function buildTraceMessage(input: {
  agentId: string
  tick?: number
  eventType: VisibleTraceEventType
  tool?: string
  target?: string
  outcome?: string
  metadata: Record<string, unknown>
  error?: string
  summary?: string
}): string {
  const tickPrefix = input.tick != null ? ` [t${input.tick}]` : ''
  const subject = `${input.agentId}${tickPrefix}`

  if (input.eventType === 'external_action') {
    const action = asString(input.metadata.action)
    const actionLabel = action ? humanizeToken(action) : 'external action'
    const via = input.tool ? ` via ${input.tool}` : ''
    const target = input.target ? ` -> ${input.target}` : ''
    const outcome = input.outcome && input.outcome !== 'success' ? ` (${input.outcome})` : ''
    return `${subject} ${actionLabel}${via}${target}${outcome}`
  }

  if (input.eventType === 'goal_update') {
    const target = input.target ? ` -> ${input.target}` : ''
    return `${subject} goal update${target}`
  }

  if (input.eventType === 'checkpoint') {
    if (input.summary) return `${subject} checkpoint: ${truncateText(input.summary, 120)}`
    return `${subject} checkpoint`
  }

  if (input.eventType === 'tick_end') {
    if (input.summary) return `${subject} ${truncateText(input.summary, 120)}`
    return `${subject} tick complete`
  }

  const tool = input.tool ? `${input.tool} ` : ''
  const target = input.target ? ` on ${input.target}` : ''
  const detail = input.error ? `: ${truncateText(input.error, 120)}` : ''
  return `${subject} ${tool}error${target}${detail}`.trim()
}

function buildIngestKey(input: Record<string, unknown>): string {
  return createHash('sha1').update(JSON.stringify(input)).digest('hex')
}

function humanizeToken(value: string): string {
  return value.replace(/[_-]+/g, ' ').trim()
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength - 3)}...`
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const asNumberValue = Number(value)
    if (Number.isFinite(asNumberValue) && value.trim() !== '') return asNumberValue
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function readdirSafe(dirPath: string): string[] {
  try {
    return readdirSync(dirPath).sort((a, b) => a.localeCompare(b))
  } catch {
    return []
  }
}

function readTextSafe(filePath: string): string {
  try {
    return readFileSync(filePath, 'utf-8')
  } catch {
    return ''
  }
}
