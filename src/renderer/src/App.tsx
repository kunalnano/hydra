import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { useSystemStore } from './stores/system'
import { useTimeSeriesStore } from './stores/timeseries'
import { useNavigationStore, type HydraPageId } from './stores/navigation'
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
import { FMRadioPanel } from './panels/FMRadio'
import { HYDRA_SKINS, useSkinStore } from './stores/skin'
import type { SystemState } from '../../shared/types'

interface PageMeta {
  id: HydraPageId
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
    id: 'radio',
    label: 'FM Radio',
    kicker: 'Stereo relay',
    description: 'Free-streaming FM presets, direct URL loading, and a built-in desktop tuner.'
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
  'FM Radio': 'bg-pink-300',
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
  'FM Radio': '#f9a8d4',
  Logs: '#9ca3af',
  'Git History': '#818cf8',
  Timeline: '#a3e635',
  'CC Usage': '#a78bfa'
}

const PAGE_MONOGRAMS: Record<HydraPageId, string> = {
  overview: 'OV',
  workspaces: 'WS',
  agents: 'AG',
  systems: 'SY',
  ai: 'AI',
  radio: 'FM',
  activity: 'AC'
}

const PAGE_GLYPH_GRADIENTS: Record<HydraPageId, string> = {
  overview: 'from-cyan-300/90 via-sky-300/70 to-teal-300/70',
  workspaces: 'from-blue-300/90 via-indigo-300/75 to-cyan-300/70',
  agents: 'from-amber-200/95 via-orange-300/80 to-rose-300/75',
  systems: 'from-emerald-200/95 via-teal-300/80 to-sky-300/65',
  ai: 'from-fuchsia-200/95 via-violet-300/80 to-sky-300/65',
  radio: 'from-pink-200/95 via-fuchsia-300/80 to-cyan-300/70',
  activity: 'from-lime-200/95 via-emerald-300/75 to-cyan-300/65'
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
  const panelStyle: CSSProperties = {
    background: `radial-gradient(circle at 92% 0%, ${accentColor}20, transparent 26%), var(--hydra-panel-bg)`,
    boxShadow: `0 20px 40px rgba(2, 8, 20, 0.2), inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -18px 26px ${accentColor}18`
  }

  return (
    <section
      className={`shell-panel min-h-0 flex flex-col overflow-hidden ${className}`}
      style={panelStyle}
    >
      <div className="shell-panel-header shrink-0">
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full shadow-[0_0_12px_currentColor] ${PANEL_DOTS[title] || 'bg-gray-600'}`}
          />
          <h2 className="shell-panel-title text-xs font-semibold uppercase tracking-[0.24em]">
            {title}
          </h2>
        </div>
        <div
          className="h-2.5 w-12 rounded-full border border-white/10"
          style={{
            background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)`
          }}
        />
      </div>
      <div className="shell-panel-body flex-1 min-h-0 overflow-auto">{children}</div>
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

function SkinSelector(): JSX.Element {
  const activeSkin = useSkinStore((s) => s.activeSkin)
  const setActiveSkin = useSkinStore((s) => s.setActiveSkin)

  return (
    <div className="shell-segmented-control" role="group" aria-label="Choose shell skin">
      {HYDRA_SKINS.map((skin) => {
        const active = skin.id === activeSkin
        return (
          <button
            key={skin.id}
            type="button"
            onClick={() => setActiveSkin(skin.id)}
            className={`shell-segmented-button ${active ? 'shell-segmented-button--active' : ''}`}
            title={skin.blurb}
          >
            {skin.label}
          </button>
        )
      })}
    </div>
  )
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
    <header className="shell-header px-5 py-3 flex items-center justify-between relative shrink-0 border-b">
      <div className="flex items-center gap-3">
        <div className={`w-2.5 h-2.5 rounded-full ${health.dot} shadow-md ${health.glow}`} />
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-white tracking-[0.28em]">HYDRA</h1>
            <span className="text-[11px] shell-subtle">V2 shell</span>
          </div>
          <div className="text-[11px] shell-subtle">{health.label}</div>
        </div>
      </div>

      <div className="hidden xl:flex items-center gap-5 text-sm">
        <div className="flex items-center gap-1.5 shell-muted">
          <span className="text-xs">CPU</span>
          <div className="w-24 h-6">
            <Sparkline data={cpuHistory} color="#4ade80" filled={false} width={96} height={24} />
          </div>
          <span className="text-white font-mono text-xs tabular-nums">{cpuUsage.toFixed(0)}%</span>
        </div>
        <div className="flex items-center gap-1.5 shell-muted">
          <span className="text-xs">MEM</span>
          <div className="w-24 h-6">
            <Sparkline data={memHistory} color="#a78bfa" filled={false} width={96} height={24} />
          </div>
          <span className="text-white font-mono text-xs tabular-nums">{memUsage.toFixed(0)}%</span>
        </div>
        <div className="flex items-center gap-2 shell-muted">
          <span className="text-xs">NET</span>
          <div className="flex flex-col text-[10px] font-mono tabular-nums leading-tight">
            <span className="text-green-400">
              <span className="shell-subtle">&#8593;</span> {formatBytes(netOut)}
            </span>
            <span className="text-blue-400">
              <span className="shell-subtle">&#8595;</span> {formatBytes(netIn)}
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
            className="flex items-center gap-1 shell-subtle"
            title="Late night mode — non-critical alerts suppressed"
          >
            <span className="text-indigo-400 text-sm">◐</span>
            <span className="text-[10px] uppercase tracking-wider">Night</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.24em] shell-subtle">Skin</span>
          <SkinSelector />
        </div>
        <button
          type="button"
          onClick={refresh}
          className="shell-control-button px-3 py-1.5 text-xs font-medium"
        >
          Refresh
        </button>
        {state && (
          <div className="flex items-center gap-2">
            <span
              className={`w-1.5 h-1.5 rounded-full ${isFresh ? 'bg-green-400 animate-pulse' : 'bg-gray-600'}`}
            />
            <span className="text-xs shell-subtle font-mono tabular-nums">
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
  tone,
  onClick
}: {
  eyebrow: string
  value: string
  title: string
  detail: string
  tone: 'green' | 'amber' | 'red' | 'blue'
  onClick?: () => void
}): JSX.Element {
  const tones: Record<typeof tone, { hex: string; text: string }> = {
    green: { hex: '#6ee7b7', text: 'text-emerald-200' },
    amber: { hex: '#fbbf24', text: 'text-amber-100' },
    red: { hex: '#fda4af', text: 'text-rose-100' },
    blue: { hex: '#7dd3fc', text: 'text-sky-100' }
  }
  const toneMeta = tones[tone]
  const cardStyle: CSSProperties = {
    background: `radial-gradient(circle at 90% 10%, ${toneMeta.hex}22, transparent 34%), var(--hydra-card-bg)`,
    boxShadow: `0 18px 36px rgba(2, 8, 20, 0.18), inset 0 1px 0 rgba(255,255,255,0.16), inset 0 -18px 22px ${toneMeta.hex}18`
  }

  return (
    <button
      type="button"
      onClick={onClick}
      style={cardStyle}
      className={`shell-insight-card w-full text-left ${onClick ? 'shell-insight-card--interactive' : ''}`}
    >
      <div className="text-[10px] uppercase tracking-[0.2em] shell-subtle">{eyebrow}</div>
      <div className="pt-2 flex items-end justify-between gap-3">
        <div>
          <div className="text-2xl font-semibold text-white">{value}</div>
          <div className={`text-sm ${toneMeta.text}`}>{title}</div>
        </div>
        <div className="max-w-[18rem] text-right text-xs shell-muted">{detail}</div>
      </div>
    </button>
  )
}

function PageHeader({ meta }: { meta: PageMeta }): JSX.Element {
  const state = useSystemStore((s) => s.state)

  return (
    <div className="shell-page-header px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="shell-page-kicker text-[10px] uppercase tracking-[0.25em]">
            {meta.kicker}
          </div>
          <h2 className="text-2xl font-semibold text-white pt-1">{meta.label}</h2>
          <p className="pt-1 max-w-2xl text-sm shell-subtle">{meta.description}</p>
        </div>
        {state && (
          <div className="hidden md:flex items-center gap-2 text-[11px]">
            <span className="shell-chip rounded-full px-3 py-1">{state.agents.length} agents</span>
            <span className="shell-chip rounded-full px-3 py-1">{state.gitRepos.length} repos</span>
            <span className="shell-chip rounded-full px-3 py-1">
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
  const setCurrentPage = useNavigationStore((s) => s.setCurrentPage)
  if (!state) return <></>

  const dirtyRepos = state.gitRepos.filter((repo) => repo.dirty).length
  const engagedAgents = state.agents.filter(
    (agent) => agent.status === 'active' || agent.status === 'busy'
  ).length
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
          value={`${engagedAgents}/${state.agents.length}`}
          title={
            waitingAgents > 0 ? 'Swarm is active with some queueing' : 'Swarm is active and flowing'
          }
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
              ? 'Git Status now surfaces an action queue with stash and fetch controls instead of just wagging a finger.'
              : 'Use Overview for status, then drill down only when needed.'
          }
          tone={repoTone}
          onClick={() => setCurrentPage('workspaces')}
        />
      </div>

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.9fr)]">
        <DashPanel title="Command Center" className="min-h-[460px]">
          <CommandCenterPanel />
        </DashPanel>
        <div className="grid gap-4 auto-rows-fr">
          <DashPanel title="Local AI (LM Studio)" className="min-h-[300px]">
            <BriefingPanel variant="compact" />
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
          <CommandCenterPanel initialSortMode="workspace" showSortControls />
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
      <DashPanel title="Local AI (LM Studio)" className="min-h-[420px]">
        <BriefingPanel variant="full" />
      </DashPanel>
    </div>
  )
}

function RadioPage(): JSX.Element {
  return (
    <div className="space-y-4">
      <DashPanel title="FM Radio" className="min-h-[580px]">
        <FMRadioPanel />
      </DashPanel>
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

function NavGlyph({ pageId, active }: { pageId: HydraPageId; active: boolean }): JSX.Element {
  return (
    <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/16 bg-black/10 text-[10px] font-semibold tracking-[0.22em] text-white/90 shadow-[0_12px_24px_rgba(4,10,22,0.2)]">
      <span
        className={`absolute inset-0 bg-gradient-to-br ${PAGE_GLYPH_GRADIENTS[pageId]} ${active ? 'opacity-100' : 'opacity-75'}`}
      />
      <span className="absolute inset-x-1 top-1 h-3 rounded-full bg-white/30 blur-md" />
      <span className="absolute inset-1 rounded-full border border-white/20" />
      <span className="relative">{PAGE_MONOGRAMS[pageId]}</span>
    </span>
  )
}

function NavBadge({
  pageId,
  active = false
}: {
  pageId: HydraPageId
  active?: boolean
}): JSX.Element {
  const state = useSystemStore((s) => s.state)
  if (!state) return <span className="shell-nav-badge text-[10px]">-</span>

  let badge: string
  switch (pageId) {
    case 'overview':
      badge = `${state.agents.length}`
      break
    case 'workspaces':
      badge = `${state.gitRepos.length}`
      break
    case 'agents':
      badge = `${state.agents.length}`
      break
    case 'systems':
      badge = `${state.ports.filter((port) => port.state === 'LISTEN').length}`
      break
    case 'ai':
      badge = state.memory.usagePercent >= 80 ? 'hot' : 'ready'
      break
    case 'radio':
      badge = 'fm'
      break
    case 'activity':
      badge = `${state.processes.length}`
      break
  }

  return (
    <span
      className={`shell-nav-badge rounded-full px-2 py-0.5 text-[10px] ${active ? 'shell-nav-badge--active' : ''}`}
    >
      {badge}
    </span>
  )
}

function ShellNav({
  currentPage,
  setCurrentPage
}: {
  currentPage: HydraPageId
  setCurrentPage: (page: HydraPageId) => void
}): JSX.Element {
  return (
    <>
      <aside className="shell-nav hidden xl:flex shrink-0 flex-col p-3">
        <div className="px-3 pb-3 border-b border-white/10">
          <div className="shell-page-kicker text-[10px] uppercase tracking-[0.25em]">
            Navigation
          </div>
          <div className="pt-2 text-sm shell-subtle">
            Persistent posture stays global. Step into a page only when you need to act.
          </div>
        </div>
        <nav className="pt-3 space-y-2.5">
          {PAGES.map((page) => {
            const active = page.id === currentPage
            return (
              <button
                key={page.id}
                type="button"
                onClick={() => setCurrentPage(page.id)}
                className={`shell-nav-button w-full text-left ${active ? 'shell-nav-button--active' : 'shell-nav-button--inactive'}`}
              >
                <div className="flex items-center gap-3">
                  <NavGlyph pageId={page.id} active={active} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-white">{page.label}</div>
                      <NavBadge pageId={page.id} active={active} />
                    </div>
                    <div
                      className={`pt-1 text-[10px] uppercase tracking-[0.22em] ${active ? 'text-white/80' : 'shell-subtle'}`}
                    >
                      {page.kicker}
                    </div>
                  </div>
                </div>
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
                type="button"
                onClick={() => setCurrentPage(page.id)}
                className={`shell-mobile-nav-button rounded-full px-3 py-2 text-xs transition-colors ${
                  active ? 'shell-mobile-nav-button--active text-white' : 'shell-subtle'
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

function PageContent({ currentPage }: { currentPage: HydraPageId }): JSX.Element {
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
    case 'radio':
      return <RadioPage />
    case 'activity':
      return <ActivityPage />
  }
}

function App(): JSX.Element {
  const activeSkin = useSkinStore((s) => s.activeSkin)
  const state = useSystemStore((s) => s.state)
  const initialize = useSystemStore((s) => s.initialize)
  const currentPage = useNavigationStore((s) => s.currentPage)
  const setCurrentPage = useNavigationStore((s) => s.setCurrentPage)
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => {
    initialize()
  }, [initialize])

  useEffect(() => {
    document.documentElement.dataset.skin = activeSkin
    return () => {
      delete document.documentElement.dataset.skin
    }
  }, [activeSkin])

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
      <div
        className="hydra-shell shell-loading flex items-center justify-center h-screen"
        data-skin={activeSkin}
      >
        <div className="text-center">
          <div className="mb-2 text-2xl font-semibold tracking-[0.28em] text-white">HYDRA</div>
          <div className="text-sm shell-subtle">Connecting to system monitors...</div>
        </div>
      </div>
    )
  }

  const activePageMeta = PAGES.find((page) => page.id === currentPage) || PAGES[0]

  return (
    <div
      className="hydra-shell crt-grid h-screen flex flex-col overflow-hidden"
      data-skin={activeSkin}
    >
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

          <main className="shell-main flex-1 min-h-0 overflow-hidden flex flex-col">
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
