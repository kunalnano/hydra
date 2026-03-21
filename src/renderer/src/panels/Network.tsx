import { useEffect, useMemo, useState } from 'react'
import type {
  FirewallState,
  NetworkConnection,
  NetworkProcess,
  NetworkScope,
  NetworkState
} from '../../../shared/types'
import { NetworkTrafficGrid, type NetworkGridPeer } from '../components/NetworkTrafficGrid'
import { Sparkline } from '../components/Sparkline'
import { redactSensitiveText, usePrivacyStore } from '../stores/privacy'
import { useTimeSeriesStore } from '../stores/timeseries'

function formatRate(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)} B/s`
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
}

function normalizePeerLabel(address: string): string {
  const normalized = address.replace(/^::ffff:/, '')
  if (normalized === '::1' || normalized.startsWith('127.')) return 'localhost'
  return normalized
}

function formatPortList(ports: number[]): string {
  if (!ports.length) return 'none'
  return ports.slice(0, 4).map((port) => `:${port}`).join(' ')
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

const SCOPE_ACCENT: Record<NetworkScope, string> = {
  loopback: 'bg-amber-400/20 text-amber-200 border-amber-300/20',
  lan: 'bg-teal-400/20 text-teal-200 border-teal-300/20',
  internet: 'bg-blue-400/20 text-blue-200 border-blue-300/20',
  unknown: 'bg-slate-400/20 text-slate-200 border-slate-300/20'
}

const SCOPE_LABEL: Record<NetworkScope, string> = {
  loopback: 'Loopback',
  lan: 'LAN',
  internet: 'Internet',
  unknown: 'Unknown'
}

interface PeerContributor {
  name: string
  pid: number
  bytesInPerSec: number
  bytesOutPerSec: number
  localPorts: number[]
}

interface PeerGroup extends NetworkGridPeer {
  remoteAddress: string
  remotePorts: number[]
  localPorts: number[]
  contributors: PeerContributor[]
}

function buildPeerGroups(connections: NetworkConnection[]): PeerGroup[] {
  const groups = new Map<
    string,
    PeerGroup & {
      contributorMap: Map<number, PeerContributor>
      remotePortSet: Set<number>
      localPortSet: Set<number>
    }
  >()

  for (const connection of connections) {
    const label = normalizePeerLabel(connection.remoteAddress)
    const key = `${connection.scope}|${label}`
    let group = groups.get(key)

    if (!group) {
      group = {
        id: key,
        label,
        scope: connection.scope,
        bytesInPerSec: 0,
        bytesOutPerSec: 0,
        connectionCount: 0,
        remoteAddress: label,
        remotePorts: [],
        localPorts: [],
        contributors: [],
        contributorMap: new Map(),
        remotePortSet: new Set(),
        localPortSet: new Set()
      }
      groups.set(key, group)
    }

    group.bytesInPerSec += connection.bytesInPerSec
    group.bytesOutPerSec += connection.bytesOutPerSec
    group.connectionCount += 1

    if (connection.remotePort !== null) group.remotePortSet.add(connection.remotePort)
    if (connection.localPort !== null) group.localPortSet.add(connection.localPort)

    let contributor = group.contributorMap.get(connection.pid)
    if (!contributor) {
      contributor = {
        name: connection.processName,
        pid: connection.pid,
        bytesInPerSec: 0,
        bytesOutPerSec: 0,
        localPorts: []
      }
      group.contributorMap.set(connection.pid, contributor)
    }

    contributor.bytesInPerSec += connection.bytesInPerSec
    contributor.bytesOutPerSec += connection.bytesOutPerSec
    if (connection.localPort !== null && !contributor.localPorts.includes(connection.localPort)) {
      contributor.localPorts.push(connection.localPort)
    }
  }

  return Array.from(groups.values())
    .map((group) => ({
      id: group.id,
      label: group.label,
      scope: group.scope,
      bytesInPerSec: group.bytesInPerSec,
      bytesOutPerSec: group.bytesOutPerSec,
      connectionCount: group.connectionCount,
      remoteAddress: group.remoteAddress,
      remotePorts: Array.from(group.remotePortSet).sort((left, right) => left - right),
      localPorts: Array.from(group.localPortSet).sort((left, right) => left - right),
      contributors: Array.from(group.contributorMap.values())
        .sort(
          (left, right) =>
            right.bytesInPerSec +
            right.bytesOutPerSec -
            (left.bytesInPerSec + left.bytesOutPerSec)
        )
        .slice(0, 4)
    }))
    .sort(
      (left, right) =>
        right.bytesInPerSec + right.bytesOutPerSec - (left.bytesInPerSec + left.bytesOutPerSec)
    )
}

export function NetworkPanel(): JSX.Element {
  const [networkState, setNetworkState] = useState<NetworkState | null>(null)
  const [firewallState, setFirewallState] = useState<FirewallState | null>(null)
  const [processHistory, setProcessHistory] = useState<Record<number, number[]>>({})
  const [peerHistory, setPeerHistory] = useState<Record<string, number[]>>({})
  const [selectedPeerId, setSelectedPeerId] = useState<string | null>(null)
  const privacyMode = usePrivacyStore((store) => store.privacyMode)

  const { netInHistory, netOutHistory } = useTimeSeriesStore()

  useEffect(() => {
    const unsub = window.helm.onNetworkState((state) => {
      setNetworkState(state)

      setProcessHistory((previous) => {
        const next = { ...previous }
        for (const proc of state.processes) {
          const total = proc.bytesInPerSec + proc.bytesOutPerSec
          next[proc.pid] = [...(next[proc.pid] || []), total].slice(-30)
        }
        return next
      })

      const peers = buildPeerGroups(state.connections).slice(0, 10)
      setPeerHistory((previous) => {
        const next = { ...previous }
        for (const peer of peers) {
          const total = peer.bytesInPerSec + peer.bytesOutPerSec
          next[peer.id] = [...(next[peer.id] || []), total].slice(-30)
        }
        return next
      })
    })

    window.helm.getFirewallRules().then(setFirewallState)

    return unsub
  }, [])

  const peerGroups = useMemo(
    () => (networkState ? buildPeerGroups(networkState.connections).slice(0, 10) : []),
    [networkState]
  )
  const displayPeers = useMemo(
    () =>
      peerGroups.map((peer) => ({
        ...peer,
        label: privacyMode ? redactSensitiveText(peer.label) : peer.label
      })),
    [peerGroups, privacyMode]
  )

  useEffect(() => {
    if (!peerGroups.length) {
      setSelectedPeerId(null)
      return
    }

    if (!selectedPeerId || !peerGroups.some((peer) => peer.id === selectedPeerId)) {
      setSelectedPeerId(peerGroups[0].id)
    }
  }, [peerGroups, selectedPeerId])

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
    (left, right) =>
      right.bytesInPerSec + right.bytesOutPerSec - (left.bytesInPerSec + left.bytesOutPerSec)
  )

  const firewallRules = firewallState?.rules ?? []
  const isInterfaceMode =
    networkState.sourceMode === 'netstat' || sortedProcesses.some((proc) => proc.pid < 0)
  const showTopology = !isInterfaceMode && peerGroups.length > 0
  const selectedPeer = peerGroups.find((peer) => peer.id === selectedPeerId) ?? null
  const selectedPeerLabel = selectedPeer
    ? privacyMode
      ? redactSensitiveText(selectedPeer.label)
      : selectedPeer.label
    : null

  return (
    <div className="space-y-3 text-sm overflow-y-auto max-h-full pr-1">
      <div className="space-y-2">
        <div className="relative h-12 w-full rounded-lg bg-gray-900/55 overflow-hidden border border-white/5">
          <div className="absolute inset-0">
            <Sparkline data={netInHistory} color="#34d399" filled={true} width={400} height={48} />
          </div>
          <div className="absolute inset-0">
            <Sparkline data={netOutHistory} color="#60a5fa" filled={true} width={400} height={48} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4 px-1 text-[10px] text-gray-500 uppercase tracking-[0.2em]">
          <span>
            <span className="text-green-400">&#9660;</span> {formatRate(networkState.totalBytesInPerSec)} down
          </span>
          <span>
            <span className="text-blue-400">&#9650;</span> {formatRate(networkState.totalBytesOutPerSec)} up
          </span>
          <span>{networkState.sourceMode}</span>
          {showTopology ? <span>{peerGroups.length} peers</span> : <span>{sortedProcesses.length} processes</span>}
        </div>
      </div>

      {showTopology ? (
        <div className="space-y-3">
          <NetworkTrafficGrid
            peers={displayPeers}
            selectedPeerId={selectedPeerId}
            onSelect={setSelectedPeerId}
          />

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div className="space-y-1.5">
              {displayPeers.map((peer) => (
                <button
                  key={peer.id}
                  type="button"
                  onClick={() => setSelectedPeerId(peer.id)}
                  className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors ${
                    peer.id === selectedPeerId
                      ? 'border-white/18 bg-white/8'
                      : 'border-white/5 bg-black/20 hover:border-white/12 hover:bg-white/4'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-white font-medium">{peer.label}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] ${SCOPE_ACCENT[peer.scope]}`}>
                        {SCOPE_LABEL[peer.scope]}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-white/45">
                      {peer.connectionCount} flows · remote {formatPortList(peer.remotePorts)}
                    </div>
                  </div>
                  <div className="ml-3 flex items-center gap-3 shrink-0">
                    {(peerHistory[peer.id] || []).length > 1 && (
                      <div className="h-5 w-16 shrink-0">
                        <Sparkline
                          data={peerHistory[peer.id] || []}
                          color="#94a3b8"
                          filled={false}
                          width={64}
                          height={20}
                        />
                      </div>
                    )}
                    <div className="text-right text-[11px] font-mono">
                      <div className="text-green-400">&#9660; {formatRate(peer.bytesInPerSec)}</div>
                      <div className="text-blue-400">&#9650; {formatRate(peer.bytesOutPerSec)}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <div className="rounded-xl border border-white/8 bg-slate-950/60 p-3">
              {selectedPeer ? (
                <div className="space-y-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.24em] text-white/45">
                      Selected Peer
                    </div>
                    <div className="mt-1 text-white font-semibold">{selectedPeerLabel}</div>
                    <div className="mt-1 text-xs text-white/45">
                      {SCOPE_LABEL[selectedPeer.scope]} scope · {selectedPeer.connectionCount} active flows
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <MetricTile label="Inbound" value={formatRate(selectedPeer.bytesInPerSec)} tone="green" />
                    <MetricTile label="Outbound" value={formatRate(selectedPeer.bytesOutPerSec)} tone="blue" />
                    <MetricTile label="Remote Ports" value={formatPortList(selectedPeer.remotePorts)} tone="neutral" />
                    <MetricTile label="Local Ports" value={formatPortList(selectedPeer.localPorts)} tone="neutral" />
                  </div>

                  <div>
                    <div className="text-[10px] uppercase tracking-[0.24em] text-white/45">
                      Top Contributors
                    </div>
                    <div className="mt-2 space-y-2">
                      {selectedPeer.contributors.map((contributor) => (
                        <div key={contributor.pid} className="rounded-lg border border-white/6 bg-black/20 px-2 py-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-[12px] text-white/80">{contributor.name}</span>
                            <span className="text-[10px] font-mono text-white/35">PID {contributor.pid}</span>
                          </div>
                          <div className="mt-1 flex items-center justify-between text-[10px] font-mono">
                            <span className="text-green-400">&#9660; {formatRate(contributor.bytesInPerSec)}</span>
                            <span className="text-blue-400">&#9650; {formatRate(contributor.bytesOutPerSec)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-white/45">No peer selected.</div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <>
          {isInterfaceMode && (
            <div className="text-[10px] text-gray-500 px-1 uppercase tracking-[0.18em]">
              Interface mode — peer topology unavailable, showing transport surfaces instead
            </div>
          )}

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
        </>
      )}
    </div>
  )
}

function MetricTile({
  label,
  value,
  tone
}: {
  label: string
  value: string
  tone: 'green' | 'blue' | 'neutral'
}): JSX.Element {
  const toneClasses =
    tone === 'green'
      ? 'border-green-400/10 bg-green-400/8 text-green-200'
      : tone === 'blue'
        ? 'border-blue-400/10 bg-blue-400/8 text-blue-200'
        : 'border-white/6 bg-white/[0.03] text-white/80'

  return (
    <div className={`rounded-lg border px-2 py-1.5 ${toneClasses}`}>
      <div className="text-[10px] uppercase tracking-[0.18em] text-white/45">{label}</div>
      <div className="mt-1 text-[12px] font-mono">{value}</div>
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
