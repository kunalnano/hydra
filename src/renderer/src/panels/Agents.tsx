import { useEffect, useMemo, useState } from 'react'
import { useSystemStore } from '../stores/system'
import { useUIStore } from '../stores/ui'
import { useHiveStore } from '../stores/hive'
import { redactSensitiveText, usePrivacyStore } from '../stores/privacy'
import type { AgentInfo, ProcessInfo, TimelineEventRecord } from '../../../shared/types'

const STATUS_STYLES: Record<AgentInfo['status'], { dot: string; label: string }> = {
  active: { dot: 'bg-green-400', label: 'active' },
  busy: { dot: 'bg-cyan-400', label: 'busy' },
  idle: { dot: 'bg-gray-500', label: 'idle' },
  waiting: { dot: 'bg-amber-400 animate-pulse', label: 'waiting' },
  unknown: { dot: 'bg-gray-700', label: 'unknown' }
}

const STATUS_PILL: Record<AgentInfo['status'], string> = {
  active: 'bg-green-950/60 text-green-400 border-green-800/40',
  busy: 'bg-cyan-950/60 text-cyan-400 border-cyan-800/40',
  idle: 'bg-gray-800/60 text-gray-500 border-gray-700/40',
  waiting: 'bg-amber-950/60 text-amber-400 border-amber-800/40 animate-pulse',
  unknown: 'bg-gray-900 text-gray-600 border-gray-800'
}

const TYPE_LABELS: Record<AgentInfo['type'], string> = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
  gemini: 'Gemini',
  cursor: 'Cursor',
  aider: 'Aider',
  continue: 'Continue',
  copilot: 'Copilot',
  other: 'Agent'
}

const TYPE_ICONS: Record<AgentInfo['type'], string> = {
  'claude-code': '\u25C6',
  codex: '\u25C7',
  gemini: '\u2726',
  cursor: '\u25C8',
  aider: '\u25A0',
  continue: '\u25B6',
  copilot: '\u2605',
  other: '\u25CB'
}

const TYPE_COLORS: Record<AgentInfo['type'], string> = {
  'claude-code': 'text-amber-400',
  codex: 'text-blue-400',
  gemini: 'text-purple-400',
  cursor: 'text-teal-400',
  aider: 'text-green-400',
  continue: 'text-rose-400',
  copilot: 'text-sky-400',
  other: 'text-gray-400'
}

function formatUptime(ms: number): string {
  const mins = Math.floor(ms / 60000)
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  return `${hrs}h ${mins % 60}m`
}

function formatRelativeAge(ts: number): string {
  const diff = Math.max(0, Date.now() - ts)
  if (diff < 60000) return 'now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`
  return `${Math.floor(diff / 3600000)}h`
}

function formatPercent(value?: number): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--'
  return `${value.toFixed(value >= 10 ? 0 : 1)}%`
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function getWorkspaceName(agent: AgentInfo, groups: { name: string; processes: ProcessInfo[] }[]): string | undefined {
  const matched = groups.find((group) => {
    if (agent.workingDir) {
      const dirName = agent.workingDir.split('/').pop()
      if (group.name === dirName || group.name === agent.workingDir) return true
    }

    return agent.pid != null && group.processes.some((proc) => proc.pid === agent.pid)
  })

  return matched?.name
}

function getProcessInfo(agent: AgentInfo, groups: { processes: ProcessInfo[] }[]): ProcessInfo | undefined {
  if (agent.pid == null) return undefined
  return groups.flatMap((group) => group.processes).find((proc) => proc.pid === agent.pid)
}

function parseTimelineMetadata(event: TimelineEventRecord): Record<string, unknown> | null {
  if (!event.metadata) return null
  try {
    return JSON.parse(event.metadata) as Record<string, unknown>
  } catch {
    return null
  }
}

function matchesAgentEvent(agent: AgentInfo, event: TimelineEventRecord): boolean {
  if (!event.type.startsWith('agent_')) return false

  const metadata = parseTimelineMetadata(event)
  const names = new Set<string>()

  names.add(agent.name)
  if (agent.agentId) names.add(agent.agentId)
  if (agent.sessionId) names.add(agent.sessionId)

  if (names.has(event.source)) return true

  for (const name of names) {
    if (name.length > 2 && event.message.includes(name)) return true
  }

  if (metadata) {
    const metadataAgentId =
      typeof metadata['agentId'] === 'string'
        ? metadata['agentId']
        : typeof metadata['agent_id'] === 'string'
          ? metadata['agent_id']
          : null
    const metadataSessionId =
      typeof metadata['sessionId'] === 'string'
        ? metadata['sessionId']
        : typeof metadata['session_id'] === 'string'
          ? metadata['session_id']
          : null

    if (metadataAgentId && names.has(metadataAgentId)) return true
    if (metadataSessionId && agent.sessionId === metadataSessionId) return true
  }

  return false
}

function displayText(value: string | undefined, privacyMode: boolean): string | null {
  if (!value) return null
  return privacyMode ? redactSensitiveText(value) : value
}

function MetricCard({
  label,
  value,
  hint
}: {
  label: string
  value: string
  hint?: string
}): JSX.Element {
  return (
    <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
      <div className="text-[9px] uppercase tracking-[0.18em] text-gray-500 font-[family-name:var(--helm-font-mono)]">
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-white font-[family-name:var(--helm-font-mono)]">
        {value}
      </div>
      {hint && <div className="mt-1 text-[10px] text-gray-500">{hint}</div>}
    </div>
  )
}

export function AgentsPanel(): JSX.Element {
  const state = useSystemStore((store) => store.state)
  const selectedAgentId = useUIStore((store) => store.selectedAgentId)
  const [timelineEvents, setTimelineEvents] = useState<TimelineEventRecord[]>([])

  useEffect(() => {
    let cancelled = false

    const refreshTimeline = async (): Promise<void> => {
      const events = await window.helm.getTimelineEvents(80).catch(() => [])
      if (!cancelled) {
        setTimelineEvents(events as TimelineEventRecord[])
      }
    }

    void refreshTimeline()
    const interval = window.setInterval(() => {
      void refreshTimeline()
    }, 10000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [])

  if (!state) return <></>

  if (state.agents.length === 0) {
    return <div className="text-gray-600 text-sm">No AI agents detected</div>
  }

  const effectiveSelectedId = selectedAgentId ?? state.agents[0]?.id ?? null
  const selectedAgent =
    state.agents.find((agent) => agent.id === effectiveSelectedId) ?? state.agents[0] ?? null

  return (
    <div className="grid h-full min-h-0 gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.9fr)]">
      <div className="min-h-0 overflow-hidden rounded-xl border border-white/10 bg-black/18">
        <div className="flex items-center justify-between border-b border-white/8 px-3 py-2 text-[10px] uppercase tracking-[0.16em] text-gray-500">
          <span>Agent Roster</span>
          <span>{state.agents.length} tracked</span>
        </div>

        <div className="flex items-center text-[10px] text-gray-600 uppercase tracking-wider px-3 py-2 border-b border-gray-800/40">
          <span className="flex-1">Agent</span>
          <span className="w-20 text-center">Status</span>
          <span className="w-24 text-right">Context</span>
          <span className="w-28 text-right">Handle</span>
          <span className="w-5 text-right" />
        </div>

        <div className="max-h-full overflow-y-auto px-2 py-2">
          <div className="space-y-1">
            {state.agents.map((agent) => (
              <AgentRow
                key={agent.id}
                agent={agent}
                isSelected={effectiveSelectedId === agent.id}
                processGroups={state.processes}
              />
            ))}
          </div>
        </div>
      </div>

      <AgentDetailPanel agent={selectedAgent} timelineEvents={timelineEvents} />
    </div>
  )
}

function AgentRow({
  agent,
  isSelected,
  processGroups
}: {
  agent: AgentInfo
  isSelected: boolean
  processGroups: { name: string; processes: ProcessInfo[] }[]
}): JSX.Element {
  const selectAgent = useUIStore((store) => store.selectAgent)

  const style = STATUS_STYLES[agent.status]
  const workspaceName = getWorkspaceName(agent, processGroups)
  const contextLabel =
    workspaceName ??
    (agent.currentTick != null
      ? `Tick ${agent.currentTick}`
      : agent.lastHeartbeat != null
        ? `HB ${formatRelativeAge(agent.lastHeartbeat)}`
        : '-')
  const handleLabel = agent.pid != null ? `PID ${agent.pid}` : agent.agentId ?? '-'
  const secondaryLabel =
    agent.currentAction ??
    (agent.source === 'state-file' && agent.sessionId ? `Session ${agent.sessionId}` : undefined)
  const kindLabel = TYPE_LABELS[agent.type]

  return (
    <button
      type="button"
      onClick={() => selectAgent(agent.id, workspaceName)}
      className={`flex w-full items-center rounded border px-2 py-2 text-left transition-colors ${
        isSelected
          ? 'border-amber-700/40 bg-amber-950/25'
          : 'border-transparent hover:border-white/8 hover:bg-gray-800/40'
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`${TYPE_COLORS[agent.type]} text-xs shrink-0`}>{TYPE_ICONS[agent.type]}</span>
          <span className="truncate font-medium text-white">{agent.name}</span>
          {agent.hiveSessionId && (
            <span className="shrink-0 rounded-full bg-amber-950/50 border border-amber-700/40 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-400">
              HIVE {agent.hiveRole ?? ''}
            </span>
          )}
          {agent.uptime != null && (
            <span className="shrink-0 text-[10px] text-gray-600">{formatUptime(agent.uptime)}</span>
          )}
          {!agent.hiveSessionId && agent.name !== kindLabel && (
            <span className="shrink-0 text-[10px] uppercase tracking-wider text-gray-600">
              {kindLabel}
            </span>
          )}
        </div>
        {secondaryLabel && (
          <div className="mt-0.5 truncate pl-5 text-[10px] text-gray-500">{secondaryLabel}</div>
        )}
      </div>

      <div className="w-20 shrink-0 flex justify-center">
        <span className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_PILL[agent.status]}`}>
          {style.label}
        </span>
      </div>

      <div className="w-24 shrink-0 text-right">
        {contextLabel !== '-' ? (
          <span className="inline-block max-w-full truncate text-[10px] text-blue-400/70" title={contextLabel}>
            {contextLabel}
          </span>
        ) : (
          <span className="text-[10px] text-gray-700">-</span>
        )}
      </div>

      <div className="w-28 shrink-0 text-right">
        <span className="inline-block max-w-full truncate font-mono text-xs text-gray-500" title={handleLabel}>
          {handleLabel}
        </span>
      </div>

      <div className="w-5 shrink-0 text-right text-gray-600">{isSelected ? '>' : '+'}</div>
    </button>
  )
}

function HiveAgentActions({ sessionId }: { sessionId: string }): JSX.Element {
  const sendMessage = useHiveStore((s) => s.sendMessage)
  const attach = useHiveStore((s) => s.attach)
  const killSession = useHiveStore((s) => s.killSession)
  const [message, setMessage] = useState('')
  const [confirmKill, setConfirmKill] = useState(false)

  async function handleSend(): Promise<void> {
    if (!message.trim()) return
    await sendMessage(sessionId, message.trim())
    setMessage('')
  }

  return (
    <div className="rounded-lg border border-amber-800/30 bg-amber-950/15 p-3 space-y-2">
      <div className="text-[9px] uppercase tracking-[0.18em] text-amber-400 font-[family-name:var(--helm-font-mono)]">
        HIVE Controls
      </div>
      <div className="flex gap-2">
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSend() }}
          placeholder="Send message to agent..."
          className="flex-1 bg-black/30 border border-white/10 rounded px-2 py-1 text-xs text-white placeholder-white/25 focus:outline-none focus:border-amber-700/40"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!message.trim()}
          className="px-2 py-1 rounded text-[10px] font-semibold bg-amber-950/40 border border-amber-700/40 text-amber-400 hover:bg-amber-950/60 disabled:opacity-30"
        >
          Send
        </button>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => attach(sessionId)}
          className="px-2 py-1 rounded text-[10px] font-semibold bg-cyan-950/30 border border-cyan-800/30 text-cyan-400 hover:bg-cyan-950/50"
        >
          Attach Terminal
        </button>
        {confirmKill ? (
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => { killSession(sessionId); setConfirmKill(false) }}
              className="px-2 py-1 rounded text-[10px] font-semibold bg-red-950/40 border border-red-700/40 text-red-400"
            >
              Confirm Kill
            </button>
            <button
              type="button"
              onClick={() => setConfirmKill(false)}
              className="px-2 py-1 rounded text-[10px] text-gray-500"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmKill(true)}
            className="px-2 py-1 rounded text-[10px] font-semibold bg-red-950/20 border border-red-800/20 text-red-400/60 hover:text-red-400"
          >
            Kill Session
          </button>
        )}
      </div>
    </div>
  )
}

function AgentDetailPanel({
  agent,
  timelineEvents
}: {
  agent: AgentInfo | null
  timelineEvents: TimelineEventRecord[]
}): JSX.Element {
  const state = useSystemStore((store) => store.state)
  const privacyMode = usePrivacyStore((store) => store.privacyMode)

  const processInfo = useMemo(
    () => (state && agent ? getProcessInfo(agent, state.processes) : undefined),
    [state, agent]
  )
  const workspaceName = useMemo(
    () => (state && agent ? getWorkspaceName(agent, state.processes) : undefined),
    [state, agent]
  )
  const listeningPorts = useMemo(
    () =>
      state && agent?.pid != null
        ? state.ports.filter((port) => port.pid === agent.pid && port.state === 'LISTEN').map((port) => port.port)
        : [],
    [state, agent]
  )
  const relatedEvents = useMemo(
    () => (agent ? timelineEvents.filter((event) => matchesAgentEvent(agent, event)).slice(0, 8) : []),
    [agent, timelineEvents]
  )

  if (!agent) {
    return (
      <div className="rounded-xl border border-dashed border-white/10 bg-black/12 p-4 text-sm text-gray-500">
        No agent selected.
      </div>
    )
  }

  const displayCommand = displayText(processInfo?.command, privacyMode)
  const displayWorkingDir = displayText(processInfo?.cwd ?? agent.workingDir, privacyMode)
  const displayAction = displayText(agent.currentAction, privacyMode)

  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-white/10 bg-black/18">
      <div className="border-b border-white/8 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className={`${TYPE_COLORS[agent.type]} text-xs`}>{TYPE_ICONS[agent.type]}</span>
              <h3 className="text-sm font-semibold text-white">{agent.name}</h3>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] ${STATUS_PILL[agent.status]}`}>
                {STATUS_STYLES[agent.status].label}
              </span>
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-gray-500">
              Click any agent row to inspect its handle, usage, and recent activity.
            </div>
          </div>
          <div className="text-right text-[10px] text-gray-500">
            <div>{TYPE_LABELS[agent.type]}</div>
            <div>{agent.source === 'process' ? 'Process Monitor' : 'State Feed'}</div>
          </div>
        </div>
      </div>

      <div className="min-h-0 space-y-3 overflow-y-auto p-4 text-sm">
        <div className="grid gap-2 md:grid-cols-2">
          <MetricCard label="Handle" value={agent.pid != null ? `PID ${agent.pid}` : agent.agentId ?? 'n/a'} />
          <MetricCard label="Workspace" value={workspaceName ?? 'unmapped'} />
          <MetricCard label="CPU" value={formatPercent(processInfo?.cpu)} hint="Live process sample" />
          <MetricCard label="Memory" value={formatPercent(processInfo?.mem)} hint="Resident share" />
          <MetricCard label="Uptime" value={agent.uptime != null ? formatUptime(agent.uptime) : 'n/a'} />
          <MetricCard
            label="Heartbeat"
            value={agent.lastHeartbeat != null ? formatRelativeAge(agent.lastHeartbeat) : 'n/a'}
            hint={agent.lastHeartbeat != null ? new Date(agent.lastHeartbeat).toLocaleTimeString() : undefined}
          />
        </div>

        <div className="rounded-lg border border-white/10 bg-black/25 p-3">
          <div className="text-[9px] uppercase tracking-[0.18em] text-gray-500 font-[family-name:var(--helm-font-mono)]">
            Runtime
          </div>
          <div className="mt-2 space-y-2 text-xs text-gray-300">
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-gray-500">Working Dir</div>
              <div className="rounded bg-black/35 px-2 py-1 font-mono text-[11px] text-gray-200">
                {displayWorkingDir ?? 'No working directory reported'}
              </div>
            </div>
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-gray-500">Command</div>
              <div className="rounded bg-black/35 px-2 py-1 font-mono text-[11px] text-gray-200">
                {displayCommand ?? 'No command line reported'}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-white/10 bg-black/35 px-2 py-1 font-mono text-[10px] text-gray-300">
                {listeningPorts.length > 0
                  ? `Ports ${listeningPorts.map((port) => `:${port}`).join(', ')}`
                  : 'No listening ports'}
              </span>
              {agent.sessionId && (
                <span className="rounded-full border border-white/10 bg-black/35 px-2 py-1 font-mono text-[10px] text-gray-300">
                  Session {privacyMode ? redactSensitiveText(agent.sessionId) : agent.sessionId}
                </span>
              )}
              {agent.currentTick != null && (
                <span className="rounded-full border border-white/10 bg-black/35 px-2 py-1 font-mono text-[10px] text-gray-300">
                  Tick {agent.currentTick}
                  {agent.totalTicks != null ? ` / ${agent.totalTicks}` : ''}
                </span>
              )}
              {agent.totalActions != null && (
                <span className="rounded-full border border-white/10 bg-black/35 px-2 py-1 font-mono text-[10px] text-gray-300">
                  {agent.totalActions} actions
                </span>
              )}
              {agent.memoryCount != null && (
                <span className="rounded-full border border-white/10 bg-black/35 px-2 py-1 font-mono text-[10px] text-gray-300">
                  {agent.memoryCount} memories
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-black/25 p-3">
          <div className="text-[9px] uppercase tracking-[0.18em] text-gray-500 font-[family-name:var(--helm-font-mono)]">
            Current Focus
          </div>
          <div className="mt-2 rounded bg-black/35 px-3 py-2 text-xs text-gray-200">
            {displayAction ?? 'No current action reported for this agent.'}
          </div>
          {agent.goals && agent.goals.length > 0 && (
            <div className="mt-3 space-y-2">
              {agent.goals.slice(0, 4).map((goal) => (
                <div key={goal.name}>
                  <div className="flex items-center justify-between gap-2 text-[11px] text-gray-300">
                    <span>{goal.name}</span>
                    <span className="font-mono text-gray-500">{Math.round(goal.progress * 100)}%</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/40">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400"
                      style={{ width: `${Math.max(4, Math.round(goal.progress * 100))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {agent.hiveSessionId && <HiveAgentActions sessionId={agent.hiveSessionId} />}

        <div className="rounded-lg border border-white/10 bg-black/25 p-3">
          <div className="text-[9px] uppercase tracking-[0.18em] text-gray-500 font-[family-name:var(--helm-font-mono)]">
            Related Timeline
          </div>
          {relatedEvents.length > 0 ? (
            <div className="mt-2 space-y-2">
              {relatedEvents.map((event, index) => (
                <div
                  key={`${event.timestamp}-${index}`}
                  className="rounded border border-white/8 bg-black/30 px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.14em] text-gray-500">
                    <span>{event.type.replace(/_/g, ' ')}</span>
                    <span>{formatTime(event.timestamp)}</span>
                  </div>
                  <div className="mt-1 text-xs text-gray-200">
                    {privacyMode ? redactSensitiveText(event.message) : event.message}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-2 text-xs text-gray-500">
              No agent-specific timeline entries yet. Process-backed agents still show live CPU, memory, command, and port context above.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
