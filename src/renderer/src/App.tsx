import { useEffect, useState, type ReactNode } from 'react'
import { useSystemStore } from './stores/system'
import { useTimeSeriesStore } from './stores/timeseries'
import { Sparkline } from './components/Sparkline'
import { AgentsPanel } from './panels/Agents'
import { PortsPanel } from './panels/Ports'
import { GitStatusPanel } from './panels/GitStatus'
import { LogsPanel } from './panels/Logs'
import { BriefingPanel } from './panels/Briefing'
import { NotificationsPanel } from './panels/Notifications'
import { NetworkPanel } from './panels/Network'
import { SecurityPanel } from './panels/Security'
import { ScorecardsStrip } from './panels/ScorecardsStrip'
import { GitHistoryPanel } from './panels/GitHistory'
import { CommandCenterPanel } from './panels/CommandCenter'
import { TimelinePanel, SessionDeltaBanner } from './panels/Timeline'
import { CommandPalette } from './panels/CommandPalette'
import { CCUsagePanel } from './panels/CCUsage'
import { WorkspacesPanel } from './panels/Workspaces'
import type { SystemState } from '../../shared/types'

type PageId = 'overview' | 'workspaces' | 'agents' | 'systems' | 'ai' | 'activity'

interface PageMeta {
  id: PageId
  label: string
  kicker: string
  description: string
}

const PAGES: PageMeta[] = [
  {
    id: 'overview',
    label: 'Overview',
    kicker: 'Mission control',
    description: 'A calmer top layer for health, AI guidance, and what needs attention right now.'
  },
  {
    id: 'workspaces',
    label: 'Workspaces',
    kicker: 'Repos and processes',
    description: 'Workspace health, git drift, and process orchestration without the extra noise.'
  },
  {
    id: 'agents',
    label: 'Agents',
    kicker: 'Swarm operations',
    description: 'Dedicated view for agent load, waiting states, and coordination context.'
  },
  {
    id: 'systems',
    label: 'Systems',
    kicker: 'Network and posture',
    description: 'Infrastructure telemetry, ports, security posture, and supporting systems.'
  },
  {
    id: 'ai',
    label: 'AI',
    kicker: 'Briefings and repair',
    description: 'LM Studio status, Yennefer control, and the operator-facing AI loop.'
  },
  {
    id: 'activity',
    label: 'Activity',
    kicker: 'Logs and history',
    description: 'Timelines, logs, and recent movement across the workstation.'
  }
]

const PANEL_DOTS: Record<string, string> = {
  'Command Center': 'bg-emerald-400',
  Workspaces: 'bg-blue-400',
  Agents: 'bg-amber-400',
  'Git Status': 'bg-purple-400',
  'Local AI (LM Studio)': 'bg-cyan-400',
  Network: 'bg-green-400',
  'Staff of Gandalf': 'bg-red-400',
  Ports: 'bg-teal-400',
  Notifications: 'bg-orange-400',
  Logs: 'bg-gray-400',
  'Git History': 'bg-indigo-400',
  Timeline: 'bg-lime-400',
  'CC Usage': 'bg-violet-400'
}

const PANEL_ACCENT_HEX: Record<string, string> = {
  'Command Center': '#34d399',
  Workspaces: '#60a5fa',
  Agents: '#fbbf24',
  'Git Status': '#c084fc',
  'Local AI (LM Studio)': '#22d3ee',
  Network: '#4ade80',
  'Staff of Gandalf': '#f87171',
  Ports: '#2dd4bf',
  Notifications: '#fb923c',
  Logs: '#9ca3af',
  'Git History': '#818cf8',
  Timeline: '#a3e635',
  'CC Usage': '#a78bfa'
}

function DashPanel({
  title,
  children,
  className = ''
}: {
  title: string
  children: ReactNode
  className?: string
}): JSX.Element {
  const accentColor = PANEL_ACCENT_HEX[title] || '#6b7280'

  return (
    <section
      className={`bg-gray-900 border border-gray-800/60 rounded-xl overflow-hidden shadow-lg shadow-black/20 hover:border-gray-700 transition-colors min-h-0 flex flex-col ${className}`}
    >
      <div className="px-4 py-2 border-b border-gray-800 flex items-center justify-between relative shrink-0">
        <div className="flex items-center gap-2">
          <span
            className={`w-1.5 h-1.5 rounded-full ${PANEL_DOTS[title] || 'bg-gray-600'}`}
          />
          <h2 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">{title}</h2>
        </div>
        <div
          className="absolute bottom-0 left-0 right-0 h-[2px]"
          style={{
            background: `linear-gradient(to right, transparent, ${accentColor}40, ${accentColor}, ${accentColor}40, transparent)`
          }}
        />
      </div>
      <div className="p-4 flex-1 overflow-auto min-h-0">{children}</div>
    </section>
  )
}

function formatBytes(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${Math.round(bytesPerSec)} B/s`
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
}

function getUsageTone(percent: number): 'green' | 'amber' | 'red' {
  if (percent >= 85) return 'red'
  if (percent >= 60) return 'amber'
  return 'green'
}

function getShellHealth(state: SystemState | null): {
  dot: string
  glow: string
  label: string
} {
  if (!state) {
    return {
      dot: 'bg-gray-600',
      glow: 'shadow-gray-700/40',
      label: 'Booting monitors'
    }
  }

  if (state.cpu.usage >= 85 || state.memory.usagePercent >= 90) {
    return {
      dot: 'bg-red-400',
      glow: 'shadow-red-400/50',
      label: 'Pressure rising'
    }
  }

  if (state.cpu.usage >= 60 || state.memory.usagePercent >= 75) {
    return {
      dot: 'bg-amber-400',
      glow: 'shadow-amber-400/50',
      label: 'Watch posture'
    }
  }

  return {
    dot: 'bg-green-400',
    glow: 'shadow-green-400/50',
    label: 'Systems nominal'
  }
}

function Header(): JSX.Element {
  const state = useSystemStore((s) => s.state)
  const refresh = useSystemStore((s) => s.refresh)
  const { cpuHistory, memHistory, netInHistory, netOutHistory } = useTimeSeriesStore()

  const cpuUsage = state?.cpu.usage ?? 0
  const memUsage = state?.memory.usagePercent ?? 0
  const netIn = state?.network?.totalBytesInPerSec ?? 0
  const netOut = state?.network?.totalBytesOutPerSec ?? 0
  const health = getShellHealth(state)
  const isFresh = state ? Date.now() - state.timestamp < 5000 : false

  return (
    <header className="bg-gray-900 px-6 py-3 flex items-center justify-between relative shrink-0 border-b border-gray-800/60">
      <div className="flex items-center gap-3">
        <div className={`w-2.5 h-2.5 rounded-full ${health.dot} shadow-md ${health.glow}`} />
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-white tracking-tight">HYDRA</h1>
            <span className="text-xs text-gray-500">V2 shell</span>
          </div>
          <div className="text-[11px] text-gray-500">{health.label}</div>
        </div>
      </div>

      <div className="hidden xl:flex items-center gap-5 text-sm">
        <div className="flex items-center gap-1.5 text-gray-400">
          <span className="text-xs">CPU</span>
          <div className="w-24 h-6">
            <Sparkline data={cpuHistory} color="#4ade80" filled={false} width={96} height={24} />
          </div>
          <span className="text-white font-mono text-xs tabular-nums">{cpuUsage.toFixed(0)}%</span>
        </div>
        <div className="flex items-center gap-1.5 text-gray-400">
          <span className="text-xs">MEM</span>
          <div className="w-24 h-6">
            <Sparkline data={memHistory} color="#a78bfa" filled={false} width={96} height={24} />
          </div>
          <span className="text-white font-mono text-xs tabular-nums">{memUsage.toFixed(0)}%</span>
        </div>
        <div className="flex items-center gap-2 text-gray-400">
          <span className="text-xs">NET</span>
          <div className="flex flex-col text-[10px] font-mono tabular-nums leading-tight">
            <span className="text-green-400">
              <span className="text-gray-500">&#8593;</span> {formatBytes(netOut)}
            </span>
            <span className="text-blue-400">
              <span className="text-gray-500">&#8595;</span> {formatBytes(netIn)}
            </span>
          </div>
          <div className="w-12 h-6">
            <Sparkline
              data={netInHistory.map((value, index) => value + (netOutHistory[index] ?? 0))}
              color="#60a5fa"
              filled={false}
              width={48}
              height={24}
            />
          </div>
        </div>
        {state?.isLateNight && (
          <div
            className="flex items-center gap-1 text-gray-500"
            title="Late night mode — non-critical alerts suppressed"
          >
            <span className="text-indigo-400 text-sm">◐</span>
            <span className="text-[10px] uppercase tracking-wider">Night</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={refresh}
          className="px-3 py-1 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded border border-gray-700 transition-colors"
        >
          Refresh
        </button>
        {state && (
          <div className="flex items-center gap-2">
            <span
              className={`w-1.5 h-1.5 rounded-full ${isFresh ? 'bg-green-400 animate-pulse' : 'bg-gray-600'}`}
            />
            <span className="text-xs text-gray-600 font-mono tabular-nums">
              {new Date(state.timestamp).toLocaleTimeString()}
            </span>
          </div>
        )}
      </div>
    </header>
  )
}

function InsightCard({
  eyebrow,
  value,
  title,
  detail,
  tone
}: {
  eyebrow: string
  value: string
  title: string
  detail: string
  tone: 'green' | 'amber' | 'red' | 'blue'
}): JSX.Element {
  const tones: Record<typeof tone, string> = {
    green: 'border-green-800/40 bg-green-950/20 text-green-300',
    amber: 'border-amber-800/40 bg-amber-950/20 text-amber-300',
    red: 'border-red-800/40 bg-red-950/20 text-red-300',
    blue: 'border-cyan-800/40 bg-cyan-950/20 text-cyan-300'
  }

  return (
    <div className={`rounded-xl border px-4 py-3 ${tones[tone]}`}>
      <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500">{eyebrow}</div>
      <div className="pt-2 flex items-end justify-between gap-3">
        <div>
          <div className="text-2xl font-semibold text-white">{value}</div>
          <div className="text-sm text-gray-300">{title}</div>
        </div>
        <div className="max-w-[18rem] text-right text-xs text-gray-500">{detail}</div>
      </div>
    </div>
  )
}

function PageHeader({ meta }: { meta: PageMeta }): JSX.Element {
  const state = useSystemStore((s) => s.state)

  return (
    <div className="px-5 py-4 border-b border-gray-800/60 bg-gray-950/50">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-cyan-500">{meta.kicker}</div>
          <h2 className="text-2xl font-semibold text-white pt-1">{meta.label}</h2>
          <p className="text-sm text-gray-500 pt-1 max-w-2xl">{meta.description}</p>
        </div>
        {state && (
          <div className="hidden md:flex items-center gap-2 text-[11px] text-gray-500">
            <span className="rounded-full border border-gray-800 bg-gray-900 px-3 py-1">
              {state.agents.length} agents
            </span>
            <span className="rounded-full border border-gray-800 bg-gray-900 px-3 py-1">
              {state.gitRepos.length} repos
            </span>
            <span className="rounded-full border border-gray-800 bg-gray-900 px-3 py-1">
              {state.ports.filter((port) => port.state === 'LISTEN').length} listeners
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function OverviewPage(): JSX.Element {
  const state = useSystemStore((s) => s.state)
  if (!state) return <></>

  const dirtyRepos = state.gitRepos.filter((repo) => repo.dirty).length
  const activeAgents = state.agents.filter((agent) => agent.status === 'active').length
  const waitingAgents = state.agents.filter((agent) => agent.status === 'waiting').length
  const memoryTone = getUsageTone(state.memory.usagePercent)
  const repoTone = dirtyRepos > 0 ? 'amber' : 'green'

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <InsightCard
          eyebrow="Resource posture"
          value={`${Math.round(state.memory.usagePercent)}%`}
          title="Memory is your main pressure vector"
          detail={`${Math.round(state.cpu.usage)}% CPU means you are memory-bound before you are CPU-bound.`}
          tone={memoryTone}
        />
        <InsightCard
          eyebrow="Agent load"
          value={`${activeAgents}/${state.agents.length}`}
          title={waitingAgents > 0 ? 'Swarm is active with some queueing' : 'Swarm is active and flowing'}
          detail={
            waitingAgents > 0
              ? `${waitingAgents} agents are waiting. This is where Yennefer should coach instead of scold.`
              : 'Multiple agents are normal here. Navigation should reflect that reality.'
          }
          tone="blue"
        />
        <InsightCard
          eyebrow="Repo drift"
          value={dirtyRepos > 0 ? `${dirtyRepos}` : '0'}
          title={dirtyRepos > 0 ? 'Dirty repos need sequencing' : 'Repos are stable'}
          detail={
            dirtyRepos > 0
              ? 'Use Workspaces for branch and process cleanup without drowning in unrelated panels.'
              : 'Use Overview for status, then drill down only when needed.'
          }
          tone={repoTone}
        />
      </div>

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.9fr)]">
        <DashPanel title="Command Center" className="min-h-[460px]">
          <CommandCenterPanel />
        </DashPanel>
        <div className="grid gap-4 auto-rows-fr">
          <DashPanel title="Local AI (LM Studio)" className="min-h-[300px]">
            <BriefingPanel />
          </DashPanel>
          <DashPanel title="Notifications" className="min-h-[220px]">
            <NotificationsPanel />
          </DashPanel>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <DashPanel title="Agents" className="min-h-[320px]">
          <AgentsPanel />
        </DashPanel>
        <DashPanel title="Git Status" className="min-h-[320px]">
          <GitStatusPanel />
        </DashPanel>
      </div>
    </div>
  )
}

function WorkspacesPage(): JSX.Element {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.4fr)_minmax(360px,0.85fr)]">
        <DashPanel title="Command Center" className="min-h-[520px]">
          <CommandCenterPanel />
        </DashPanel>
        <div className="grid gap-4 auto-rows-fr">
          <DashPanel title="Workspaces" className="min-h-[260px]">
            <WorkspacesPanel />
          </DashPanel>
          <DashPanel title="Git Status" className="min-h-[240px]">
            <GitStatusPanel />
          </DashPanel>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <DashPanel title="Git History" className="min-h-[300px]">
          <GitHistoryPanel />
        </DashPanel>
        <DashPanel title="Timeline" className="min-h-[300px]">
          <TimelinePanel />
        </DashPanel>
      </div>
    </div>
  )
}

function AgentsPage(): JSX.Element {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.3fr)_minmax(360px,0.9fr)]">
        <DashPanel title="Agents" className="min-h-[520px]">
          <AgentsPanel />
        </DashPanel>
        <div className="grid gap-4 auto-rows-fr">
          <DashPanel title="Notifications" className="min-h-[240px]">
            <NotificationsPanel />
          </DashPanel>
          <DashPanel title="Timeline" className="min-h-[260px]">
            <TimelinePanel />
          </DashPanel>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <DashPanel title="Command Center" className="min-h-[320px]">
          <CommandCenterPanel />
        </DashPanel>
        <DashPanel title="Workspaces" className="min-h-[320px]">
          <WorkspacesPanel />
        </DashPanel>
      </div>
    </div>
  )
}

function SystemsPage(): JSX.Element {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <DashPanel title="Network" className="min-h-[360px]">
          <NetworkPanel />
        </DashPanel>
        <DashPanel title="Staff of Gandalf" className="min-h-[360px]">
          <SecurityPanel />
        </DashPanel>
      </div>

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_minmax(0,0.8fr)]">
        <DashPanel title="Ports" className="min-h-[280px]">
          <PortsPanel />
        </DashPanel>
        <DashPanel title="Notifications" className="min-h-[280px]">
          <NotificationsPanel />
        </DashPanel>
        <DashPanel title="CC Usage" className="min-h-[280px]">
          <CCUsagePanel />
        </DashPanel>
      </div>
    </div>
  )
}

function AIPage(): JSX.Element {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.9fr)]">
        <DashPanel title="Local AI (LM Studio)" className="min-h-[520px]">
          <BriefingPanel />
        </DashPanel>
        <div className="grid gap-4 auto-rows-fr">
          <DashPanel title="Notifications" className="min-h-[240px]">
            <NotificationsPanel />
          </DashPanel>
          <DashPanel title="Agents" className="min-h-[260px]">
            <AgentsPanel />
          </DashPanel>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <DashPanel title="Timeline" className="min-h-[300px]">
          <TimelinePanel />
        </DashPanel>
        <DashPanel title="Command Center" className="min-h-[300px]">
          <CommandCenterPanel />
        </DashPanel>
      </div>
    </div>
  )
}

function ActivityPage(): JSX.Element {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.85fr)]">
        <DashPanel title="Logs" className="min-h-[520px]">
          <LogsPanel />
        </DashPanel>
        <div className="grid gap-4 auto-rows-fr">
          <DashPanel title="Timeline" className="min-h-[240px]">
            <TimelinePanel />
          </DashPanel>
          <DashPanel title="Git History" className="min-h-[260px]">
            <GitHistoryPanel />
          </DashPanel>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <DashPanel title="Notifications" className="min-h-[300px]">
          <NotificationsPanel />
        </DashPanel>
        <DashPanel title="Workspaces" className="min-h-[300px]">
          <WorkspacesPanel />
        </DashPanel>
      </div>
    </div>
  )
}

function NavBadge({ pageId }: { pageId: PageId }): JSX.Element {
  const state = useSystemStore((s) => s.state)
  if (!state) return <span className="text-[10px] text-gray-600">-</span>

  let badge: string
  switch (pageId) {
    case 'overview':
      badge = `${state.agents.length}`
      break
    case 'workspaces':
      badge = `${state.gitRepos.length}`
      break
    case 'agents':
      badge = `${state.agents.filter((agent) => agent.status === 'waiting').length}`
      break
    case 'systems':
      badge = `${state.ports.filter((port) => port.state === 'LISTEN').length}`
      break
    case 'ai':
      badge = state.memory.usagePercent >= 80 ? 'hot' : 'ready'
      break
    case 'activity':
      badge = `${state.processes.length}`
      break
  }

  return (
    <span className="rounded-full border border-gray-800 bg-gray-900 px-2 py-0.5 text-[10px] text-gray-500">
      {badge}
    </span>
  )
}

function ShellNav({
  currentPage,
  setCurrentPage
}: {
  currentPage: PageId
  setCurrentPage: (page: PageId) => void
}): JSX.Element {
  return (
    <>
      <aside className="hidden xl:flex w-64 shrink-0 flex-col rounded-2xl border border-gray-800/60 bg-gray-900/70 p-3">
        <div className="px-3 pb-3 border-b border-gray-800/60">
          <div className="text-[10px] uppercase tracking-[0.25em] text-cyan-500">Navigation</div>
          <div className="pt-2 text-sm text-gray-500">
            Persistent health stays global. Detail lives on dedicated pages.
          </div>
        </div>
        <nav className="pt-3 space-y-2">
          {PAGES.map((page) => {
            const active = page.id === currentPage
            return (
              <button
                key={page.id}
                onClick={() => setCurrentPage(page.id)}
                className={`w-full text-left rounded-xl border px-3 py-3 transition-colors ${
                  active
                    ? 'border-cyan-700/60 bg-cyan-950/30'
                    : 'border-transparent bg-transparent hover:border-gray-800 hover:bg-gray-900'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-white">{page.label}</div>
                  <NavBadge pageId={page.id} />
                </div>
                <div className="pt-1 text-[11px] text-gray-500">{page.description}</div>
              </button>
            )
          })}
        </nav>
      </aside>

      <div className="xl:hidden overflow-x-auto">
        <div className="flex gap-2 min-w-max">
          {PAGES.map((page) => {
            const active = page.id === currentPage
            return (
              <button
                key={page.id}
                onClick={() => setCurrentPage(page.id)}
                className={`rounded-full border px-3 py-2 text-xs transition-colors ${
                  active
                    ? 'border-cyan-700/60 bg-cyan-950/30 text-cyan-200'
                    : 'border-gray-800 bg-gray-900 text-gray-400 hover:text-gray-200'
                }`}
              >
                {page.label}
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}

function PageContent({ currentPage }: { currentPage: PageId }): JSX.Element {
  switch (currentPage) {
    case 'overview':
      return <OverviewPage />
    case 'workspaces':
      return <WorkspacesPage />
    case 'agents':
      return <AgentsPage />
    case 'systems':
      return <SystemsPage />
    case 'ai':
      return <AIPage />
    case 'activity':
      return <ActivityPage />
  }
}

function App(): JSX.Element {
  const state = useSystemStore((s) => s.state)
  const initialize = useSystemStore((s) => s.initialize)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState<PageId>('overview')

  useEffect(() => {
    initialize()
  }, [initialize])

  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault()
        setPaletteOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  if (!state) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950 text-gray-400">
        <div className="text-center">
          <div className="text-2xl font-bold text-white mb-2">HYDRA</div>
          <div className="text-sm">Connecting to system monitors...</div>
        </div>
      </div>
    )
  }

  const activePageMeta = PAGES.find((page) => page.id === currentPage) || PAGES[0]

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-white crt-grid overflow-hidden">
      <Header />

      <div className="shrink-0 px-4 pt-3 overflow-x-auto">
        <ScorecardsStrip />
      </div>
      <div className="shrink-0 px-4 pt-2">
        <SessionDeltaBanner />
      </div>

      <div className="flex-1 min-h-0 px-4 pb-4 pt-3">
        <div className="h-full min-h-0 flex flex-col xl:flex-row gap-4">
          <ShellNav currentPage={currentPage} setCurrentPage={setCurrentPage} />

          <main className="flex-1 min-h-0 rounded-2xl border border-gray-800/60 bg-gray-900/40 overflow-hidden flex flex-col">
            <PageHeader meta={activePageMeta} />
            <div className="flex-1 min-h-0 overflow-y-auto p-5">
              <PageContent currentPage={currentPage} />
            </div>
          </main>
        </div>
      </div>

      <CommandPalette isOpen={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  )
}

export default App
