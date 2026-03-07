import { useSystemStore } from '../stores/system'
import { useUIStore } from '../stores/ui'
import type { AgentInfo } from '../../../shared/types'

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

export function AgentsPanel(): JSX.Element {
  const state = useSystemStore((s) => s.state)
  if (!state) return <></>

  if (state.agents.length === 0) {
    return <div className="text-gray-600 text-sm">No AI agents detected</div>
  }

  return (
    <div className="text-sm overflow-y-auto max-h-full">
      {/* Column header legend */}
      <div className="flex items-center text-[10px] text-gray-600 uppercase tracking-wider px-2 pb-1.5 mb-1 border-b border-gray-800/50">
        <span className="flex-1">Agent</span>
        <span className="w-20 text-center">Status</span>
        <span className="w-24 text-right">Context</span>
        <span className="w-28 text-right">Handle</span>
      </div>

      <div className="space-y-1">
        {state.agents.map((agent) => (
          <AgentRow key={agent.id} agent={agent} />
        ))}
      </div>
    </div>
  )
}

function AgentRow({ agent }: { agent: AgentInfo }): JSX.Element {
  const state = useSystemStore((s) => s.state)
  const selectedAgentId = useUIStore((s) => s.selectedAgentId)
  const selectAgent = useUIStore((s) => s.selectAgent)

  const style = STATUS_STYLES[agent.status]
  const isSelected = selectedAgentId === agent.id

  // Find the workspace this agent belongs to by matching the agent's working dir
  // to a process group name, or by finding a process group that contains this agent's PID
  const matchedWorkspace = state?.processes.find((g) => {
    if (agent.workingDir) {
      const dirName = agent.workingDir.split('/').pop()
      if (g.name === dirName || g.name === agent.workingDir) return true
    }
    return agent.pid != null && g.processes.some((p) => p.pid === agent.pid)
  })

  const workspaceName = matchedWorkspace?.name
  const contextLabel =
    workspaceName ??
    (agent.currentTick != null ? `Tick ${agent.currentTick}` : agent.lastHeartbeat != null ? `HB ${formatRelativeAge(agent.lastHeartbeat)}` : '-')
  const handleLabel = agent.pid != null ? `PID ${agent.pid}` : agent.agentId ?? '-'
  const secondaryLabel =
    agent.currentAction ??
    (agent.source === 'state-file' && agent.sessionId ? `Session ${agent.sessionId}` : undefined)
  const kindLabel = TYPE_LABELS[agent.type]

  const handleClick = (): void => {
    selectAgent(agent.id, workspaceName)
  }

  return (
    <div
      onClick={handleClick}
      className={`flex items-center py-2 px-2 rounded cursor-pointer transition-colors ${
        isSelected
          ? 'bg-amber-950/30 border border-amber-800/40'
          : 'hover:bg-gray-800/50 border border-transparent'
      }`}
    >
      {/* Agent name + type icon + uptime (flex-1 to fill remaining space) */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`${TYPE_COLORS[agent.type]} text-xs shrink-0`}>
            {TYPE_ICONS[agent.type]}
          </span>
          <span className="text-white font-medium truncate">{agent.name}</span>
          {agent.uptime != null && (
            <span className="text-gray-600 text-[10px] shrink-0">{formatUptime(agent.uptime)}</span>
          )}
          {agent.name !== kindLabel && (
            <span className="text-[10px] uppercase tracking-wider text-gray-600 shrink-0">
              {kindLabel}
            </span>
          )}
        </div>
        {secondaryLabel && (
          <div className="text-[10px] text-gray-500 truncate pl-5 mt-0.5">{secondaryLabel}</div>
        )}
      </div>

      {/* Status pill — centered in w-20 */}
      <div className="w-20 flex justify-center shrink-0">
        <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_PILL[agent.status]}`}>
          {style.label}
        </span>
      </div>

      {/* Context — right-aligned in w-24 */}
      <div className="w-24 text-right shrink-0">
        {contextLabel !== '-' ? (
          <span
            className="text-blue-400/60 text-[10px] truncate inline-block max-w-full"
            title={contextLabel}
          >
            {contextLabel}
          </span>
        ) : (
          <span className="text-gray-700 text-[10px]">-</span>
        )}
      </div>

      {/* Handle — right-aligned in w-28 */}
      <div className="w-28 text-right shrink-0">
        <span className="text-gray-700 text-xs font-mono truncate inline-block max-w-full" title={handleLabel}>
          {handleLabel}
        </span>
      </div>
    </div>
  )
}
