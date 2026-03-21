import { useEffect, useMemo, useRef } from 'react'
import { geoGraticule10, geoInterpolate, geoOrthographic, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import landAtlas from 'world-atlas/land-110m.json'
import type { RadioHomeLocation } from '../../../shared/types'
import type { RadioStation } from '../panels/fm-stations'

const TAU = Math.PI * 2
const ROUTE_SAMPLE_COUNT = 72
const LAND_FEATURE = feature(landAtlas as any, (landAtlas as any).objects.land) as any
const WORLD_GRATICULE = geoGraticule10()

const STATION_COORDS: Record<string, [number, number]> = {
  'wbgo-jazz': [40.7357, -74.1724],
  wwoz: [29.9511, -90.0715],
  kcsm: [37.563, -122.3255],
  kexp: [47.6062, -122.3321],
  kcrw: [34.0195, -118.4912],
  'nts-1': [51.5072, -0.1276],
  kutx: [30.2672, -97.7431],
  wfmu: [40.7282, -74.0776],
  'somafm-groovesalad': [37.7749, -122.4194],
  'somafm-dronezone': [37.7749, -122.4194],
  'somafm-lush': [37.7749, -122.4194],
  'somafm-gsclassic': [37.7749, -122.4194],
  'somafm-illstreet': [37.7749, -122.4194],
  'somafm-defcon': [37.7749, -122.4194],
  'somafm-cliqhop': [37.7749, -122.4194],
  wbls: [40.7128, -74.006],
  kblx: [37.7749, -122.4194],
  'bbc-6music': [51.5072, -0.1276]
}

type SignalMode = 'station' | 'local' | 'custom' | 'idle'
type DeviceLocationSource = 'configured'

interface DeviceLocation {
  coords: [number, number]
  label: string
  source: DeviceLocationSource
}

interface RadioSignalGlobeProps {
  station: RadioStation | null
  mode: SignalMode
  sourceLabel: string | null
  homeLocation: RadioHomeLocation | null
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function toLonLat([lat, lon]: [number, number]): [number, number] {
  return [lon, lat]
}

function colorWithAlpha(color: string, alpha: number, fallback: string): string {
  const trimmed = color.trim()
  if (!trimmed) return fallback

  if (trimmed.startsWith('#')) {
    const hex = trimmed.slice(1)
    const normalized = hex.length === 3 ? hex.split('').map((char) => char + char).join('') : hex
    if (normalized.length === 6) {
      const red = Number.parseInt(normalized.slice(0, 2), 16)
      const green = Number.parseInt(normalized.slice(2, 4), 16)
      const blue = Number.parseInt(normalized.slice(4, 6), 16)
      return `rgba(${red}, ${green}, ${blue}, ${alpha})`
    }
  }

  if (trimmed.startsWith('rgb(')) {
    return trimmed.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`)
  }

  if (trimmed.startsWith('rgba(')) {
    return trimmed.replace(/rgba\(([^)]+),\s*[\d.]+\)/, `rgba($1, ${alpha})`)
  }

  return fallback
}

function buildRouteLine(start: [number, number], end: [number, number]): { type: 'LineString'; coordinates: [number, number][] } {
  const interpolate = geoInterpolate(toLonLat(start), toLonLat(end))
  return {
    type: 'LineString',
    coordinates: Array.from({ length: ROUTE_SAMPLE_COUNT + 1 }, (_, index) =>
      interpolate(index / ROUTE_SAMPLE_COUNT) as [number, number]
    )
  }
}

function getFocus(
  stationCoords: [number, number] | null,
  homeCoords: [number, number] | null,
  time: number
): [number, number, number] {
  const anchor = stationCoords && homeCoords
    ? (geoInterpolate(toLonLat(stationCoords), toLonLat(homeCoords))(0.5) as [number, number])
    : stationCoords
      ? toLonLat(stationCoords)
      : homeCoords
        ? toLonLat(homeCoords)
        : [-30, 28]

  const yawDrift = stationCoords ? Math.sin(time * 0.22) * 4.5 : Math.sin(time * 0.18) * 6
  const pitchDrift = stationCoords ? Math.cos(time * 0.16) * 1.8 : Math.cos(time * 0.14) * 2.4
  const roll = Math.sin(time * 0.08) * 1.1

  return [
    -anchor[0] + yawDrift,
    -clamp(anchor[1] * 0.88 + pitchDrift, -55, 55),
    roll
  ]
}

function haversineMiles(from: [number, number], to: [number, number]): number {
  const earthRadiusMiles = 3958.8
  const dLat = ((to[0] - from[0]) * Math.PI) / 180
  const dLon = ((to[1] - from[1]) * Math.PI) / 180
  const lat1 = (from[0] * Math.PI) / 180
  const lat2 = (to[0] * Math.PI) / 180

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2)

  return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function formatDistance(miles: number): string {
  if (miles >= 1000) return `${(miles / 1000).toFixed(1)}k mi`
  return `${Math.round(miles)} mi`
}

function drawMarker(
  context: CanvasRenderingContext2D,
  projection: ReturnType<typeof geoOrthographic>,
  coords: [number, number],
  {
    haloColor,
    coreColor,
    pulseScale = 0,
    time = 0
  }: {
    haloColor: string
    coreColor: string
    pulseScale?: number
    time?: number
  }
): void {
  const projected = projection(toLonLat(coords))
  if (!projected) return

  const [x, y] = projected
  if (pulseScale > 0) {
    const pulse = 0.55 + Math.sin(time * 2.4) * 0.35
    context.beginPath()
    context.arc(x, y, 5 + pulse * pulseScale, 0, TAU)
    context.fillStyle = haloColor
    context.fill()
  }

  context.beginPath()
  context.arc(x, y, 3.2, 0, TAU)
  context.fillStyle = coreColor
  context.shadowBlur = 12
  context.shadowColor = coreColor
  context.fill()
  context.shadowBlur = 0
}

function SignalCard({
  label,
  value,
  detail
}: {
  label: string
  value: string
  detail: string
}): JSX.Element {
  return (
    <div className="winamp-signal-card">
      <div className="winamp-signal-kicker">{label}</div>
      <div className="winamp-signal-value">{value}</div>
      <div className="winamp-signal-detail">{detail}</div>
    </div>
  )
}

export function RadioSignalGlobe({
  station,
  mode,
  sourceLabel,
  homeLocation
}: RadioSignalGlobeProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef(0)
  const deviceLocation = useMemo<DeviceLocation | null>(() => {
    if (!homeLocation) return null
    return {
      coords: [homeLocation.latitude, homeLocation.longitude],
      label: homeLocation.label,
      source: 'configured'
    }
  }, [homeLocation])
  const stationCoords = station ? STATION_COORDS[station.id] ?? null : null

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const resize = (): void => {
      const parent = canvas.parentElement
      if (!parent) return
      const dpr = window.devicePixelRatio || 1
      const width = parent.clientWidth
      const height = Math.max(220, parent.clientHeight)
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
    }

    resize()
    window.addEventListener('resize', resize)

    const render = (): void => {
      const context = canvas.getContext('2d')
      if (!context) return

      const dpr = window.devicePixelRatio || 1
      const width = canvas.width / dpr
      const height = canvas.height / dpr
      const time = performance.now() / 1000
      const cx = width / 2
      const cy = height / 2
      const radius = Math.min(cx, cy) * 0.78
      const style = getComputedStyle(canvas)
      const accent = style.getPropertyValue('--winamp-blue-bright')
      const dim = style.getPropertyValue('--winamp-screen-dim')

      const atmosphere = colorWithAlpha(accent, 0.15, 'rgba(135, 212, 255, 0.15)')
      const landFill = colorWithAlpha(accent, 0.18, 'rgba(121, 187, 255, 0.18)')
      const coastlineStroke = colorWithAlpha(accent, 0.56, 'rgba(170, 220, 255, 0.56)')
      const gridStroke = colorWithAlpha(dim, 0.16, 'rgba(124, 160, 210, 0.16)')
      const rimStroke = colorWithAlpha(accent, 0.3, 'rgba(170, 220, 255, 0.3)')
      const routeStroke = 'rgba(255, 212, 120, 0.88)'

      const projection = geoOrthographic()
        .translate([cx, cy])
        .scale(radius)
        .clipAngle(90)
        .precision(0.4)
        .rotate(getFocus(stationCoords, deviceLocation?.coords ?? null, time))

      const path = geoPath(projection, context)
      const sphere = { type: 'Sphere' as const }

      context.setTransform(1, 0, 0, 1, 0, 0)
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.scale(dpr, dpr)

      context.save()
      context.beginPath()
      path(sphere as any)
      context.shadowBlur = 24
      context.shadowColor = atmosphere
      context.fillStyle = atmosphere
      context.fill()
      context.shadowBlur = 0

      context.beginPath()
      path(sphere as any)
      const globeGradient = context.createRadialGradient(
        cx - radius * 0.35,
        cy - radius * 0.42,
        radius * 0.12,
        cx,
        cy,
        radius * 1.05
      )
      globeGradient.addColorStop(0, 'rgba(35, 45, 70, 0.98)')
      globeGradient.addColorStop(0.6, 'rgba(12, 18, 30, 0.96)')
      globeGradient.addColorStop(1, 'rgba(5, 8, 16, 0.98)')
      context.fillStyle = globeGradient
      context.fill()

      context.save()
      context.beginPath()
      path(sphere as any)
      context.clip()

      const sheen = context.createLinearGradient(
        cx - radius,
        cy - radius * 0.85,
        cx + radius * 0.7,
        cy + radius
      )
      sheen.addColorStop(0, 'rgba(255, 255, 255, 0.06)')
      sheen.addColorStop(0.35, 'rgba(255, 255, 255, 0.02)')
      sheen.addColorStop(1, 'rgba(255, 255, 255, 0)')
      context.fillStyle = sheen
      context.fillRect(cx - radius - 2, cy - radius - 2, radius * 2 + 4, radius * 2 + 4)

      context.beginPath()
      path(WORLD_GRATICULE as any)
      context.strokeStyle = gridStroke
      context.lineWidth = 0.7
      context.stroke()

      context.beginPath()
      path(LAND_FEATURE)
      context.fillStyle = landFill
      context.fill()
      context.strokeStyle = coastlineStroke
      context.lineWidth = 1.05
      context.stroke()

      if (stationCoords && deviceLocation) {
        const route = buildRouteLine(stationCoords, deviceLocation.coords)
        context.beginPath()
        path(route as any)
        context.strokeStyle = 'rgba(255, 212, 120, 0.22)'
        context.lineWidth = 4.6
        context.stroke()

        context.beginPath()
        path(route as any)
        context.strokeStyle = routeStroke
        context.lineWidth = 1.8
        context.setLineDash([7, 7])
        context.lineDashOffset = -time * 26
        context.stroke()
        context.setLineDash([])

        drawMarker(context, projection, stationCoords, {
          haloColor: 'rgba(94, 179, 255, 0.14)',
          coreColor: 'rgba(135, 212, 255, 0.95)'
        })
      } else if (stationCoords) {
        drawMarker(context, projection, stationCoords, {
          haloColor: 'rgba(94, 179, 255, 0.14)',
          coreColor: 'rgba(135, 212, 255, 0.95)'
        })
      }

      if (deviceLocation) {
        drawMarker(context, projection, deviceLocation.coords, {
          haloColor: 'rgba(255, 212, 120, 0.16)',
          coreColor: 'rgba(255, 212, 120, 0.96)',
          pulseScale: 3.4,
          time
        })
      }

      context.restore()

      context.beginPath()
      path(sphere as any)
      context.strokeStyle = rimStroke
      context.lineWidth = 1.2
      context.stroke()
      context.restore()

      animationRef.current = requestAnimationFrame(render)
    }

    animationRef.current = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(animationRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [deviceLocation, stationCoords])

  const pathValue = useMemo(() => {
    if (stationCoords && deviceLocation) {
      return formatDistance(haversineMiles(stationCoords, deviceLocation.coords))
    }
    if (stationCoords) return 'Set home'
    if (mode === 'local') return 'Local'
    if (mode === 'custom') return 'Direct'
    return 'Idle'
  }, [deviceLocation, mode, stationCoords])

  const pathDetail = useMemo(() => {
    if (stationCoords && deviceLocation) {
      return 'Great-circle route over a real-world orthographic map from station origin to home.'
    }
    if (stationCoords) {
      return 'Set your saved home endpoint to map the route.'
    }
    if (mode === 'local') {
      return 'Local file playback stays on-device.'
    }
    if (mode === 'custom') {
      return sourceLabel ? `Direct relay from ${sourceLabel}.` : 'Direct relay URL.'
    }
    return 'Select a station to visualize the path.'
  }, [deviceLocation, mode, sourceLabel, stationCoords])

  const receivingDetail = deviceLocation
    ? 'Saved operator endpoint.'
    : 'Home endpoint not configured yet.'

  return (
    <div className="winamp-signal-layout">
      <div className="winamp-signal-canvas-shell">
        <canvas ref={canvasRef} className="winamp-signal-canvas" />
      </div>

      <div className="winamp-signal-readout">
        <SignalCard
          label="Origin"
          value={
            station
              ? station.location
              : mode === 'local'
                ? 'Local library'
                : mode === 'custom'
                  ? 'Direct stream'
                  : 'No signal'
          }
          detail={station ? `${station.callSign} · ${station.frequency}` : sourceLabel ?? 'Choose a source to map.'}
        />
        <SignalCard
          label="Receiving"
          value={deviceLocation?.label ?? 'Setup required'}
          detail={receivingDetail}
        />
        <SignalCard label="Path" value={pathValue} detail={pathDetail} />
      </div>
    </div>
  )
}
