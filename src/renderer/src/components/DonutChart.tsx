export interface DonutSegment {
  value: number
  color: string
  label: string
}

export interface DonutChartProps {
  segments: DonutSegment[]
  size?: number
  centerText?: string
}

export function DonutChart({ segments, size = 64, centerText }: DonutChartProps): JSX.Element {
  const center = size / 2
  const strokeWidth = 8
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius

  const total = segments.reduce((sum, s) => sum + s.value, 0)

  // If no segments or total is 0, show a full gray ring
  if (!segments.length || total === 0) {
    return (
      <div
        className="relative inline-flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="#374151"
            strokeWidth={strokeWidth}
          />
        </svg>
        {centerText && <span className="absolute text-sm font-bold text-white">{centerText}</span>}
      </div>
    )
  }

  // Build segment circles using stroke-dasharray/dashoffset technique
  // Start from top (rotate -90 degrees)
  let accumulatedOffset = 0
  const circles = segments.map((seg, i) => {
    const segmentLength = (seg.value / total) * circumference
    const dashArray = `${segmentLength} ${circumference - segmentLength}`
    // offset rotates the segment start: negative offset = clockwise advance
    const dashOffset = -accumulatedOffset
    accumulatedOffset += segmentLength

    return (
      <circle
        key={`${seg.label}-${i}`}
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke={seg.color}
        strokeWidth={strokeWidth}
        strokeDasharray={dashArray}
        strokeDashoffset={dashOffset}
        strokeLinecap="butt"
        style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }}
      />
    )
  })

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background ring */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="#1f2937"
          strokeWidth={strokeWidth}
        />
        {circles}
      </svg>
      {centerText && <span className="absolute text-sm font-bold text-white">{centerText}</span>}
    </div>
  )
}
