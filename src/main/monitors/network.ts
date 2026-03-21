import { exec } from 'child_process'
import { setTimeout as delay } from 'timers/promises'
import { promisify } from 'util'
import type {
  NetworkConnection,
  NetworkProcess,
  NetworkScope,
  NetworkSourceMode,
  NetworkState
} from '../../shared/types'
import { isMacOS } from '../platform'

const execAsync = promisify(exec)

interface RawNetworkEntry {
  name: string
  pid: number
  bytesIn: number
  bytesOut: number
}

interface RawNetworkConnection {
  id: string
  processName: string
  pid: number
  protocol: string
  state: string
  localAddress: string
  localPort: number | null
  remoteAddress: string
  remotePort: number | null
  scope: NetworkScope
  bytesIn: number
  bytesOut: number
}

interface RawNettopSnapshot {
  processes: RawNetworkEntry[]
  connections: RawNetworkConnection[]
}

interface Snapshot {
  processes: Map<number, { bytesIn: number; bytesOut: number }>
  connections: Map<string, { bytesIn: number; bytesOut: number }>
  timestamp: number
}

interface NetworkSourceSelection {
  mode: NetworkSourceMode
  processes: RawNetworkEntry[] | null
  connections: RawNetworkConnection[] | null
}

let previousSnapshot: Snapshot | null = null

// Track which source is working so we don't retry failed ones every poll
let nettopFailed = false

function parseMetric(value: string | undefined): number {
  const parsed = Number.parseInt((value || '').trim(), 10)
  return Number.isFinite(parsed) ? parsed : 0
}

function isConnectionIdentifier(identifier: string): boolean {
  return /^(tcp|udp)\d?\s+/i.test(identifier)
}

function parseProcessIdentifier(identifier: string): { name: string; pid: number } | null {
  if (!identifier || isConnectionIdentifier(identifier)) return null

  const lastDotIndex = identifier.lastIndexOf('.')
  if (lastDotIndex === -1) return null

  const pid = Number.parseInt(identifier.slice(lastDotIndex + 1), 10)
  if (!Number.isFinite(pid)) return null

  const name = identifier.slice(0, lastDotIndex).trim()
  if (!name) return null

  return { name, pid }
}

function splitEndpoint(raw: string): { address: string; port: number | null } {
  const trimmed = raw.trim()
  if (!trimmed || trimmed === '*:*' || trimmed === '*.*' || trimmed === '*') {
    return { address: '*', port: null }
  }

  for (let index = trimmed.length - 1; index >= 0; index--) {
    const char = trimmed[index]
    if (char !== ':' && char !== '.') continue

    const suffix = trimmed.slice(index + 1)
    if (!suffix || !/^(\d+|\*)$/.test(suffix)) continue

    return {
      address: trimmed.slice(0, index) || '*',
      port: /^\d+$/.test(suffix) ? Number.parseInt(suffix, 10) : null
    }
  }

  return { address: trimmed, port: null }
}

function isLoopbackAddress(address: string): boolean {
  const normalized = address.toLowerCase()
  return normalized === 'localhost' || normalized === '::1' || normalized.startsWith('127.')
}

function isPrivateIPv4(address: string): boolean {
  return (
    address.startsWith('10.') ||
    address.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(address) ||
    address.startsWith('169.254.')
  )
}

function isLanAddress(address: string): boolean {
  const normalized = address.toLowerCase()
  if (isPrivateIPv4(normalized)) return true
  return normalized.startsWith('fe80:') || normalized.startsWith('fc') || normalized.startsWith('fd')
}

function classifyNetworkScope(localAddress: string, remoteAddress: string): NetworkScope {
  const local = localAddress.toLowerCase()
  const remote = remoteAddress.toLowerCase()

  if (remote === '*' || remote === '') return 'unknown'
  if (isLoopbackAddress(remote) || isLoopbackAddress(local)) return 'loopback'
  if (isLanAddress(remote)) return 'lan'
  return 'internet'
}

function buildConnectionId(connection: Omit<RawNetworkConnection, 'id'>): string {
  return [
    connection.pid,
    connection.protocol,
    connection.localAddress,
    connection.localPort ?? '*',
    connection.remoteAddress,
    connection.remotePort ?? '*'
  ].join('|')
}

function parseConnectionIdentifier(
  identifier: string,
  currentProcess: RawNetworkEntry | null,
  state: string,
  bytesIn: number,
  bytesOut: number
): RawNetworkConnection | null {
  if (!currentProcess) return null

  const match = identifier.match(/^((?:tcp|udp)\d?)\s+(.+?)<->(.+)$/i)
  if (!match) return null

  const protocol = match[1].toLowerCase()
  const local = splitEndpoint(match[2])
  const remote = splitEndpoint(match[3])
  const scope = classifyNetworkScope(local.address, remote.address)
  const connection = {
    processName: currentProcess.name,
    pid: currentProcess.pid,
    protocol,
    state: state || '',
    localAddress: local.address,
    localPort: local.port,
    remoteAddress: remote.address,
    remotePort: remote.port,
    scope,
    bytesIn,
    bytesOut
  }

  return {
    ...connection,
    id: buildConnectionId(connection)
  }
}

/**
 * Parse connection-aware nettop CSV output. Process rows set the active process
 * context, and following socket rows are attached to that process.
 */
export function parseNettopSnapshot(raw: string): RawNettopSnapshot {
  const trimmed = raw.trim()
  if (!trimmed) return { processes: [], connections: [] }

  const lines = trimmed.split('\n').map((line) => line.trim()).filter(Boolean)
  if (lines.length <= 1) return { processes: [], connections: [] }

  const headers = lines[0].replace(/^,/, '').replace(/,$/, '').split(',').map((part) => part.trim())
  const processes: RawNetworkEntry[] = []
  const connections: RawNetworkConnection[] = []
  let currentProcess: RawNetworkEntry | null = null

  for (let index = 1; index < lines.length; index++) {
    const parts = lines[index].replace(/,$/, '').split(',')
    if (parts.length === 0) continue

    const identifier = parts[0]?.trim()
    if (!identifier) continue

    const columns = new Map<string, string>()
    for (let columnIndex = 0; columnIndex < headers.length; columnIndex++) {
      columns.set(headers[columnIndex], parts[columnIndex + 1]?.trim() ?? '')
    }

    const bytesIn = parseMetric(columns.get('bytes_in'))
    const bytesOut = parseMetric(columns.get('bytes_out'))
    const state = columns.get('state') || ''

    const process = parseProcessIdentifier(identifier)
    if (process) {
      currentProcess = {
        ...process,
        bytesIn,
        bytesOut
      }
      processes.push(currentProcess)
      continue
    }

    const connection = parseConnectionIdentifier(identifier, currentProcess, state, bytesIn, bytesOut)
    if (connection) {
      connections.push(connection)
    }
  }

  return { processes, connections }
}

/**
 * Legacy helper used by tests and callers that only care about process totals.
 */
export function parseNettopOutput(raw: string): RawNetworkEntry[] {
  return parseNettopSnapshot(raw).processes
}

/**
 * Non-privileged nettop can emit process rows with every counter stuck at zero.
 * Treat that as unusable so we fall back to interface-level netstat data.
 */
export function hasUsableNettopData(entries: RawNetworkEntry[]): boolean {
  return entries.some((entry) => entry.bytesIn > 0 || entry.bytesOut > 0)
}

export function selectNetworkSource(
  nettopSnapshot: RawNettopSnapshot | null,
  netstatEntries: RawNetworkEntry[] | null
): NetworkSourceSelection {
  if (nettopSnapshot && hasUsableNettopData(nettopSnapshot.processes)) {
    return {
      mode: 'nettop',
      processes: aggregateByPid(nettopSnapshot.processes),
      connections: nettopSnapshot.connections
    }
  }

  if (netstatEntries && netstatEntries.length > 0) {
    return {
      mode: 'netstat',
      processes: netstatEntries,
      connections: []
    }
  }

  return {
    mode: 'unavailable',
    processes: null,
    connections: null
  }
}

/**
 * Parse netstat -ib output into interface-level byte counts.
 * Returns one entry per active interface (en0, en1, etc.) with cumulative bytes.
 */
export function parseNetstatOutput(
  raw: string
): { name: string; bytesIn: number; bytesOut: number }[] {
  const lines = raw.trim().split('\n')
  if (lines.length <= 1) return []

  const results: { name: string; bytesIn: number; bytesOut: number }[] = []
  const seen = new Set<string>()

  for (let index = 1; index < lines.length; index++) {
    const cols = lines[index].trim().split(/\s+/)
    if (cols.length < 11) continue

    const iface = cols[0]
    if (iface.startsWith('lo') || iface.endsWith('*')) continue
    if (!cols[2].startsWith('<Link#')) continue
    if (seen.has(iface)) continue
    seen.add(iface)

    const bytesIn = Number.parseInt(cols[6], 10)
    const bytesOut = Number.parseInt(cols[9], 10)
    if (!Number.isFinite(bytesIn) || !Number.isFinite(bytesOut)) continue
    if (bytesIn === 0 && bytesOut === 0) continue

    results.push({ name: iface, bytesIn, bytesOut })
  }

  return results
}

function interfacePid(name: string): number {
  let hash = 0
  for (const char of name) {
    hash = (hash * 31 + char.charCodeAt(0)) % 1000000
  }
  return -(hash + 1)
}

function mapNetstatEntries(
  interfaces: { name: string; bytesIn: number; bytesOut: number }[]
): RawNetworkEntry[] {
  return interfaces.map((iface) => ({
    name: iface.name,
    pid: interfacePid(iface.name),
    bytesIn: iface.bytesIn,
    bytesOut: iface.bytesOut
  }))
}

function aggregateByPid(entries: RawNetworkEntry[]): RawNetworkEntry[] {
  const pidMap = new Map<number, RawNetworkEntry>()

  for (const entry of entries) {
    const existing = pidMap.get(entry.pid)
    if (existing) {
      existing.bytesIn += entry.bytesIn
      existing.bytesOut += entry.bytesOut
    } else {
      pidMap.set(entry.pid, { ...entry })
    }
  }

  return Array.from(pidMap.values())
}

function buildSnapshot(
  processes: RawNetworkEntry[],
  connections: RawNetworkConnection[],
  timestamp: number
): Snapshot {
  return {
    processes: new Map(
      processes.map((entry) => [
        entry.pid,
        {
          bytesIn: entry.bytesIn,
          bytesOut: entry.bytesOut
        }
      ])
    ),
    connections: new Map(
      connections.map((entry) => [
        entry.id,
        {
          bytesIn: entry.bytesIn,
          bytesOut: entry.bytesOut
        }
      ])
    ),
    timestamp
  }
}

function shouldExposeConnection(connection: RawNetworkConnection): boolean {
  if (connection.scope === 'unknown') return false
  return connection.remoteAddress !== '*' && connection.state.toLowerCase() !== 'listen'
}

function buildNetworkState(
  processes: RawNetworkEntry[],
  connections: RawNetworkConnection[],
  now: number,
  sourceMode: NetworkSourceMode
): NetworkState {
  const { state, snapshot } = buildNetworkStateFromSnapshot(previousSnapshot, processes, connections, now, sourceMode)
  previousSnapshot = snapshot
  return state
}

function buildNetworkStateFromSnapshot(
  baseline: Snapshot | null,
  processes: RawNetworkEntry[],
  connections: RawNetworkConnection[],
  now: number,
  sourceMode: NetworkSourceMode
): { state: NetworkState; snapshot: Snapshot } {
  const currentSnapshot = buildSnapshot(processes, connections, now)
  const elapsedSec = baseline !== null ? (now - baseline.timestamp) / 1000 : 0

  const nextProcesses: NetworkProcess[] = processes.map((entry) => {
    let bytesInPerSec = 0
    let bytesOutPerSec = 0

    if (baseline && elapsedSec > 0) {
      const previous = baseline.processes.get(entry.pid)
      if (previous) {
        bytesInPerSec = Math.max(0, entry.bytesIn - previous.bytesIn) / elapsedSec
        bytesOutPerSec = Math.max(0, entry.bytesOut - previous.bytesOut) / elapsedSec
      }
    }

    return {
      name: entry.name,
      pid: entry.pid,
      bytesIn: entry.bytesIn,
      bytesOut: entry.bytesOut,
      bytesInPerSec,
      bytesOutPerSec
    }
  })

  const nextConnections: NetworkConnection[] = connections
    .filter(shouldExposeConnection)
    .map((entry) => {
      let bytesInPerSec = 0
      let bytesOutPerSec = 0

      if (baseline && elapsedSec > 0) {
        const previous = baseline.connections.get(entry.id)
        if (previous) {
          bytesInPerSec = Math.max(0, entry.bytesIn - previous.bytesIn) / elapsedSec
          bytesOutPerSec = Math.max(0, entry.bytesOut - previous.bytesOut) / elapsedSec
        }
      }

      return {
        ...entry,
        bytesInPerSec,
        bytesOutPerSec
      }
    })

  const totalBytesInPerSec = nextProcesses.reduce((sum, entry) => sum + entry.bytesInPerSec, 0)
  const totalBytesOutPerSec = nextProcesses.reduce((sum, entry) => sum + entry.bytesOutPerSec, 0)

  return {
    state: {
      processes: nextProcesses,
      connections: nextConnections,
      totalBytesInPerSec,
      totalBytesOutPerSec,
      timestamp: now,
      sourceMode
    },
    snapshot: currentSnapshot
  }
}

async function tryNettop(): Promise<RawNettopSnapshot | null> {
  try {
    const { stdout } = await execAsync('nettop -n -x -L 1 -J state,bytes_in,bytes_out', {
      timeout: 8000
    })
    const snapshot = parseNettopSnapshot(stdout)
    if (snapshot.processes.length > 0) return snapshot
    return null
  } catch {
    return null
  }
}

async function tryNetstat(): Promise<RawNetworkEntry[] | null> {
  try {
    const { stdout } = await execAsync('netstat -ib', { timeout: 3000 })
    const ifaces = parseNetstatOutput(stdout)
    if (ifaces.length === 0) return null
    return mapNetstatEntries(ifaces)
  } catch {
    return null
  }
}

async function buildNetstatFallbackState(initialEntries: RawNetworkEntry[]): Promise<NetworkState> {
  const firstTimestamp = Date.now()
  const firstSnapshot = buildSnapshot(initialEntries, [], firstTimestamp)

  await delay(2000)

  const secondEntries = await tryNetstat()
  if (!secondEntries) {
    previousSnapshot = firstSnapshot
    return buildNetworkState(initialEntries, [], firstTimestamp, 'netstat')
  }

  const secondTimestamp = Date.now()
  const { state, snapshot } = buildNetworkStateFromSnapshot(
    firstSnapshot,
    secondEntries,
    [],
    secondTimestamp,
    'netstat'
  )
  previousSnapshot = snapshot
  return state
}

export async function getNetworkActivity(): Promise<NetworkState> {
  const now = Date.now()

  if (!isMacOS()) {
    return {
      processes: [],
      connections: [],
      totalBytesInPerSec: 0,
      totalBytesOutPerSec: 0,
      timestamp: now,
      sourceMode: 'unavailable'
    }
  }

  let nettopSnapshot: RawNettopSnapshot | null = null
  if (!nettopFailed) {
    nettopSnapshot = await tryNettop()
  }

  let netstatEntries: RawNetworkEntry[] | null = null
  if (!nettopSnapshot || !hasUsableNettopData(nettopSnapshot.processes)) {
    nettopFailed = true
    netstatEntries = await tryNetstat()
  }

  const selected = selectNetworkSource(nettopSnapshot, netstatEntries)
  if (selected.processes) {
    if (selected.mode === 'netstat') {
      return buildNetstatFallbackState(selected.processes)
    }

    return buildNetworkState(
      selected.processes,
      selected.connections ?? [],
      now,
      selected.mode
    )
  }

  return {
    processes: [],
    connections: [],
    totalBytesInPerSec: 0,
    totalBytesOutPerSec: 0,
    timestamp: now,
    sourceMode: 'unavailable',
    error: 'Network monitoring unavailable — nettop and netstat both failed'
  }
}

export function resetNetworkState(): void {
  previousSnapshot = null
  nettopFailed = false
}

export function _computeNetworkState(rawOutput: string, timestamp: number): NetworkState {
  const snapshot = parseNettopSnapshot(rawOutput)
  const aggregated = aggregateByPid(snapshot.processes)
  return buildNetworkState(aggregated, snapshot.connections, timestamp, 'nettop')
}

export function _computeNetworkStateFromEntries(
  previousEntries: RawNetworkEntry[],
  currentEntries: RawNetworkEntry[],
  elapsedMs: number,
  now: number
): NetworkState {
  const baseline = buildSnapshot(previousEntries, [], now - elapsedMs)
  return buildNetworkStateFromSnapshot(baseline, currentEntries, [], now, 'netstat').state
}
