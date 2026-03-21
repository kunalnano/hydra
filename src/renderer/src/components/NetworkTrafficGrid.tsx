import { useEffect, useMemo, useRef, useState } from 'react'
import type { NetworkScope } from '../../../shared/types'

const TAU = Math.PI * 2
const SCOPE_ORDER: NetworkScope[] = ['loopback', 'lan', 'internet', 'unknown']

const SCOPE_META: Record<
  NetworkScope,
  { label: string; color: string; ringScale: number; glow: string }
> = {
  loopback: { label: 'Loopback', color: '#f59e0b', ringScale: 0.28, glow: 'rgba(245, 158, 11, 0.45)' },
  lan: { label: 'LAN', color: '#2dd4bf', ringScale: 0.47, glow: 'rgba(45, 212, 191, 0.38)' },
  internet: { label: 'Internet', color: '#60a5fa', ringScale: 0.67, glow: 'rgba(96, 165, 250, 0.34)' },
  unknown: { label: 'Unknown', color: '#94a3b8', ringScale: 0.82, glow: 'rgba(148, 163, 184, 0.24)' }
}

export interface NetworkGridPeer {
  id: string
  label: string
  scope: NetworkScope
  bytesInPerSec: number
  bytesOutPerSec: number
  connectionCount: number
}

interface LayoutPeer extends NetworkGridPeer {
  x: number
  y: number
  radius: number
  angle: number
}

interface NetworkTrafficGridProps {
  peers: NetworkGridPeer[]
  selectedPeerId: string | null
  onSelect: (id: string) => void
}

function hashValue(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 4294967295
}

function truncateLabel(value: string, max = 16): string {
  if (value.length <= max) return value
  return `${value.slice(0, max - 1)}…`
}

function quadraticPoint(
  startX: number,
  startY: number,
  controlX: number,
  controlY: number,
  endX: number,
  endY: number,
  t: number
): { x: number; y: number } {
  const inv = 1 - t
  return {
    x: inv * inv * startX + 2 * inv * t * controlX + t * t * endX,
    y: inv * inv * startY + 2 * inv * t * controlY + t * t * endY
  }
}

function buildLayout(peers: NetworkGridPeer[], width: number, height: number): LayoutPeer[] {
  if (!width || !height) return []

  const centerX = width / 2
  const centerY = height / 2 + 8
  const baseRadius = Math.min(width, height) * 0.48
  const byScope = new Map<NetworkScope, NetworkGridPeer[]>()

  for (const scope of SCOPE_ORDER) {
    byScope.set(scope, [])
  }

  for (const peer of peers) {
    byScope.get(peer.scope)?.push(peer)
  }

  const layout: LayoutPeer[] = []

  for (const scope of SCOPE_ORDER) {
    const scoped = (byScope.get(scope) || []).slice().sort((left, right) => {
      const leftTotal = left.bytesInPerSec + left.bytesOutPerSec
      const rightTotal = right.bytesInPerSec + right.bytesOutPerSec
      return rightTotal - leftTotal
    })
    if (!scoped.length) continue

    const ringRadius = baseRadius * SCOPE_META[scope].ringScale
    const spread = TAU / scoped.length
    const offset = hashValue(scope) * TAU

    scoped.forEach((peer, index) => {
      const angle = offset + index * spread + hashValue(peer.id) * 0.32
      layout.push({
        ...peer,
        angle,
        radius: ringRadius,
        x: centerX + Math.cos(angle) * ringRadius,
        y: centerY + Math.sin(angle) * ringRadius * 0.76
      })
    })
  }

  return layout
}

export function NetworkTrafficGrid({
  peers,
  selectedPeerId,
  onSelect
}: NetworkTrafficGridProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef(0)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return

      setSize({
        width: Math.round(entry.contentRect.width),
        height: Math.round(entry.contentRect.height)
      })
    })

    observer.observe(host)
    return () => observer.disconnect()
  }, [])

  const layout = useMemo(
    () => buildLayout(peers, size.width, size.height),
    [peers, size.width, size.height]
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !size.width || !size.height) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = size.width * dpr
    canvas.height = size.height * dpr
    canvas.style.width = `${size.width}px`
    canvas.style.height = `${size.height}px`

    const render = (): void => {
      const context = canvas.getContext('2d')
      if (!context) return

      const time = performance.now() / 1000
      const width = size.width
      const height = size.height
      const centerX = width / 2
      const centerY = height / 2 + 8
      const baseRadius = Math.min(width, height) * 0.48

      context.setTransform(1, 0, 0, 1, 0, 0)
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.scale(dpr, dpr)

      const wash = context.createLinearGradient(0, 0, width, height)
      wash.addColorStop(0, 'rgba(15, 23, 42, 0.92)')
      wash.addColorStop(1, 'rgba(2, 6, 23, 0.95)')
      context.fillStyle = wash
      context.fillRect(0, 0, width, height)

      context.strokeStyle = 'rgba(148, 163, 184, 0.08)'
      context.lineWidth = 1
      for (let x = 0; x <= width; x += 28) {
        context.beginPath()
        context.moveTo(x + 0.5, 0)
        context.lineTo(x + 0.5, height)
        context.stroke()
      }
      for (let y = 0; y <= height; y += 28) {
        context.beginPath()
        context.moveTo(0, y + 0.5)
        context.lineTo(width, y + 0.5)
        context.stroke()
      }

      for (const scope of SCOPE_ORDER) {
        const meta = SCOPE_META[scope]
        if (!peers.some((peer) => peer.scope === scope)) continue

        context.beginPath()
        context.ellipse(
          centerX,
          centerY,
          baseRadius * meta.ringScale,
          baseRadius * meta.ringScale * 0.76,
          0,
          0,
          TAU
        )
        context.strokeStyle = meta.glow
        context.lineWidth = scope === 'internet' ? 1.2 : 1
        context.stroke()

        context.fillStyle = 'rgba(226, 232, 240, 0.55)'
        context.font = '10px var(--helm-font-mono)'
        context.fillText(meta.label.toUpperCase(), 14, 18 + SCOPE_ORDER.indexOf(scope) * 14)
      }

      for (const peer of layout) {
        const meta = SCOPE_META[peer.scope]
        const totalRate = peer.bytesInPerSec + peer.bytesOutPerSec
        const normalized = Math.max(0.15, Math.min(1, totalRate / (1024 * 512)))
        const selected = peer.id === selectedPeerId
        const controlX = centerX + Math.cos(peer.angle) * (peer.radius * 0.5)
        const controlY =
          centerY +
          Math.sin(peer.angle) * (peer.radius * 0.34) -
          Math.cos(peer.angle * 1.7) * (selected ? 22 : 14)

        context.beginPath()
        context.moveTo(centerX, centerY)
        context.quadraticCurveTo(controlX, controlY, peer.x, peer.y)
        context.strokeStyle = selected ? meta.color : `${meta.color}88`
        context.lineWidth = selected ? 2.4 : 1.15 + normalized * 1.5
        context.shadowBlur = selected ? 10 : 0
        context.shadowColor = meta.color
        context.stroke()
        context.shadowBlur = 0

        for (let pulse = 0; pulse < 2; pulse++) {
          const direction = pulse === 0 ? peer.bytesOutPerSec : peer.bytesInPerSec
          if (direction <= 0) continue

          const progress = (time * (0.22 + normalized * 0.52) + pulse * 0.33 + hashValue(peer.id)) % 1
          const t = pulse === 0 ? progress : 1 - progress
          const point = quadraticPoint(centerX, centerY, controlX, controlY, peer.x, peer.y, t)

          context.beginPath()
          context.arc(point.x, point.y, selected ? 3.3 : 2.4, 0, TAU)
          context.fillStyle = pulse === 0 ? '#60a5fa' : '#34d399'
          context.shadowBlur = 12
          context.shadowColor = pulse === 0 ? '#60a5fa' : '#34d399'
          context.fill()
          context.shadowBlur = 0
        }

        context.beginPath()
        context.arc(peer.x, peer.y, selected ? 8.5 : 6.5, 0, TAU)
        context.fillStyle = meta.color
        context.globalAlpha = selected ? 0.95 : 0.82
        context.fill()
        context.globalAlpha = 1

        context.beginPath()
        context.arc(peer.x, peer.y, selected ? 13 : 10, 0, TAU)
        context.strokeStyle = selected ? `${meta.color}aa` : `${meta.color}55`
        context.lineWidth = 1
        context.stroke()
      }

      context.save()
      context.translate(centerX, centerY)
      context.rotate(time * 0.24)
      context.fillStyle = '#e2e8f0'
      context.shadowBlur = 18
      context.shadowColor = 'rgba(226, 232, 240, 0.35)'
      context.beginPath()
      context.moveTo(0, -12)
      context.lineTo(12, 0)
      context.lineTo(0, 12)
      context.lineTo(-12, 0)
      context.closePath()
      context.fill()
      context.restore()

      context.fillStyle = 'rgba(226, 232, 240, 0.82)'
      context.font = '11px var(--helm-font-mono)'
      context.fillText('HOST', centerX - 14, centerY + 27)

      animationRef.current = requestAnimationFrame(render)
    }

    animationRef.current = requestAnimationFrame(render)
    return () => cancelAnimationFrame(animationRef.current)
  }, [layout, peers, selectedPeerId, size.height, size.width])

  return (
    <div
      ref={hostRef}
      className="relative h-[250px] overflow-hidden rounded-xl border border-white/8 bg-slate-950/75"
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      <div className="pointer-events-none absolute left-3 top-3 rounded-full border border-white/10 bg-black/35 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-white/65">
        Traffic Grid
      </div>

      {layout.map((peer) => {
        const selected = peer.id === selectedPeerId
        return (
          <button
            key={peer.id}
            type="button"
            onClick={() => onSelect(peer.id)}
            className="absolute -translate-x-1/2 -translate-y-1/2 outline-none"
            style={{ left: `${peer.x}px`, top: `${peer.y}px` }}
            title={`${peer.label} • ${SCOPE_META[peer.scope].label}`}
          >
            <span className="sr-only">{peer.label}</span>
            <span
              className={`pointer-events-none absolute left-1/2 top-[16px] -translate-x-1/2 whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-[10px] ${
                selected
                  ? 'border-white/25 bg-black/70 text-white'
                  : 'border-white/10 bg-black/45 text-white/65'
              }`}
            >
              {truncateLabel(peer.label)}
            </span>
            <span className="block h-6 w-6 rounded-full bg-transparent" />
          </button>
        )
      })}
    </div>
  )
}
