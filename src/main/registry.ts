import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { AgentRegistryEntry } from '../shared/types'

const HELM_DIR = join(homedir(), '.config', 'helm')
const REGISTRY_FILE = join(HELM_DIR, 'agent-registry.json')

// In dev mode, __dirname is the output dir. Try multiple locations for the seed.
const SEED_PATHS = [
  join(__dirname, 'data', 'agent-registry.json'),
  join(__dirname, '..', 'src', 'main', 'data', 'agent-registry.json'),
  join(process.cwd(), 'src', 'main', 'data', 'agent-registry.json')
]

let cache: AgentRegistryEntry[] | null = null

function findSeedFile(): string | null {
  for (const p of SEED_PATHS) {
    if (existsSync(p)) return p
  }
  return null
}

function loadRegistry(): AgentRegistryEntry[] {
  if (cache) return cache

  // If user-local registry exists, use it
  if (existsSync(REGISTRY_FILE)) {
    try {
      const raw = readFileSync(REGISTRY_FILE, 'utf-8')
      cache = JSON.parse(raw) as AgentRegistryEntry[]
      return cache
    } catch {
      console.error('[registry] Corrupt registry file, falling back to seed')
    }
  }

  // First run: copy seed to user-local
  const seedPath = findSeedFile()
  if (seedPath) {
    try {
      const raw = readFileSync(seedPath, 'utf-8')
      cache = JSON.parse(raw) as AgentRegistryEntry[]
      mkdirSync(HELM_DIR, { recursive: true })
      writeFileSync(REGISTRY_FILE, raw, 'utf-8')
      console.log('[registry] Seeded agent registry from', seedPath)
      return cache
    } catch (err) {
      console.error('[registry] Failed to seed from', seedPath, err)
    }
  }

  cache = []
  return cache
}

function saveRegistry(entries: AgentRegistryEntry[]): void {
  mkdirSync(HELM_DIR, { recursive: true })
  writeFileSync(REGISTRY_FILE, JSON.stringify(entries, null, 2), 'utf-8')
  cache = entries
}

export function getAgentRegistry(): AgentRegistryEntry[] {
  return loadRegistry()
}

export function getAgentById(id: string): AgentRegistryEntry | null {
  return loadRegistry().find((e) => e.id === id) ?? null
}

export function updateAgentEntry(entry: AgentRegistryEntry): AgentRegistryEntry {
  const entries = loadRegistry()
  const idx = entries.findIndex((e) => e.id === entry.id)
  if (idx >= 0) {
    entries[idx] = entry
  } else {
    entries.push(entry)
  }
  saveRegistry(entries)
  return entry
}

export function getTopAgents(n: number): AgentRegistryEntry[] {
  return loadRegistry()
    .slice()
    .sort((a, b) => b.impactScore - a.impactScore)
    .slice(0, n)
}
