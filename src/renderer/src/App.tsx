import { useEffect } from 'react'
import { useSystemStore } from './stores/system'
import { WorkspacesPanel } from './panels/Workspaces'
import { AgentsPanel } from './panels/Agents'
import { PortsPanel } from './panels/Ports'
import { GitStatusPanel } from './panels/GitStatus'
import { LogsPanel } from './panels/Logs'
import { BriefingPanel } from './panels/Briefing'
import { NotificationsPanel } from './panels/Notifications'
import { NetworkPanel } from './panels/Network'
import { SecurityPanel } from './panels/Security'

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
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">{title}</h2>
      </div>
      <div className="p-4 flex-1 overflow-hidden">{children}</div>
    </div>
  )
}

function Header(): JSX.Element {
  const { state, refresh } = useSystemStore()
  return (
    <header className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-bold text-white tracking-tight">HYDRA</h1>
        <span className="text-xs text-gray-500">Mission Control</span>
      </div>
      <div className="flex items-center gap-6 text-sm">
        {state && (
          <>
            <div className="text-gray-400">
              CPU <span className="text-white font-mono">{state.cpu.usage.toFixed(1)}%</span>
            </div>
            <div className="text-gray-400">
              MEM{' '}
              <span className="text-white font-mono">{state.memory.usagePercent.toFixed(1)}%</span>
            </div>
            <div className="text-gray-400">
              <span className="text-white font-mono">{state.agents.length}</span> agents
            </div>
            <div className="text-gray-400">
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
      <main className="flex-1 p-4 grid grid-cols-2 grid-rows-[1fr_1fr_1fr_1fr_minmax(180px,1fr)] gap-4 overflow-hidden">
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
