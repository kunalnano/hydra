import { useState } from 'react'
import { useSystemStore } from '../stores/system'
import { useUIStore } from '../stores/ui'
import type { ProcessGroup, ProcessInfo } from '../../../shared/types'

export type CommandCenterSortMode = 'health' | 'workspace' | 'cpu' | 'memory'
type CommandCenterMode = 'full' | 'overview'

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

const HEALTH_DOT: Record<string, string> = {
  green: 'bg-green-400 shadow-green-400/50',
  yellow: 'bg-amber-400 shadow-amber-400/50',
  red: 'bg-red-400 shadow-red-400/50'
}

const TYPE_ORDER: Record<ProcessGroup['type'], number> = {
  project: 0,
  service: 1,
  agent: 2,
  other: 3
}

function getGroupHealth(group: ProcessGroup): 'green' | 'yellow' | 'red' {
  if (group.totalCpu > 95) return 'red'
  if (group.totalCpu > 80) return 'yellow'
  if (group.totalMem > 85) return 'red'
  if (group.totalMem > 70) return 'yellow'
  return 'green'
}

function compareGroupsByHealth(a: ProcessGroup, b: ProcessGroup): number {
  const healthOrder = { red: 0, yellow: 1, green: 2 }
  const ha = healthOrder[getGroupHealth(a)]
  const hb = healthOrder[getGroupHealth(b)]
  if (ha !== hb) return ha - hb
  if (b.totalCpu !== a.totalCpu) return b.totalCpu - a.totalCpu
  if (b.totalMem !== a.totalMem) return b.totalMem - a.totalMem
  return a.name.localeCompare(b.name)
}

function compareGroupsByWorkspaceFocus(
  a: ProcessGroup,
  b: ProcessGroup,
  selectedWorkspace: string | null
): number {
  const aSelected = selectedWorkspace === a.name ? 0 : 1
  const bSelected = selectedWorkspace === b.name ? 0 : 1
  if (aSelected !== bSelected) return aSelected - bSelected

  const typeDiff = TYPE_ORDER[a.type] - TYPE_ORDER[b.type]
  if (typeDiff !== 0) return typeDiff
  if (b.totalCpu !== a.totalCpu) return b.totalCpu - a.totalCpu
  if (b.totalMem !== a.totalMem) return b.totalMem - a.totalMem
  return a.name.localeCompare(b.name)
}

function compareGroupsByCpu(a: ProcessGroup, b: ProcessGroup): number {
  if (b.totalCpu !== a.totalCpu) return b.totalCpu - a.totalCpu
  if (b.totalMem !== a.totalMem) return b.totalMem - a.totalMem
  return a.name.localeCompare(b.name)
}

function compareGroupsByMemory(a: ProcessGroup, b: ProcessGroup): number {
  if (b.totalMem !== a.totalMem) return b.totalMem - a.totalMem
  if (b.totalCpu !== a.totalCpu) return b.totalCpu - a.totalCpu
  return a.name.localeCompare(b.name)
}

function compareGroups(
  a: ProcessGroup,
  b: ProcessGroup,
  sortMode: CommandCenterSortMode,
  selectedWorkspace: string | null
): number {
  switch (sortMode) {
    case 'workspace':
      return compareGroupsByWorkspaceFocus(a, b, selectedWorkspace)
    case 'cpu':
      return compareGroupsByCpu(a, b)
    case 'memory':
      return compareGroupsByMemory(a, b)
    default:
      return compareGroupsByHealth(a, b)
  }
}

export function CommandCenterPanel({
  initialSortMode = 'health',
  showSortControls = false,
  mode = 'full',
  maxGroups
}: {
  initialSortMode?: CommandCenterSortMode
  showSortControls?: boolean
  mode?: CommandCenterMode
  maxGroups?: number
}): JSX.Element {
  const state = useSystemStore((s) => s.state)
  const frozenPids = useSystemStore((s) => s.frozenPids)
  const selectedWorkspace = useUIStore((s) => s.selectedWorkspace)
  const [sortMode, setSortMode] = useState<CommandCenterSortMode>(initialSortMode)

  if (!state) return <></>

  const groups = [...state.processes]
    .filter((g) => g.type !== 'other')
    .sort((a, b) => compareGroups(a, b, sortMode, selectedWorkspace))
  const visibleGroups =
    mode === 'overview' && typeof maxGroups === 'number' ? groups.slice(0, maxGroups) : groups

  const otherCount = state.processes
    .filter((g) => g.type === 'other')
    .reduce((sum, g) => sum + g.processes.length, 0)

  const repoMap = new Map(state.gitRepos.map((r) => [r.name, r]))

  return (
    <div className="space-y-2 text-sm overflow-y-auto max-h-full">
      {showSortControls && mode === 'full' && (
        <div className="flex items-center justify-between gap-3 px-2">
          <div className="flex flex-wrap gap-1.5">
            <SortChip
              label="Workspace"
              active={sortMode === 'workspace'}
              onClick={() => setSortMode('workspace')}
            />
            <SortChip
              label="Health"
              active={sortMode === 'health'}
              onClick={() => setSortMode('health')}
            />
            <SortChip
              label="CPU"
              active={sortMode === 'cpu'}
              onClick={() => setSortMode('cpu')}
            />
            <SortChip
              label="Memory"
              active={sortMode === 'memory'}
              onClick={() => setSortMode('memory')}
            />
          </div>
          <div className="text-[10px] text-gray-600 whitespace-nowrap">
            CPU is per-core: 144% = 1.44 cores
          </div>
        </div>
      )}

      <div className="flex items-center text-[10px] text-gray-600 uppercase tracking-wider px-2 pb-1.5 mb-1 border-b border-gray-800/50">
        <span className="w-4" />
        <span className="flex-1">Workspace</span>
        <span className="w-10 text-center">Type</span>
        {mode === 'full' && <span className="w-20 text-right">Ports</span>}
        <span className="w-14 text-right">CPU</span>
        <span className="w-14 text-right">MEM</span>
        <span className="w-20 text-right">Git</span>
        {mode === 'full' && <span className="w-20 text-right">Actions</span>}
      </div>
      {visibleGroups.map((group) => (
        <CommandRow
          key={`${group.type}:${group.name}`}
          group={group}
          repo={repoMap.get(group.name)}
          frozenPids={frozenPids}
          isSelected={selectedWorkspace === group.name}
          allowExpand={mode === 'full'}
          showPorts={mode === 'full'}
          showActions={mode === 'full'}
        />
      ))}
      {mode === 'overview' && visibleGroups.length < groups.length && (
        <div className="text-xs text-gray-600 pt-2 px-2">
          + {groups.length - visibleGroups.length} more workspaces in Fleet
        </div>
      )}
      {otherCount > 0 && (
        <div className="text-xs text-gray-600 pt-2 px-2">+ {otherCount} system processes</div>
      )}
      {groups.length === 0 && <div className="text-gray-600 text-xs">No active workspaces</div>}
    </div>
  )
}

function SortChip({
  label,
  active,
  onClick
}: {
  label: string
  active: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full border text-[10px] uppercase tracking-[0.18em] transition-colors ${
        active
          ? 'border-cyan-700/60 bg-cyan-950/30 text-cyan-200'
          : 'border-gray-800 bg-gray-900 text-gray-500 hover:text-gray-300'
      }`}
    >
      {label}
    </button>
  )
}

function CommandRow({
  group,
  repo,
  frozenPids,
  isSelected,
  allowExpand,
  showPorts,
  showActions
}: {
  group: ProcessGroup
  repo?: { branch: string; dirty: boolean; ahead: number; status: string }
  frozenPids: Set<number>
  isSelected: boolean
  allowExpand: boolean
  showPorts: boolean
  showActions: boolean
}): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const killGroup = useSystemStore((s) => s.killGroup)
  const signalProcess = useSystemStore((s) => s.signalProcess)
  const selectWorkspace = useUIStore((s) => s.selectWorkspace)

  const health = getGroupHealth(group)
  const frozenCount = group.processes.filter((p) => frozenPids.has(p.pid)).length
  const allFrozen = frozenCount === group.processes.length && frozenCount > 0

  const handleFreezeAll = async (): Promise<void> => {
    for (const p of group.processes) {
      if (!frozenPids.has(p.pid)) {
        await signalProcess(p.pid, 'SIGSTOP')
      }
    }
  }

  const handleThawAll = async (): Promise<void> => {
    for (const p of group.processes) {
      if (frozenPids.has(p.pid)) {
        await signalProcess(p.pid, 'SIGCONT')
      }
    }
  }

  const handleKillGroup = async (): Promise<void> => {
    if (!confirming) {
      setConfirming(true)
      setTimeout(() => setConfirming(false), 3000)
      return
    }
    setConfirming(false)
    await killGroup(
      group.processes.map((p) => ({ pid: p.pid, name: p.name })),
      group.name
    )
  }

  return (
    <div>
      <div
        className={`flex items-center py-1.5 px-2 rounded cursor-pointer transition-colors border ${
          isSelected
            ? 'bg-blue-950/30 border-blue-800/50'
            : 'hover:bg-gray-800/50 border-transparent'
        }`}
      >
        <div className="w-4 flex items-center">
          <span className={`w-2 h-2 rounded-full shadow-sm ${HEALTH_DOT[health]}`} />
        </div>

        <div
          className="flex items-center gap-2 flex-1 min-w-0"
          onClick={() => {
            if (allowExpand) {
              setExpanded(!expanded)
            }
            selectWorkspace(group.name)
          }}
        >
          {allowExpand && (
            <span
              className={`text-[10px] ${expanded ? 'rotate-90' : ''} text-gray-500 transition-transform`}
            >
              {'\u25B6'}
            </span>
          )}
          <span className="text-white truncate">{group.name}</span>
          {frozenCount > 0 && (
            <span className="text-blue-400 text-[10px]" title={`${frozenCount} frozen`}>
              * {frozenCount}
            </span>
          )}
        </div>

        <span
          className={`text-[10px] font-bold px-1.5 py-0.5 rounded border w-10 text-center ${TYPE_PILL_STYLES[group.type]}`}
        >
          {TYPE_LABELS[group.type]}
        </span>

        {showPorts && (
          <span className="text-gray-500 text-xs font-mono w-20 text-right truncate">
            {group.ports.length > 0 ? group.ports.map((p) => `:${p}`).join(' ') : '\u2014'}
          </span>
        )}

        <div className="flex items-center gap-1 w-14 justify-end">
          <span className="text-blue-400 text-xs font-mono">{group.totalCpu.toFixed(1)}%</span>
        </div>

        <span className="text-purple-400 text-xs font-mono w-14 text-right">
          {group.totalMem.toFixed(1)}%
        </span>

        <span className="text-xs w-20 text-right truncate">
          {repo ? (
            <>
              <span className="text-gray-400">{repo.branch}</span>
              {repo.dirty && <span className="text-amber-400 ml-1">*</span>}
              {repo.ahead > 0 && (
                <span className="text-cyan-400 ml-1">
                  {'\u2191'}
                  {repo.ahead}
                </span>
              )}
            </>
          ) : (
            <span className="text-gray-700">{'\u2014'}</span>
          )}
        </span>

        {showActions && (
          <div className="flex items-center gap-1 w-20 justify-end">
            {allFrozen ? (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleThawAll()
                }}
                className="text-[10px] px-1.5 py-0.5 rounded bg-blue-950/60 text-blue-400 border border-blue-800/40 hover:bg-blue-900/60"
                title="Thaw all processes"
              >
                Thaw
              </button>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleFreezeAll()
                }}
                className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-950/60 text-cyan-400 border border-cyan-800/40 hover:bg-cyan-900/60"
                title="Freeze all processes (SIGSTOP)"
              >
                Freeze
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleKillGroup()
              }}
              className={`text-[10px] px-1.5 py-0.5 rounded border ${
                confirming
                  ? 'bg-red-900/60 text-red-300 border-red-500 animate-pulse'
                  : 'bg-red-950/60 text-red-400 border-red-800/40 hover:bg-red-900/60'
              }`}
              title={
                confirming ? 'Click again to confirm' : `Kill all ${group.processes.length} processes`
              }
            >
              {confirming ? 'Sure?' : 'Kill'}
            </button>
          </div>
        )}
      </div>

      {allowExpand && expanded && (
        <div className="ml-6 border-l border-gray-800 pl-2 py-1 space-y-px">
          <div className="flex items-center text-[10px] text-gray-600 uppercase tracking-wider px-1 pb-1 gap-2">
            <span className="w-3" />
            <span className="flex-1">Process</span>
            <span className="w-10 text-right">CPU</span>
            <span className="w-10 text-right">MEM</span>
            <span className="w-14 text-right">PID</span>
            <span className="w-20 text-right">Actions</span>
          </div>
          {[...group.processes]
            .sort((a, b) => b.cpu - a.cpu)
            .map((proc, idx) => (
              <ProcessActionRow
                key={proc.pid}
                proc={proc}
                isEven={idx % 2 === 0}
                isFrozen={frozenPids.has(proc.pid)}
              />
            ))}
        </div>
      )}
    </div>
  )
}

function ProcessActionRow({
  proc,
  isEven,
  isFrozen
}: {
  proc: ProcessInfo
  isEven: boolean
  isFrozen: boolean
}): JSX.Element {
  const killProcess = useSystemStore((s) => s.killProcess)
  const signalProcess = useSystemStore((s) => s.signalProcess)

  const cpuColor =
    proc.cpu > 50 ? 'text-red-400' : proc.cpu > 20 ? 'text-amber-400' : 'text-gray-400'
  const memColor =
    proc.mem > 10 ? 'text-red-400' : proc.mem > 5 ? 'text-amber-400' : 'text-gray-400'

  const shortCommand = proc.command
    .replace(/^\/.*\//, '')
    .replace(/\s+--?\S+=\S+/g, '')
    .slice(0, 50)

  return (
    <div
      className={`flex items-center text-xs px-1 py-0.5 rounded hover:bg-gray-800/30 gap-2 ${isEven ? 'bg-gray-900/30' : ''}`}
    >
      <span className="w-3 text-center">
        {isFrozen && (
          <span className="text-blue-400 text-[10px]" title="Frozen">
            *
          </span>
        )}
      </span>

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

      <div className="flex items-center gap-1 w-20 justify-end">
        {isFrozen ? (
          <button
            onClick={() => signalProcess(proc.pid, 'SIGCONT')}
            className="text-[10px] px-1 py-0.5 rounded bg-blue-950/60 text-blue-400 border border-blue-800/40 hover:bg-blue-900/60"
            title="Thaw (SIGCONT)"
          >
            Thaw
          </button>
        ) : (
          <button
            onClick={() => signalProcess(proc.pid, 'SIGSTOP')}
            className="text-[10px] px-1 py-0.5 rounded bg-cyan-950/60 text-cyan-400 border border-cyan-800/40 hover:bg-cyan-900/60"
            title="Freeze (SIGSTOP)"
          >
            Freeze
          </button>
        )}
        <button
          onClick={() => killProcess(proc.pid, proc.name)}
          className="text-[10px] px-1 py-0.5 rounded bg-red-950/60 text-red-400 border-red-800/40 border hover:bg-red-900/60"
          title="Kill (SIGTERM)"
        >
          Kill
        </button>
      </div>
    </div>
  )
}
