import { useSystemStore } from '../stores/system'
import { useUIStore } from '../stores/ui'
import type { ProcessGroup, ProcessInfo } from '../../../shared/types'

const TYPE_LABELS: Record<ProcessGroup['type'], string> = {
  project: 'PRJ',
  agent: 'AI',
  service: 'SVC',
  other: 'SYS'
}

const TYPE_PILL_STYLES: Record<ProcessGroup['type'], string> = {
  project: 'bg-blue-950/60 text-blue-400 border-blue-800/40',
  agent: 'bg-amber-950/60 text-amber-400 border-amber-800/40',
  service: 'bg-green-950/60 text-green-400 border-green-800/40',
  other: 'bg-gray-900 text-gray-500 border-gray-700/40'
}

export function WorkspacesPanel(): JSX.Element {
  const state = useSystemStore((s) => s.state)
  if (!state) return <></>

  const groups = [...state.processes]
    .filter((g) => g.type !== 'other')
    .sort((a, b) => b.totalCpu - a.totalCpu)

  const otherGroups = state.processes.filter((g) => g.type === 'other')

  return (
    <div className="space-y-0.5 text-sm overflow-y-auto max-h-full">
      <div className="flex items-center text-[10px] text-gray-600 uppercase tracking-wider px-2 pb-1.5 mb-1 border-b border-gray-800/50">
        <span className="flex-1">Workspace</span>
        <span className="w-12 text-center">Type</span>
        <span className="w-10 text-right">Procs</span>
        <span className="w-16 text-right">CPU</span>
        <span className="w-16 text-right">MEM</span>
      </div>
      {groups.map((group) => (
        <GroupRow key={`${group.type}:${group.name}`} group={group} />
      ))}
      {otherGroups.length > 0 && (
        <div className="text-xs text-gray-600 pt-2 px-2">
          + {otherGroups.reduce((sum, g) => sum + g.processes.length, 0)} system processes
        </div>
      )}
      {groups.length === 0 && <div className="text-gray-600 text-xs">No active workspaces</div>}
    </div>
  )
}

function GroupRow({ group }: { group: ProcessGroup }): JSX.Element {
  const selectedWorkspace = useUIStore((s) => s.selectedWorkspace)
  const expandedWorkspace = useUIStore((s) => s.expandedWorkspace)
  const toggleExpand = useUIStore((s) => s.toggleExpandWorkspace)
  const selectWorkspace = useUIStore((s) => s.selectWorkspace)

  const isSelected = selectedWorkspace === group.name
  const isExpanded = expandedWorkspace === group.name

  const handleClick = (): void => {
    toggleExpand(group.name)
    selectWorkspace(group.name)
  }

  return (
    <div>
      <div
        onClick={handleClick}
        className={`flex items-center justify-between py-1.5 px-2 rounded cursor-pointer transition-colors ${
          isSelected
            ? 'bg-blue-950/40 border border-blue-800/50'
            : 'hover:bg-gray-800/50 border border-transparent'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`text-[10px] ${isExpanded ? 'rotate-90' : ''} text-gray-500 transition-transform`}
          >
            ▶
          </span>
          <span className="text-white truncate">{group.name}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-2">
          <span
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${TYPE_PILL_STYLES[group.type]}`}
          >
            {TYPE_LABELS[group.type]}
          </span>
          <span className="text-gray-600 text-xs shrink-0">{group.processes.length} proc</span>
          {group.ports.length > 0 && (
            <span className="text-gray-500 text-xs font-mono">
              {group.ports.map((p) => `:${p}`).join(' ')}
            </span>
          )}
          <div className="flex items-center gap-1.5 w-16 justify-end">
            <span className="text-blue-400 text-xs font-mono text-right">
              {group.totalCpu.toFixed(1)}%
            </span>
            <div className="w-8 h-1 bg-gray-800 rounded-full overflow-hidden shrink-0">
              <div
                className={`h-full rounded-full ${
                  group.totalCpu > 50
                    ? 'bg-red-400'
                    : group.totalCpu > 20
                      ? 'bg-amber-400'
                      : 'bg-blue-400'
                }`}
                style={{ width: `${Math.min(100, group.totalCpu)}%` }}
              />
            </div>
          </div>
          <span className="text-purple-400 text-xs font-mono w-16 text-right">
            {group.totalMem.toFixed(1)}% mem
          </span>
        </div>
      </div>

      {isExpanded && (
        <div className="ml-6 border-l border-gray-800 pl-2 py-1 space-y-px">
          <div className="flex items-center text-[10px] text-gray-600 uppercase tracking-wider px-1 pb-1 gap-2">
            <span className="flex-1">Process</span>
            <span className="w-10 text-right">CPU</span>
            <span className="w-10 text-right">MEM</span>
            <span className="w-14 text-right">PID</span>
          </div>
          {[...group.processes]
            .sort((a, b) => b.cpu - a.cpu)
            .map((proc, idx) => (
              <ProcessRow key={proc.pid} proc={proc} isEven={idx % 2 === 0} />
            ))}
        </div>
      )}
    </div>
  )
}

function ProcessRow({ proc, isEven }: { proc: ProcessInfo; isEven: boolean }): JSX.Element {
  const cpuColor =
    proc.cpu > 50 ? 'text-red-400' : proc.cpu > 20 ? 'text-amber-400' : 'text-gray-400'
  const memColor =
    proc.mem > 10 ? 'text-red-400' : proc.mem > 5 ? 'text-amber-400' : 'text-gray-400'

  // Show the meaningful part of the command
  const shortCommand = proc.command
    .replace(/^\/.*\//, '')
    .replace(/\s+--?\S+=\S+/g, '')
    .slice(0, 60)

  return (
    <div
      className={`flex items-center text-xs px-1 py-0.5 rounded hover:bg-gray-800/30 gap-2 ${isEven ? 'bg-gray-900/30' : ''}`}
    >
      <span className="text-gray-400 truncate flex-1" title={proc.command}>
        {shortCommand}
      </span>
      <span className={`${cpuColor} font-mono w-10 text-right shrink-0`}>
        {proc.cpu.toFixed(1)}
      </span>
      <span className={`${memColor} font-mono w-10 text-right shrink-0`}>
        {proc.mem.toFixed(1)}
      </span>
      <span className="text-gray-700 font-mono w-14 text-right shrink-0">{proc.pid}</span>
    </div>
  )
}
