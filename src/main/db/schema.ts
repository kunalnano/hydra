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

export function initializeSchema(db: Database.Database): void {
  db.exec(CREATE_SNAPSHOTS_TABLE)
  db.exec(CREATE_ALERTS_TABLE)
  db.exec(CREATE_BRIEFINGS_TABLE)
  db.exec(CREATE_NOTIFICATIONS_TABLE)
  db.exec(CREATE_POSTURE_HISTORY_TABLE)
}
