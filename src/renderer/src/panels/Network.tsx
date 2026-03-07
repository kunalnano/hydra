import { useState, useEffect } from 'react'
import type { NetworkState, NetworkProcess, FirewallState } from '../../../shared/types'
import { useTimeSeriesStore } from '../stores/timeseries'
import { Sparkline } from '../components/Sparkline'

function formatRate(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)} B/s`
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
}

type FirewallMatch = 'allow' | 'block' | 'unknown'

function getFirewallStatus(processName: string, rules: FirewallState['rules']): FirewallMatch {
  const normalized = processName.toLowerCase()
  for (const rule of rules) {
    const ruleName = rule.name.toLowerCase()
    if (normalized.includes(ruleName) || ruleName.includes(normalized)) {
      return rule.action
    }
  }
  return 'unknown'
}

const FIREWALL_DOT: Record<FirewallMatch, string> = {
  allow: 'bg-green-400',
  block: 'bg-red-400',
  unknown: 'bg-gray-600'
}

export function NetworkPanel(): JSX.Element {
  const [networkState, setNetworkState] = useState<NetworkState | null>(null)
  const [firewallState, setFirewallState] = useState<FirewallState | null>(null)
  const [processHistory, setProcessHistory] = useState<Record<number, number[]>>({})

  const { netInHistory, netOutHistory } = useTimeSeriesStore()

  useEffect(() => {
    const unsub = window.hydra.onNetworkState((state) => {
      setNetworkState(state)
      setProcessHistory((prev) => {
        const next = { ...prev }
        for (const proc of state.processes) {
          const total = proc.bytesInPerSec + proc.bytesOutPerSec
          const existing = next[proc.pid] || []
          next[proc.pid] = [...existing, total].slice(-30)
        }
        return next
      })
    })

    window.hydra.getFirewallRules().then(setFirewallState)

    return unsub
  }, [])

  if (!networkState) {
    return <div className="text-gray-600 text-sm">Monitoring network activity...</div>
  }

  if (networkState.error) {
    return (
      <div className="text-sm space-y-2">
        <div className="text-amber-400 text-xs px-2 py-1.5 rounded bg-amber-950/30 border border-amber-900">
          {networkState.error}
        </div>
        <div className="text-gray-600 text-xs px-2">
          Network monitoring requires nettop access on macOS.
        </div>
      </div>
    )
  }

  const sortedProcesses = [...networkState.processes].sort(
    (a, b) => b.bytesInPerSec + b.bytesOutPerSec - (a.bytesInPerSec + a.bytesOutPerSec)
  )

  // Negative PIDs = netstat interface-level fallback
  const isInterfaceMode = sortedProcesses.some((p) => p.pid < 0)
  const firewallRules = firewallState?.rules ?? []

  return (
    <div className="space-y-2 text-sm overflow-y-auto max-h-full">
      {/* Bandwidth sparkline chart */}
      <div className="mb-2">
        <div className="relative h-12 w-full rounded bg-gray-800/30 overflow-hidden">
          <div className="absolute inset-0">
            <Sparkline data={netInHistory} color="#4ade80" filled={true} width={400} height={48} />
          </div>
          <div className="absolute inset-0">
            <Sparkline data={netOutHistory} color="#60a5fa" filled={true} width={400} height={48} />
          </div>
        </div>
        <div className="flex items-center gap-4 px-1 pt-1 text-[10px] text-gray-500">
          <span>
            <span className="text-green-400">&#9660;</span>{' '}
            {formatRate(networkState.totalBytesInPerSec)} down
          </span>
          <span>
            <span className="text-blue-400">&#9650;</span>{' '}
            {formatRate(networkState.totalBytesOutPerSec)} up
          </span>
        </div>
      </div>

      {isInterfaceMode && (
        <div className="text-[10px] text-gray-600 px-1">
          Interface mode (netstat) — nettop unavailable
        </div>
      )}

      {/* Process list */}
      <div className="space-y-px">
        {sortedProcesses.map((proc) => (
          <ProcessRow
            key={proc.pid}
            proc={proc}
            firewallMatch={getFirewallStatus(proc.name, firewallRules)}
            history={processHistory[proc.pid] || []}
            isInterface={proc.pid < 0}
          />
        ))}
        {sortedProcesses.length === 0 && (
          <div className="text-gray-600 text-xs px-2">No active network processes</div>
        )}
      </div>
    </div>
  )
}

function ProcessRow({
  proc,
  firewallMatch,
  history,
  isInterface = false
}: {
  proc: NetworkProcess
  firewallMatch: FirewallMatch
  history: number[]
  isInterface?: boolean
}): JSX.Element {
  return (
    <div className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-800/50 border border-transparent transition-colors">
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={`w-2 h-2 rounded-full ${isInterface ? 'bg-cyan-400' : FIREWALL_DOT[firewallMatch]} shrink-0`}
          title={isInterface ? `Interface: ${proc.name}` : `Firewall: ${firewallMatch}`}
        />
        <span className="text-white truncate max-w-[140px]" title={proc.name}>
          {proc.name}
        </span>
        {!isInterface && (
          <span className="text-gray-700 text-xs font-mono shrink-0">PID {proc.pid}</span>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0 ml-2">
        {history.length > 1 && (
          <div className="w-16 h-4 shrink-0">
            <Sparkline data={history} color="#6b7280" filled={false} width={64} height={16} />
          </div>
        )}
        <span className="text-green-400 text-xs font-mono w-20 text-right">
          &#9660; {formatRate(proc.bytesInPerSec)}
        </span>
        <span className="text-blue-400 text-xs font-mono w-20 text-right">
          &#9650; {formatRate(proc.bytesOutPerSec)}
        </span>
      </div>
    </div>
  )
}
