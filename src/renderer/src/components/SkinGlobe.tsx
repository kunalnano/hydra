import { useEffect, useRef } from 'react'
import { useRadioStore } from '../stores/radio'
import { useSystemStore } from '../stores/system'
import { FM_STATIONS } from '../panels/fm-stations'

const TAU = Math.PI * 2

const KNOWN_LOCATIONS: Record<string, [number, number]> = {
  user: [29.87, -98.25],
  wbgo: [40.73, -74.17],
  kexp: [47.62, -122.35],
  somafm: [37.77, -122.42],
  kcrw: [34.02, -118.49],
  wwoz: [29.95, -90.07],
  kutx: [30.27, -97.74],
  kcsm: [37.55, -122.32],
  nts: [51.51, -0.13],
  wfmu: [40.73, -74.08],
  wbls: [40.75, -73.99],
  kblx: [37.77, -122.42],
  bbc: [51.51, -0.13],
  anthropic: [37.77, -122.42],
  localhost: [29.87, -98.25]
}

function stationLocationKey(stationId: string): string | null {
  const station = FM_STATIONS.find((s) => s.id === stationId)
  if (!station) return null
  const cs = station.callSign.toLowerCase()
  if (cs === 'somafm') return 'somafm'
  for (const key of Object.keys(KNOWN_LOCATIONS)) {
    if (cs.includes(key) || stationId.includes(key)) return key
  }
  return null
}

function project(
  lat: number, lon: number,
  cx: number, cy: number, r: number, rotOff: number
): { x: number; y: number; visible: boolean } {
  const phi = (lat * Math.PI) / 180
  const lambda = (lon * Math.PI) / 180 + rotOff
  return {
    x: cx + r * Math.cos(phi) * Math.sin(lambda),
    y: cy - r * Math.sin(phi),
    visible: r * Math.cos(phi) * Math.cos(lambda) > 0
  }
}

function greatCirclePoints(
  lat1: number, lon1: number, lat2: number, lon2: number, count: number
): Array<[number, number]> {
  const p1 = (lat1 * Math.PI) / 180
  const l1 = (lon1 * Math.PI) / 180
  const p2 = (lat2 * Math.PI) / 180
  const l2 = (lon2 * Math.PI) / 180
  const d = Math.acos(
    Math.min(1, Math.max(-1,
      Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(l2 - l1)
    ))
  )
  if (d < 0.001) return [[lat1, lon1], [lat2, lon2]]
  const pts: Array<[number, number]> = []
  for (let i = 0; i <= count; i++) {
    const f = i / count
    const a = Math.sin((1 - f) * d) / Math.sin(d)
    const b = Math.sin(f * d) / Math.sin(d)
    const x = a * Math.cos(p1) * Math.cos(l1) + b * Math.cos(p2) * Math.cos(l2)
    const y = a * Math.cos(p1) * Math.sin(l1) + b * Math.cos(p2) * Math.sin(l2)
    const z = a * Math.sin(p1) + b * Math.sin(p2)
    pts.push([
      Math.atan2(z, Math.sqrt(x * x + y * y)) * (180 / Math.PI),
      Math.atan2(y, x) * (180 / Math.PI)
    ])
  }
  return pts
}

interface ArcDef { from: [number, number]; to: [number, number]; color: string }

export function SkinGlobe(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const dataRef = useRef<{ stationId: string; hasActiveAgent: boolean }>({
    stationId: '', hasActiveAgent: false
  })

  // Keep refs in sync without re-running the effect
  const stationId = useRadioStore((s) => s.selectedStationId)
  const agents = useSystemStore((s) => s.state?.agents)
  dataRef.current.stationId = stationId
  dataRef.current.hasActiveAgent = agents?.some(
    (a) => a.type === 'claude-code' && (a.status === 'active' || a.status === 'busy')
  ) ?? false

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const setupSize = (): void => {
      const parent = canvas.parentElement
      if (!parent) return
      const dpr = window.devicePixelRatio || 1
      const w = parent.clientWidth
      canvas.width = w * dpr
      canvas.height = 200 * dpr
      canvas.style.width = `${w}px`
      canvas.style.height = '200px'
    }
    setupSize()
    window.addEventListener('resize', setupSize)

    function loop(): void {
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const dpr = window.devicePixelRatio || 1
      const w = canvas.width / dpr
      const h = canvas.height / dpr
      const time = performance.now() / 1000
      const cx = w / 2
      const cy = h / 2
      const r = Math.min(cx, cy) * 0.78
      const rot = time * (TAU / 60)
      const user = KNOWN_LOCATIONS.user

      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.save()
      ctx.scale(dpr, dpr)

      // Globe body
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, TAU)
      ctx.fillStyle = 'rgba(20,16,10,0.6)'
      ctx.fill()

      // Grid
      ctx.strokeStyle = 'rgba(200,170,110,0.08)'
      ctx.lineWidth = 0.5
      for (let lat = -60; lat <= 60; lat += 30) {
        ctx.beginPath()
        let on = false
        for (let lon = -180; lon <= 180; lon += 3) {
          const p = project(lat, lon, cx, cy, r, rot)
          if (p.visible) { if (!on) { ctx.moveTo(p.x, p.y); on = true } else ctx.lineTo(p.x, p.y) }
          else on = false
        }
        ctx.stroke()
      }
      for (let lon = -180; lon < 180; lon += 30) {
        ctx.beginPath()
        let on = false
        for (let lat = -90; lat <= 90; lat += 3) {
          const p = project(lat, lon, cx, cy, r, rot)
          if (p.visible) { if (!on) { ctx.moveTo(p.x, p.y); on = true } else ctx.lineTo(p.x, p.y) }
          else on = false
        }
        ctx.stroke()
      }

      // Rim
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, TAU)
      ctx.strokeStyle = 'rgba(200,170,110,0.2)'
      ctx.lineWidth = 1
      ctx.stroke()

      // Arcs
      const arcs: ArcDef[] = []
      const rk = stationLocationKey(dataRef.current.stationId)
      if (rk && KNOWN_LOCATIONS[rk]) {
        arcs.push({ from: KNOWN_LOCATIONS[rk], to: user, color: 'rgba(255,210,130,0.55)' })
      }
      if (dataRef.current.hasActiveAgent) {
        arcs.push({ from: KNOWN_LOCATIONS.anthropic, to: user, color: 'rgba(255,170,90,0.55)' })
      }

      for (const arc of arcs) {
        const pts = greatCirclePoints(arc.from[0], arc.from[1], arc.to[0], arc.to[1], 40)
          .map(([la, lo]) => project(la, lo, cx, cy, r, rot))

        ctx.beginPath()
        let on = false
        for (const p of pts) {
          if (p.visible) { if (!on) { ctx.moveTo(p.x, p.y); on = true } else ctx.lineTo(p.x, p.y) }
          else on = false
        }
        ctx.strokeStyle = arc.color
        ctx.lineWidth = 1.5
        ctx.setLineDash([4, 6])
        ctx.lineDashOffset = -time * 30
        ctx.stroke()
        ctx.setLineDash([])

        for (const ll of [arc.from, arc.to]) {
          const p = project(ll[0], ll[1], cx, cy, r, rot)
          if (p.visible) {
            ctx.beginPath()
            ctx.arc(p.x, p.y, 2.5, 0, TAU)
            ctx.fillStyle = arc.color
            ctx.fill()
          }
        }
      }

      // User dot
      const up = project(user[0], user[1], cx, cy, r, rot)
      if (up.visible) {
        const pulse = 0.5 + Math.sin(time * 3) * 0.5
        ctx.beginPath()
        ctx.arc(up.x, up.y, 3 + pulse * 2, 0, TAU)
        ctx.fillStyle = `rgba(255,210,130,${(0.15 + pulse * 0.15).toFixed(2)})`
        ctx.fill()
        ctx.beginPath()
        ctx.arc(up.x, up.y, 3, 0, TAU)
        ctx.fillStyle = 'rgb(255,210,130)'
        ctx.fill()
      }

      ctx.restore()
      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', setupSize)
    }
  }, [])

  return <canvas ref={canvasRef} className="shell-skin-globe" />
}
