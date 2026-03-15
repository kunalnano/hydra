import { useState, useEffect } from 'react'
import { Sparkline } from '../components/Sparkline'
import type { CCUsageState } from '../../../shared/types'

function formatTokens(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return `${n}`
}

function formatCost(usd: number): string {
  if (usd >= 100) return `$${Math.round(usd)}`
  if (usd >= 1) return `$${usd.toFixed(2)}`
  return `$${usd.toFixed(3)}`
}

function formatRelativeTime(value: string): string {
  if (!value) return 'unknown'
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) return value

  const deltaMs = Date.now() - parsed
  const deltaMinutes = Math.max(0, Math.round(deltaMs / 60000))
  if (deltaMinutes < 1) return 'just now'
  if (deltaMinutes < 60) return `${deltaMinutes}m ago`

  const deltaHours = Math.round(deltaMinutes / 60)
  if (deltaHours < 24) return `${deltaHours}h ago`

  const deltaDays = Math.round(deltaHours / 24)
  return `${deltaDays}d ago`
}

function formatTimestamp(value: string): string {
  if (!value) return 'unknown'
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) return value
  return new Date(parsed).toLocaleString()
}

function getSourceLabel(source: CCUsageState['source']): string {
  if (source === 'hybrid') return 'hybrid live'
  if (source === 'live-log') return 'live logs'
  return 'stats cache'
}

export function CCUsagePanel(): JSX.Element {
  const [usage, setUsage] = useState<CCUsageState | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)

  useEffect(() => {
    window.hydra.getCCUsage().then(setUsage)
    const unsub = window.hydra.onCCUsageUpdate(setUsage)
    return unsub
  }, [])

  const refreshLiveUsage = async (): Promise<void> => {
    setRefreshing(true)
    setRefreshError(null)
    try {
      const next = await window.hydra.refreshCCUsage()
      setUsage(next)
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : 'Live refresh failed')
    } finally {
      setRefreshing(false)
    }
  }

  if (!usage || !usage.available) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-6">
        <div className="text-gray-500 text-xs leading-relaxed">
          No Claude Code usage data yet. Hydra can read `~/.claude/stats-cache.json` and rescan raw session logs.
        </div>
        <button
          onClick={() => {
            void refreshLiveUsage()
          }}
          disabled={refreshing}
          className="px-3 py-1.5 text-xs rounded bg-cyan-700 hover:bg-cyan-600 disabled:bg-gray-700 disabled:text-gray-500 text-white transition-colors font-medium"
        >
          {refreshing ? 'Scanning Logs...' : 'Refresh Live'}
        </button>
        {refreshError && <div className="text-[10px] text-rose-400">{refreshError}</div>}
      </div>
    )
  }

  const sparkData = usage.last7Days.map((d) => d.messages)

  return (
    <div className="h-full flex flex-col text-sm space-y-3 overflow-y-auto">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-cyan-500/30 bg-cyan-950/40 px-2 py-1 text-[10px] uppercase tracking-[0.22em] text-cyan-300">
            {getSourceLabel(usage.source)}
          </span>
          {usage.cacheStale && usage.cacheUpdated && (
            <span className="rounded-full border border-amber-500/30 bg-amber-950/30 px-2 py-1 text-[10px] uppercase tracking-[0.22em] text-amber-300">
              cache stale: {usage.cacheUpdated}
            </span>
          )}
          {usage.liveDeltaCostUSD > 0 && (
            <span className="rounded-full border border-emerald-500/30 bg-emerald-950/30 px-2 py-1 text-[10px] uppercase tracking-[0.22em] text-emerald-300">
              +{formatCost(usage.liveDeltaCostUSD)} live
            </span>
          )}
        </div>
        <button
          onClick={() => {
            void refreshLiveUsage()
          }}
          disabled={refreshing}
          className="px-3 py-1.5 text-[11px] rounded bg-cyan-700 hover:bg-cyan-600 disabled:bg-gray-700 disabled:text-gray-500 text-white transition-colors font-medium whitespace-nowrap"
        >
          {refreshing ? 'Scanning Logs...' : 'Refresh Live'}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <StatBox label="Today Msgs" value={`${usage.todayMessages.toLocaleString()}`} />
        <StatBox label="Today Sessions" value={`${usage.todaySessions}`} />
        <StatBox label="Today Tools" value={`${usage.todayToolCalls.toLocaleString()}`} />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <StatBox label="Month Msgs" value={`${usage.monthMessages.toLocaleString()}`} />
        <StatBox label="Month Sessions" value={`${usage.monthSessions}`} />
        <StatBox label="Month Tokens" value={formatTokens(usage.monthTokens)} />
      </div>

      <div className="space-y-1">
        <div className="text-gray-500 text-xs uppercase tracking-wider">Cost Estimate (All Time)</div>
        {usage.modelBreakdown.map((model) => (
          <div key={model.model} className="flex items-center justify-between text-xs">
            <span className="text-gray-400 truncate mr-2">{model.model}</span>
            <div className="flex gap-3 text-gray-300 font-mono tabular-nums shrink-0">
              <span title="Input tokens">{formatTokens(model.inputTokens)} in</span>
              <span title="Output tokens">{formatTokens(model.outputTokens)} out</span>
              <span className="text-amber-400" title="Estimated cost">
                {formatCost(model.costUSD)}
              </span>
            </div>
          </div>
        ))}
        <div className="flex justify-between text-xs pt-1 border-t border-gray-800">
          <span className="text-gray-500">Total estimated</span>
          <span className="text-amber-400 font-mono font-semibold">{formatCost(usage.totalCostUSD)}</span>
        </div>
      </div>

      {sparkData.length > 1 && (
        <div className="space-y-1">
          <div className="text-gray-500 text-xs uppercase tracking-wider">Last 7 Days (messages)</div>
          <div className="h-10">
            <Sparkline data={sparkData} color="#22d3ee" filled width={280} height={40} />
          </div>
          <div className="flex justify-between text-[10px] text-gray-600 font-mono">
            <span>{usage.last7Days[0]?.date.slice(5)}</span>
            <span>{usage.last7Days[usage.last7Days.length - 1]?.date.slice(5)}</span>
          </div>
        </div>
      )}

      <div className="text-[10px] text-gray-700 pt-1 space-y-1">
        <div>
          All-time: {usage.totalSessions.toLocaleString()} sessions, {usage.totalMessages.toLocaleString()} messages
        </div>
        <div>
          Updated: {formatTimestamp(usage.lastUpdated)}
          {usage.liveLastActivity && <span> &middot; Live pulse {formatRelativeTime(usage.liveLastActivity)}</span>}
        </div>
        {usage.cacheUpdated && usage.source !== 'stats-cache' && (
          <div>Baseline cache snapshot: {usage.cacheUpdated}</div>
        )}
        {refreshError && <div className="text-rose-400">{refreshError}</div>}
      </div>
    </div>
  )
}

function StatBox({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="bg-gray-800/50 rounded px-2 py-1.5">
      <div className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</div>
      <div className="text-sm text-white font-mono tabular-nums">{value}</div>
    </div>
  )
}
