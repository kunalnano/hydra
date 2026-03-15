/**
 * Globe geometry for the AI Core Lattice.
 *
 * Nodes placed at equator + latitude band intersections with longitude
 * columns. Slight positional jitter breaks the grid into an organic
 * star-field pattern.
 */

export const SPHERE = { cx: 396, cy: 194, r: 172 }

/** Meridian ellipse rx values (decorative wireframe) */
export const MERIDIAN_RX = [26, 52, 78, 104, 130, 156]

/** Latitude ellipse ry values (bands above and below equator) */
export const LATITUDE_RY = [32, 64, 96, 128, 156]

/** Number of longitude columns */
export const NUM_LONGITUDES = 14

export interface GlobeNode {
  x: number
  y: number
}

/** Deterministic jitter from index */
function jitter(index: number, seed: number): number {
  return (((index * 2654435761 + seed * 340573) >>> 0) % 1000) / 1000 * 6 - 3
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function buildNodes(): GlobeNode[] {
  const nodes: GlobeNode[] = []
  const inset = SPHERE.r * 0.06
  let idx = 0

  for (let li = 0; li < NUM_LONGITUDES; li++) {
    const t = (li + 0.5) / NUM_LONGITUDES
    const x = SPHERE.cx - SPHERE.r + inset + t * (2 * SPHERE.r - 2 * inset)
    const dx = x - SPHERE.cx
    const sf = Math.sqrt(Math.max(0, 1 - (dx / SPHERE.r) ** 2))
    if (sf < 0.05) continue

    // Equator node
    nodes.push({
      x: round1(x + jitter(idx, 1)),
      y: round1(SPHERE.cy + jitter(idx, 2))
    })
    idx++

    // Latitude band intersections (above + below)
    for (const ry of LATITUDE_RY) {
      const yOff = ry * sf
      if (yOff > 6) {
        nodes.push({
          x: round1(x + jitter(idx, 3)),
          y: round1(SPHERE.cy - yOff + jitter(idx, 4))
        })
        idx++
        nodes.push({
          x: round1(x + jitter(idx, 5)),
          y: round1(SPHERE.cy + yOff + jitter(idx, 6))
        })
        idx++
      }
    }
  }

  return nodes
}

export const GLOBE_NODES = buildNodes()

export const DUST_POINTS: Array<[number, number]> = [
  [206, 124], [222, 156], [214, 214], [232, 276], [266, 338],
  [312, 46], [332, 96], [318, 344], [386, 36], [386, 350],
  [452, 50], [466, 100], [476, 344], [532, 88], [556, 138], [564, 288]
]
