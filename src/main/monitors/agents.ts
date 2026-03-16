import type { ProcessInfo, AgentInfo, AgentStatus } from '../../shared/types'

interface AgentPattern {
  type: AgentInfo['type']
  displayName: string
  /** Match functions — first match wins. Receives the full process record. */
  match: (proc: ProcessInfo) => boolean
  dedupeKey?: (proc: ProcessInfo) => string
  priority?: (proc: ProcessInfo) => number
}

const AGENT_PATTERNS: AgentPattern[] = [
  {
    type: 'claude-code',
    displayName: 'Claude Code',
    // CLI instances: "claude" binary but NOT Claude.app
    match: (proc) => {
      const lower = proc.command.toLowerCase()
      const name = proc.name.toLowerCase()
      return (
        (name === 'claude' || lower.includes('/claude') || lower.startsWith('claude')) &&
        !lower.includes('claude.app') &&
        !lower.includes('claude helper')
      )
    },
    dedupeKey: (proc) => `claude:${proc.cwd || proc.command}`
  },
  {
    type: 'codex',
    displayName: 'Codex',
    match: (proc) => {
      const lower = proc.command.toLowerCase()
      const name = proc.name.toLowerCase()
      return (
        (name === 'codex' || /(^|\s)codex(\s|$)/i.test(proc.command)) &&
        !lower.includes('codex helper') &&
        !lower.includes('codex-cli-mcp-tool') &&
        !lower.includes('sparkle') &&
        !lower.includes('crashpad')
      )
    },
    dedupeKey: (proc) => {
      const lower = proc.command.toLowerCase()
      if (
        lower.includes('/applications/codex.app/contents/macos/codex') ||
        lower.includes('/contents/resources/codex app-server')
      ) {
        return 'codex-desktop'
      }
      return `codex:${proc.cwd || proc.command}`
    },
    priority: (proc) => {
      const lower = proc.command.toLowerCase()
      if (lower.includes('/contents/resources/codex app-server')) return 3
      if (lower.includes('/applications/codex.app/contents/macos/codex')) return 2
      return 1
    }
  },
  {
    type: 'gemini',
    displayName: 'Gemini',
    // Chrome app wrapper for Gemini, or native gemini binary
    match: (proc) => {
      const lower = proc.command.toLowerCase()
      return lower.includes('gemini.app') || /\bgemini\b/.test(lower)
    },
    dedupeKey: (proc) => `gemini:${proc.cwd || proc.command}`
  },
  {
    type: 'cursor',
    displayName: 'Cursor',
    match: (proc) => {
      const lower = proc.command.toLowerCase()
      return (
        (lower.includes('/applications/cursor.app/') || /(^|\s)cursor(\s|$)/i.test(proc.command)) &&
        !lower.includes('cursoruiviewservice') &&
        !lower.includes('setcursor')
      )
    },
    dedupeKey: (proc) => `cursor:${proc.cwd || proc.command}`
  },
  {
    type: 'aider',
    displayName: 'Aider',
    match: (proc) => /\baider\b/i.test(proc.command),
    dedupeKey: (proc) => `aider:${proc.cwd || proc.command}`
  },
  {
    type: 'continue',
    displayName: 'Continue',
    match: (proc) => /\bcontinue\b/i.test(proc.command) && proc.command.includes('.continue'),
    dedupeKey: (proc) => `continue:${proc.cwd || proc.command}`
  },
  {
    type: 'copilot',
    displayName: 'Copilot',
    match: (proc) => /copilot-agent|github-copilot/i.test(proc.command),
    dedupeKey: (proc) => `copilot:${proc.cwd || proc.command}`
  }
]

export function detectAgents(processes: ProcessInfo[]): AgentInfo[] {
  const agentsByKey = new Map<string, { agent: AgentInfo; priority: number; cpu: number }>()
  const seenTypes = new Map<string, number>() // type → count for dedup display

  for (const proc of processes) {
    for (const pattern of AGENT_PATTERNS) {
      if (pattern.match(proc)) {
        const key = pattern.dedupeKey?.(proc) || `${pattern.type}:${proc.pid}`
        const priority = pattern.priority?.(proc) || 1
        const nextAgent: AgentInfo = {
          id: `pid:${proc.pid}`,
          name: pattern.displayName,
          type: pattern.type,
          status: inferStatus(proc),
          source: 'process',
          pid: proc.pid,
          workingDir: proc.cwd
        }
        const existing = agentsByKey.get(key)
        if (!existing || priority > existing.priority || (priority === existing.priority && proc.cpu > existing.cpu)) {
          agentsByKey.set(key, { agent: nextAgent, priority, cpu: proc.cpu })
        }
        break
      }
    }
  }

  return Array.from(agentsByKey.values()).map(({ agent }) => {
    const count = (seenTypes.get(agent.type) || 0) + 1
    seenTypes.set(agent.type, count)
    return {
      ...agent,
      name: count > 1 ? `${agent.name} #${count}` : agent.name
    }
  })
}

function inferStatus(proc: ProcessInfo): AgentStatus {
  if (proc.cpu > 5) return 'active'
  if (proc.cpu > 1) return 'busy'
  return 'idle'
}
