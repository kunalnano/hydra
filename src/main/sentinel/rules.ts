import type { SystemState, SentinelAlert, SentinelSeverity } from '../../shared/types'

export interface SentinelRule {
  id: string
  name: string
  description: string
  enabled: boolean
  check: (state: SystemState, prevState: SystemState | null) => SentinelAlert | null
  cooldownMs: number
}

function makeAlert(
  ruleId: string,
  severity: SentinelSeverity,
  title: string,
  body: string,
  suggestedAction?: string
): SentinelAlert {
  return { ruleId, severity, title, body, suggestedAction, timestamp: Date.now() }
}

export const defaultRules: SentinelRule[] = [
  {
    id: 'agent-crash',
    name: 'Agent Crash Detector',
    description: 'Fires when a previously-seen agent PID disappears unexpectedly',
    enabled: true,
    cooldownMs: 300000,
    check: (state, prevState) => {
      if (!prevState) return null
      for (const prev of prevState.agents) {
        if (prev.pid && !state.agents.find((a) => a.pid === prev.pid)) {
          return makeAlert(
            'agent-crash',
            'warning',
            'Agent disappeared',
            `${prev.name} (PID ${prev.pid}) is no longer running.`,
            'Check if the agent exited cleanly or needs restart.'
          )
        }
      }
      return null
    }
  },
  {
    id: 'high-cpu',
    name: 'High CPU',
    description: 'Fires when system CPU exceeds 90% for consecutive polls',
    enabled: true,
    cooldownMs: 600000,
    check: (state, prevState) => {
      if (!prevState) return null
      if (state.cpu.usage > 90 && prevState.cpu.usage > 90) {
        return makeAlert(
          'high-cpu',
          'warning',
          'Sustained high CPU',
          `CPU at ${state.cpu.usage.toFixed(0)}% for 2+ consecutive polls.`,
          'Check top processes for runaway tasks.'
        )
      }
      return null
    }
  },
  {
    id: 'high-memory',
    name: 'High Memory',
    description: 'Fires when system memory exceeds 85%',
    enabled: true,
    cooldownMs: 600000,
    check: (state) => {
      if (state.memory.usagePercent > 85) {
        return makeAlert(
          'high-memory',
          'warning',
          'Memory pressure',
          `Memory at ${state.memory.usagePercent.toFixed(0)}% (${(state.memory.used / 1e9).toFixed(1)}GB / ${(state.memory.total / 1e9).toFixed(1)}GB).`,
          'Consider closing unused applications or agents.'
        )
      }
      return null
    }
  },
  {
    id: 'port-conflict',
    name: 'Port Conflict',
    description: 'Fires when multiple processes bind to the same port',
    enabled: true,
    cooldownMs: 300000,
    check: (state) => {
      const listenPorts = state.ports.filter((p) => p.state === 'LISTEN')
      const portMap = new Map<number, string[]>()
      for (const p of listenPorts) {
        const procs = portMap.get(p.port) || []
        if (!procs.includes(p.process)) procs.push(p.process)
        portMap.set(p.port, procs)
      }
      for (const [port, procs] of portMap) {
        if (procs.length > 1) {
          return makeAlert(
            'port-conflict',
            'critical',
            'Port conflict detected',
            `Port ${port} has multiple listeners: ${procs.join(', ')}.`,
            'Kill one of the conflicting processes.'
          )
        }
      }
      return null
    }
  },
  {
    id: 'vault-rag-down',
    name: 'vault-rag Down',
    description: 'Fires when vault-rag server (port 8742) stops responding',
    enabled: true,
    cooldownMs: 60000,
    check: (state) => {
      const vaultRagPort = state.ports.find((p) => p.port === 8742 && p.state === 'LISTEN')
      // Only alert if we've seen vault-rag before (don't alert on cold start)
      const hasVaultRagProcess = state.processes.some((g) =>
        g.processes.some((p) => p.command.includes('vault-rag') || p.name.includes('vault-rag'))
      )
      if (!vaultRagPort && hasVaultRagProcess) {
        return makeAlert(
          'vault-rag-down',
          'critical',
          'vault-rag not responding',
          'vault-rag process detected but port 8742 is not listening.',
          'Restart the vault-rag server.'
        )
      }
      return null
    }
  },
  {
    id: 'lm-studio-idle',
    name: 'LM Studio Idle',
    description: 'Fires when LM Studio process detected but idle for extended period',
    enabled: true,
    cooldownMs: 1800000,
    check: (state) => {
      const lmStudio = state.processes.find((g) =>
        g.name.toLowerCase().includes('lm studio') || g.name.toLowerCase().includes('lmstudio')
      )
      if (lmStudio && lmStudio.totalCpu < 2) {
        return makeAlert(
          'lm-studio-idle',
          'info',
          'LM Studio idle',
          'LM Studio is running but showing minimal CPU activity.',
          'Consider closing it to free resources if not needed.'
        )
      }
      return null
    }
  },
  {
    id: 'long-running-agent',
    name: 'Long Running Agent',
    description: 'Fires when a Claude Code session exceeds 2 hours',
    enabled: true,
    cooldownMs: 7200000,
    check: (state) => {
      const twoHours = 2 * 60 * 60 * 1000
      for (const agent of state.agents) {
        if (agent.type === 'claude-code' && agent.uptime && agent.uptime > twoHours) {
          const hours = (agent.uptime / 3600000).toFixed(1)
          return makeAlert(
            'long-running-agent',
            'info',
            'Long-running agent',
            `${agent.name} has been running for ${hours}h.`,
            'Check if the session is still productive.'
          )
        }
      }
      return null
    }
  },
  {
    id: 'hive-idle-reclaim',
    name: 'HIVE Idle Reclaim',
    description: 'Fires when a HIVE agent has been idle for 30+ minutes',
    enabled: true,
    cooldownMs: 1800000,
    check: (state) => {
      const thirtyMinutes = 30 * 60 * 1000
      for (const agent of state.agents) {
        if (agent.hiveSessionId && agent.status === 'idle' && agent.uptime && agent.uptime > thirtyMinutes) {
          return makeAlert(
            'hive-idle-reclaim',
            'info',
            'HIVE agent idle',
            `HIVE ${agent.hiveRole ?? 'agent'} (${agent.name}) has been idle for 30+ minutes.`,
            'Consider killing the session to free resources.'
          )
        }
      }
      return null
    }
  },
  {
    id: 'hive-worktree-conflict',
    name: 'HIVE Worktree Conflict',
    description: 'Fires when two HIVE agents share the same working directory',
    enabled: true,
    cooldownMs: 300000,
    check: (state) => {
      const hiveAgents = state.agents.filter((a) => a.hiveSessionId && a.workingDir)
      const dirMap = new Map<string, string[]>()
      for (const agent of hiveAgents) {
        const dir = agent.workingDir!
        const names = dirMap.get(dir) || []
        names.push(`${agent.hiveRole ?? agent.name}`)
        dirMap.set(dir, names)
      }
      for (const [dir, names] of dirMap) {
        if (names.length > 1) {
          return makeAlert(
            'hive-worktree-conflict',
            'warning',
            'HIVE worktree conflict',
            `${names.join(' and ')} are both targeting ${dir}.`,
            'Use separate directories or worktrees to avoid file conflicts.'
          )
        }
      }
      return null
    }
  }
]
