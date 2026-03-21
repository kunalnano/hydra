import { useEffect, useState } from 'react'
import type { AgentRegistryEntry, RegistryAgentStatus, RegistryAgentType } from '../../../shared/types'

const STATUS_COLORS: Record<RegistryAgentStatus, string> = {
  active: 'bg-green-400',
  retired: 'bg-gray-500',
  stalled: 'bg-amber-400',
  dead: 'bg-red-400/50',
  evolved: 'bg-cyan-400'
}

const STATUS_TEXT: Record<RegistryAgentStatus, string> = {
  active: 'text-green-400',
  retired: 'text-gray-500',
  stalled: 'text-amber-400',
  dead: 'text-red-400/60',
  evolved: 'text-cyan-400'
}

const TYPE_ICONS: Record<RegistryAgentType, string> = {
  'voice-assistant': '\u{1F399}',
  'cli-tool': '\u{2328}',
  dashboard: '\u{1F4CA}',
  'mcp-server': '\u{1F50C}',
  'workflow-agent': '\u{2699}',
  multiplexer: '\u{1F500}',
  'rag-server': '\u{1F50D}',
  bot: '\u{1F916}',
  simulator: '\u{1F3AE}',
  other: '\u{1F4E6}'
}

const AGENT_TYPES: RegistryAgentType[] = [
  'cli-tool',
  'dashboard',
  'voice-assistant',
  'mcp-server',
  'workflow-agent',
  'rag-server',
  'bot',
  'multiplexer',
  'simulator',
  'other'
]

const AGENT_STATUSES: RegistryAgentStatus[] = ['active', 'retired', 'stalled', 'dead', 'evolved']

function makeId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

interface AddAgentFormProps {
  onSave: (entry: AgentRegistryEntry) => void
  onCancel: () => void
}

function AddAgentForm({ onSave, onCancel }: AddAgentFormProps): JSX.Element {
  const [name, setName] = useState('')
  const [type, setType] = useState<RegistryAgentType>('cli-tool')
  const [status, setStatus] = useState<RegistryAgentStatus>('active')
  const [description, setDescription] = useState('')
  const [stackInput, setStackInput] = useState('')
  const [repo, setRepo] = useState('')
  const [impactScore, setImpactScore] = useState(50)

  const canSave = name.trim().length > 0

  function handleSubmit(): void {
    if (!canSave) return
    const entry: AgentRegistryEntry = {
      id: makeId(name),
      name: name.trim(),
      type,
      status,
      era: { start: new Date().toISOString().split('T')[0] },
      stack: stackInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      description,
      keyOutputs: [],
      impactScore,
      tags: [],
      ...(repo.trim() ? { repo: repo.trim() } : {})
    }
    onSave(entry)
  }

  const selectClass =
    'w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-white/25 appearance-none'
  const inputClass =
    'w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/25'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-semibold text-white">Add Agent</h3>
        <button
          type="button"
          onClick={onCancel}
          className="text-white/40 hover:text-white/70 text-sm"
        >
          Cancel
        </button>
      </div>

      <div>
        <label className="text-[9px] uppercase tracking-[0.16em] shell-subtle mb-1 block">
          Name *
        </label>
        <input
          className={inputClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My Agent"
          autoFocus
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[9px] uppercase tracking-[0.16em] shell-subtle mb-1 block">
            Type
          </label>
          <select className={selectClass} value={type} onChange={(e) => setType(e.target.value as RegistryAgentType)}>
            {AGENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_ICONS[t]} {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[9px] uppercase tracking-[0.16em] shell-subtle mb-1 block">
            Status
          </label>
          <select
            className={selectClass}
            value={status}
            onChange={(e) => setStatus(e.target.value as RegistryAgentStatus)}
          >
            {AGENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="text-[9px] uppercase tracking-[0.16em] shell-subtle mb-1 block">
          Description
        </label>
        <textarea
          className={`${inputClass} resize-none`}
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What does this agent do?"
        />
      </div>

      <div>
        <label className="text-[9px] uppercase tracking-[0.16em] shell-subtle mb-1 block">
          Stack (comma-separated)
        </label>
        <input
          className={inputClass}
          value={stackInput}
          onChange={(e) => setStackInput(e.target.value)}
          placeholder="typescript, react, python"
        />
      </div>

      <div>
        <label className="text-[9px] uppercase tracking-[0.16em] shell-subtle mb-1 block">
          Repository URL (optional)
        </label>
        <input
          className={inputClass}
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          placeholder="https://github.com/..."
        />
      </div>

      <div>
        <label className="text-[9px] uppercase tracking-[0.16em] shell-subtle mb-1 block">
          Impact Score: {impactScore}
        </label>
        <input
          type="range"
          min={1}
          max={100}
          value={impactScore}
          onChange={(e) => setImpactScore(Number(e.target.value))}
          className="w-full accent-amber-400"
        />
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSave}
        className={`w-full py-2 rounded text-sm font-semibold transition-colors ${
          canSave
            ? 'bg-amber-950/40 border border-amber-700/40 text-amber-400 hover:bg-amber-950/60'
            : 'bg-white/5 border border-white/10 text-white/30 cursor-not-allowed'
        }`}
      >
        Save Agent
      </button>
    </div>
  )
}

function ImpactBar({ score }: { score: number }): JSX.Element {
  const width = Math.max(4, score)
  const color =
    score >= 80 ? 'bg-green-400' : score >= 50 ? 'bg-amber-400' : score >= 25 ? 'bg-orange-400' : 'bg-red-400/60'

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 rounded-full bg-white/5 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${width}%` }} />
      </div>
      <span className="text-[10px] font-mono tabular-nums shell-subtle">{score}</span>
    </div>
  )
}

function EraRange({ era }: { era: { start: string; end?: string } }): JSX.Element {
  const fmt = (d: string): string => {
    const date = new Date(d)
    return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
  }
  return (
    <span className="text-[10px] font-mono tabular-nums shell-subtle">
      {fmt(era.start)}{era.end ? ` \u2013 ${fmt(era.end)}` : ' \u2013 now'}
    </span>
  )
}

function AgentRow({
  entry,
  rank,
  selected,
  onSelect
}: {
  entry: AgentRegistryEntry
  rank: number
  selected: boolean
  onSelect: () => void
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left px-3 py-2.5 rounded-md transition-colors ${
        selected
          ? 'bg-white/8 border border-white/10'
          : 'hover:bg-white/4 border border-transparent'
      }`}
    >
      <div className="flex items-center gap-3">
        <span className="text-[10px] font-mono tabular-nums shell-subtle w-5 text-right shrink-0">
          {rank}
        </span>
        <span className="text-sm shrink-0" title={entry.type}>
          {TYPE_ICONS[entry.type]}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white truncate">{entry.name}</span>
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_COLORS[entry.status]}`} />
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <EraRange era={entry.era} />
            <ImpactBar score={entry.impactScore} />
          </div>
        </div>
      </div>
    </button>
  )
}

function DetailField({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-[0.16em] shell-subtle mb-1">{label}</div>
      <div className="text-sm text-white/90">{children}</div>
    </div>
  )
}

function AgentDetail({
  entry,
  allEntries
}: {
  entry: AgentRegistryEntry
  allEntries: AgentRegistryEntry[]
}): JSX.Element {
  const parent = entry.parentAgent ? allEntries.find((e) => e.id === entry.parentAgent) : null
  const children = allEntries.filter((e) => e.parentAgent === entry.id)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <span className="text-2xl">{TYPE_ICONS[entry.type]}</span>
          <div>
            <h3 className="text-lg font-semibold text-white">{entry.name}</h3>
            {entry.codename && (
              <span className="text-[10px] shell-subtle">
                formerly {entry.codename}
              </span>
            )}
          </div>
          <span
            className={`ml-auto px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${STATUS_TEXT[entry.status]} border border-current/20`}
          >
            {entry.status}
          </span>
        </div>
        <p className="text-sm shell-muted">{entry.description}</p>
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="display-well rounded-md px-3 py-2 text-center">
          <div className="text-[9px] uppercase tracking-wider shell-subtle">Impact</div>
          <div className="text-xl font-bold font-mono" style={{ color: 'var(--helm-accent)' }}>
            {entry.impactScore}
          </div>
        </div>
        <div className="display-well rounded-md px-3 py-2 text-center">
          <div className="text-[9px] uppercase tracking-wider shell-subtle">Type</div>
          <div className="text-xs font-semibold text-white mt-1">{entry.type}</div>
        </div>
        <div className="display-well rounded-md px-3 py-2 text-center">
          <div className="text-[9px] uppercase tracking-wider shell-subtle">Era</div>
          <div className="text-xs text-white mt-1">
            <EraRange era={entry.era} />
          </div>
        </div>
      </div>

      {/* Stack */}
      <DetailField label="Stack">
        <div className="flex flex-wrap gap-1.5">
          {entry.stack.map((s) => (
            <span
              key={s}
              className="px-2 py-0.5 rounded text-[10px] font-mono bg-white/6 border border-white/8 text-white/80"
            >
              {s}
            </span>
          ))}
        </div>
      </DetailField>

      {/* Key Outputs */}
      <DetailField label="Key Outputs">
        <ul className="space-y-1.5">
          {entry.keyOutputs.map((output, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <span className="text-[10px] mt-1 shrink-0" style={{ color: 'var(--helm-accent)' }}>
                {'\u25B8'}
              </span>
              <span className="shell-muted">{output}</span>
            </li>
          ))}
        </ul>
      </DetailField>

      {/* Lessons Learned */}
      {entry.lessonsLearned && (
        <DetailField label="Lessons Learned">
          <div
            className="rounded-md px-3 py-2.5 text-sm italic shell-muted leading-relaxed"
            style={{
              background: 'var(--helm-well-bg)',
              borderLeft: '2px solid var(--helm-accent)'
            }}
          >
            {entry.lessonsLearned}
          </div>
        </DetailField>
      )}

      {/* Links */}
      <div className="grid grid-cols-2 gap-3">
        {entry.repo && (
          <DetailField label="Repository">
            <span className="text-xs font-mono shell-muted break-all">{entry.repo}</span>
          </DetailField>
        )}
        {entry.deployedTo && (
          <DetailField label="Deployed To">
            <span className="text-xs font-mono shell-muted">{entry.deployedTo}</span>
          </DetailField>
        )}
      </div>

      {/* Lineage */}
      {(parent || children.length > 0) && (
        <DetailField label="Lineage">
          <div className="space-y-1">
            {parent && (
              <div className="text-xs shell-muted">
                <span className="shell-subtle">Evolved from:</span>{' '}
                <span className="text-white/80">{parent.name}</span>
              </div>
            )}
            {children.map((child) => (
              <div key={child.id} className="text-xs shell-muted">
                <span className="shell-subtle">Spawned:</span>{' '}
                <span className="text-white/80">{child.name}</span>
              </div>
            ))}
          </div>
        </DetailField>
      )}

      {/* Tags */}
      <DetailField label="Tags">
        <div className="flex flex-wrap gap-1.5">
          {entry.tags.map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 rounded-full text-[10px] bg-white/4 shell-subtle"
            >
              #{tag}
            </span>
          ))}
        </div>
      </DetailField>
    </div>
  )
}

function SummaryStats({ entries }: { entries: AgentRegistryEntry[] }): JSX.Element {
  const total = entries.length
  const active = entries.filter((e) => e.status === 'active').length
  const avgImpact = total > 0 ? Math.round(entries.reduce((s, e) => s + e.impactScore, 0) / total) : 0
  const repos = entries.filter((e) => e.repo).length

  const stats = [
    { label: 'Total Agents', value: total },
    { label: 'Active', value: active },
    { label: 'Avg Impact', value: avgImpact },
    { label: 'Repos Shipped', value: repos }
  ]

  return (
    <div className="flex gap-3 mb-4">
      {stats.map((s) => (
        <div key={s.label} className="display-well flex-1 rounded-md px-3 py-2 text-center">
          <div className="text-[9px] uppercase tracking-wider shell-subtle">{s.label}</div>
          <div className="text-lg font-bold font-mono" style={{ color: 'var(--helm-accent)' }}>
            {s.value}
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8">
      <div className="text-4xl mb-4">{'\u{1F4CB}'}</div>
      <h2 className="text-lg font-semibold text-white mb-2">Agent Registry</h2>
      <p className="text-sm text-gray-400 max-w-md mb-6">
        Track every AI agent that works for you. Add agents manually or let HELM
        auto-detect them from running processes.
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="px-4 py-2 rounded border border-amber-700/40 bg-amber-950/25
                   text-amber-400 text-sm hover:bg-amber-950/40 transition-colors"
      >
        + Add Your First Agent
      </button>
    </div>
  )
}

export function RegistryPanel(): JSX.Element {
  const [entries, setEntries] = useState<AgentRegistryEntry[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filter, setFilter] = useState<RegistryAgentStatus | 'all'>('all')
  const [showAddForm, setShowAddForm] = useState(false)

  useEffect(() => {
    window.helm.getAgentRegistry().then((data) => {
      const sorted = data.slice().sort((a, b) => b.impactScore - a.impactScore)
      setEntries(sorted)
      if (sorted.length > 0 && !selectedId) {
        setSelectedId(sorted[0].id)
      }
    })
  }, [])

  function handleSaveAgent(entry: AgentRegistryEntry): void {
    window.helm.updateAgentEntry(entry).then((saved) => {
      setEntries((prev) => {
        const updated = [...prev, saved].sort((a, b) => b.impactScore - a.impactScore)
        return updated
      })
      setSelectedId(saved.id)
      setShowAddForm(false)
    })
  }

  // Empty state
  if (entries.length === 0 && !showAddForm) {
    return <EmptyState onAdd={() => setShowAddForm(true)} />
  }

  // Show add form fullscreen when registry is empty
  if (entries.length === 0 && showAddForm) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-full max-w-md">
          <AddAgentForm onSave={handleSaveAgent} onCancel={() => setShowAddForm(false)} />
        </div>
      </div>
    )
  }

  const filtered = filter === 'all' ? entries : entries.filter((e) => e.status === filter)
  const selected = entries.find((e) => e.id === selectedId) ?? null

  const statusCounts: Record<string, number> = {}
  for (const e of entries) {
    statusCounts[e.status] = (statusCounts[e.status] || 0) + 1
  }

  return (
    <div className="h-full flex flex-col">
      <SummaryStats entries={entries} />

      {/* Filter strip + add button */}
      <div className="flex items-center gap-1.5 mb-3">
        {(['all', 'active', 'stalled', 'dead', 'evolved', 'retired'] as const).map((f) => {
          const count = f === 'all' ? entries.length : statusCounts[f] || 0
          if (f !== 'all' && count === 0) return null
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                filter === f
                  ? 'bg-white/10 text-white border border-white/15'
                  : 'text-white/50 hover:text-white/70 border border-transparent'
              }`}
            >
              {f} ({count})
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => {
            setShowAddForm(true)
            setSelectedId(null)
          }}
          className="ml-auto px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wider
                     text-amber-400/70 hover:text-amber-400 border border-amber-700/30 hover:border-amber-700/50
                     transition-colors"
        >
          + Add
        </button>
      </div>

      {/* Main layout */}
      <div className="flex-1 min-h-0 flex gap-4">
        {/* Left: ranked list */}
        <div className="w-[340px] shrink-0 overflow-y-auto pr-1 space-y-0.5">
          {filtered.map((entry) => (
            <AgentRow
              key={entry.id}
              entry={entry}
              rank={entries.indexOf(entry) + 1}
              selected={entry.id === selectedId && !showAddForm}
              onSelect={() => {
                setSelectedId(entry.id)
                setShowAddForm(false)
              }}
            />
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-8 shell-subtle text-sm">No agents match filter</div>
          )}
        </div>

        {/* Right: detail view or add form */}
        <div className="flex-1 min-w-0 overflow-y-auto pl-4 border-l border-white/6">
          {showAddForm ? (
            <AddAgentForm onSave={handleSaveAgent} onCancel={() => setShowAddForm(false)} />
          ) : selected ? (
            <AgentDetail entry={selected} allEntries={entries} />
          ) : (
            <div className="flex items-center justify-center h-full shell-subtle text-sm">
              Select an agent to view details
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
