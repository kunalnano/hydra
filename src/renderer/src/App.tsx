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

const PANEL_DOTS: Record<string, string> = {
  Workspaces: 'bg-blue-400',
  Agents: 'bg-amber-400',
  'Git Status': 'bg-purple-400',
  'AI Briefing': 'bg-cyan-400',
  Network: 'bg-green-400',
  Security: 'bg-red-400',
  Ports: 'bg-teal-400',
  Notifications: 'bg-orange-400',
  Logs: 'bg-gray-400'
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
  return (
    <div className={`bg-gray-900 border border-gray-800 rounded-lg overflow-hidden ${className}`}>
      <div className="px-4 py-2 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full ${PANEL_DOTS[title] || 'bg-gray-600'}`} />
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">{title}</h2>
        </div>
      </div>
      <div className="p-4 flex-1 overflow-hidden">{children}</div>
    </div>
  )
}

function Header(): JSX.Element {
  const { state, refresh } = useSystemStore()
  const { cpuHistory, memHistory } = useTimeSeriesStore()
  return (
    <header className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-bold text-white tracking-tight">HYDRA</h1>
        <span className="text-xs text-gray-500">Mission Control</span>
      </div>
      <div className="flex items-center gap-5 text-sm">
        {state && (
          <>
            <div className="flex items-center gap-1.5 text-gray-400">
              <span className="text-xs">CPU</span>
              <div className="w-16 h-4">
                <Sparkline
                  data={cpuHistory}
                  color="#4ade80"
                  filled={false}
                  width={64}
                  height={16}
                />
              </div>
              <span className="text-white font-mono text-xs">{state.cpu.usage.toFixed(0)}%</span>
            </div>
            <div className="flex items-center gap-1.5 text-gray-400">
              <span className="text-xs">MEM</span>
              <div className="w-16 h-4">
                <Sparkline
                  data={memHistory}
                  color="#a78bfa"
                  filled={false}
                  width={64}
                  height={16}
                />
              </div>
              <span className="text-white font-mono text-xs">
                {state.memory.usagePercent.toFixed(0)}%
              </span>
            </div>
            <div className="text-gray-400 text-xs">
              <span className="text-white font-mono">{state.agents.length}</span> agents
            </div>
            <div className="text-gray-400 text-xs">
              <span className="text-white font-mono">
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
          <span className="text-xs text-gray-600 font-mono">
            {new Date(state.timestamp).toLocaleTimeString()}
          </span>
        )}
      </div>
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
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <Header />
      <main className="flex-1 p-4 grid grid-cols-2 grid-rows-[auto_1fr_1fr_1fr_1fr_minmax(160px,1fr)] gap-4 overflow-hidden">
        <div className="col-span-2">
          <ScorecardsStrip />
        </div>
        <Panel title="Workspaces">
          <WorkspacesPanel />
        </Panel>
        <Panel title="Agents">
          <AgentsPanel />
        </Panel>
        <Panel title="Git Status">
          <GitStatusPanel />
        </Panel>
        <Panel title="AI Briefing">
          <BriefingPanel />
        </Panel>
        <Panel title="Network">
          <NetworkPanel />
        </Panel>
        <Panel title="Security">
          <SecurityPanel />
        </Panel>
        <Panel title="Ports">
          <PortsPanel />
        </Panel>
        <Panel title="Notifications" className="flex flex-col">
          <NotificationsPanel />
        </Panel>
        <Panel title="Logs" className="col-span-2 flex flex-col">
          <LogsPanel />
        </Panel>
      </main>
    </div>
  )
}

export default App
