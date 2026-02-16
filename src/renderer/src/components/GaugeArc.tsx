export interface GaugeArcProps {
  value: number
  grade?: string
  color: string
  size?: number
}

function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number
): string {
  const toRad = (deg: number): number => (deg * Math.PI) / 180
  const x1 = cx + r * Math.cos(toRad(startAngle))
  const y1 = cy + r * Math.sin(toRad(startAngle))
  const x2 = cx + r * Math.cos(toRad(endAngle))
  const y2 = cy + r * Math.sin(toRad(endAngle))
  const largeArc = endAngle - startAngle > 180 ? 1 : 0
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`
}

export function GaugeArc({ value, grade, color, size = 80 }: GaugeArcProps): JSX.Element {
  const clamped = Math.max(0, Math.min(100, value))
  const cx = size / 2
  const cy = size / 2
  const r = (size - 12) / 2 // leave room for stroke

  // Arc spans from 180 degrees (left) to 0 degrees (right) -- a top semicircle
  // In SVG, 0 degrees is right (3 o'clock), so 180 = left, 0 = right
  // We sweep from 180 to 360 (bottom half open means arc is on top)
  const startAngle = 180
  const fullEndAngle = 360
  const valueEndAngle = startAngle + (clamped / 100) * (fullEndAngle - startAngle)

  const bgPath = describeArc(cx, cy, r, startAngle, fullEndAngle)
  const fgPath = clamped > 0 ? describeArc(cx, cy, r, startAngle, valueEndAngle) : ''

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size / 2 + 6} viewBox={`0 0 ${size} ${size / 2 + 6}`}>
        {/* Background arc */}
        <path d={bgPath} fill="none" stroke="#1f2937" strokeWidth={6} strokeLinecap="round" />
        {/* Foreground arc */}
        {clamped > 0 && (
          <path d={fgPath} fill="none" stroke={color} strokeWidth={6} strokeLinecap="round" />
        )}
        {/* Grade letter centered */}
        {grade && (
          <text
            x={cx}
            y={cy - 2}
            textAnchor="middle"
            dominantBaseline="central"
            fill={color}
            style={{ fontSize: '18px', fontWeight: 700 }}
          >
            {grade}
          </text>
        )}
      </svg>
      {/* Value below */}
      <span className="text-xs text-gray-500 -mt-1">{clamped}/100</span>
    </div>
  )
}
