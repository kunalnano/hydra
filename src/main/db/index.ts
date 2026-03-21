import Database from 'better-sqlite3'
import { mkdirSync, copyFileSync, existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { initializeSchema } from './schema'
import { pruneOldSnapshots } from './queries'

let db: Database.Database | null = null

const HELM_DIR = join(homedir(), '.config', 'helm')
const LEGACY_DIR = join(homedir(), '.config', 'hydra')
const DB_FILE = 'helm.db'
const LEGACY_DB_FILE = 'hydra.db'

function migrateLegacyDb(): string {
  mkdirSync(HELM_DIR, { recursive: true })

  const newDbPath = join(HELM_DIR, DB_FILE)
  if (existsSync(newDbPath)) {
    return newDbPath
  }

  const legacyDbPath = join(LEGACY_DIR, LEGACY_DB_FILE)
  if (!existsSync(legacyDbPath)) {
    return newDbPath
  }

  copyFileSync(legacyDbPath, newDbPath)

  for (const suffix of ['-wal', '-shm']) {
    const legacySidecar = `${legacyDbPath}${suffix}`
    if (existsSync(legacySidecar)) {
      copyFileSync(legacySidecar, `${newDbPath}${suffix}`)
    }
  }

  console.log('Migrated database from ~/.config/hydra/hydra.db to ~/.config/helm/helm.db')
  return newDbPath
}

export function getDb(): Database.Database {
  if (!db) {
    const dbPath = migrateLegacyDb()
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    initializeSchema(db)
    try {
      pruneOldSnapshots(1000)
    } catch {
      /* first-run: table may be empty */
    }
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
