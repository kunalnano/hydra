import { useEffect, useRef } from 'react'
import type { AudioStatus } from '../stores/audio-engine'

const TAU = Math.PI * 2

interface RadioRippleVisualizerProps {
  status: AudioStatus
  volume: number
  seed: string | null
}

function hashSeed(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 4294967295
}

function drawDroplet(context: CanvasRenderingContext2D, size: number, stretch: number): void {
  context.beginPath()
  context.moveTo(0, -size * 1.18)
  context.bezierCurveTo(size * 0.72, -size * 0.62, size * 0.96, size * 0.04, 0, size * 1.15 * stretch)
  context.bezierCurveTo(-size * 0.96, size * 0.04, -size * 0.72, -size * 0.62, 0, -size * 1.18)
  context.closePath()
}

export function RadioRippleVisualizer({
  status,
  volume,
  seed
}: RadioRippleVisualizerProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef(0)
  const stateRef = useRef({ status, volume, seed: seed ?? 'signal' })

  stateRef.current = { status, volume, seed: seed ?? 'signal' }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const resize = (): void => {
      const parent = canvas.parentElement
      if (!parent) return

      const dpr = window.devicePixelRatio || 1
      const width = parent.clientWidth
      const height = Math.max(112, parent.clientHeight)
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
    }

    const observer = new ResizeObserver(resize)
    if (canvas.parentElement) {
      observer.observe(canvas.parentElement)
    }
    resize()

    const render = (): void => {
      const context = canvas.getContext('2d')
      if (!context) return

      const dpr = window.devicePixelRatio || 1
      const width = canvas.width / dpr
      const height = canvas.height / dpr
      const time = performance.now() / 1000
      const centerX = width / 2
      const surfaceY = height * 0.68
      const computedStyle = getComputedStyle(canvas)
      const accent = computedStyle.getPropertyValue('--winamp-blue-bright').trim() || '#5eb3ff'
      const dim = computedStyle.getPropertyValue('--winamp-screen-dim').trim() || '#688eb7'
      const { seed: currentSeed } = stateRef.current
      const phase = hashSeed(currentSeed) * TAU

      const motion = (() => {
        switch (stateRef.current.status) {
          case 'playing':
            return 0.96
          case 'loading':
            return 0.62
          case 'paused':
            return 0.28
          case 'error':
            return 0.22
          default:
            return 0.14
        }
      })()

      const energy = Math.min(1, 0.18 + motion * 0.62 + stateRef.current.volume * 0.28)
      const rippleSpeed = 0.28 + energy * 0.62
      const dropletLift = 22 + energy * 14 + Math.sin(time * (1.5 + motion) + phase) * (3 + energy * 2)
      const dropletY = surfaceY - dropletLift
      const dropletSize = 9 + energy * 7 + Math.sin(time * (2.6 + motion * 2.2) + phase) * 1.6
      const maxRippleWidth = width * (0.35 + energy * 0.16)

      context.setTransform(1, 0, 0, 1, 0, 0)
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.scale(dpr, dpr)

      const haze = context.createRadialGradient(
        centerX,
        surfaceY - 6,
        dropletSize * 0.4,
        centerX,
        surfaceY - 6,
        Math.max(width, height) * 0.42
      )
      haze.addColorStop(0, 'rgba(255,255,255,0.08)')
      haze.addColorStop(0.3, 'rgba(255,255,255,0.03)')
      haze.addColorStop(1, 'rgba(255,255,255,0)')
      context.fillStyle = haze
      context.fillRect(0, 0, width, height)

      context.save()
      for (let line = 0; line < height; line += 5) {
        context.globalAlpha = 0.035
        context.strokeStyle = dim
        context.lineWidth = 1
        context.beginPath()
        context.moveTo(0, line + 0.5)
        context.lineTo(width, line + 0.5)
        context.stroke()
      }
      context.restore()

      context.save()
      context.globalAlpha = 0.1 + energy * 0.12
      context.strokeStyle = accent
      context.lineWidth = 1.1
      context.beginPath()
      context.moveTo(centerX, 10)
      context.quadraticCurveTo(
        centerX + Math.sin(time * 1.25 + phase) * (5 + energy * 4),
        dropletY - dropletSize * 0.9,
        centerX,
        dropletY - dropletSize * 0.28
      )
      context.stroke()
      context.restore()

      context.save()
      context.globalAlpha = 0.16 + energy * 0.16
      context.fillStyle = accent
      context.beginPath()
      context.ellipse(centerX, surfaceY, 18 + energy * 12, 4 + energy * 1.8, 0, 0, TAU)
      context.fill()
      context.restore()

      for (let index = 0; index < 5; index++) {
        const progress = (time * rippleSpeed + index * 0.18 + phase / TAU) % 1
        const spread = 12 + progress * maxRippleWidth
        const heightScale = 2.2 + progress * (8 + energy * 4)
        const alpha = (0.38 - index * 0.05) * Math.pow(1 - progress, 1.35)

        context.save()
        context.globalAlpha = alpha
        context.strokeStyle = index % 2 === 0 ? accent : dim
        context.lineWidth = Math.max(0.8, 1.8 - progress * 1.15)
        context.beginPath()
        context.ellipse(centerX, surfaceY, spread, heightScale, 0, 0, TAU)
        context.stroke()
        context.restore()
      }

      context.save()
      context.globalAlpha = 0.18 + energy * 0.22
      context.fillStyle = accent
      context.shadowBlur = 24
      context.shadowColor = accent
      context.beginPath()
      context.ellipse(centerX, dropletY + dropletSize * 1.55, dropletSize * 0.8, dropletSize * 0.26, 0, 0, TAU)
      context.fill()
      context.restore()

      context.save()
      context.translate(centerX, dropletY)
      context.scale(1, 0.96 + Math.sin(time * (2.4 + motion) + phase) * 0.04)
      drawDroplet(context, dropletSize, 0.94 + Math.sin(time * (3.4 + motion) + phase) * 0.08)
      const dropletGradient = context.createLinearGradient(0, -dropletSize * 1.1, 0, dropletSize * 1.25)
      dropletGradient.addColorStop(0, '#fffdf5')
      dropletGradient.addColorStop(0.22, accent)
      dropletGradient.addColorStop(1, dim)
      context.fillStyle = dropletGradient
      context.shadowBlur = 18
      context.shadowColor = accent
      context.fill()

      context.shadowBlur = 0
      context.globalAlpha = 0.72
      context.fillStyle = 'rgba(255,255,255,0.74)'
      context.beginPath()
      context.ellipse(-dropletSize * 0.2, -dropletSize * 0.28, dropletSize * 0.22, dropletSize * 0.36, 0.4, 0, TAU)
      context.fill()
      context.restore()

      for (let index = 0; index < 4; index++) {
        const orbitAngle = time * (0.7 + motion + index * 0.12) + phase + index * 1.35
        const orbitRadiusX = 14 + index * 8 + energy * 8
        const orbitRadiusY = 5 + index * 1.5 + energy * 4
        const x = centerX + Math.cos(orbitAngle) * orbitRadiusX
        const y = dropletY + Math.sin(orbitAngle * 1.4) * orbitRadiusY

        context.save()
        context.globalAlpha = 0.18 + energy * 0.22
        context.fillStyle = index === 0 ? '#fff7de' : accent
        context.beginPath()
        context.arc(x, y, index === 0 ? 1.8 : 1.15 + energy * 0.4, 0, TAU)
        context.fill()
        context.restore()
      }

      animationRef.current = requestAnimationFrame(render)
    }

    animationRef.current = requestAnimationFrame(render)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(animationRef.current)
    }
  }, [])

  return (
    <div className={`winamp-ripple-panel winamp-ripple-panel--${status}`} aria-hidden="true">
      <canvas ref={canvasRef} className="winamp-ripple-canvas" />
    </div>
  )
}
