import type Database from 'better-sqlite3'

export const CREATE_SNAPSHOTS_TABLE = `
CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  data TEXT NOT NULL
)`

export const CREATE_ALERTS_TABLE = `
CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  rule TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  success INTEGER NOT NULL,
  message TEXT NOT NULL
)`

export const CREATE_BRIEFINGS_TABLE = `
CREATE TABLE IF NOT EXISTS briefings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  summary TEXT NOT NULL,
  alerts TEXT NOT NULL,
  suggestions TEXT NOT NULL
)`

export const CREATE_NOTIFICATIONS_TABLE = `
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  level TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  dismissed INTEGER NOT NULL DEFAULT 0
)`

export const CREATE_POSTURE_HISTORY_TABLE = `
CREATE TABLE IF NOT EXISTS posture_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  score INTEGER NOT NULL,
  grade TEXT NOT NULL,
  verdict TEXT NOT NULL
)`

export const CREATE_SESSIONS_TABLE = `
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  data TEXT NOT NULL
)`

export const CREATE_TIMELINE_EVENTS_TABLE = `
CREATE TABLE IF NOT EXISTS timeline_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  type TEXT NOT NULL,
  source TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata TEXT,
  ingest_key TEXT
)`

export function initializeSchema(db: Database.Database): void {
  db.exec(CREATE_SNAPSHOTS_TABLE)
  db.exec(CREATE_ALERTS_TABLE)
  db.exec(CREATE_BRIEFINGS_TABLE)
  db.exec(CREATE_NOTIFICATIONS_TABLE)
  db.exec(CREATE_POSTURE_HISTORY_TABLE)
  db.exec(CREATE_SESSIONS_TABLE)
  db.exec(CREATE_TIMELINE_EVENTS_TABLE)
  ensureTimelineEventColumns(db)
  db.exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_timeline_events_ingest_key ON timeline_events (ingest_key) WHERE ingest_key IS NOT NULL'
  )
}

function ensureTimelineEventColumns(db: Database.Database): void {
  const columns = db
    .prepare('PRAGMA table_info(timeline_events)')
    .all() as { name: string }[]

  const columnNames = new Set(columns.map((column) => column.name))
  if (!columnNames.has('ingest_key')) {
    db.exec('ALTER TABLE timeline_events ADD COLUMN ingest_key TEXT')
  }
}
