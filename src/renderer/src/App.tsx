import { useEffect, useState } from 'react'
import {
  Panel as ResizablePanel,
  Group as PanelGroup,
  Separator as PanelResizeHandle
} from 'react-resizable-panels'
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
  children: React.ReactNode
  className?: string
}): JSX.Element {
  const accentColor = PANEL_ACCENT_HEX[title] || '#6b7280'

  return (
    <div
      className={`bg-gray-900 border border-gray-800/50 rounded-lg overflow-hidden shadow-lg shadow-black/20 hover:border-gray-700 transition-all duration-200 min-h-0 flex flex-col h-full ${className}`}
    >
      <div className="px-4 py-2 border-b border-gray-800 flex items-center justify-between relative shrink-0">
        <div className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full panel-dot-live ${PANEL_DOTS[title] || 'bg-gray-600'}`} />
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
    </div>
  )
}

function ResizeHandle({ direction = 'horizontal' }: { direction?: 'horizontal' | 'vertical' }): JSX.Element {
  const isVertical = direction === 'vertical'
  return (
    <PanelResizeHandle
      className={`group relative flex items-center justify-center ${isVertical ? 'h-2 cursor-row-resize' : 'w-2 cursor-col-resize'}`}
    >
      <div
        className={`${isVertical ? 'h-[1px] w-8' : 'w-[1px] h-8'} bg-gray-800 group-hover:bg-cyan-600 group-active:bg-cyan-400 transition-colors`}
      />
    </PanelResizeHandle>
  )
}

function formatBytes(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${Math.round(bytesPerSec)} B/s`
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
}

function Header(): JSX.Element {
  const { state, refresh } = useSystemStore()
  const { cpuHistory, memHistory, netInHistory, netOutHistory } = useTimeSeriesStore()

  const cpuUsage = state?.cpu.usage ?? 0
  const memUsage = state?.memory.usagePercent ?? 0

  let healthColor = 'bg-green-400'
  let healthGlow = 'shadow-green-400/50'
  if (cpuUsage >= 80 || memUsage >= 80) {
    healthColor = 'bg-red-400'
    healthGlow = 'shadow-red-400/50'
  } else if (cpuUsage >= 50 || memUsage >= 50) {
    healthColor = 'bg-amber-400'
    healthGlow = 'shadow-amber-400/50'
  }

  const isFresh = state ? Date.now() - state.timestamp < 5000 : false
  const netIn = state?.network?.totalBytesInPerSec ?? 0
  const netOut = state?.network?.totalBytesOutPerSec ?? 0

  return (
    <header className="bg-gray-900 px-6 py-3 flex items-center justify-between relative shrink-0">
      <div className="flex items-center gap-3">
        <div className={`w-2.5 h-2.5 rounded-full ${healthColor} shadow-md ${healthGlow}`} />
        <h1 className="text-lg font-bold text-white tracking-tight">HYDRA</h1>
        <span className="text-xs text-gray-500">Mission Control</span>
      </div>
      <div className="flex items-center gap-5 text-sm">
        {state && (
          <>
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
                  data={netInHistory.map((v, i) => v + (netOutHistory[i] ?? 0))}
                  color="#60a5fa"
                  filled={false}
                  width={48}
                  height={24}
                />
              </div>
            </div>
            <div className="text-gray-400 text-xs">
              <span className="text-white font-mono tabular-nums">{state.agents.length}</span> agents
            </div>
            <div className="text-gray-400 text-xs">
              <span className="text-white font-mono tabular-nums">
                {state.ports.filter((p) => p.state === 'LISTEN').length}
              </span>{' '}
              ports
            </div>
          </>
        )}
        {state?.isLateNight && (
          <div className="flex items-center gap-1 text-gray-500" title="Late night mode — non-critical alerts suppressed">
            <svg className="w-4 h-4 text-indigo-400" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 0 1-4.4 2.26 5.403 5.403 0 0 1-3.14-9.8c-.44-.06-.9-.1-1.36-.1z" />
            </svg>
            <span className="text-[10px] uppercase tracking-wider">Night</span>
          </div>
        )}
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
      <div
        className="absolute bottom-0 left-0 right-0 h-[1px]"
        style={{
          background: 'linear-gradient(to right, transparent, #22d3ee30, #22d3ee, #22d3ee30, transparent)'
        }}
      />
    </header>
  )
}

function App(): JSX.Element {
  const { state, initialize } = useSystemStore()
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => {
    initialize()
  }, [initialize])

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
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

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-white crt-grid overflow-hidden">
      <Header />

      {/* Fixed scorecards strip */}
      <div className="shrink-0 px-4 pt-3">
        <ScorecardsStrip />
      </div>
      <div className="shrink-0 px-4 pt-2">
        <SessionDeltaBanner />
      </div>

      {/* Resizable panel area */}
      <div className="flex-1 min-h-0 p-3 h-full">
        <PanelGroup orientation="vertical" id="hydra-rows" style={{ height: '100%' }}>
          {/* Row 1: Command Center (2/3) | Git Status + Agents (1/3) */}
          <ResizablePanel defaultSize={35} minSize={15}>
            <PanelGroup orientation="horizontal" id="hydra-row1">
              <ResizablePanel defaultSize={66} minSize={30}>
                <DashPanel title="Command Center">
                  <CommandCenterPanel />
                </DashPanel>
              </ResizablePanel>
              <ResizeHandle />
              <ResizablePanel defaultSize={34} minSize={20}>
                <PanelGroup orientation="vertical" id="hydra-row1-right">
                  <ResizablePanel defaultSize={50} minSize={20}>
                    <DashPanel title="Git Status">
                      <GitStatusPanel />
                    </DashPanel>
                  </ResizablePanel>
                  <ResizeHandle direction="vertical" />
                  <ResizablePanel defaultSize={50} minSize={20}>
                    <DashPanel title="Agents">
                      <AgentsPanel />
                    </DashPanel>
                  </ResizablePanel>
                </PanelGroup>
              </ResizablePanel>
            </PanelGroup>
          </ResizablePanel>

          <ResizeHandle direction="vertical" />

          {/* Row 2: Network | Security | Ports */}
          <ResizablePanel defaultSize={25} minSize={10}>
            <PanelGroup orientation="horizontal" id="hydra-row2">
              <ResizablePanel defaultSize={33} minSize={15}>
                <DashPanel title="Network">
                  <NetworkPanel />
                </DashPanel>
              </ResizablePanel>
              <ResizeHandle />
              <ResizablePanel defaultSize={34} minSize={15}>
                <DashPanel title="Staff of Gandalf">
                  <SecurityPanel />
                </DashPanel>
              </ResizablePanel>
              <ResizeHandle />
              <ResizablePanel defaultSize={33} minSize={15}>
                <PanelGroup orientation="vertical" id="hydra-row2-right">
                  <ResizablePanel defaultSize={50} minSize={20}>
                    <DashPanel title="Ports">
                      <PortsPanel />
                    </DashPanel>
                  </ResizablePanel>
                  <ResizeHandle direction="vertical" />
                  <ResizablePanel defaultSize={50} minSize={20}>
                    <DashPanel title="Notifications">
                      <NotificationsPanel />
                    </DashPanel>
                  </ResizablePanel>
                </PanelGroup>
              </ResizablePanel>
            </PanelGroup>
          </ResizablePanel>

          <ResizeHandle direction="vertical" />

          {/* Row 3: AI Briefing | CC Usage | Git History | Timeline */}
          <ResizablePanel defaultSize={25} minSize={10}>
            <PanelGroup orientation="horizontal" id="hydra-row3">
              <ResizablePanel defaultSize={25} minSize={15}>
                <DashPanel title="Local AI (LM Studio)">
                  <BriefingPanel />
                </DashPanel>
              </ResizablePanel>
              <ResizeHandle />
              <ResizablePanel defaultSize={25} minSize={15}>
                <DashPanel title="CC Usage">
                  <CCUsagePanel />
                </DashPanel>
              </ResizablePanel>
              <ResizeHandle />
              <ResizablePanel defaultSize={25} minSize={15}>
                <DashPanel title="Git History">
                  <GitHistoryPanel />
                </DashPanel>
              </ResizablePanel>
              <ResizeHandle />
              <ResizablePanel defaultSize={25} minSize={15}>
                <DashPanel title="Timeline">
                  <TimelinePanel />
                </DashPanel>
              </ResizablePanel>
            </PanelGroup>
          </ResizablePanel>

          <ResizeHandle direction="vertical" />

          {/* Row 4: Logs full width */}
          <ResizablePanel defaultSize={15} minSize={8}>
            <DashPanel title="Logs">
              <LogsPanel />
            </DashPanel>
          </ResizablePanel>
        </PanelGroup>
      </div>

      <CommandPalette isOpen={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  )
}

export default App
