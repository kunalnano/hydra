import { Notification } from 'electron'

const THROTTLE_MS = 30_000 // Max 1 desktop notification per 30s
let lastNotificationTime = 0

export function showDesktopNotification(title: string, body: string): void {
  if (!Notification.isSupported()) return

  const now = Date.now()
  if (now - lastNotificationTime < THROTTLE_MS) return

  lastNotificationTime = now
  new Notification({ title, body }).show()
}
