import { useEffect, useMemo, useRef, useState } from 'react'
import type { RadioStation } from '../panels/fm-stations'

const TAU = Math.PI * 2
const DEFAULT_DEVICE_COORDS: [number, number] = [39.5, -98.35]

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

const TIMEZONE_FALLBACKS: Record<string, { coords: [number, number]; label: string }> = {
  'America/New_York': { coords: [40.7128, -74.006], label: 'New York region' },
  'America/Chicago': { coords: [41.8781, -87.6298], label: 'Chicago region' },
  'America/Denver': { coords: [39.7392, -104.9903], label: 'Denver region' },
  'America/Los_Angeles': { coords: [34.0522, -118.2437], label: 'Los Angeles region' },
  'America/Phoenix': { coords: [33.4484, -112.074], label: 'Phoenix region' },
  'America/Anchorage': { coords: [61.2181, -149.9003], label: 'Anchorage region' },
  'Pacific/Honolulu': { coords: [21.3099, -157.8581], label: 'Honolulu region' },
  'Europe/London': { coords: [51.5072, -0.1276], label: 'London region' }
}

type SignalMode = 'station' | 'local' | 'custom' | 'idle'
type DeviceLocationSource = 'geolocation' | 'timezone' | 'fallback'

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

function resolveTimezoneFallback(): DeviceLocation {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const fallback = TIMEZONE_FALLBACKS[zone]
  if (fallback) {
    return { coords: fallback.coords, label: fallback.label, source: 'timezone' }
  }

  return { coords: DEFAULT_DEVICE_COORDS, label: 'Device region', source: 'fallback' }
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
  const [deviceLocation, setDeviceLocation] = useState<DeviceLocation>(() => resolveTimezoneFallback())

  const stationCoords = station ? STATION_COORDS[station.id] ?? null : null

  useEffect(() => {
    if (!navigator.geolocation) return

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setDeviceLocation({
          coords: [position.coords.latitude, position.coords.longitude],
          label: 'Current location',
          source: 'geolocation'
        })
      },
      () => {
        /* fall back to timezone approximation */
      },
      {
        enableHighAccuracy: false,
        timeout: 5000,
        maximumAge: 5 * 60 * 1000
      }
    )
  }, [])

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

      context.clearRect(0, 0, canvas.width, canvas.height)
      context.save()
      context.scale(dpr, dpr)

      context.beginPath()
      context.arc(cx, cy, radius, 0, TAU)
      context.fillStyle = 'rgba(7, 9, 14, 0.76)'
      context.fill()

      context.strokeStyle = 'rgba(120, 180, 255, 0.08)'
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
      return 'Great-circle route from station origin to your device.'
    }
    if (mode === 'local') {
      return 'Local file playback stays on-device.'
    }
    if (mode === 'custom') {
      return sourceLabel ? `Direct relay from ${sourceLabel}.` : 'Direct relay URL.'
    }
    return 'Select a station to visualize the path.'
  }, [mode, sourceLabel, stationCoords])

  const receivingDetail =
    deviceLocation.source === 'geolocation'
      ? 'Live device location.'
      : deviceLocation.source === 'timezone'
        ? 'Timezone-based approximation.'
        : 'Fallback region.'

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
