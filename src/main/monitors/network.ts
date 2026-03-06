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
 * Get current network activity by running nettop and computing per-second rates.
 */
export async function getNetworkActivity(): Promise<NetworkState> {
  const now = Date.now()

  if (!isMacOS()) {
    return { processes: [], totalBytesInPerSec: 0, totalBytesOutPerSec: 0, timestamp: now }
  }

  try {
    const { stdout } = await execAsync('nettop -P -L 1 -J bytes_in,bytes_out', {
      timeout: 5000
    })

    const rawEntries = parseNettopOutput(stdout)
    const aggregated = aggregateByPid(rawEntries)

    // Build current snapshot
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

    // Compute per-second rates by diffing against previous snapshot
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

    // Update previous snapshot for next call
    previousSnapshot = currentSnapshot

    const totalBytesInPerSec = processes.reduce((sum, p) => sum + p.bytesInPerSec, 0)
    const totalBytesOutPerSec = processes.reduce((sum, p) => sum + p.bytesOutPerSec, 0)

    return {
      processes,
      totalBytesInPerSec,
      totalBytesOutPerSec,
      timestamp: now
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const isPermission = message.includes('EPERM') || message.includes('Operation not permitted')
    return {
      processes: [],
      totalBytesInPerSec: 0,
      totalBytesOutPerSec: 0,
      timestamp: now,
      error: isPermission
        ? 'nettop requires elevated permissions — run Hydra with sudo or grant Full Disk Access'
        : `nettop failed: ${message}`
    }
  }
}

/**
 * Reset module-level state. Used for test cleanup.
 */
export function resetNetworkState(): void {
  previousSnapshot = null
}

/**
 * Exposed for testing: allows injecting raw output + timestamp
 * to test rate computation without actually calling nettop.
 */
export function _computeNetworkState(rawOutput: string, timestamp: number): NetworkState {
  const rawEntries = parseNettopOutput(rawOutput)
  const aggregated = aggregateByPid(rawEntries)

  // Build current snapshot
  const currentSnapshot: Snapshot = {
    entries: new Map(),
    timestamp
  }
  for (const entry of aggregated) {
    currentSnapshot.entries.set(entry.pid, {
      bytesIn: entry.bytesIn,
      bytesOut: entry.bytesOut
    })
  }

  // Compute per-second rates
  const elapsedSec = previousSnapshot !== null ? (timestamp - previousSnapshot.timestamp) / 1000 : 0

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

  // Update previous snapshot
  previousSnapshot = currentSnapshot

  const totalBytesInPerSec = processes.reduce((sum, p) => sum + p.bytesInPerSec, 0)
  const totalBytesOutPerSec = processes.reduce((sum, p) => sum + p.bytesOutPerSec, 0)

  return {
    processes,
    totalBytesInPerSec,
    totalBytesOutPerSec,
    timestamp
  }
}
