import { useSystemStore } from '../stores/system'

export function PortsPanel(): JSX.Element {
  const state = useSystemStore((s) => s.state)
  if (!state) return <></>

  const listening = state.ports.filter((p) => p.state === 'LISTEN').sort((a, b) => a.port - b.port)

  if (listening.length === 0) {
    return <div className="text-gray-600 text-sm">No listening ports</div>
  }

  return (
    <div className="space-y-1 text-sm overflow-y-auto max-h-full">
      {listening.map((port) => (
        <div
          key={`${port.port}:${port.pid}`}
          className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-800/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="text-white font-mono font-bold">:{port.port}</span>
            <span className="text-gray-400">{port.process}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-600 text-xs">
              {port.address === '*' ? '0.0.0.0' : port.address}
            </span>
            <span className="text-gray-700 text-xs font-mono">PID {port.pid}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
