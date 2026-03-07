import { exec } from 'child_process'
import { promisify } from 'util'
import type { NetworkProcess, NetworkState } from '../../shared/types'
import { isMacOS } from '../platform'

const execAsync = promisify(exec)

interface RawNetworkEntry {
  name: string
  pid: number
  bytesIn: number
  bytesOut: number
}

interface Snapshot {
  entries: Map<number, { bytesIn: number; bytesOut: number }>
  timestamp: number
}

let previousSnapshot: Snapshot | null = null

// Track which source is working so we don't retry failed ones every poll
let nettopFailed = false

/**
 * Parse nettop output into raw network entries.
 *
 * nettop outputs CSV format:
 *   ,bytes_in,bytes_out,
 *   Chrome.1234,1048576,524288,
 *   Electron Helper.5678,262144,131072,
 *
 * The PID is the number after the last dot in the process identifier.
 */
export function parseNettopOutput(
  raw: string
): { name: string; pid: number; bytesIn: number; bytesOut: number }[] {
  const lines = raw.trim().split('\n')
  if (lines.length === 0) return []

  const results: RawNetworkEntry[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    // CSV format: "processName.PID,bytesIn,bytesOut," (trailing comma)
    const parts = line.replace(/,$/, '').split(',')
    if (parts.length < 3) continue

    const processId = parts[0].trim()
    const bytesIn = parseInt(parts[1], 10)
    const bytesOut = parseInt(parts[2], 10)

    if (!processId || isNaN(bytesIn) || isNaN(bytesOut)) continue

    // Extract PID from the last dot-separated segment
    const lastDotIndex = processId.lastIndexOf('.')
    if (lastDotIndex === -1) continue

    const pidStr = processId.substring(lastDotIndex + 1)
    const pid = parseInt(pidStr, 10)
    if (isNaN(pid)) continue

    const name = processId.substring(0, lastDotIndex)
    if (!name) continue

    results.push({ name, pid, bytesIn, bytesOut })
  }

  return results
}

/**
 * Non-privileged nettop can emit process rows with every counter stuck at zero.
 * Treat that as unusable so we fall back to interface-level netstat data.
 */
export function hasUsableNettopData(entries: RawNetworkEntry[]): boolean {
  return entries.some((entry) => entry.bytesIn > 0 || entry.bytesOut > 0)
}

/**
 * Parse netstat -ibn output into interface-level byte counts.
 * Returns one entry per active interface (en0, en1, etc.) with cumulative bytes.
 *
 * Format:
 * Name  Mtu  Network  Address  Ipkts  Ierrs  Ibytes  Opkts  Oerrs  Obytes  Coll
 * en0   1500 <Link#14> ...     1377177  0    1428632542 497465  0   186614454  0
 */
export function parseNetstatOutput(
  raw: string
): { name: string; bytesIn: number; bytesOut: number }[] {
  const lines = raw.trim().split('\n')
  if (lines.length <= 1) return []

  const results: { name: string; bytesIn: number; bytesOut: number }[] = []
  const seen = new Set<string>()

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].trim().split(/\s+/)
    if (cols.length < 11) continue

    const iface = cols[0]
    // Only real interfaces (en*, bridge*, utun*), skip loopback and inactive (*-suffix)
    if (iface.startsWith('lo') || iface.endsWith('*')) continue
    // Only <Link#N> rows (raw byte counts), not per-address duplicates
    if (!cols[2].startsWith('<Link#')) continue
    if (seen.has(iface)) continue
    seen.add(iface)

    const bytesIn = parseInt(cols[6], 10)
    const bytesOut = parseInt(cols[9], 10)
    if (isNaN(bytesIn) || isNaN(bytesOut)) continue
    // Skip interfaces with zero traffic
    if (bytesIn === 0 && bytesOut === 0) continue

    results.push({ name: iface, bytesIn, bytesOut })
  }

  return results
}

/**
 * Aggregate multiple entries for the same PID (e.g. multiple interfaces)
 * by summing their bytesIn and bytesOut.
 */
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

/**
 * Build NetworkState from raw entries + snapshot diffing for rate computation.
 */
function buildNetworkState(
  aggregated: { name: string; pid: number; bytesIn: number; bytesOut: number }[],
  now: number
): NetworkState {
  const currentSnapshot: Snapshot = {
    entries: new Map(),
    timestamp: now
  }
  for (const entry of aggregated) {
    currentSnapshot.entries.set(entry.pid, {
      bytesIn: entry.bytesIn,
      bytesOut: entry.bytesOut
    })
  }

  const elapsedSec = previousSnapshot !== null ? (now - previousSnapshot.timestamp) / 1000 : 0

  const processes: NetworkProcess[] = aggregated.map((entry) => {
    let bytesInPerSec = 0
    let bytesOutPerSec = 0

    if (previousSnapshot && elapsedSec > 0) {
      const prev = previousSnapshot.entries.get(entry.pid)
      if (prev) {
        const deltaIn = Math.max(0, entry.bytesIn - prev.bytesIn)
        const deltaOut = Math.max(0, entry.bytesOut - prev.bytesOut)
        bytesInPerSec = deltaIn / elapsedSec
        bytesOutPerSec = deltaOut / elapsedSec
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

  previousSnapshot = currentSnapshot

  const totalBytesInPerSec = processes.reduce((sum, p) => sum + p.bytesInPerSec, 0)
  const totalBytesOutPerSec = processes.reduce((sum, p) => sum + p.bytesOutPerSec, 0)

  return { processes, totalBytesInPerSec, totalBytesOutPerSec, timestamp: now }
}

/**
 * Try nettop with -x flag (extended, works better from non-interactive contexts).
 */
async function tryNettop(): Promise<RawNetworkEntry[] | null> {
  try {
    const { stdout } = await execAsync('nettop -P -x -L 1 -J bytes_in,bytes_out', {
      timeout: 8000
    })
    const entries = parseNettopOutput(stdout)
    if (entries.length > 0 && hasUsableNettopData(entries)) return entries
    return null
  } catch {
    return null
  }
}

/**
 * Fallback: netstat -ibn gives interface-level cumulative byte counts.
 * No per-process granularity, but shows real network throughput.
 * Uses negative PIDs as synthetic identifiers for interfaces.
 */
async function tryNetstat(): Promise<RawNetworkEntry[] | null> {
  try {
    const { stdout } = await execAsync('netstat -ibn', { timeout: 3000 })
    const ifaces = parseNetstatOutput(stdout)
    if (ifaces.length === 0) return null
    // Use negative PIDs as synthetic identifiers for interfaces
    return ifaces.map((iface, i) => ({
      name: iface.name,
      pid: -(i + 1),
      bytesIn: iface.bytesIn,
      bytesOut: iface.bytesOut
    }))
  } catch {
    return null
  }
}

/**
 * Get current network activity. Tries nettop first (per-process),
 * falls back to netstat (per-interface) if nettop is unavailable.
 */
export async function getNetworkActivity(): Promise<NetworkState> {
  const now = Date.now()

  if (!isMacOS()) {
    return { processes: [], totalBytesInPerSec: 0, totalBytesOutPerSec: 0, timestamp: now }
  }

  // Try nettop first (unless it previously failed)
  if (!nettopFailed) {
    const nettopEntries = await tryNettop()
    if (nettopEntries) {
      const aggregated = aggregateByPid(nettopEntries)
      return buildNetworkState(aggregated, now)
    }
    // nettop failed — remember so we skip it on future polls
    nettopFailed = true
  }

  // Fallback: netstat for interface-level stats
  const netstatEntries = await tryNetstat()
  if (netstatEntries) {
    return buildNetworkState(netstatEntries, now)
  }

  return {
    processes: [],
    totalBytesInPerSec: 0,
    totalBytesOutPerSec: 0,
    timestamp: now,
    error: 'Network monitoring unavailable — nettop and netstat both failed'
  }
}

/**
 * Reset module-level state. Used for test cleanup.
 */
export function resetNetworkState(): void {
  previousSnapshot = null
  nettopFailed = false
}

/**
 * Exposed for testing: allows injecting raw output + timestamp
 * to test rate computation without actually calling nettop.
 */
export function _computeNetworkState(rawOutput: string, timestamp: number): NetworkState {
  const rawEntries = parseNettopOutput(rawOutput)
  const aggregated = aggregateByPid(rawEntries)
  return buildNetworkState(aggregated, timestamp)
}
