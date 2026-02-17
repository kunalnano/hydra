import type { ProcessInfo, AgentInfo, AgentStatus } from '../../shared/types'

interface AgentPattern {
  type: AgentInfo['type']
  displayName: string
  /** Match functions — first match wins. Receives the full command string. */
  match: (cmd: string) => boolean
}

const AGENT_PATTERNS: AgentPattern[] = [
  {
    type: 'claude-code',
    displayName: 'Claude Code',
    // CLI instances: "claude" binary but NOT Claude.app
    match: (cmd) => {
      const lower = cmd.toLowerCase()
      return (
        (lower.includes('/claude') || lower.startsWith('claude')) &&
        !lower.includes('claude.app') &&
        !lower.includes('claude helper')
      )
    }
  },
  {
    type: 'codex',
    displayName: 'Codex',
    match: (cmd) => /\bcodex\b/i.test(cmd) && !cmd.includes('.app/')
  },
  {
    type: 'gemini',
    displayName: 'Gemini',
    // Chrome app wrapper for Gemini, or native gemini binary
    match: (cmd) => {
      const lower = cmd.toLowerCase()
      return lower.includes('gemini.app') || /\bgemini\b/.test(lower)
    }
  },
  {
    type: 'cursor',
    displayName: 'Cursor',
    match: (cmd) => /cursor/i.test(cmd) && !cmd.includes('setCursor')
  },
  {
    type: 'aider',
    displayName: 'Aider',
    match: (cmd) => /\baider\b/i.test(cmd)
  },
  {
    type: 'continue',
    displayName: 'Continue',
    match: (cmd) => /\bcontinue\b/i.test(cmd) && cmd.includes('.continue')
  },
  {
    type: 'copilot',
    displayName: 'Copilot',
    match: (cmd) => /copilot-agent|github-copilot/i.test(cmd)
  }
]

export function detectAgents(processes: ProcessInfo[]): AgentInfo[] {
  const agents: AgentInfo[] = []
  const seenTypes = new Map<string, number>() // type → count for dedup display

  for (const proc of processes) {
    for (const pattern of AGENT_PATTERNS) {
      if (pattern.match(proc.command)) {
        const count = (seenTypes.get(pattern.type) || 0) + 1
        seenTypes.set(pattern.type, count)

        agents.push({
          name: count > 1 ? `${pattern.displayName} #${count}` : pattern.displayName,
          type: pattern.type,
          status: inferStatus(proc),
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
