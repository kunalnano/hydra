import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { useSystemStore } from './stores/system'
import { useNavigationStore, type HelmPageId } from './stores/navigation'
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
import { HELM_SKINS, useSkinStore } from './stores/skin'
import { usePrivacyStore } from './stores/privacy'
import { SkinGlobe } from './components/SkinGlobe'
import { getAudioElement } from './stores/audio-engine'
import type { SystemState } from '../../shared/types'

interface PageMeta {
  id: HelmPageId
  label: string
  kicker: string
  description: string
}

const PAGES: PageMeta[] = [
  {
    id: 'bridge',
    label: 'Bridge',
    kicker: 'Mission control',
    description: 'Health posture, operator briefing, and what needs attention right now.'
  },
  {
    id: 'fleet',
    label: 'Fleet',
    kicker: 'Repos and workspaces',
    description: 'Workspace health, git drift, commit history, and process orchestration.'
  },
  {
    id: 'swarm',
    label: 'Swarm',
    kicker: 'Agent operations',
    description: 'Live agent state, swarm load, and session timeline.'
  },
  {
    id: 'grid',
    label: 'Grid',
    kicker: 'Infrastructure posture',
    description: 'Network traffic, security scans, and listening ports.'
  },
  {
    id: 'ai',
    label: 'AI',
    kicker: 'Briefings and cost',
    description: 'LM Studio control, Yennefer, Claude Code usage tracking.'
  },
  {
    id: 'radio',
    label: 'Radio',
    kicker: 'Stereo relay',
    description: 'FM presets, local MP3, direct URL loading, and desktop tuner.'
  },
  {
    id: 'logs',
    label: 'Logs',
    kicker: 'System stream',
    description: 'Live log tailing and system event history.'
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

const PAGE_MONOGRAMS: Record<HelmPageId, string> = {
  bridge: 'BR',
  fleet: 'FL',
  swarm: 'SW',
  grid: 'GR',
  ai: 'AI',
  radio: 'FM',
  logs: 'LG'
}

const PAGE_GLYPH_GRADIENTS: Record<HelmPageId, string> = {
  bridge: 'from-cyan-300/90 via-sky-300/70 to-teal-300/70',
  fleet: 'from-blue-300/90 via-indigo-300/75 to-cyan-300/70',
  swarm: 'from-amber-200/95 via-orange-300/80 to-rose-300/75',
  grid: 'from-emerald-200/95 via-teal-300/80 to-sky-300/65',
  ai: 'from-fuchsia-200/95 via-violet-300/80 to-sky-300/65',
  radio: 'from-pink-200/95 via-fuchsia-300/80 to-cyan-300/70',
  logs: 'from-lime-200/95 via-emerald-300/75 to-cyan-300/65'
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
    background: `radial-gradient(circle at 92% 0%, ${accentColor}14, transparent 26%), var(--helm-panel-bg)`
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
          <h2 className="shell-panel-title text-[10px] font-semibold uppercase tracking-[0.16em]">
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

const DEV_TICKER_POOL = [
  'JAVASCRIPT WAS CREATED IN 10 DAYS // MAY 1995',
  'LINUX KERNEL HAS 30M+ LINES OF CODE // AND GROWING',
  'GIT WAS WRITTEN BY LINUS TORVALDS IN 2 WEEKS',
  'THE FIRST COMPUTER BUG WAS AN ACTUAL MOTH // 1947',
  'STACK OVERFLOW GETS 100M+ MONTHLY VISITORS',
  'NPM REGISTRY HOSTS 2.1M+ PACKAGES',
  'PYTHON WAS NAMED AFTER MONTY PYTHON // NOT THE SNAKE',
  'THE FIRST EMAIL WAS SENT IN 1971 BY RAY TOMLINSON',
  'RUST HAS BEEN MOST LOVED LANGUAGE 8 YEARS RUNNING',
  'NASA STILL RUNS SOFTWARE FROM THE 1970S',
  'THE AVERAGE DEV WRITES 100 LINES OF CODE PER DAY',
  'GOOGLE PROCESSES 8.5 BILLION SEARCHES PER DAY',
  'TYPESCRIPT ADOPTION GREW 300% SINCE 2020',
  'THE INTERNET WEIGHS ABOUT 50 GRAMS // ELECTRONS',
  'FIRST WEBSITE WENT LIVE AUG 6 1991 // CERN',
  'THERE ARE 700+ PROGRAMMING LANGUAGES IN USE',
  'SPACEX RUNS LINUX ON FALCON 9 FLIGHT COMPUTERS',
  'CLAUDE CAN PROCESS 200K TOKENS IN A SINGLE CONTEXT',
  'DNS WAS INVENTED IN 1983 // BEFORE THE WWW',
  'THE DARK WEB IS ONLY 5% OF THE TOTAL INTERNET',
  'ELECTRON APPS USE CHROMIUM // YES EVEN THIS ONE',
  'REACT WAS OPEN-SOURCED BY FACEBOOK IN 2013',
  'SQLITE IS THE MOST DEPLOYED DATABASE IN THE WORLD',
  'THE FIRST PROGRAMMER WAS ADA LOVELACE // 1843',
  'DOCKER CONTAINERS SHARE THE HOST OS KERNEL',
  'KUBERNETES MEANS HELMSMAN IN GREEK',
  'GITHUB HAS 100M+ DEVELOPERS WORLDWIDE',
  'THE AVERAGE WEBSITE MAKES 70+ HTTP REQUESTS',
  'WASM RUNS AT NEAR-NATIVE SPEED IN THE BROWSER',
  'VIM HAS BEEN AROUND SINCE 1991 // STILL NO EXIT'
]

function buildTickerItems(): string[] {
  const now = Date.now()
  const seed = Math.floor(now / 60000) % DEV_TICKER_POOL.length
  const items: string[] = []
  for (let i = 0; i < 8; i++) {
    items.push(DEV_TICKER_POOL[(seed + i) % DEV_TICKER_POOL.length])
  }
  return items
}

function SkinCard({ skin, active, onSelect }: {
  skin: (typeof HELM_SKINS)[number]; active: boolean; onSelect: () => void
}): JSX.Element {
  return (
    <button onClick={onSelect} className={`shell-skin-card ${active ? 'shell-skin-card--active' : ''}`}>
      <div className="shell-skin-preview">
        {skin.palette.map((color, i) => (
          <div key={i} style={{ background: color, flex: i === 0 ? 3 : 1 }} />
        ))}
      </div>
      <div className="shell-skin-card-body">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-white">{skin.label}</span>
          {active && <span className="shell-skin-badge">Active</span>}
        </div>
        <p className="text-xs shell-muted mt-1">{skin.blurb}</p>
      </div>
    </button>
  )
}

function SkinSelectorPanel({ onClose }: { onClose: () => void }): JSX.Element {
  const activeSkin = useSkinStore((s) => s.activeSkin)
  const setActiveSkin = useSkinStore((s) => s.setActiveSkin)

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="shell-command-overlay fixed inset-0 z-50" onClick={onClose}>
      <div className="shell-skin-panel" onClick={(e) => e.stopPropagation()}>
        <SkinGlobe />
        <div className="shell-skin-panel-header">
          <h3>Shell Skin</h3>
          <p>Choose the visual identity for your HELM shell.</p>
        </div>
        <div className="shell-skin-grid">
          {HELM_SKINS.map((skin) => (
            <SkinCard key={skin.id} skin={skin} active={skin.id === activeSkin}
              onSelect={() => { setActiveSkin(skin.id); onClose() }} />
          ))}
        </div>
      </div>
    </div>
  )
}

function SkinChip({ onOpen }: { onOpen: () => void }): JSX.Element {
  const activeSkin = useSkinStore((s) => s.activeSkin)
  const skinMeta = HELM_SKINS.find((s) => s.id === activeSkin)
  return (
    <button onClick={onOpen} className="shell-control-button px-3 py-1.5 text-xs font-medium flex items-center gap-2">
      <span className="w-2 h-2 rounded-full" style={{ background: 'var(--helm-accent)' }} />
      {skinMeta?.label ?? 'Skin'}
    </button>
  )
}

function PrivacyChip(): JSX.Element {
  const privacyMode = usePrivacyStore((s) => s.privacyMode)
  const togglePrivacyMode = usePrivacyStore((s) => s.togglePrivacyMode)

  return (
    <button
      type="button"
      onClick={togglePrivacyMode}
      title={
        privacyMode
          ? 'Secure View is on. Local paths, hosts, and endpoints are redacted.'
          : 'Secure View is off. Local paths, hosts, and endpoints may be visible.'
      }
      className="shell-control-button px-3 py-1.5 text-xs font-medium flex items-center gap-2"
    >
      <span
        className={`h-2 w-2 rounded-full ${
          privacyMode
            ? 'bg-emerald-300 shadow-[0_0_8px_rgba(110,231,183,0.8)]'
            : 'bg-amber-300 shadow-[0_0_8px_rgba(252,211,77,0.8)]'
        }`}
      />
      {privacyMode ? 'Secure On' : 'Secure Off'}
    </button>
  )
}

function HeaderTicker(): JSX.Element {
  const [items, setItems] = useState(() => buildTickerItems())

  useEffect(() => {
    const interval = setInterval(() => setItems(buildTickerItems()), 60000)
    return () => clearInterval(interval)
  }, [])

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

function Header({
  onOpenSkinSelector
}: {
  onOpenSkinSelector: () => void
}): JSX.Element {
  const state = useSystemStore((s) => s.state)
  const refresh = useSystemStore((s) => s.refresh)
  const health = getShellHealth(state)
  const isFresh = state ? Date.now() - state.timestamp < 5000 : false

  return (
    <header className="shell-header chrome-brushed px-4 py-2 flex items-center gap-4 relative shrink-0 border-b">
      <div className="flex shrink-0 items-center gap-3">
        <div className={`w-2.5 h-2.5 rounded-full ${health.dot} shadow-md ${health.glow}`} />
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold text-white tracking-[0.16em] font-[family-name:var(--helm-font-mono)]">HELM</h1>
            <span className="text-[10px] shell-subtle font-[family-name:var(--helm-font-mono)]">V4</span>
          </div>
          <div className="text-[11px] shell-subtle">{health.label}</div>
        </div>
      </div>

      <HeaderTicker />

      <div className="ml-auto flex shrink-0 items-center gap-3">
        <div className="hidden sm:flex items-center gap-2">
          <PrivacyChip />
          <SkinChip onOpen={onOpenSkinSelector} />
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

function PageHeader({ meta }: { meta: PageMeta }): JSX.Element {
  const state = useSystemStore((s) => s.state)

  return (
    <div className="shell-page-header px-4 py-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="shell-page-kicker text-[9px] uppercase tracking-[0.16em]">
            {meta.kicker}
          </div>
          <h2 className="text-lg font-semibold text-white">{meta.label}</h2>
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

function BridgePage(): JSX.Element {
  const state = useSystemStore((s) => s.state)
  if (!state) return <></>

  return (
    <div className="space-y-4">
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
    </div>
  )
}

function FleetPage(): JSX.Element {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.4fr)_minmax(360px,0.85fr)]">
        <DashPanel title="Workspaces" className="min-h-[420px]">
          <WorkspacesPanel />
        </DashPanel>
        <DashPanel title="Git Status" className="min-h-[420px]">
          <GitStatusPanel />
        </DashPanel>
      </div>
      <DashPanel title="Git History" className="min-h-[300px]">
        <GitHistoryPanel />
      </DashPanel>
    </div>
  )
}

function SwarmPage(): JSX.Element {
  return (
    <div className="space-y-4">
      <DashPanel title="Agents" className="min-h-[460px]">
        <AgentsPanel />
      </DashPanel>
      <DashPanel title="Timeline" className="min-h-[280px]">
        <TimelinePanel />
      </DashPanel>
    </div>
  )
}

function GridPage(): JSX.Element {
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
      <DashPanel title="Ports" className="min-h-[280px]">
        <PortsPanel />
      </DashPanel>
    </div>
  )
}

function AIPage(): JSX.Element {
  return (
    <div className="space-y-4">
      <DashPanel title="Local AI (LM Studio)" className="min-h-[420px]">
        <BriefingPanel variant="full" />
      </DashPanel>
      <DashPanel title="CC Usage" className="min-h-[400px]">
        <CCUsagePanel />
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

function LogsPage(): JSX.Element {
  return (
    <div className="space-y-4">
      <DashPanel title="Logs" className="min-h-[600px]">
        <LogsPanel />
      </DashPanel>
    </div>
  )
}

function NavGlyph({ pageId, active }: { pageId: HelmPageId; active: boolean }): JSX.Element {
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
  pageId: HelmPageId
  active?: boolean
}): JSX.Element {
  const state = useSystemStore((s) => s.state)
  if (!state) return <span className="shell-nav-badge text-[10px]">-</span>

  let badge: string
  switch (pageId) {
    case 'bridge':
      badge = `${state.agents.length}`
      break
    case 'fleet':
      badge = `${state.gitRepos.length}`
      break
    case 'swarm':
      badge = `${state.agents.length}`
      break
    case 'grid':
      badge = `${state.ports.filter((port) => port.state === 'LISTEN').length}`
      break
    case 'ai':
      badge = state.memory.usagePercent >= 80 ? 'hot' : 'ready'
      break
    case 'radio':
      badge = 'fm'
      break
    case 'logs':
      badge = `${state.processes.length}`
      break
    default:
      badge = '-'
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
  currentPage: HelmPageId
  setCurrentPage: (page: HelmPageId) => void
}): JSX.Element {
  return (
    <>
      <aside className="shell-nav hidden xl:flex shrink-0 flex-col p-2">
        <div className="px-2 pb-2">
          <div className="shell-page-kicker text-[9px] uppercase tracking-[0.14em]">
            Navigation
          </div>
        </div>
        <div className="chrome-ribbed mx-2" />
        <nav className="pt-2 space-y-1.5 px-1">
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

function PageContent({ currentPage }: { currentPage: HelmPageId }): JSX.Element {
  switch (currentPage) {
    case 'bridge':   return <BridgePage />
    case 'fleet':    return <FleetPage />
    case 'swarm':    return <SwarmPage />
    case 'grid':     return <GridPage />
    case 'ai':       return <AIPage />
    case 'radio':    return <RadioPage />
    case 'logs':     return <LogsPage />
    default:         return <BridgePage />
  }
}

function App(): JSX.Element {
  const activeSkin = useSkinStore((s) => s.activeSkin)
  const state = useSystemStore((s) => s.state)
  const initialize = useSystemStore((s) => s.initialize)
  const currentPage = useNavigationStore((s) => s.currentPage)
  const setCurrentPage = useNavigationStore((s) => s.setCurrentPage)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [skinOpen, setSkinOpen] = useState(false)

  useEffect(() => {
    initialize()
    getAudioElement()
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
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && (event.key === 's' || event.key === 'S')) {
        event.preventDefault()
        setSkinOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  if (!state) {
    return (
      <div
        className="helm-shell shell-loading flex items-center justify-center h-screen"
        data-skin={activeSkin}
      >
        <div className="text-center">
          <div className="mb-2 text-2xl font-semibold tracking-[0.28em] text-white">HELM</div>
          <div className="text-sm shell-subtle">Connecting to system monitors...</div>
        </div>
      </div>
    )
  }

  const activePageMeta = PAGES.find((page) => page.id === currentPage) || PAGES[0]

  return (
    <div
      className="helm-shell crt-grid h-screen flex flex-col overflow-hidden"
      data-skin={activeSkin}
    >
      <Header onOpenSkinSelector={() => setSkinOpen(true)} />

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
      {skinOpen && <SkinSelectorPanel onClose={() => setSkinOpen(false)} />}
    </div>
  )
}

export default App
