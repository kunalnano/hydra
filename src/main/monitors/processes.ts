import { exec } from 'child_process'
import { promisify } from 'util'
import type { ProcessInfo, ProcessGroup } from '../../shared/types'

const execAsync = promisify(exec)

const AGENT_PATTERNS = ['claude', 'codex', 'gemini']
const SERVICE_PATTERNS = ['postgres', 'redis', 'mysql', 'mongo', 'nginx', 'docker']

export function parseProcessOutput(output: string): ProcessInfo[] {
  const lines = output.trim().split('\n')
  return lines
    .slice(1)
    .map((line) => {
      const parts = line.trim().split(/\s+/)
      if (parts.length < 11) return null

      const user = parts[0]
      const pid = parseInt(parts[1], 10)
      const cpu = parseFloat(parts[2])
      const mem = parseFloat(parts[3])
      const command = parts.slice(10).join(' ')
      const name = extractProcessName(command)
      const cwd = extractWorkingDir(command)

      return { pid, user, cpu, mem, command, name, cwd } as ProcessInfo
    })
    .filter((p): p is ProcessInfo => p !== null && !isNaN(p.pid))
}

function extractProcessName(command: string): string {
  const executable = command.split(/\s+/)[0]
  return executable.split('/').pop() || executable
}

function extractWorkingDir(command: string): string | undefined {
  const pathMatch = command.match(/\/(Users|home)\/[^\s]+/)
  if (!pathMatch) return undefined

  const fullPath = pathMatch[0]
  const segments = fullPath.split('/')

  // Infrastructure directories that indicate we've gone past the project root
  const INFRA_DIRS = ['node_modules', '.bin', 'bin', 'lib', '.nvm', 'versions']

  // Walk forward from the start. When we hit an infrastructure directory,
  // the project root is everything before it.
  for (let i = 0; i < segments.length; i++) {
    if (INFRA_DIRS.includes(segments[i])) {
      // Return everything up to (but not including) this infrastructure dir
      if (i >= 3) {
        return segments.slice(0, i).join('/')
      }
      return undefined
    }
    // Skip version-like segments that are children of .nvm/versions etc.
    if (i > 3 && /^v?\d+[\.\d]*$/.test(segments[i])) {
      if (i >= 3) {
        return segments.slice(0, i).join('/')
      }
      return undefined
    }
  }

  // No infrastructure dirs found — the path itself might be a file path.
  // Return the directory (everything except the last segment if it looks like a file).
  const lastSegment = segments[segments.length - 1]
  if (lastSegment.includes('.') && segments.length > 3) {
    return segments.slice(0, segments.length - 1).join('/')
  }

  // Return the full path if it's a directory path
  if (segments.length > 3) {
    return fullPath
  }

  return undefined
}

export function groupProcesses(processes: ProcessInfo[]): ProcessGroup[] {
  const groups = new Map<string, ProcessGroup>()

  for (const proc of processes) {
    const { groupName, type } = classifyProcess(proc)
    const key = `${type}:${groupName}`

    if (!groups.has(key)) {
      groups.set(key, {
        name: groupName,
        type,
        processes: [],
        totalCpu: 0,
        totalMem: 0,
        ports: []
      })
    }

    const group = groups.get(key)!
    group.processes.push(proc)
    group.totalCpu += proc.cpu
    group.totalMem += proc.mem
  }

  return Array.from(groups.values())
}

function classifyProcess(proc: ProcessInfo): { groupName: string; type: ProcessGroup['type'] } {
  const cmdLower = proc.command.toLowerCase()
  const nameLower = proc.name.toLowerCase()

  // Check agent patterns first (agents take priority)
  if (AGENT_PATTERNS.some((p) => cmdLower.includes(p))) {
    const agent = AGENT_PATTERNS.find((p) => cmdLower.includes(p))!
    return { groupName: agent.charAt(0).toUpperCase() + agent.slice(1), type: 'agent' }
  }

  // Check service patterns
  if (SERVICE_PATTERNS.some((p) => nameLower.includes(p))) {
    const service = SERVICE_PATTERNS.find((p) => nameLower.includes(p))!
    return { groupName: service.charAt(0).toUpperCase() + service.slice(1), type: 'service' }
  }

  // Group by project directory if detected
  if (proc.cwd) {
    const projectName = proc.cwd.split('/').pop() || 'Unknown'
    return { groupName: projectName, type: 'project' }
  }

  return { groupName: 'System', type: 'other' }
}

export async function getProcesses(): Promise<ProcessInfo[]> {
  try {
    const { stdout } = await execAsync('ps aux')
    return parseProcessOutput(stdout)
  } catch {
    return []
  }
}

export async function getProcessGroups(): Promise<ProcessGroup[]> {
  const processes = await getProcesses()
  return groupProcesses(processes)
}
