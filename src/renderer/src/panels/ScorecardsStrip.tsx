import { useSystemStore } from '../stores/system'
import { useTimeSeriesStore } from '../stores/timeseries'
import { Scorecard, type ScorecardProps } from '../components/Scorecard'

function getAverage(history: number[]): number {
  if (history.length === 0) return 0
  return history.reduce((a, b) => a + b, 0) / history.length
}

type TrendDirection = 'up' | 'down' | 'flat'

/**
 * Compare current value to the average of timeseries history.
 * Returns direction + whether that direction is "good" or "bad"
 * based on the metric type.
 */
function getSmartTrend(
  history: number[],
  lowerIsBetter: boolean
): { direction: TrendDirection; sentiment: 'good' | 'bad' | 'neutral' } {
  if (history.length < 3) return { direction: 'flat', sentiment: 'neutral' }
  const current = history[history.length - 1]
  const avg = getAverage(history)
  const delta = current - avg
  const threshold = avg * 0.05 || 2 // 5% of average, or minimum 2

  if (Math.abs(delta) < threshold) return { direction: 'flat', sentiment: 'neutral' }

  const direction: TrendDirection = delta > 0 ? 'up' : 'down'
  let sentiment: 'good' | 'bad' | 'neutral'
  if (lowerIsBetter) {
    sentiment = delta > 0 ? 'bad' : 'good'
  } else {
    sentiment = delta > 0 ? 'good' : 'bad'
  }
  return { direction, sentiment }
}

function formatRate(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${Math.round(bytesPerSec)} B/s`
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
}

function getUsageColor(percent: number): ScorecardProps['color'] {
  if (percent < 50) return 'green'
  if (percent < 80) return 'amber'
  return 'red'
}

function SmartTrendArrow({
  direction,
  sentiment
}: {
  direction: TrendDirection
  sentiment: 'good' | 'bad' | 'neutral'
}): JSX.Element {
  if (direction === 'flat') {
    return <span className="text-xs text-gray-600">&mdash;</span>
  }
  const arrow = direction === 'up' ? '\u25B2' : '\u25BC'
  const color =
    sentiment === 'good' ? 'text-green-400' : sentiment === 'bad' ? 'text-red-400' : 'text-gray-500'
  return <span className={`text-xs ${color}`}>{arrow}</span>
}

export function ScorecardsStrip(): JSX.Element {
  const state = useSystemStore((s) => s.state)
  const { cpuHistory, memHistory, netInHistory, netOutHistory } = useTimeSeriesStore()

  const cpuUsage = state?.cpu.usage ?? 0
  const memUsage = state?.memory.usagePercent ?? 0
  const netIn = state?.network?.totalBytesInPerSec ?? 0
  const netOut = state?.network?.totalBytesOutPerSec ?? 0
  const totalBandwidth = netIn + netOut

  const netCombinedHistory = netInHistory.map((v, i) => v + (netOutHistory[i] ?? 0))

  const activeAgents = state?.agents.filter((a) => a.status === 'active').length ?? 0
  const listenPorts = state?.ports.filter((p) => p.state === 'LISTEN').length ?? 0
  const dirtyRepos = state?.gitRepos.filter((r) => r.dirty).length ?? 0
  const totalRepos = state?.gitRepos.length ?? 0

  const cpuTrend = getSmartTrend(cpuHistory, true)
  const memTrend = getSmartTrend(memHistory, true)
  const netTrend = getSmartTrend(netCombinedHistory, false)

  return (
    <div className="flex gap-3">
      <Scorecard
        value={`${Math.round(cpuUsage)}%`}
        label="CPU"
        color={getUsageColor(cpuUsage)}
        sparkData={cpuHistory}
        trend={cpuTrend.direction}
        trendWidget={
          <SmartTrendArrow direction={cpuTrend.direction} sentiment={cpuTrend.sentiment} />
        }
      />
      <Scorecard
        value={`${Math.round(memUsage)}%`}
        label="Memory"
        color={getUsageColor(memUsage)}
        sparkData={memHistory}
        trend={memTrend.direction}
        trendWidget={
          <SmartTrendArrow direction={memTrend.direction} sentiment={memTrend.sentiment} />
        }
      />
      <Scorecard
        value={formatRate(totalBandwidth)}
        label="Network"
        color="blue"
        sparkData={netCombinedHistory}
        trend={netTrend.direction}
        trendWidget={
          <SmartTrendArrow direction={netTrend.direction} sentiment={netTrend.sentiment} />
        }
      />
      <Scorecard
        value={`${activeAgents}`}
        label="Agents"
        color={activeAgents > 0 ? 'green' : 'gray'}
      />
      <Scorecard value={`${listenPorts}`} label="Ports" color="blue" />
      <Scorecard
        value={dirtyRepos > 0 ? `${dirtyRepos}/${totalRepos}` : `${totalRepos}`}
        label={dirtyRepos > 0 ? 'Dirty Repos' : 'Git Repos'}
        color={dirtyRepos > 0 ? 'amber' : 'green'}
      />
    </div>
  )
}
