import { useSystemStore } from '../stores/system'
import { useUIStore } from '../stores/ui'
import type { AgentInfo } from '../../../../shared/types'

const STATUS_STYLES: Record<AgentInfo['status'], { dot: string; label: string }> = {
  active: { dot: 'bg-green-400', label: 'active' },
  idle: { dot: 'bg-gray-500', label: 'idle' },
  waiting: { dot: 'bg-amber-400 animate-pulse', label: 'waiting' },
  unknown: { dot: 'bg-gray-700', label: 'unknown' }
}

const STATUS_PILL: Record<AgentInfo['status'], string> = {
  active: 'bg-green-950/60 text-green-400 border-green-800/40',
  idle: 'bg-gray-800/60 text-gray-500 border-gray-700/40',
  waiting: 'bg-amber-950/60 text-amber-400 border-amber-800/40 animate-pulse',
  unknown: 'bg-gray-900 text-gray-600 border-gray-800'
}

const TYPE_LABELS: Record<AgentInfo['type'], string> = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
  gemini: 'Gemini',
  other: 'Agent'
}

const TYPE_ICONS: Record<AgentInfo['type'], string> = {
  'claude-code': '\u25C6',
  codex: '\u25C7',
  gemini: '\u2726',
  other: '\u25CB'
}

const TYPE_COLORS: Record<AgentInfo['type'], string> = {
  'claude-code': 'text-amber-400',
  codex: 'text-blue-400',
  gemini: 'text-purple-400',
  other: 'text-gray-400'
}

function formatUptime(ms: number): string {
  const mins = Math.floor(ms / 60000)
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  return `${hrs}h ${mins % 60}m`
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
        <span className="w-24 text-right">Workspace</span>
        <span className="w-16 text-right">PID</span>
      </div>

      <div className="space-y-1">
        {state.agents.map((agent) => (
          <AgentRow key={agent.pid} agent={agent} />
        ))}
      </div>
    </div>
  )
}

function AgentRow({ agent }: { agent: AgentInfo }): JSX.Element {
  const state = useSystemStore((s) => s.state)
  const selectedAgentPid = useUIStore((s) => s.selectedAgentPid)
  const selectAgent = useUIStore((s) => s.selectAgent)

  const style = STATUS_STYLES[agent.status]
  const isSelected = selectedAgentPid === agent.pid

  // Find the workspace this agent belongs to by matching the agent's working dir
  // to a process group name, or by finding a process group that contains this agent's PID
  const matchedWorkspace = state?.processes.find((g) => {
    if (agent.workingDir) {
      const dirName = agent.workingDir.split('/').pop()
      if (g.name === dirName || g.name === agent.workingDir) return true
    }
    return g.processes.some((p) => p.pid === agent.pid)
  })

  const workspaceName = matchedWorkspace?.name

  const handleClick = (): void => {
    selectAgent(agent.pid, workspaceName)
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
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className={`${TYPE_COLORS[agent.type]} text-xs shrink-0`}>
          {TYPE_ICONS[agent.type]}
        </span>
        <span className="text-white font-medium truncate">{TYPE_LABELS[agent.type]}</span>
        {agent.uptime != null && (
          <span className="text-gray-600 text-[10px]">{formatUptime(agent.uptime)}</span>
        )}
      </div>

      {/* Status pill — centered in w-20 */}
      <div className="w-20 flex justify-center shrink-0">
        <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_PILL[agent.status]}`}>
          {style.label}
        </span>
      </div>

      {/* Workspace — right-aligned in w-24 */}
      <div className="w-24 text-right shrink-0">
        {workspaceName ? (
          <span
            className="text-blue-400/60 text-[10px] truncate inline-block max-w-full"
            title="Click to jump to workspace"
          >
            {workspaceName}
          </span>
        ) : (
          <span className="text-gray-700 text-[10px]">-</span>
        )}
      </div>

      {/* PID — right-aligned in w-16 */}
      <div className="w-16 text-right shrink-0">
        <span className="text-gray-700 text-xs font-mono">{agent.pid}</span>
      </div>
    </div>
  )
}
