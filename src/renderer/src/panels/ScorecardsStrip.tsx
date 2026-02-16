import { useSystemStore } from '../stores/system'
import { useTimeSeriesStore } from '../stores/timeseries'
import { Scorecard, type ScorecardProps } from '../components/Scorecard'

function getTrend(history: number[]): 'up' | 'down' | 'flat' {
  if (history.length < 2) return 'flat'
  const curr = history[history.length - 1]
  const prev = history[history.length - 2]
  const delta = curr - prev
  if (Math.abs(delta) < 2) return 'flat'
  return delta > 0 ? 'up' : 'down'
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

  return (
    <div className="flex gap-3 border-b border-gray-800 pb-3">
      <Scorecard
        value={`${Math.round(cpuUsage)}%`}
        label="CPU"
        color={getUsageColor(cpuUsage)}
        sparkData={cpuHistory}
        trend={getTrend(cpuHistory)}
      />
      <Scorecard
        value={`${Math.round(memUsage)}%`}
        label="Memory"
        color={getUsageColor(memUsage)}
        sparkData={memHistory}
        trend={getTrend(memHistory)}
      />
      <Scorecard
        value={formatRate(totalBandwidth)}
        label="Network"
        color="blue"
        sparkData={netCombinedHistory}
        trend={getTrend(netCombinedHistory)}
      />
      <Scorecard
        value={`${activeAgents}`}
        label="Agents"
        color={activeAgents > 0 ? 'green' : 'gray'}
      />
      <Scorecard value={'\u2014'} label="Security" color="gray" />
    </div>
  )
}
