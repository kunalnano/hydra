/**
 * Globe geometry for the AI Core Lattice.
 *
 * Nodes are placed at the intersections of longitude scan lines and
 * latitude ellipses. The sweep animation highlights one longitude
 * column at a time, left-to-right, creating a spinning-globe effect.
 */

export const SPHERE = { cx: 396, cy: 194, r: 172 }

/** Meridian ellipse rx values (decorative wireframe structure) */
export const MERIDIAN_RX = [26, 52, 78, 104, 130, 156]

/** Latitude ellipse ry values (horizontal bands) */
export const LATITUDE_RY = [42, 70, 98, 128, 154]

/** Number of evenly-spaced longitude scan columns */
export const NUM_LONGITUDES = 12

export interface GlobeNode {
  x: number
  y: number
  lonIndex: number
}

export interface LongitudeLine {
  x: number
  yTop: number
  yBot: number
  index: number
}

function buildLongitudes(): LongitudeLine[] {
  const lines: LongitudeLine[] = []
  const inset = SPHERE.r * 0.06
  for (let i = 0; i < NUM_LONGITUDES; i++) {
    const t = (i + 0.5) / NUM_LONGITUDES
    const x = SPHERE.cx - SPHERE.r + inset + t * (2 * SPHERE.r - 2 * inset)
    const dx = x - SPHERE.cx
    const h = Math.sqrt(Math.max(0, SPHERE.r ** 2 - dx ** 2))
    if (h > 8) {
      lines.push({
        x: Math.round(x * 10) / 10,
        yTop: Math.round((SPHERE.cy - h) * 10) / 10,
        yBot: Math.round((SPHERE.cy + h) * 10) / 10,
        index: i
      })
    }
  }
  return lines
}

function buildNodes(longitudes: LongitudeLine[]): GlobeNode[] {
  const nodes: GlobeNode[] = []
  for (const lon of longitudes) {
    const dx = lon.x - SPHERE.cx
    const sf = Math.sqrt(Math.max(0, 1 - (dx / SPHERE.r) ** 2))
    for (const ry of LATITUDE_RY) {
      const yOff = ry * sf
      if (yOff > 6) {
        nodes.push({
          x: lon.x,
          y: Math.round((SPHERE.cy - yOff) * 10) / 10,
          lonIndex: lon.index
        })
        nodes.push({
          x: lon.x,
          y: Math.round((SPHERE.cy + yOff) * 10) / 10,
          lonIndex: lon.index
        })
      }
    }
  }
  return nodes
}

export const LONGITUDE_LINES = buildLongitudes()
export const GLOBE_NODES = buildNodes(LONGITUDE_LINES)

export const DUST_POINTS: Array<[number, number]> = [
  [206, 124], [222, 156], [214, 214], [232, 276], [266, 338],
  [312, 46], [332, 96], [318, 344], [386, 36], [386, 350],
  [452, 50], [466, 100], [476, 344], [532, 88], [556, 138], [564, 288]
]
