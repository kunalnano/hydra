import { useEffect, useState } from 'react'

interface TimelineEvent {
  id: number
  timestamp: number
  type: 'process_start' | 'process_stop' | 'user_action' | 'auto_heal' | 'system'
  source: string
  message: string
}

const TYPE_ICONS: Record<TimelineEvent['type'], string> = {
  process_start: '>',
  process_stop: 'x',
  user_action: '!',
  auto_heal: '~',
  system: 'o'
}

const TYPE_COLORS: Record<TimelineEvent['type'], string> = {
  process_start: 'text-green-400',
  process_stop: 'text-red-400',
  user_action: 'text-cyan-400',
  auto_heal: 'text-amber-400',
  system: 'text-gray-400'
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

export function SessionDeltaBanner(): JSX.Element {
  const [delta, setDelta] = useState<{
    lastSessionTimestamp: number
    missingWorkspaces: { name: string; type: string; ports: number[] }[]
  } | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    window.hydra.getSessionDelta().then((d: typeof delta) => setDelta(d))
  }, [])

  if (!delta || dismissed || delta.missingWorkspaces.length === 0) return <></>

  return (
    <div className="bg-amber-950/40 border border-amber-800/50 rounded-lg px-4 py-2 flex items-center justify-between">
      <div className="text-xs text-amber-300">
        <span className="font-semibold">Session Delta:</span> {delta.missingWorkspaces.length}{' '}
        workspace{delta.missingWorkspaces.length > 1 ? 's' : ''} from your last session{' '}
        {delta.missingWorkspaces.length <= 3
          ? `not running: ${delta.missingWorkspaces
              .map((w) => {
                const ports = w.ports.map((p) => `:${p}`).join(', ')
                return `${w.name}${ports ? ` (${ports})` : ''}`
              })
              .join(', ')}`
          : 'not running'}
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="text-amber-600 hover:text-amber-400 text-xs ml-4"
      >
        Dismiss
      </button>
    </div>
  )
}

export function TimelinePanel(): JSX.Element {
  const [events, setEvents] = useState<TimelineEvent[]>([])

  useEffect(() => {
    window.hydra.getTimelineEvents(50).then((evts: unknown[]) => {
      setEvents(evts as TimelineEvent[])
    })

    const interval = setInterval(() => {
      window.hydra.getTimelineEvents(50).then((evts: unknown[]) => {
        setEvents(evts as TimelineEvent[])
      })
    }, 10000)

    return () => clearInterval(interval)
  }, [])

  if (events.length === 0) {
    return <div className="text-gray-600 text-xs">No events recorded yet</div>
  }

  return (
    <div className="space-y-1 text-xs overflow-y-auto max-h-full">
      {events.map((event) => (
        <div
          key={event.id}
          className="flex items-start gap-2 py-1 px-2 rounded hover:bg-gray-800/30"
        >
          <span className={`${TYPE_COLORS[event.type]} shrink-0 w-4 text-center font-mono`}>
            {TYPE_ICONS[event.type]}
          </span>
          <span className="text-gray-500 font-mono shrink-0 w-12">
            {formatTime(event.timestamp)}
          </span>
          <span className="text-gray-300 flex-1">{event.message}</span>
          <span className="text-gray-700 shrink-0">{formatRelative(event.timestamp)}</span>
        </div>
      ))}
    </div>
  )
}
