import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export interface DiskMount {
  filesystem: string
  mount: string
  totalBytes: number
  usedBytes: number
  availableBytes: number
  usagePercent: number
}

export interface DiskState {
  mounts: DiskMount[]
  maxUsagePercent: number
  timestamp: number
}

/**
 * Parse `df -Pk` output into typed mount entries.
 *
 * df -Pk outputs:
 *   Filesystem     1024-blocks      Used Available Capacity Mounted on
 *   /dev/disk3s1s1   489825072  12345678 123456789    10%   /
 */
export function parseDfOutput(raw: string): DiskMount[] {
  const lines = raw.trim().split('\n')
  if (lines.length <= 1) return []

  const results: DiskMount[] = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    // Split by whitespace — last field (mount point) may contain spaces
    const parts = line.split(/\s+/)
    if (parts.length < 6) continue

    const filesystem = parts[0]
    const totalBlocks = parseInt(parts[1], 10)
    const usedBlocks = parseInt(parts[2], 10)
    const availableBlocks = parseInt(parts[3], 10)
    const capacityStr = parts[4]
    const mount = parts.slice(5).join(' ')

    if (isNaN(totalBlocks) || isNaN(usedBlocks) || isNaN(availableBlocks)) continue

    // Skip pseudo-filesystems
    if (filesystem === 'devfs' || filesystem === 'map' || filesystem.startsWith('map ')) continue
    if (totalBlocks === 0) continue

    const usagePercent = parseInt(capacityStr.replace('%', ''), 10)

    results.push({
      filesystem,
      mount,
      totalBytes: totalBlocks * 1024,
      usedBytes: usedBlocks * 1024,
      availableBytes: availableBlocks * 1024,
      usagePercent: isNaN(usagePercent)
        ? (usedBlocks / totalBlocks) * 100
        : usagePercent
    })
  }

  return results
}

/**
 * Get current disk usage by running `df -Pk`.
 */
export async function getDiskUsage(): Promise<DiskState> {
  const now = Date.now()

  try {
    const { stdout } = await execAsync('df -Pk', { timeout: 5000 })
    const mounts = parseDfOutput(stdout)
    const maxUsagePercent = mounts.length > 0
      ? Math.max(...mounts.map((m) => m.usagePercent))
      : 0

    return { mounts, maxUsagePercent, timestamp: now }
  } catch {
    return { mounts: [], maxUsagePercent: 0, timestamp: now }
  }
}
