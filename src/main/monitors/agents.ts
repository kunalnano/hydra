import type { ProcessInfo, AgentInfo, AgentStatus } from '../../shared/types'

interface AgentPattern {
  type: AgentInfo['type']
  displayName: string
  patterns: string[]
}

const AGENT_PATTERNS: AgentPattern[] = [
  {
    type: 'claude-code',
    displayName: 'Claude Code',
    patterns: ['/claude', 'bin/claude', 'claude-code']
  },
  { type: 'codex', displayName: 'Codex', patterns: ['/codex', 'bin/codex'] },
  { type: 'gemini', displayName: 'Gemini', patterns: ['/gemini', 'bin/gemini'] },
  { type: 'cursor', displayName: 'Cursor', patterns: ['cursor', '.cursor'] },
  { type: 'aider', displayName: 'Aider', patterns: ['aider', '/aider'] },
  { type: 'continue', displayName: 'Continue', patterns: ['continue'] },
  { type: 'copilot', displayName: 'Copilot', patterns: ['copilot-agent', 'github-copilot'] }
]

export function detectAgents(processes: ProcessInfo[]): AgentInfo[] {
  const agents: AgentInfo[] = []
  for (const proc of processes) {
    const cmdLower = proc.command.toLowerCase()
    for (const pattern of AGENT_PATTERNS) {
      if (pattern.patterns.some((p) => cmdLower.includes(p))) {
        agents.push({
          name: pattern.displayName,
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
