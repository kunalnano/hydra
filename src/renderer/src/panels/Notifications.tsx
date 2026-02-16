import { useState, useEffect } from 'react'
import type { HydraNotification } from '../../../../shared/types'

const LEVEL_STYLES: Record<HydraNotification['level'], string> = {
  info: 'border-l-blue-500',
  warning: 'border-l-amber-500',
  critical: 'border-l-red-500'
}

export function NotificationsPanel(): JSX.Element {
  const [notifications, setNotifications] = useState<HydraNotification[]>([])

  useEffect(() => {
    const unsubNotif = window.hydra.onNotification((notif) => {
      setNotifications((prev) => [notif, ...prev].slice(0, 50))
    })
    return unsubNotif
  }, [])

  const dismiss = (id: string): void => {
    window.hydra.dismissNotification(id)
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }

  if (notifications.length === 0) {
    return (
      <div className="text-gray-600 text-sm h-full flex items-center justify-center">
        No notifications
      </div>
    )
  }

  return (
    <div className="overflow-y-auto max-h-full space-y-1">
      {notifications.map((n) => (
        <div
          key={n.id}
          className={`text-xs px-2 py-1.5 border-l-2 bg-gray-800/30 rounded-r flex items-start justify-between gap-2 ${LEVEL_STYLES[n.level]}`}
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
            className="text-gray-600 hover:text-gray-400 shrink-0 text-[10px]"
          >
            DISMISS
          </button>
        </div>
      ))}
    </div>
  )
}
