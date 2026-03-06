import { exec } from 'child_process'
import { promisify } from 'util'
import type { PortInfo } from '../../shared/types'

const execAsync = promisify(exec)

export function parseLsofOutput(output: string): PortInfo[] {
  const lines = output.trim().split('\n')
  const results: PortInfo[] = []

  // Skip header line; handle empty/whitespace-only input
  if (lines.length <= 1 && !lines[0]?.includes('\t') && lines[0]?.startsWith('COMMAND')) {
    return results
  }
  if (output.trim() === '') return results

  for (const line of lines.slice(1)) {
    const parts = line.trim().split(/\s+/)
    if (parts.length < 10) continue

    const process = parts[0]
    const pid = parseInt(parts[1], 10)
    const type = parts[4]

    if (!type?.startsWith('IPv')) continue

    const protocol = parts[7] as 'TCP' | 'UDP'
    if (protocol !== 'TCP' && protocol !== 'UDP') continue

    const nameField = parts[8]
    const stateField = parts[9]

    const parsed = parseNameField(nameField)
    if (!parsed) continue

    const state = parseState(stateField)

    results.push({
      port: parsed.port,
      pid,
      process,
      protocol,
      state,
      address: parsed.address
    })
  }

  return results
}

function parseNameField(name: string): { address: string; port: number } | null {
  // For connections like "127.0.0.1:3000->127.0.0.1:54321", take the local part
  const localPart = name.split('->')[0]
  const lastColon = localPart.lastIndexOf(':')
  if (lastColon === -1) return null

  const address = localPart.substring(0, lastColon)
  const port = parseInt(localPart.substring(lastColon + 1), 10)

  if (isNaN(port)) return null
  return { address, port }
}

function parseState(stateField: string): PortInfo['state'] {
  if (!stateField) return 'OTHER'
  const s = stateField.replace(/[()]/g, '').toUpperCase()
  if (s === 'LISTEN') return 'LISTEN'
  if (s === 'ESTABLISHED') return 'ESTABLISHED'
  if (s === 'CLOSE_WAIT') return 'CLOSE_WAIT'
  return 'OTHER'
}

export async function getPorts(): Promise<PortInfo[]> {
  try {
    const { stdout } = await execAsync('lsof -i -P -n')
    return parseLsofOutput(stdout)
  } catch {
    return []
  }
}
