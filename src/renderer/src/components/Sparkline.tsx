export interface SparklineProps {
  data: number[]
  width?: number
  height?: number
  color?: string
  filled?: boolean
}

export function Sparkline({
  data,
  width = 120,
  height = 32,
  color = '#4ade80',
  filled = true
}: SparklineProps): JSX.Element | null {
  if (!data || data.length < 2) return null

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((v - min) / range) * height
    return `${x},${y}`
  })

  const polylinePoints = points.join(' ')

  // For the filled polygon, extend the path down to the bottom corners
  const polygonPoints = `0,${height} ${polylinePoints} ${width},${height}`

  const gradientId = `spark-grad-${Math.random().toString(36).slice(2, 9)}`

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height: `${height}px` }}
    >
      {filled && (
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
      )}

      {filled && <polygon points={polygonPoints} fill={`url(#${gradientId})`} />}

      <polyline
        points={polylinePoints}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
