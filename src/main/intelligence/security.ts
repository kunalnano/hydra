import { exec } from 'child_process'
import { promisify } from 'util'
import type { SecurityScanResult } from '../../shared/types'

const execAsync = promisify(exec)

const STAFF_BIN = '/Users/alsharma/Documents/ai/myAIProjects/staff-of-gandalf/venv/bin/staff'
const SCAN_TIMEOUT_MS = 120_000

export const SCAN_COMMANDS = [
  { command: 'survey', description: 'Network reconnaissance survey' },
  { command: 'illuminate', description: 'Port & service illumination' },
  { command: 'shadowfax', description: 'Quick network speed analysis' },
  { command: 'delve', description: 'Deep vulnerability assessment' },
  { command: 'scry', description: 'DNS & domain intelligence' }
] as const

const VALID_COMMANDS = SCAN_COMMANDS.map((c) => c.command) as readonly string[]

function generateScanId(command: string): string {
  return `scan-${command}-${Date.now()}`
}

export async function runSecurityScan(command: string): Promise<SecurityScanResult> {
  const id = generateScanId(command)
  const timestamp = Date.now()

  if (!VALID_COMMANDS.includes(command)) {
    return {
      id,
      command,
      output: `Invalid command: "${command}". Valid commands: ${VALID_COMMANDS.join(', ')}`,
      timestamp,
      status: 'error'
    }
  }

  try {
    const { stdout, stderr } = await execAsync(`${STAFF_BIN} ${command}`, {
      timeout: SCAN_TIMEOUT_MS,
      env: {
        ...process.env,
        PATH: `/Users/alsharma/Documents/ai/myAIProjects/staff-of-gandalf/venv/bin:${process.env.PATH}`
      }
    })

    const output = stdout.trim() || stderr.trim() || 'Scan completed with no output.'

    return {
      id,
      command,
      output,
      timestamp,
      status: 'complete'
    }
  } catch (err) {
    let message: string
    if (err instanceof Error && 'killed' in err && err.killed) {
      message = `Scan timed out after ${SCAN_TIMEOUT_MS / 1000}s`
    } else if (err instanceof Error) {
      // exec errors include stderr in the message — pull it out for cleaner output
      const execErr = err as Error & { stderr?: string; stdout?: string }
      message = execErr.stderr?.trim() || execErr.stdout?.trim() || err.message
    } else {
      message = 'Unknown error during scan'
    }

    return {
      id,
      command,
      output: message,
      timestamp,
      status: 'error'
    }
  }
}
