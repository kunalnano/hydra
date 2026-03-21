import { useEffect, useMemo, useRef } from 'react'
import type { RadioStation } from '../panels/fm-stations'

const TAU = Math.PI * 2
const LAND_SAMPLE_STEP_DEGREES = 4
const HOME_LOCATION: DeviceLocation = {
  coords: [29.7438332, -98.4530729],
  label: 'Bulverde, TX',
  source: 'fixed'
}

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

const LAND_POLYGONS: Array<Array<[number, number]>> = [
  [
    [72, -168],
    [67, -150],
    [61, -142],
    [58, -132],
    [55, -124],
    [50, -121],
    [47, -128],
    [42, -125],
    [34, -117],
    [25, -109],
    [18, -98],
    [18, -88],
    [24, -81],
    [31, -78],
    [40, -73],
    [48, -66],
    [56, -60],
    [64, -62],
    [70, -82],
    [73, -112]
  ],
  [
    [83, -72],
    [77, -60],
    [73, -48],
    [69, -38],
    [64, -30],
    [62, -18],
    [68, -18],
    [76, -28],
    [82, -42],
    [84, -58]
  ],
  [
    [12, -81],
    [7, -78],
    [2, -80],
    [-8, -78],
    [-18, -74],
    [-28, -71],
    [-38, -69],
    [-50, -63],
    [-55, -53],
    [-52, -44],
    [-42, -38],
    [-28, -40],
    [-12, -48],
    [-2, -54],
    [6, -60],
    [11, -70]
  ],
  [
    [72, -10],
    [70, 10],
    [69, 28],
    [66, 48],
    [62, 68],
    [58, 88],
    [54, 108],
    [49, 128],
    [42, 145],
    [34, 158],
    [26, 146],
    [18, 122],
    [11, 102],
    [8, 84],
    [14, 68],
    [22, 56],
    [30, 44],
    [38, 34],
    [46, 24],
    [54, 14],
    [60, 4],
    [58, -6],
    [48, -10],
    [39, -6],
    [35, 4],
    [36, 18],
    [42, 28],
    [47, 20],
    [52, 10],
    [59, 0],
    [65, -8]
  ],
  [
    [37, -18],
    [35, -8],
    [33, 6],
    [31, 18],
    [26, 30],
    [20, 40],
    [12, 50],
    [1, 50],
    [-10, 44],
    [-20, 36],
    [-30, 27],
    [-35, 14],
    [-32, 2],
    [-26, -7],
    [-14, -12],
    [-1, -11],
    [11, -8],
    [22, -11],
    [31, -16]
  ],
  [
    [-11, 113],
    [-18, 117],
    [-25, 124],
    [-32, 132],
    [-38, 142],
    [-37, 151],
    [-28, 153],
    [-19, 147],
    [-13, 139],
    [-12, 127],
    [-16, 118]
  ]
]

type SignalMode = 'station' | 'local' | 'custom' | 'idle'
type DeviceLocationSource = 'fixed'

interface DeviceLocation {
  coords: [number, number]
  label: string
  source: DeviceLocationSource
}

interface RadioSignalGlobeProps {
  station: RadioStation | null
  mode: SignalMode
  sourceLabel: string | null
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

function project(
  lat: number,
  lon: number,
  cx: number,
  cy: number,
  radius: number,
  rotationOffset: number
): { x: number; y: number; visible: boolean } {
  const phi = (lat * Math.PI) / 180
  const lambda = (lon * Math.PI) / 180 + rotationOffset
  return {
    x: cx + radius * Math.cos(phi) * Math.sin(lambda),
    y: cy - radius * Math.sin(phi),
    visible: radius * Math.cos(phi) * Math.cos(lambda) > 0
  }
}

function greatCirclePoints(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  count: number
): Array<[number, number]> {
  const p1 = (lat1 * Math.PI) / 180
  const l1 = (lon1 * Math.PI) / 180
  const p2 = (lat2 * Math.PI) / 180
  const l2 = (lon2 * Math.PI) / 180
  const distance = Math.acos(
    Math.min(
      1,
      Math.max(-1, Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(l2 - l1))
    )
  )

  if (distance < 0.001) return [[lat1, lon1], [lat2, lon2]]

  const points: Array<[number, number]> = []
  for (let index = 0; index <= count; index++) {
    const fraction = index / count
    const a = Math.sin((1 - fraction) * distance) / Math.sin(distance)
    const b = Math.sin(fraction * distance) / Math.sin(distance)
    const x = a * Math.cos(p1) * Math.cos(l1) + b * Math.cos(p2) * Math.cos(l2)
    const y = a * Math.cos(p1) * Math.sin(l1) + b * Math.cos(p2) * Math.sin(l2)
    const z = a * Math.sin(p1) + b * Math.sin(p2)

    points.push([
      Math.atan2(z, Math.sqrt(x * x + y * y)) * (180 / Math.PI),
      Math.atan2(y, x) * (180 / Math.PI)
    ])
  }

  return points
}

function pointInPolygon(lat: number, lon: number, polygon: Array<[number, number]>): boolean {
  let inside = false

  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const [latA, lonA] = polygon[index]
    const [latB, lonB] = polygon[previous]
    const intersects =
      lonA > lon !== lonB > lon &&
      lat < ((latB - latA) * (lon - lonA)) / ((lonB - lonA) || 0.00001) + latA

    if (intersects) {
      inside = !inside
    }
  }

  return inside
}

function buildLandSamples(polygons: Array<Array<[number, number]>>): Array<[number, number]> {
  const points: Array<[number, number]> = []

  for (const polygon of polygons) {
    const latitudes = polygon.map(([lat]) => lat)
    const longitudes = polygon.map(([, lon]) => lon)
    const minLat = Math.floor(Math.min(...latitudes))
    const maxLat = Math.ceil(Math.max(...latitudes))
    const minLon = Math.floor(Math.min(...longitudes))
    const maxLon = Math.ceil(Math.max(...longitudes))

    for (let lat = minLat; lat <= maxLat; lat += LAND_SAMPLE_STEP_DEGREES) {
      for (let lon = minLon; lon <= maxLon; lon += LAND_SAMPLE_STEP_DEGREES) {
        const sampleLat = lat + LAND_SAMPLE_STEP_DEGREES / 2
        const sampleLon = lon + LAND_SAMPLE_STEP_DEGREES / 2
        if (pointInPolygon(sampleLat, sampleLon, polygon)) {
          points.push([sampleLat, sampleLon])
        }
      }
    }
  }

  return points
}

function densifyPolygon(polygon: Array<[number, number]>, step = 3): Array<[number, number]> {
  const points: Array<[number, number]> = []

  for (let index = 0; index < polygon.length; index++) {
    const current = polygon[index]
    const next = polygon[(index + 1) % polygon.length]
    const latDelta = next[0] - current[0]
    const lonDelta = next[1] - current[1]
    const segments = Math.max(1, Math.ceil(Math.max(Math.abs(latDelta), Math.abs(lonDelta)) / step))

    for (let segment = 0; segment < segments; segment++) {
      const t = segment / segments
      points.push([
        current[0] + latDelta * t,
        current[1] + lonDelta * t
      ])
    }
  }

  return points
}

const LAND_SAMPLE_POINTS = buildLandSamples(LAND_POLYGONS)
const LAND_COASTLINES = LAND_POLYGONS.map((polygon) => densifyPolygon(polygon))

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
  sourceLabel
}: RadioSignalGlobeProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef(0)
  const deviceLocation = HOME_LOCATION

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
      const radius = Math.min(cx, cy) * 0.74
      const rotation = time * (TAU / 75)
      const style = getComputedStyle(canvas)
      const accent = style.getPropertyValue('--winamp-blue-bright')
      const dim = style.getPropertyValue('--winamp-screen-dim')
      const landFill = colorWithAlpha(accent, 0.12, 'rgba(108, 173, 196, 0.12)')
      const coastlineStroke = colorWithAlpha(accent, 0.3, 'rgba(138, 203, 255, 0.3)')
      const gridStroke = colorWithAlpha(dim, 0.18, 'rgba(120, 180, 255, 0.08)')

      context.clearRect(0, 0, canvas.width, canvas.height)
      context.save()
      context.scale(dpr, dpr)

      context.beginPath()
      context.arc(cx, cy, radius, 0, TAU)
      context.fillStyle = 'rgba(7, 9, 14, 0.76)'
      context.fill()

      for (const [lat, lon] of LAND_SAMPLE_POINTS) {
        const point = project(lat, lon, cx, cy, radius, rotation)
        if (!point.visible) continue

        context.beginPath()
        context.arc(point.x, point.y, 1.6, 0, TAU)
        context.fillStyle = landFill
        context.fill()
      }

      context.strokeStyle = coastlineStroke
      context.lineWidth = 1.1
      for (const coastline of LAND_COASTLINES) {
        context.beginPath()
        let open = false
        for (const [lat, lon] of coastline) {
          const point = project(lat, lon, cx, cy, radius, rotation)
          if (point.visible) {
            if (!open) {
              context.moveTo(point.x, point.y)
              open = true
            } else {
              context.lineTo(point.x, point.y)
            }
          } else {
            open = false
          }
        }
        context.stroke()
      }

      context.strokeStyle = gridStroke
      context.lineWidth = 0.6
      for (let lat = -60; lat <= 60; lat += 30) {
        context.beginPath()
        let open = false
        for (let lon = -180; lon <= 180; lon += 3) {
          const point = project(lat, lon, cx, cy, radius, rotation)
          if (point.visible) {
            if (!open) {
              context.moveTo(point.x, point.y)
              open = true
            } else {
              context.lineTo(point.x, point.y)
            }
          } else {
            open = false
          }
        }
        context.stroke()
      }

      for (let lon = -180; lon < 180; lon += 30) {
        context.beginPath()
        let open = false
        for (let lat = -90; lat <= 90; lat += 3) {
          const point = project(lat, lon, cx, cy, radius, rotation)
          if (point.visible) {
            if (!open) {
              context.moveTo(point.x, point.y)
              open = true
            } else {
              context.lineTo(point.x, point.y)
            }
          } else {
            open = false
          }
        }
        context.stroke()
      }

      context.beginPath()
      context.arc(cx, cy, radius, 0, TAU)
      context.strokeStyle = 'rgba(140, 200, 255, 0.18)'
      context.lineWidth = 1
      context.stroke()

      const devicePoint = project(
        deviceLocation.coords[0],
        deviceLocation.coords[1],
        cx,
        cy,
        radius,
        rotation
      )

      if (stationCoords) {
        const arcPoints = greatCirclePoints(
          stationCoords[0],
          stationCoords[1],
          deviceLocation.coords[0],
          deviceLocation.coords[1],
          44
        ).map(([lat, lon]) => project(lat, lon, cx, cy, radius, rotation))

        context.beginPath()
        let open = false
        for (const point of arcPoints) {
          if (point.visible) {
            if (!open) {
              context.moveTo(point.x, point.y)
              open = true
            } else {
              context.lineTo(point.x, point.y)
            }
          } else {
            open = false
          }
        }
        context.strokeStyle = 'rgba(255, 212, 120, 0.75)'
        context.lineWidth = 1.8
        context.setLineDash([5, 7])
        context.lineDashOffset = -time * 24
        context.stroke()
        context.setLineDash([])

        const stationPoint = project(stationCoords[0], stationCoords[1], cx, cy, radius, rotation)
        if (stationPoint.visible) {
          context.beginPath()
          context.arc(stationPoint.x, stationPoint.y, 3.2, 0, TAU)
          context.fillStyle = 'rgba(135, 212, 255, 0.9)'
          context.fill()
        }
      }

      if (devicePoint.visible) {
        const pulse = 0.45 + Math.sin(time * 2.8) * 0.35
        context.beginPath()
        context.arc(devicePoint.x, devicePoint.y, 4 + pulse * 3, 0, TAU)
        context.fillStyle = `rgba(255, 212, 120, ${(0.12 + pulse * 0.1).toFixed(2)})`
        context.fill()

        context.beginPath()
        context.arc(devicePoint.x, devicePoint.y, 3.2, 0, TAU)
        context.fillStyle = 'rgba(255, 212, 120, 0.95)'
        context.fill()
      }

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
    if (stationCoords) {
      return formatDistance(haversineMiles(stationCoords, deviceLocation.coords))
    }
    if (mode === 'local') return 'Local'
    if (mode === 'custom') return 'Direct'
    return 'Idle'
  }, [deviceLocation.coords, mode, stationCoords])

  const pathDetail = useMemo(() => {
    if (stationCoords) {
      return 'Great-circle route over the world map from station origin to home.'
    }
    if (mode === 'local') {
      return 'Local file playback stays on-device.'
    }
    if (mode === 'custom') {
      return sourceLabel ? `Direct relay from ${sourceLabel}.` : 'Direct relay URL.'
    }
    return 'Select a station to visualize the path.'
  }, [mode, sourceLabel, stationCoords])

  const receivingDetail = 'Fixed home endpoint.'

  return (
    <div className="winamp-signal-layout">
      <div className="winamp-signal-canvas-shell">
        <canvas ref={canvasRef} className="winamp-signal-canvas" />
      </div>

      <div className="winamp-signal-readout">
        <SignalCard
          label="Origin"
          value={station ? station.location : mode === 'local' ? 'Local library' : mode === 'custom' ? 'Direct stream' : 'No signal'}
          detail={station ? `${station.callSign} · ${station.frequency}` : sourceLabel ?? 'Choose a source to map.'}
        />
        <SignalCard
          label="Receiving"
          value={deviceLocation.label}
          detail={receivingDetail}
        />
        <SignalCard
          label="Path"
          value={pathValue}
          detail={pathDetail}
        />
      </div>
    </div>
  )
}
