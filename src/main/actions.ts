import { execFile } from 'child_process'
import { promisify } from 'util'
import type {
  ProcessSignalType,
  ProcessActionResult,
  GroupActionResult,
  ProcessInfo
} from '../shared/types'

const execFileAsync = promisify(execFile)

export const PROTECTED_PROCESSES = [
  'Finder',
  'WindowServer',
  'loginwindow',
  'kernel_task',
  'launchd',
  'systemd',
  'Electron',
  'HYDRA',
  'hydra'
]

export function isProtectedProcess(name: string): boolean {
  return PROTECTED_PROCESSES.some((p) => p.toLowerCase() === name.toLowerCase())
}

export function validatePid(pid: number): boolean {
  return pid > 1 && Number.isInteger(pid)
}

async function verifyPidAlive(pid: number): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('ps', ['-p', String(pid), '-o', 'comm='], {
      timeout: 3000
    })
    const name = stdout.trim()
    return name || null
  } catch {
    return null
  }
}

export async function sendProcessSignal(
  pid: number,
  signal: ProcessSignalType,
  expectedName?: string
): Promise<ProcessActionResult> {
  if (!validatePid(pid)) {
    return { success: false, pid, signal, error: `Invalid PID: ${pid}` }
  }

  const actualName = await verifyPidAlive(pid)
  if (!actualName) {
    return { success: false, pid, signal, error: `PID ${pid} is no longer running` }
  }

  if (isProtectedProcess(actualName)) {
    return {
      success: false,
      pid,
      signal,
      error: `${actualName} (PID ${pid}) is a protected process`
    }
  }

  if (expectedName && actualName.toLowerCase() !== expectedName.toLowerCase()) {
    return {
      success: false,
      pid,
      signal,
      error: `PID ${pid} is now ${actualName}, expected ${expectedName} (PID was recycled)`
    }
  }

  try {
    process.kill(pid, signal)
    return { success: true, pid, signal }
  } catch (err) {
    return {
      success: false,
      pid,
      signal,
      error: `Failed to send ${signal} to PID ${pid}: ${err instanceof Error ? err.message : 'Unknown error'}`
    }
  }
}

export async function killProcess(
  pid: number,
  expectedName?: string,
  forceTimeoutMs = 5000
): Promise<ProcessActionResult> {
  const termResult = await sendProcessSignal(pid, 'SIGTERM', expectedName)
  if (!termResult.success) return termResult

  await new Promise((resolve) => setTimeout(resolve, Math.min(forceTimeoutMs, 5000)))

  const stillAlive = await verifyPidAlive(pid)
  if (stillAlive) {
    return sendProcessSignal(pid, 'SIGKILL')
  }

  return termResult
}

export async function killGroup(
  processes: ProcessInfo[],
  groupName: string
): Promise<GroupActionResult> {
  const results = await Promise.all(processes.map((p) => killProcess(p.pid, p.name)))

  return {
    results,
    groupName,
    totalKilled: results.filter((r) => r.success).length,
    totalFailed: results.filter((r) => !r.success).length
  }
}
