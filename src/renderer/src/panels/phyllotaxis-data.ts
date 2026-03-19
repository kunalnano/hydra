/**
 * Golden angle phyllotaxis computation for the AI Core visualizer.
 *
 * Points are placed using the Fermat spiral formula:
 *   angle(n) = n * golden_angle
 *   radius(n) = scale * sqrt(n)
 *
 * This produces the same Fibonacci spiral pattern seen in sunflower seeds.
 * The golden angle = 360° / φ² ≈ 137.508° where φ = (1+√5)/2.
 */

export const PHI = (1 + Math.sqrt(5)) / 2
export const GOLDEN_ANGLE_RAD = (2 * Math.PI) / (PHI * PHI)
export const MAX_PHYLLOTAXIS_POINTS = 260

export interface PhyllotaxisPoint {
  x: number
  y: number
  /** Normalized distance from center (0-1) */
  normR: number
}

/**
 * Compute phyllotaxis positions for `count` points centered at (cx, cy).
 * `maxRadius` is the radius of the bounding circle — the scale factor
 * is derived so the outermost point lands just inside it.
 */
export function computePhyllotaxisPoints(
  count: number,
  cx: number,
  cy: number,
  maxRadius: number
): PhyllotaxisPoint[] {
  if (count <= 0) return []

  // Scale factor: sqrt(count-1) maps to maxRadius with a small margin
  const outerSqrt = Math.sqrt(Math.max(1, count - 1))
  const scale = (maxRadius * 0.92) / outerSqrt

  const points: PhyllotaxisPoint[] = []
  for (let n = 0; n < count; n++) {
    const angle = n * GOLDEN_ANGLE_RAD
    const r = scale * Math.sqrt(n)
    points.push({
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
      normR: outerSqrt > 0 ? Math.sqrt(n) / outerSqrt : 0
    })
  }
  return points
}

/**
 * Build SVG path data for a Fibonacci spiral arm connecting every Nth point.
 * Uses quadratic bezier curves for smooth arcs.
 */
export function spiralArmPath(
  points: PhyllotaxisPoint[],
  step: number,
  startOffset: number = 0
): string {
  const armPoints: PhyllotaxisPoint[] = []
  for (let i = startOffset; i < points.length; i += step) {
    armPoints.push(points[i])
  }
  if (armPoints.length < 2) return ''

  let d = `M ${armPoints[0].x.toFixed(1)} ${armPoints[0].y.toFixed(1)}`
  for (let i = 1; i < armPoints.length; i++) {
    const prev = armPoints[i - 1]
    const curr = armPoints[i]
    const mx = (prev.x + curr.x) / 2
    const my = (prev.y + curr.y) / 2
    d += ` Q ${prev.x.toFixed(1)} ${prev.y.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`
  }
  const last = armPoints[armPoints.length - 1]
  d += ` L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`
  return d
}
