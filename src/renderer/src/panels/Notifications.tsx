import { useState, useEffect, useMemo } from 'react'
import type { HelmNotification } from '../../../shared/types'

const LEVEL_STYLES: Record<HelmNotification['level'], string> = {
  critical: 'border-l-red-500 bg-red-500/10',
  warning: 'border-l-amber-500 bg-amber-500/10',
  info: 'border-l-blue-500 bg-blue-500/10'
}

const LEVEL_ORDER: Record<HelmNotification['level'], number> = {
  critical: 0,
  warning: 1,
  info: 2
}

export function NotificationsPanel(): JSX.Element {
  const [notifications, setNotifications] = useState<HelmNotification[]>([])

  useEffect(() => {
    window.helm.queryNotifications(50).then(setNotifications).catch(() => {})

    const unsubNotif = window.helm.onNotification((notif) => {
      setNotifications((prev) => [notif, ...prev.filter((existing) => existing.id !== notif.id)].slice(0, 50))
    })
    return unsubNotif
  }, [])

  const dismiss = (id: string): void => {
    window.helm.dismissNotification(id)
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }

  const dismissAll = (): void => {
    for (const n of notifications) {
      window.helm.dismissNotification(n.id)
    }
    setNotifications([])
  }

  const sorted = useMemo(
    () =>
      [...notifications].sort((a, b) => {
        const levelDiff = LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]
        if (levelDiff !== 0) return levelDiff
        return b.timestamp - a.timestamp
      }),
    [notifications]
  )

  const criticalCount = notifications.filter((n) => n.level === 'critical').length
  const warningCount = notifications.filter((n) => n.level === 'warning').length

  if (notifications.length === 0) {
    return (
      <div className="text-gray-600 text-sm h-full flex items-center justify-center">
        No notifications
      </div>
    )
  }

  return (
    <div className="flex flex-col max-h-full">
      {/* Header with badges and dismiss all */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-gray-800/50 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-gray-400 text-xs font-medium">{notifications.length}</span>
          {criticalCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 font-mono">
              {criticalCount} critical
            </span>
          )}
          {warningCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-mono">
              {warningCount} warning
            </span>
          )}
        </div>
        <button
          onClick={dismissAll}
          className="text-gray-500 hover:text-gray-300 text-[10px] uppercase tracking-wider"
        >
          Dismiss All
        </button>
      </div>

      {/* Notification list */}
      <div className="overflow-y-auto flex-1 space-y-1 pt-1">
        {sorted.map((n) => (
          <div
            key={n.id}
            className={`text-xs px-2 py-1.5 border-l-4 rounded-r flex items-start justify-between gap-2 ${LEVEL_STYLES[n.level]}`}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-gray-300 font-medium">{n.title}</span>
                <span className="text-gray-700 text-[10px] font-mono shrink-0">
                  {new Date(n.timestamp).toLocaleTimeString([], { hour12: false })}
                </span>
              </div>
              <div className="text-gray-500 truncate">{n.body}</div>
            </div>
            <button
              onClick={() => dismiss(n.id)}
              className="text-gray-500 hover:text-gray-300 shrink-0 text-sm leading-none mt-0.5"
              title="Dismiss"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
