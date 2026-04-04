import { useEffect, useState } from 'react'
import type { BrickItem, BrickQueueState } from '../../../shared/types'

const PRIORITY_COLORS: Record<string, string> = {
  'p0-critical': 'text-red-400',
  'p1-high': 'text-amber-400',
  'p2-normal': 'text-blue-400',
  'p3-low': 'text-gray-500'
}

const PRIORITY_DOTS: Record<string, string> = {
  'p0-critical': 'bg-red-400',
  'p1-high': 'bg-amber-400',
  'p2-normal': 'bg-blue-400',
  'p3-low': 'bg-gray-500'
}

const LANE_COLORS: Record<string, string> = {
  backlog: 'text-gray-400',
  claimed: 'text-amber-400',
  done: 'text-green-400',
  reviewed: 'text-cyan-400'
}

const LANE_LABELS: Record<string, string> = {
  backlog: 'Backlog',
  claimed: 'Claimed',
  done: 'Awaiting Review',
  reviewed: 'Reviewed'
}

function BrickRow({
  brick,
  onSelect,
  selected
}: {
  brick: BrickItem
  onSelect: (b: BrickItem) => void
  selected: boolean
}): JSX.Element {
  return (
    <button
      onClick={() => onSelect(brick)}
      className={`w-full text-left flex items-center gap-3 py-2 px-3 rounded transition-colors ${
        selected
          ? 'bg-white/10 border border-white/20'
          : 'hover:bg-gray-800/40 border border-transparent'
      }`}
    >
      <span className={`h-2 w-2 rounded-full shrink-0 ${PRIORITY_DOTS[brick.priority] || 'bg-gray-600'}`} />
      <span className="text-[10px] font-mono text-gray-500 shrink-0">#{brick.id}</span>
      <span className="text-sm text-white truncate flex-1">{brick.title}</span>
      <span className="text-[10px] text-gray-500 shrink-0">{brick.estimated_effort}</span>
      {brick.claimed_by && (
        <span className="text-[10px] text-cyan-400 shrink-0">{brick.claimed_by}</span>
      )}
    </button>
  )
}

function BrickDetail({
  brick,
  onApprove,
  onReject
}: {
  brick: BrickItem
  onApprove: (id: string) => void
  onReject: (id: string) => void
}): JSX.Element {
  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-center gap-3">
        <span className={`h-2.5 w-2.5 rounded-full ${PRIORITY_DOTS[brick.priority] || 'bg-gray-600'}`} />
        <h3 className="text-white font-semibold text-base">{brick.title}</h3>
        <span className="text-[10px] font-mono text-gray-500">#{brick.id}</span>
      </div>

      <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs">
        <div>
          <span className="text-gray-500 uppercase tracking-wider">Priority</span>
          <div className={PRIORITY_COLORS[brick.priority] || 'text-gray-400'}>{brick.priority}</div>
        </div>
        <div>
          <span className="text-gray-500 uppercase tracking-wider">Effort</span>
          <div className="text-gray-300">{brick.estimated_effort}</div>
        </div>
        <div>
          <span className="text-gray-500 uppercase tracking-wider">Category</span>
          <div className="text-gray-300">{brick.category}</div>
        </div>
        <div>
          <span className="text-gray-500 uppercase tracking-wider">Repo</span>
          <div className="text-gray-300">{brick.repo}</div>
        </div>
        {brick.claimed_by && (
          <div>
            <span className="text-gray-500 uppercase tracking-wider">Worker</span>
            <div className="text-cyan-400">{brick.claimed_by}</div>
          </div>
        )}
        {brick.created && (
          <div>
            <span className="text-gray-500 uppercase tracking-wider">Created</span>
            <div className="text-gray-300">{new Date(brick.created).toLocaleDateString()}</div>
          </div>
        )}
      </div>

      {brick.requires && brick.requires.length > 0 && (
        <div>
          <span className="text-[10px] text-gray-500 uppercase tracking-wider">Requires</span>
          <div className="flex gap-1.5 mt-1 flex-wrap">
            {brick.requires.map((r) => (
              <span key={r} className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-gray-400 border border-white/10">
                {r}
              </span>
            ))}
          </div>
        </div>
      )}

      <div>
        <span className="text-[10px] text-gray-500 uppercase tracking-wider">Description</span>
        <pre className="mt-1 text-xs text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">
          {brick.description}
        </pre>
      </div>

      {brick.output && (
        <div>
          <span className="text-[10px] text-gray-500 uppercase tracking-wider">Output</span>
          <div className="mt-1 text-xs text-green-400">{brick.output}</div>
        </div>
      )}

      {brick.notes && (
        <div>
          <span className="text-[10px] text-gray-500 uppercase tracking-wider">Notes</span>
          <div className="mt-1 text-xs text-gray-400 italic">{brick.notes}</div>
        </div>
      )}

      {brick.lane === 'done' && (
        <div className="flex gap-2 pt-2 border-t border-white/10">
          <button
            onClick={() => onApprove(brick.id)}
            className="px-4 py-1.5 rounded text-xs font-medium bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors border border-green-500/30"
          >
            Approve
          </button>
          <button
            onClick={() => onReject(brick.id)}
            className="px-4 py-1.5 rounded text-xs font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors border border-red-500/30"
          >
            Reject
          </button>
        </div>
      )}
    </div>
  )
}

export function BrickQueuePanel(): JSX.Element {
  const [queue, setQueue] = useState<BrickQueueState | null>(null)
  const [selected, setSelected] = useState<BrickItem | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchQueue = async (): Promise<void> => {
    try {
      const data = await window.helm.getBrickQueue()
      setQueue(data)
    } catch (err) {
      setError('Failed to load brick queue')
      console.error(err)
    }
  }

  useEffect(() => {
    void fetchQueue()
    const interval = setInterval(() => void fetchQueue(), 10000)
    return () => clearInterval(interval)
  }, [])

  const handleApprove = async (id: string): Promise<void> => {
    const result = await window.helm.approveBrick(id)
    if (result.success) {
      setSelected(null)
      void fetchQueue()
    } else {
      setError(result.error || 'Failed to approve')
    }
  }

  const handleReject = async (id: string): Promise<void> => {
    const result = await window.helm.rejectBrick(id)
    if (result.success) {
      setSelected(null)
      void fetchQueue()
    } else {
      setError(result.error || 'Failed to reject')
    }
  }

  if (!queue) {
    return <div className="text-gray-600 text-sm">Loading brick queue...</div>
  }

  const totalBricks =
    queue.backlog.length + queue.claimed.length + queue.done.length + queue.reviewed.length

  if (totalBricks === 0) {
    return <div className="text-gray-600 text-sm">No bricks in queue. All clear.</div>
  }

  return (
    <div className="flex gap-4 h-full min-h-0">
      {/* Left: brick list */}
      <div className="w-1/2 overflow-y-auto space-y-3">
        {error && (
          <div className="text-xs text-red-400 bg-red-500/10 px-3 py-1.5 rounded border border-red-500/20">
            {error}
          </div>
        )}

        {/* Summary strip */}
        <div className="flex gap-4 text-[10px] uppercase tracking-wider px-1">
          <span className="text-gray-500">
            backlog <span className="text-white font-mono">{queue.backlog.length}</span>
          </span>
          <span className="text-amber-500/70">
            claimed <span className="text-amber-400 font-mono">{queue.claimed.length}</span>
          </span>
          <span className="text-green-500/70">
            review <span className="text-green-400 font-mono">{queue.done.length}</span>
          </span>
          <span className="text-cyan-500/70">
            done <span className="text-cyan-400 font-mono">{queue.reviewed.length}</span>
          </span>
        </div>

        {/* Lanes */}
        {(['done', 'claimed', 'backlog', 'reviewed'] as const).map((lane) => {
          const bricks = queue[lane]
          if (bricks.length === 0) return null
          return (
            <div key={lane}>
              <div className={`text-[10px] uppercase tracking-[0.14em] px-1 mb-1 ${LANE_COLORS[lane]}`}>
                {LANE_LABELS[lane]} ({bricks.length})
              </div>
              <div className="space-y-0.5">
                {bricks.map((b) => (
                  <BrickRow
                    key={`${lane}-${b.id}`}
                    brick={b}
                    onSelect={setSelected}
                    selected={selected?.id === b.id && selected?.lane === b.lane}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Right: detail view */}
      <div className="w-1/2 border-l border-white/10 pl-4 overflow-y-auto">
        {selected ? (
          <BrickDetail brick={selected} onApprove={handleApprove} onReject={handleReject} />
        ) : (
          <div className="text-gray-600 text-sm flex items-center justify-center h-full">
            Select a brick to view details
          </div>
        )}
      </div>
    </div>
  )
}
