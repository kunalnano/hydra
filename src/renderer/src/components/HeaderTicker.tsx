import { useEffect, useMemo, useState } from 'react'
import type {
  AgentInfo,
  ProcessInfo,
  SkillFeed,
  SystemState,
  TimelineEventRecord
} from '../../../shared/types'
import { useSystemStore } from '../stores/system'
import { redactSensitiveText, usePrivacyStore } from '../stores/privacy'

const FALLBACK_AI_TICKER_POOL = [
  'SWARM OPS // SELECT AN AGENT TO DRILL INTO PID, COMMAND, PORTS, AND TIMELINE',
  'SKILLS // LOCAL CODEX SKILLS DEFAULT TO ~/.codex/skills AND CAN BE OVERRIDDEN',
  'AI LOOP // HELM FAVORS LOCAL SIGNALS OVER GENERIC NEWS NOISE',
  'YENNEFER // BRIEFINGS TRACK WHAT THE MACHINE IS DOING RIGHT NOW',
  'FLEET + SWARM // REPOS SHOW DRIFT WHILE AGENTS SHOW EXECUTION LOAD',
  'SECURE VIEW // ENDPOINTS, PATHS, AND LOCAL HOSTS STAY REDACTED',
  'TIMELINE // AGENT ACTIONS AND CHECKPOINTS ROLL INTO THE SWARM HISTORY'
]

interface AgentTickerSnapshot {
  agent: AgentInfo
  process?: ProcessInfo
  workspace?: string
}

function flattenProcesses(state: SystemState | null): ProcessInfo[] {
  if (!state) return []
  return state.processes.flatMap((group) => group.processes)
}

function truncate(text: string, max = 88): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

function formatRelativeTime(timestamp: number): string {
  const diff = Math.max(0, Date.now() - timestamp)
  if (diff < 60000) return 'now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

function findWorkspaceForAgent(state: SystemState, agent: AgentInfo): string | undefined {
  const matched = state.processes.find((group) => {
    if (agent.workingDir) {
      const dirName = agent.workingDir.split('/').pop()
      if (group.name === dirName || group.name === agent.workingDir) return true
    }

    return agent.pid != null && group.processes.some((proc) => proc.pid === agent.pid)
  })

  return matched?.name
}

function getAgentSnapshots(state: SystemState | null): AgentTickerSnapshot[] {
  if (!state) return []

  const processes = flattenProcesses(state)
  return state.agents.map((agent) => ({
    agent,
    process: agent.pid != null ? processes.find((proc) => proc.pid === agent.pid) : undefined,
    workspace: findWorkspaceForAgent(state, agent)
  }))
}

function toDisplayText(value: string, privacyMode: boolean): string {
  return privacyMode ? redactSensitiveText(value) : value
}

function buildTickerItems(
  state: SystemState | null,
  timeline: TimelineEventRecord[],
  skillFeed: SkillFeed,
  privacyMode: boolean
): string[] {
  const items: string[] = []
  const agentSnapshots = getAgentSnapshots(state)
  const activeAgents = agentSnapshots.filter(({ agent }) => agent.status === 'active').length
  const busyAgents = agentSnapshots.filter(({ agent }) => agent.status === 'busy').length
  const waitingAgents = agentSnapshots.filter(({ agent }) => agent.status === 'waiting').length

  if (agentSnapshots.length > 0) {
    items.push(
      `SWARM // ${agentSnapshots.length} online • ${activeAgents} active • ${busyAgents} busy${waitingAgents > 0 ? ` • ${waitingAgents} waiting` : ''}`
    )
  }

  const hottestAgent = [...agentSnapshots]
    .sort((a, b) => (b.process?.cpu ?? 0) - (a.process?.cpu ?? 0))
    .find(({ process }) => process && process.cpu > 0)

  if (hottestAgent?.process) {
    const workspaceHint = hottestAgent.workspace ? ` • ${hottestAgent.workspace}` : ''
    items.push(
      `${hottestAgent.agent.name.toUpperCase()} HOT // PID ${hottestAgent.process.pid} • ${hottestAgent.process.cpu.toFixed(1)}% CPU • ${hottestAgent.process.mem.toFixed(1)}% MEM${workspaceHint}`
    )
  }

  for (const snapshot of agentSnapshots) {
    const action = snapshot.agent.currentAction?.trim()
    if (!action) continue
    items.push(
      `${snapshot.agent.name.toUpperCase()} // ${truncate(toDisplayText(action, privacyMode), 96)}`
    )
  }

  const recentAgentEvents = timeline.filter((event) => event.type.startsWith('agent_')).slice(0, 4)
  for (const event of recentAgentEvents) {
    items.push(`AGENT EVENT // ${truncate(toDisplayText(event.message, privacyMode), 104)}`)
  }

  if (skillFeed.totalSkills > 0) {
    const latestSkill = skillFeed.recent[0]
    if (latestSkill) {
      items.push(
        `SKILLS // ${skillFeed.totalSkills} installed • latest ${latestSkill.name} ${formatRelativeTime(latestSkill.updatedAt)}`
      )
    }

    for (const skill of skillFeed.recent.slice(0, 3)) {
      const scope = skill.scope === 'system' ? 'SYSTEM SKILL' : 'SKILL'
      items.push(`${scope} // ${skill.name} updated ${formatRelativeTime(skill.updatedAt)}`)
    }
  }

  const unique = [...new Set(items.filter((item) => item.trim().length > 0))]
  const filled = [...unique]

  for (const fallback of FALLBACK_AI_TICKER_POOL) {
    if (filled.length >= 8) break
    if (!filled.includes(fallback)) {
      filled.push(fallback)
    }
  }

  return filled.slice(0, 10)
}

export function HeaderTicker(): JSX.Element {
  const state = useSystemStore((store) => store.state)
  const privacyMode = usePrivacyStore((store) => store.privacyMode)
  const [timeline, setTimeline] = useState<TimelineEventRecord[]>([])
  const [skillFeed, setSkillFeed] = useState<SkillFeed>({ totalSkills: 0, recent: [] })

  useEffect(() => {
    let cancelled = false

    const refresh = async (): Promise<void> => {
      const [nextTimeline, nextSkills] = await Promise.all([
        window.helm.getTimelineEvents(32).catch(() => []),
        window.helm.getSkillFeed(8).catch(() => ({ totalSkills: 0, recent: [] }))
      ])

      if (cancelled) return

      setTimeline(nextTimeline as TimelineEventRecord[])
      setSkillFeed(nextSkills)
    }

    void refresh()
    const interval = window.setInterval(() => {
      void refresh()
    }, 60000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [])

  const items = useMemo(
    () => buildTickerItems(state, timeline, skillFeed, privacyMode),
    [state, timeline, skillFeed, privacyMode]
  )
  const tickerItems = [...items, ...items]

  return (
    <div className="shell-ticker hidden min-w-0 flex-1 lg:flex">
      <div className="shell-ticker-track">
        {tickerItems.map((item, index) => (
          <span key={`${item}-${index}`} className="shell-ticker-item">
            {item}
          </span>
        ))}
      </div>
    </div>
  )
}
