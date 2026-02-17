import { getDb } from './index'
import type {
  SystemState,
  AutoHealEvent,
  BriefingResult,
  HydraNotification
} from '../../shared/types'

export interface DBSnapshot {
  id: number
  timestamp: number
  data: SystemState
}

export function insertSnapshot(state: SystemState): void {
  const db = getDb()
  db.prepare('INSERT INTO snapshots (timestamp, data) VALUES (?, ?)').run(
    state.timestamp,
    JSON.stringify(state)
  )
}

export function getRecentSnapshots(limit: number): DBSnapshot[] {
  const db = getDb()
  const rows = db
    .prepare('SELECT id, timestamp, data FROM snapshots ORDER BY timestamp DESC LIMIT ?')
    .all(limit) as { id: number; timestamp: number; data: string }[]
  return rows.map((row) => ({
    id: row.id,
    timestamp: row.timestamp,
    data: JSON.parse(row.data) as SystemState
  }))
}

export function insertAlert(event: AutoHealEvent): void {
  const db = getDb()
  db.prepare(
    'INSERT INTO alerts (timestamp, rule, action, target, success, message) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(
    event.timestamp,
    event.rule,
    event.action,
    event.target,
    event.success ? 1 : 0,
    event.message
  )
}

export function getAlertHistory(limit: number): AutoHealEvent[] {
  const db = getDb()
  const rows = db
    .prepare(
      'SELECT timestamp, rule, action, target, success, message FROM alerts ORDER BY timestamp DESC LIMIT ?'
    )
    .all(limit) as {
    timestamp: number
    rule: string
    action: string
    target: string
    success: number
    message: string
  }[]
  return rows.map((row) => ({
    timestamp: row.timestamp,
    rule: row.rule,
    action: row.action as AutoHealEvent['action'],
    target: row.target,
    success: row.success === 1,
    message: row.message
  }))
}

export function insertBriefing(result: BriefingResult): void {
  const db = getDb()
  db.prepare(
    'INSERT INTO briefings (timestamp, summary, alerts, suggestions) VALUES (?, ?, ?, ?)'
  ).run(
    result.timestamp,
    result.summary,
    JSON.stringify(result.alerts),
    JSON.stringify(result.suggestions)
  )
}

export function getRecentBriefings(limit: number): BriefingResult[] {
  const db = getDb()
  const rows = db
    .prepare(
      'SELECT timestamp, summary, alerts, suggestions FROM briefings ORDER BY timestamp DESC LIMIT ?'
    )
    .all(limit) as { timestamp: number; summary: string; alerts: string; suggestions: string }[]
  return rows.map((row) => ({
    timestamp: row.timestamp,
    summary: row.summary,
    alerts: JSON.parse(row.alerts),
    suggestions: JSON.parse(row.suggestions)
  }))
}

export function insertNotification(notif: HydraNotification): void {
  const db = getDb()
  db.prepare(
    'INSERT OR REPLACE INTO notifications (id, title, body, level, timestamp, dismissed) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(notif.id, notif.title, notif.body, notif.level, notif.timestamp, notif.dismissed ? 1 : 0)
}

export function getNotifications(limit: number): HydraNotification[] {
  const db = getDb()
  const rows = db
    .prepare(
      'SELECT id, title, body, level, timestamp, dismissed FROM notifications ORDER BY timestamp DESC LIMIT ?'
    )
    .all(limit) as {
    id: string
    title: string
    body: string
    level: string
    timestamp: number
    dismissed: number
  }[]
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    level: row.level as HydraNotification['level'],
    timestamp: row.timestamp,
    dismissed: row.dismissed === 1
  }))
}

export function dismissNotification(id: string): void {
  const db = getDb()
  db.prepare('UPDATE notifications SET dismissed = 1 WHERE id = ?').run(id)
}
