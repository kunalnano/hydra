import type { CSSProperties, ReactNode } from 'react'
import { Sparkline } from './Sparkline'

export interface ScorecardProps {
  value: string
  label: string
  trend?: 'up' | 'down' | 'flat'
  trendWidget?: ReactNode
  color: 'green' | 'amber' | 'red' | 'blue' | 'gray'
  sparkData?: number[]
  onClick?: () => void
}

const COLOR_MAP: Record<ScorecardProps['color'], { text: string; hex: string }> = {
  green: { text: 'text-green-400', hex: '#4ade80' },
  amber: { text: 'text-amber-400', hex: '#fbbf24' },
  red: { text: 'text-red-400', hex: '#f87171' },
  blue: { text: 'text-blue-400', hex: '#60a5fa' },
  gray: { text: 'text-gray-400', hex: '#9ca3af' }
}

function TrendArrow({
  trend,
  color
}: {
  trend: 'up' | 'down' | 'flat'
  color: ScorecardProps['color']
}): JSX.Element {
  if (trend === 'up') {
    return <span className={`text-[10px] ${COLOR_MAP[color].text}`}>&#9650;</span>
  }
  if (trend === 'down') {
    return <span className="text-[10px] text-red-400">&#9660;</span>
  }
  return <span className="text-[10px] text-gray-600">&mdash;</span>
}

export function Scorecard({
  value,
  label,
  trend,
  trendWidget,
  color,
  sparkData,
  onClick
}: ScorecardProps): JSX.Element {
  const { hex } = COLOR_MAP[color]
  const scorecardStyle: CSSProperties = {
    background: `radial-gradient(circle at 92% 8%, ${hex}10, transparent 28%), var(--helm-card-bg)`
  }

  return (
    <div
      style={scorecardStyle}
      className={`shell-scorecard flex-1 px-3 py-2 flex flex-col overflow-hidden${
        onClick ? ' cursor-pointer' : ''
      }`}
      onClick={onClick}
    >
      <div className="display-well inline-flex items-center gap-1 px-2 py-0.5 self-start">
        <span className="text-lg font-bold tabular-nums" style={{ color: hex }}>{value}</span>
        {trendWidget || (trend && <TrendArrow trend={trend} color={color} />)}
      </div>
      <span className="mt-1 text-[9px] uppercase tracking-[0.14em] shell-subtle">{label}</span>
      {sparkData && sparkData.length >= 2 && (
        <div className="mt-1.5" style={{ height: '32px' }}>
          <Sparkline data={sparkData} height={32} color={hex} />
        </div>
      )}
    </div>
  )
}
