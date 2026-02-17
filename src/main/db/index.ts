import Database from 'better-sqlite3'
import { mkdirSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { initializeSchema } from './schema'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) {
    const dir = join(homedir(), '.config', 'hydra')
    mkdirSync(dir, { recursive: true })
    const dbPath = join(dir, 'hydra.db')
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    initializeSchema(db)
  }
  return db
}

export function initDb(database: Database.Database): void {
  db = database
  initializeSchema(db)
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}
