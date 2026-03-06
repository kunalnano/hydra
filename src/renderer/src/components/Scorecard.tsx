import { Sparkline } from './Sparkline'

export interface ScorecardProps {
  value: string
  label: string
  trend?: 'up' | 'down' | 'flat'
  trendWidget?: React.ReactNode
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
    return <span className={`text-xs ${COLOR_MAP[color].text}`}>&#9650;</span>
  }
  if (trend === 'down') {
    return <span className="text-xs text-red-400">&#9660;</span>
  }
  return <span className="text-xs text-gray-600">&mdash;</span>
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
  const { text: textColor, hex } = COLOR_MAP[color]

  return (
    <div
      className={`flex-1 bg-gray-900/60 border border-gray-800/50 rounded-lg px-4 py-3 flex flex-col shadow-lg shadow-black/10 hover:border-gray-700/50 transition-all duration-200 overflow-hidden${
        onClick ? ' cursor-pointer' : ''
      }`}
      style={{ borderTopColor: hex, borderTopWidth: '2px' }}
      onClick={onClick}
    >
      <div className="flex items-center gap-1.5">
        <span className={`text-2xl font-bold tabular-nums ${textColor}`}>{value}</span>
        {trendWidget || (trend && <TrendArrow trend={trend} color={color} />)}
      </div>
      <span className="text-xs text-gray-500 uppercase tracking-wider">{label}</span>
      {sparkData && sparkData.length >= 2 && (
        <div className="mt-2" style={{ height: '40px' }}>
          <Sparkline data={sparkData} height={40} color={hex} />
        </div>
      )}
    </div>
  )
}
