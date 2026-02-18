import { useEffect } from 'react'
import { useSystemStore } from './stores/system'
import { useTimeSeriesStore } from './stores/timeseries'
import { Sparkline } from './components/Sparkline'
import { WorkspacesPanel } from './panels/Workspaces'
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

const PANEL_DOTS: Record<string, string> = {
  'Command Center': 'bg-emerald-400',
  Workspaces: 'bg-blue-400',
  Agents: 'bg-amber-400',
  'Git Status': 'bg-purple-400',
  'AI Briefing': 'bg-cyan-400',
  Network: 'bg-green-400',
  'Staff of Gandalf': 'bg-red-400',
  Ports: 'bg-teal-400',
  Notifications: 'bg-orange-400',
  Logs: 'bg-gray-400',
  'Git History': 'bg-indigo-400'
}

const PANEL_ACCENT_HEX: Record<string, string> = {
  'Command Center': '#34d399',
  Workspaces: '#60a5fa',
  Agents: '#fbbf24',
  'Git Status': '#c084fc',
  'AI Briefing': '#22d3ee',
  Network: '#4ade80',
  'Staff of Gandalf': '#f87171',
  Ports: '#2dd4bf',
  Notifications: '#fb923c',
  Logs: '#9ca3af',
  'Git History': '#818cf8'
}

function Panel({
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
      className={`bg-gray-900 border border-gray-800/50 rounded-lg overflow-hidden shadow-lg shadow-black/20 hover:border-gray-700 transition-all duration-200 min-h-0 flex flex-col ${className}`}
    >
      <div className="px-4 py-2 border-b border-gray-800 flex items-center justify-between relative">
        <div className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full ${PANEL_DOTS[title] || 'bg-gray-600'}`} />
          <h2 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">{title}</h2>
        </div>
        <div
          className="absolute bottom-0 left-0 right-0 h-[2px]"
          style={{
            background: `linear-gradient(to right, transparent, ${accentColor}40, ${accentColor}, ${accentColor}40, transparent)`
          }}
        />
      </div>
      <div className="p-4 flex-1 overflow-hidden">{children}</div>
    </div>
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

  // Health dot: green < 50% CPU & MEM, yellow < 80%, red >= 80%
  let healthColor = 'bg-green-400'
  let healthGlow = 'shadow-green-400/50'
  if (cpuUsage >= 80 || memUsage >= 80) {
    healthColor = 'bg-red-400'
    healthGlow = 'shadow-red-400/50'
  } else if (cpuUsage >= 50 || memUsage >= 50) {
    healthColor = 'bg-amber-400'
    healthGlow = 'shadow-amber-400/50'
  }

  // Activity indicator: pulse if timestamp is < 5s old
  const isFresh = state ? Date.now() - state.timestamp < 5000 : false

  const netIn = state?.network?.totalBytesInPerSec ?? 0
  const netOut = state?.network?.totalBytesOutPerSec ?? 0

  return (
    <header className="bg-gray-900 px-6 py-3 flex items-center justify-between relative">
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
                <Sparkline
                  data={cpuHistory}
                  color="#4ade80"
                  filled={false}
                  width={96}
                  height={24}
                />
              </div>
              <span className="text-white font-mono text-xs tabular-nums">
                {cpuUsage.toFixed(0)}%
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-gray-400">
              <span className="text-xs">MEM</span>
              <div className="w-24 h-6">
                <Sparkline
                  data={memHistory}
                  color="#a78bfa"
                  filled={false}
                  width={96}
                  height={24}
                />
              </div>
              <span className="text-white font-mono text-xs tabular-nums">
                {memUsage.toFixed(0)}%
              </span>
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
              <span className="text-white font-mono tabular-nums">{state.agents.length}</span>{' '}
              agents
            </div>
            <div className="text-gray-400 text-xs">
              <span className="text-white font-mono tabular-nums">
                {state.ports.filter((p) => p.state === 'LISTEN').length}
              </span>{' '}
              ports
            </div>
          </>
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
      {/* Gradient bottom border */}
      <div
        className="absolute bottom-0 left-0 right-0 h-[1px]"
        style={{
          background:
            'linear-gradient(to right, transparent, #22d3ee30, #22d3ee, #22d3ee30, transparent)'
        }}
      />
    </header>
  )
}

function App(): JSX.Element {
  const { state, initialize } = useSystemStore()

  useEffect(() => {
    initialize()
  }, [initialize])

  if (!state) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950 text-gray-400">
        <div className="text-center">
          <div className="text-2xl font-bold text-white mb-2">HYDRA</div>
          <div className="text-sm">Connecting to system monitors...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Header />
      <main className="p-4 grid grid-cols-3 grid-rows-[auto_minmax(220px,auto)_minmax(220px,auto)_minmax(220px,auto)_minmax(220px,auto)_minmax(180px,auto)] gap-3">
        {/* Row 1: Scorecards strip */}
        <div className="col-span-3">
          <ScorecardsStrip />
        </div>

        {/* Row 2-3: Command Center (spans 2 cols, 2 rows), Git Status + Agents */}
        <Panel title="Command Center" className="col-span-2 row-span-2">
          <CommandCenterPanel />
        </Panel>
        <Panel title="Git Status">
          <GitStatusPanel />
        </Panel>

        {/* Row 3 (right column): Agents */}
        <Panel title="Agents">
          <AgentsPanel />
        </Panel>

        {/* Row 3: Network, Security (spans 2 rows), Ports */}
        <Panel title="Network">
          <NetworkPanel />
        </Panel>
        <Panel title="Staff of Gandalf" className="row-span-2">
          <SecurityPanel />
        </Panel>
        <Panel title="Ports">
          <PortsPanel />
        </Panel>

        {/* Row 4: Notifications, [Security continues], Briefing */}
        <Panel title="Notifications" className="flex flex-col">
          <NotificationsPanel />
        </Panel>
        <Panel title="AI Briefing">
          <BriefingPanel />
        </Panel>

        {/* Row 5: Git History (spans 2 cols) + empty */}
        <Panel title="Git History" className="col-span-3">
          <GitHistoryPanel />
        </Panel>

        {/* Row 6: Logs full width */}
        <Panel title="Logs" className="col-span-3 flex flex-col">
          <LogsPanel />
        </Panel>
      </main>
    </div>
  )
}

export default App
