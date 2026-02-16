import { useSystemStore } from '../stores/system'
import { useUIStore } from '../stores/ui'
import type { AgentInfo } from '../../../../shared/types'

const STATUS_STYLES: Record<AgentInfo['status'], { dot: string; label: string }> = {
  active: { dot: 'bg-green-400', label: 'active' },
  idle: { dot: 'bg-gray-500', label: 'idle' },
  waiting: { dot: 'bg-amber-400 animate-pulse', label: 'waiting' },
  unknown: { dot: 'bg-gray-700', label: 'unknown' }
}

const TYPE_LABELS: Record<AgentInfo['type'], string> = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
  gemini: 'Gemini',
  other: 'Agent'
}

export function AgentsPanel(): JSX.Element {
  const state = useSystemStore((s) => s.state)
  if (!state) return <></>

  if (state.agents.length === 0) {
    return <div className="text-gray-600 text-sm">No AI agents detected</div>
  }

  return (
    <div className="space-y-1 text-sm overflow-y-auto max-h-full">
      {state.agents.map((agent) => (
        <AgentRow key={agent.pid} agent={agent} />
      ))}
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
  const dir = agent.workingDir?.split('/').pop() || ''

  const handleClick = (): void => {
    selectAgent(agent.pid, workspaceName)
  }

  return (
    <div
      onClick={handleClick}
      className={`flex items-center justify-between py-2 px-2 rounded cursor-pointer transition-colors ${
        isSelected
          ? 'bg-amber-950/30 border border-amber-800/40'
          : 'hover:bg-gray-800/50 border border-transparent'
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className={`w-2 h-2 rounded-full ${style.dot} shrink-0`} />
        <span className="text-white font-medium truncate">{TYPE_LABELS[agent.type]}</span>
        {dir && (
          <span className="text-gray-500 text-xs truncate">
            in <span className="text-gray-400">{dir}</span>
          </span>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0 ml-2">
        <span
          className={`text-xs px-1.5 py-0.5 rounded ${
            agent.status === 'active'
              ? 'bg-green-950/50 text-green-400'
              : agent.status === 'waiting'
                ? 'bg-amber-950/50 text-amber-400'
                : 'text-gray-500'
          }`}
        >
          {style.label}
        </span>
        {workspaceName && (
          <span className="text-blue-400/60 text-[10px]" title="Click to jump to workspace">
            → {workspaceName}
          </span>
        )}
        <span className="text-gray-700 text-xs font-mono">PID {agent.pid}</span>
      </div>
    </div>
  )
}
