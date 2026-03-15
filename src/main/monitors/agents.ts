import type { ProcessInfo, AgentInfo, AgentStatus } from '../../shared/types'

interface AgentPattern {
  type: AgentInfo['type']
  displayName: string
  /** Match functions — first match wins. Receives the full process record. */
  match: (proc: ProcessInfo) => boolean
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
    }
  },
  {
    type: 'codex',
    displayName: 'Codex',
    match: (proc) => {
      const lower = proc.command.toLowerCase()
      const name = proc.name.toLowerCase()
      return (
        name === 'codex' ||
        lower.includes('/contents/resources/codex app-server') ||
        /(^|\s)codex(\s|$)/i.test(proc.command)
      )
    }
  },
  {
    type: 'gemini',
    displayName: 'Gemini',
    // Chrome app wrapper for Gemini, or native gemini binary
    match: (proc) => {
      const lower = proc.command.toLowerCase()
      return lower.includes('gemini.app') || /\bgemini\b/.test(lower)
    }
  },
  {
    type: 'cursor',
    displayName: 'Cursor',
    match: (proc) => /cursor/i.test(proc.command) && !proc.command.includes('setCursor')
  },
  {
    type: 'aider',
    displayName: 'Aider',
    match: (proc) => /\baider\b/i.test(proc.command)
  },
  {
    type: 'continue',
    displayName: 'Continue',
    match: (proc) => /\bcontinue\b/i.test(proc.command) && proc.command.includes('.continue')
  },
  {
    type: 'copilot',
    displayName: 'Copilot',
    match: (proc) => /copilot-agent|github-copilot/i.test(proc.command)
  }
]

export function detectAgents(processes: ProcessInfo[]): AgentInfo[] {
  const agents: AgentInfo[] = []
  const seenTypes = new Map<string, number>() // type → count for dedup display

  for (const proc of processes) {
    for (const pattern of AGENT_PATTERNS) {
      if (pattern.match(proc)) {
        const count = (seenTypes.get(pattern.type) || 0) + 1
        seenTypes.set(pattern.type, count)

        agents.push({
          id: `pid:${proc.pid}`,
          name: count > 1 ? `${pattern.displayName} #${count}` : pattern.displayName,
          type: pattern.type,
          status: inferStatus(proc),
          source: 'process',
          pid: proc.pid,
          workingDir: proc.cwd
        })
        break
      }
    }
  }
  return agents
}

function inferStatus(proc: ProcessInfo): AgentStatus {
  if (proc.cpu > 5) return 'active'
  if (proc.cpu > 1) return 'busy'
  return 'idle'
}
