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

export function CCUsagePanel(): JSX.Element {
  const [usage, setUsage] = useState<CCUsageState | null>(null)

  useEffect(() => {
    window.hydra.getCCUsage().then(setUsage)
    const unsub = window.hydra.onCCUsageUpdate(setUsage)
    return unsub
  }, [])

  if (!usage || !usage.available) {
    return (
      <div className="h-full flex items-center justify-center text-gray-600 text-xs">
        No usage data found — ~/.claude/stats-cache.json missing
      </div>
    )
  }

  const sparkData = usage.last7Days.map((d) => d.messages)

  return (
    <div className="h-full flex flex-col text-sm space-y-3 overflow-y-auto">
      {/* Today row */}
      <div className="grid grid-cols-3 gap-2">
        <StatBox label="Today Msgs" value={`${usage.todayMessages.toLocaleString()}`} />
        <StatBox label="Today Sessions" value={`${usage.todaySessions}`} />
        <StatBox label="Today Tools" value={`${usage.todayToolCalls.toLocaleString()}`} />
      </div>

      {/* Month + totals */}
      <div className="grid grid-cols-3 gap-2">
        <StatBox label="Month Msgs" value={`${usage.monthMessages.toLocaleString()}`} />
        <StatBox label="Month Sessions" value={`${usage.monthSessions}`} />
        <StatBox label="Month Tokens" value={formatTokens(usage.monthTokens)} />
      </div>

      {/* Cost breakdown by model */}
      <div className="space-y-1">
        <div className="text-gray-500 text-xs uppercase tracking-wider">Cost Estimate (All Time)</div>
        {usage.modelBreakdown.map((m) => (
          <div key={m.model} className="flex items-center justify-between text-xs">
            <span className="text-gray-400 truncate mr-2">{m.model}</span>
            <div className="flex gap-3 text-gray-300 font-mono tabular-nums shrink-0">
              <span title="Input tokens">{formatTokens(m.inputTokens)} in</span>
              <span title="Output tokens">{formatTokens(m.outputTokens)} out</span>
              <span className="text-amber-400" title="Estimated cost">{formatCost(m.costUSD)}</span>
            </div>
          </div>
        ))}
        <div className="flex justify-between text-xs pt-1 border-t border-gray-800">
          <span className="text-gray-500">Total estimated</span>
          <span className="text-amber-400 font-mono font-semibold">{formatCost(usage.totalCostUSD)}</span>
        </div>
      </div>

      {/* 7-day sparkline */}
      {sparkData.length > 1 && (
        <div className="space-y-1">
          <div className="text-gray-500 text-xs uppercase tracking-wider">Last 7 Days (messages)</div>
          <div className="h-10">
            <Sparkline data={sparkData} color="#a78bfa" filled width={280} height={40} />
          </div>
          <div className="flex justify-between text-[10px] text-gray-600 font-mono">
            <span>{usage.last7Days[0]?.date.slice(5)}</span>
            <span>{usage.last7Days[usage.last7Days.length - 1]?.date.slice(5)}</span>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="text-[10px] text-gray-700 pt-1">
        All-time: {usage.totalSessions.toLocaleString()} sessions, {usage.totalMessages.toLocaleString()} messages
        {usage.lastUpdated && <span> &middot; Cache: {usage.lastUpdated}</span>}
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
