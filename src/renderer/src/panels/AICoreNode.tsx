import { useEffect, useMemo, useRef, useCallback } from 'react'
import type { YenneferStyle, ProcessGroup, AgentInfo, PortInfo, GitRepoInfo } from '../../../shared/types'
import {
  type MechAntenna, type MechParams, type ArmorPlate, type CircuitNode,
  type EntityKind, type LatticeEntity,
  MODE_MECH_PARAMS,
  reconcileAntennas, buildArmorPlates, buildCircuitNodes,
  coreRadius, sNoise, rgba, drawSquare, drawDiamond, drawHexagon
} from './mech-entity'

export type AICoreMode = 'idle' | 'thinking' | 'speaking' | 'repairing' | 'offline' | 'throughput'
export type { EntityKind }

const TAU = Math.PI * 2
const BASE_R = 68
const CX = 396
const CY = 194

const MODE_THEME: Record<AICoreMode, {
  label: string; detail: string; shell: string; border: string; text: string
  glowColor: { r: number; g: number; b: number }
}> = {
  idle:       { label: 'Hydra Awake', detail: 'The core is coherent and waiting for the next command.', shell: 'from-[#0a0800] via-[#0f0c04] to-[#050400]', border: 'border-amber-400/20', text: 'text-amber-200', glowColor: { r: 255, g: 210, b: 130 } },
  thinking:   { label: 'Hydra Thinking', detail: 'Antennas extend as Yennefer resolves context.', shell: 'from-[#0c0a02] via-[#100e06] to-[#060500]', border: 'border-amber-300/24', text: 'text-amber-100', glowColor: { r: 255, g: 220, b: 150 } },
  speaking:   { label: 'Yennefer Channel Open', detail: 'Inference resolved. The entity brightens with the answer.', shell: 'from-[#0e0c04] via-[#121008] to-[#070600]', border: 'border-yellow-300/22', text: 'text-yellow-100', glowColor: { r: 255, g: 240, b: 180 } },
  repairing:  { label: 'Repair Cycle Active', detail: 'Testing paths and rebuilding the LM Studio route.', shell: 'from-[#0d0800] via-[#100a04] to-[#060400]', border: 'border-orange-400/24', text: 'text-orange-200', glowColor: { r: 245, g: 180, b: 80 } },
  offline:    { label: 'Core Isolated', detail: 'The entity is alive but the inference line is down.', shell: 'from-[#080604] via-[#0a0806] to-[#040302]', border: 'border-yellow-700/20', text: 'text-yellow-600', glowColor: { r: 140, g: 110, b: 70 } },
  throughput: { label: 'Throughput Mode', detail: 'Entity saturated. Antennas at maximum extension.', shell: 'from-[#0c0a04] via-[#100e08] to-[#060500]', border: 'border-yellow-200/22', text: 'text-yellow-100', glowColor: { r: 255, g: 245, b: 210 } }
}

const KIND_COLORS: Record<EntityKind, string> = {
  workspace: 'rgb(255,210,130)', agent: 'rgb(255,170,90)',
  port: 'rgb(245,240,210)', git: 'rgb(200,170,110)', ambient: 'rgb(160,140,100)'
}

interface AICoreNodeProps {
  mode: AICoreMode; mono?: boolean; activeAgents: number; totalAgents: number
  cpuUsage: number; memoryUsage: number; listenerCount: number
  yenneferStyle: YenneferStyle; lmStudioUrl: string; privacyMode?: boolean; disabled: boolean
  processes?: ProcessGroup[]; agents?: AgentInfo[]; ports?: PortInfo[]; gitRepos?: GitRepoInfo[]
  onInvokeYennefer: () => void; onRequestBriefing: () => void; onRepair: () => void
  onToggleMono?: () => void; onSetYenneferStyle?: (s: YenneferStyle) => void; lensDisabled?: boolean
}

function buildEntities(ps?: ProcessGroup[], ag?: AgentInfo[], po?: PortInfo[], gr?: GitRepoInfo[]): LatticeEntity[] {
  const e: LatticeEntity[] = []
  if (ps) for (const g of ps) e.push({ kind: 'workspace', name: g.name, activity: Math.max(0.15, Math.min(1, g.totalCpu / 100)) })
  if (ag) for (const a of ag) e.push({ kind: 'agent', name: a.name, activity: a.status === 'active' || a.status === 'busy' ? 0.9 : a.status === 'idle' ? 0.4 : 0.15 })
  if (po) for (const p of po) { if (p.state === 'LISTEN') e.push({ kind: 'port', name: `${p.port}/${p.process}`, activity: 0.5 }) }
  if (gr) for (const r of gr) e.push({ kind: 'git', name: r.name, activity: r.dirty ? 0.7 : r.ahead > 0 ? 0.5 : 0.25 })
  return e
}

function titleCase(v: string): string { return v[0].toUpperCase() + v.slice(1) }

function MetricPill({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }): JSX.Element {
  return (
    <div className={`rounded-[4px] border px-3 py-2 ${emphasis ? 'border-amber-400/30 bg-amber-900/20' : 'border-white/10 bg-black/20'}`}>
      <div className="text-[10px] uppercase tracking-[0.16em] text-gray-500 font-[family-name:var(--hydra-font-mono)]">{label}</div>
      <div className="mt-1 text-sm font-semibold text-gray-100 font-[family-name:var(--hydra-font-mono)]">{value}</div>
    </div>
  )
}

function ActionNode({ label, detail, accent, disabled, onClick }: { label: string; detail: string; accent: string; disabled: boolean; onClick: () => void }): JSX.Element {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`rounded-[4px] border px-3 py-3 text-left transition-all ${disabled ? 'cursor-not-allowed border-white/10 bg-white/5 text-gray-500' : `border-white/10 ${accent} hover:-translate-y-0.5 hover:border-white/20`}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] font-[family-name:var(--hydra-font-mono)]">{label}</div>
      <div className="mt-1 text-xs text-gray-300">{detail}</div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Canvas render
// ---------------------------------------------------------------------------

interface RenderState {
  mode: AICoreMode
  params: MechParams
  antennas: MechAntenna[]
  plates: ArmorPlate[]
  circuits: CircuitNode[]
  mono: boolean
}

function renderFrame(ctx: CanvasRenderingContext2D, w: number, h: number, time: number, st: RenderState): void {
  const { params, antennas, plates, circuits, mono, mode } = st
  const gc = MODE_THEME[mode].glowColor

  ctx.clearRect(0, 0, w, h)

  // Scale to viewBox coordinates (792x388)
  const sx = w / 792
  const sy = h / 388
  ctx.save()
  ctx.scale(sx, sy)

  // 1. EM field rings
  for (let i = 0; i < 4; i++) {
    const r = BASE_R + 30 + i * 22
    const rot = time * (i % 2 === 0 ? 0.15 : -0.12) + i * 0.8
    ctx.save()
    ctx.translate(CX, CY)
    ctx.rotate(rot)
    ctx.beginPath()
    ctx.arc(0, 0, r, 0, TAU)
    ctx.strokeStyle = rgba(gc.r, gc.g, gc.b, 0.06 + params.glow * 0.04)
    ctx.lineWidth = 0.6
    ctx.setLineDash([3, 10])
    ctx.stroke()
    ctx.setLineDash([])
    ctx.restore()
  }

  // 2. Orbiting debris
  for (let i = 0; i < 20; i++) {
    const a = time * (0.08 + i * 0.012) + i * 1.3
    const r = BASE_R + 20 + (i * 7) % 50
    const dx = CX + Math.cos(a) * r
    const dy = CY + Math.sin(a) * r
    const sz = 0.8 + (i % 3) * 0.4
    const op = 0.12 + params.glow * 0.08
    if (i % 3 === 0) {
      drawSquare(ctx, dx, dy, sz, time * 0.3 + i, rgba(gc.r, gc.g, gc.b, op))
    } else {
      ctx.fillStyle = rgba(gc.r, gc.g, gc.b, op)
      ctx.fillRect(dx, dy, sz * 2, 0.5)
    }
  }

  // 3. Antenna spikes
  for (const ant of antennas) {
    let lengthMul = params.spkLen
    let alpha = 1.0

    if (ant.dying) {
      const dt = Math.max(0, Math.min(1, (time - ant.deathTime) / 0.4))
      lengthMul *= 1 - dt
      alpha = 1 - dt
    } else {
      const bt = Math.max(0, Math.min(1, (time - ant.birthTime) / 0.5))
      lengthMul *= bt
      alpha = bt
    }

    ant.currentLength += (ant.baseLength * lengthMul - ant.currentLength) * 0.08

    const cR = coreRadius(ant.angle, time, params, BASE_R)
    const bx = CX + Math.cos(ant.angle) * cR
    const by = CY + Math.sin(ant.angle) * cR
    const c = mono ? { r: 200, g: 200, b: 200 } : ant.color
    const segLen = ant.currentLength / ant.segments
    const pulse = Math.sin(time * ant.pulseFreq * TAU + ant.phase) * 0.5 + 0.5

    let px = bx, py = by, segAngle = ant.angle
    for (let s = 0; s < ant.segments; s++) {
      const jitter = sNoise(ant.phase + s, time * 0.3, 0) * 0.06 * params.spkAct
      segAngle += jitter
      const nx = px + Math.cos(segAngle) * segLen
      const ny = py + Math.sin(segAngle) * segLen
      const thick = ant.width * (1 - s * 0.25 / ant.segments)
      const segAlpha = alpha * (0.5 + pulse * 0.3) * (1 - s * 0.15)

      // Spine glow
      ctx.beginPath()
      ctx.moveTo(px, py)
      ctx.lineTo(nx, ny)
      ctx.strokeStyle = rgba(c.r, c.g, c.b, segAlpha * 0.15)
      ctx.lineWidth = thick * 4
      ctx.stroke()

      // Main line
      ctx.beginPath()
      ctx.moveTo(px, py)
      ctx.lineTo(nx, ny)
      ctx.strokeStyle = rgba(c.r, c.g, c.b, segAlpha)
      ctx.lineWidth = thick
      ctx.stroke()

      // Joint square
      if (s > 0) {
        drawSquare(ctx, px, py, thick * 1.2, time * 0.2 + ant.phase + s, rgba(c.r, c.g, c.b, segAlpha * 0.8))
      }
      px = nx; py = ny
    }

    // Tip sensor
    if (ant.hasNode && ant.currentLength > 2) {
      const tipAlpha = alpha * (0.5 + pulse * 0.5)
      // Radial glow
      const grad = ctx.createRadialGradient(px, py, 0, px, py, ant.nodeSize * 3)
      grad.addColorStop(0, rgba(c.r, c.g, c.b, tipAlpha * 0.3))
      grad.addColorStop(1, rgba(c.r, c.g, c.b, 0))
      ctx.fillStyle = grad
      ctx.fillRect(px - ant.nodeSize * 3, py - ant.nodeSize * 3, ant.nodeSize * 6, ant.nodeSize * 6)

      if (ant.kind === 'workspace') {
        drawSquare(ctx, px, py, ant.nodeSize, time * 0.5 + ant.phase, rgba(c.r, c.g, c.b, tipAlpha))
      } else if (ant.kind === 'agent') {
        drawDiamond(ctx, px, py, ant.nodeSize * 1.2, time * 0.3 + ant.phase, rgba(c.r, c.g, c.b, tipAlpha))
        drawDiamond(ctx, px, py, ant.nodeSize * 0.6, -time * 0.2 + ant.phase, rgba(c.r, c.g, c.b, tipAlpha * 0.7))
      } else if (ant.kind === 'git') {
        const blinkRate = ant.activity > 0.5 ? 4 : 1.5
        const blinkAlpha = tipAlpha * (0.4 + Math.sin(time * blinkRate * TAU + ant.phase) * 0.6)
        drawDiamond(ctx, px, py, ant.nodeSize, ant.phase, rgba(c.r, c.g, c.b, Math.max(0, blinkAlpha)))
      } else {
        drawSquare(ctx, px, py, ant.nodeSize * 0.8, 0, rgba(c.r, c.g, c.b, tipAlpha * 0.8))
      }
    }
  }

  // 4. Armor plates
  for (const plate of plates) {
    const breatheShift = Math.sin(time * plate.freq * TAU + plate.phase) * params.bAmp * 6 * params.pDrift
    const innerR = coreRadius((plate.angStart + plate.angEnd) / 2, time, params, BASE_R) - 2
    const outerR = innerR + plate.thickness + breatheShift

    ctx.beginPath()
    ctx.arc(CX, CY, innerR, plate.angStart, plate.angEnd)
    ctx.arc(CX, CY, outerR, plate.angEnd, plate.angStart, true)
    ctx.closePath()

    const midAng = (plate.angStart + plate.angEnd) / 2
    const grd = ctx.createRadialGradient(
      CX + Math.cos(midAng) * innerR, CY + Math.sin(midAng) * innerR, 0,
      CX + Math.cos(midAng) * outerR, CY + Math.sin(midAng) * outerR, plate.thickness
    )
    grd.addColorStop(0, rgba(40, 32, 18, 0.9))
    grd.addColorStop(0.5, rgba(70, 56, 32, 0.85))
    grd.addColorStop(1, rgba(35, 28, 16, 0.8))
    ctx.fillStyle = grd
    ctx.fill()

    // Outer rim highlight
    ctx.beginPath()
    ctx.arc(CX, CY, outerR, plate.angStart, plate.angEnd)
    ctx.strokeStyle = rgba(gc.r, gc.g, gc.b, 0.25 + params.glow * 0.15)
    ctx.lineWidth = 0.8
    ctx.stroke()
  }

  // 5. Core interior glow
  const coreGlow = ctx.createRadialGradient(CX, CY, 0, CX, CY, BASE_R * 0.7)
  coreGlow.addColorStop(0, rgba(gc.r, gc.g, gc.b, params.glow * 0.35))
  coreGlow.addColorStop(0.6, rgba(gc.r, gc.g, gc.b, params.glow * 0.08))
  coreGlow.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = coreGlow
  ctx.beginPath()
  ctx.arc(CX, CY, BASE_R * 0.7, 0, TAU)
  ctx.fill()

  // 6. Circuit nodes
  for (const cn of circuits) {
    const a = cn.angle + time * cn.speed
    const dx = CX + Math.cos(a) * cn.dist
    const dy = CY + Math.sin(a) * cn.dist
    const bright = cn.brightness * (0.6 + Math.sin(time * 1.5 + cn.phase) * 0.4) * params.glow
    if (cn.shape === 'diamond') {
      drawDiamond(ctx, dx, dy, cn.size, time * 0.2 + cn.phase, rgba(gc.r, gc.g, gc.b, bright))
    } else {
      drawSquare(ctx, dx, dy, cn.size, 0, rgba(gc.r, gc.g, gc.b, bright))
    }
  }

  // 7. Circuit veins (Manhattan-routed between adjacent circuit nodes)
  ctx.strokeStyle = rgba(gc.r, gc.g, gc.b, 0.06 * params.glow)
  ctx.lineWidth = 0.5
  for (let i = 0; i < circuits.length - 1; i++) {
    const a1 = circuits[i].angle + time * circuits[i].speed
    const a2 = circuits[i + 1].angle + time * circuits[i + 1].speed
    const x1 = CX + Math.cos(a1) * circuits[i].dist
    const y1 = CY + Math.sin(a1) * circuits[i].dist
    const x2 = CX + Math.cos(a2) * circuits[i + 1].dist
    const y2 = CY + Math.sin(a2) * circuits[i + 1].dist
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y1) // Manhattan right-angle
    ctx.lineTo(x2, y2)
    ctx.stroke()
  }

  // 8. Reactor nucleus
  const nucR = 6 + params.glow * 3
  drawHexagon(ctx, CX, CY, nucR, time * 0.3, rgba(gc.r, gc.g, gc.b, 0.6 + params.glow * 0.3))
  drawDiamond(ctx, CX, CY, nucR * 0.7, -time * 0.5, rgba(gc.r, gc.g, gc.b, 0.8))

  ctx.restore()
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AICoreNode({
  mode, mono = false, activeAgents, totalAgents, cpuUsage, memoryUsage, listenerCount,
  yenneferStyle, lmStudioUrl, privacyMode = false, disabled,
  processes, agents, ports, gitRepos,
  onInvokeYennefer, onRequestBriefing, onRepair, onToggleMono, onSetYenneferStyle, lensDisabled = false
}: AICoreNodeProps): JSX.Element {
  const theme = MODE_THEME[mode]
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const stateRef = useRef<RenderState>({
    mode, params: { ...MODE_MECH_PARAMS[mode] },
    antennas: [], plates: buildArmorPlates(12), circuits: buildCircuitNodes(18), mono
  })
  const rafRef = useRef<number>(0)
  const endpoint = lmStudioUrl.replace(/^https?:\/\//, '')

  const entities = useMemo(() => buildEntities(processes, agents, ports, gitRepos), [processes, agents, ports, gitRepos])

  const kindCounts = useMemo(() => {
    const c = { workspace: 0, agent: 0, port: 0, git: 0 }
    for (const e of entities) if (e.kind !== 'ambient') c[e.kind]++
    return c
  }, [entities])

  // Reconcile antennas when entities change
  useEffect(() => {
    const now = performance.now() / 1000
    const allEntities = [...entities]
    const realCount = allEntities.length
    const fillCount = Math.max(0, 28 - realCount)
    for (let i = 0; i < fillCount; i++) {
      allEntities.push({ kind: 'ambient', name: `ambient-${i}`, activity: 0.05 + Math.random() * 0.15 })
    }
    stateRef.current.antennas = reconcileAntennas(stateRef.current.antennas, allEntities, now)
  }, [entities])

  // Sync mode + mono
  useEffect(() => { stateRef.current.mode = mode }, [mode])
  useEffect(() => { stateRef.current.mono = mono }, [mono])

  // Canvas setup + render loop
  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.parentElement?.getBoundingClientRect()
    if (!rect) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`
  }, [])

  useEffect(() => {
    setupCanvas()
    const onResize = (): void => setupCanvas()
    window.addEventListener('resize', onResize)

    function loop(): void {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const time = performance.now() / 1000
      const st = stateRef.current
      const target = MODE_MECH_PARAMS[st.mode] || MODE_MECH_PARAMS.idle
      const p = st.params
      const lerpF = 0.02
      p.bSpd += (target.bSpd - p.bSpd) * lerpF
      p.bAmp += (target.bAmp - p.bAmp) * lerpF
      p.sqSpd += (target.sqSpd - p.sqSpd) * lerpF
      p.sqAmp += (target.sqAmp - p.sqAmp) * lerpF
      p.glow += (target.glow - p.glow) * lerpF
      p.spkLen += (target.spkLen - p.spkLen) * lerpF
      p.spkAct += (target.spkAct - p.spkAct) * lerpF
      p.pDrift += (target.pDrift - p.pDrift) * lerpF

      renderFrame(ctx, canvas.width, canvas.height, time, st)
      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', onResize)
    }
  }, [setupCanvas])

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = (event.clientX - rect.left) / rect.width - 0.5
    const y = (event.clientY - rect.top) / rect.height - 0.5
    el.style.transform = `perspective(1400px) rotateX(${(y * -8).toFixed(2)}deg) rotateY(${(x * 10).toFixed(2)}deg) scale(1.015)`
  }

  function handlePointerLeave(): void {
    const el = containerRef.current
    if (el) el.style.transform = 'perspective(1400px) rotateX(0deg) rotateY(0deg) scale(1)'
  }

  return (
    <div className={`space-y-4 rounded-[4px] border ${theme.border} bg-gradient-to-br ${theme.shell} p-4 shadow-[0_18px_60px_rgba(0,0,0,0.5)]`}>
      <div className="space-y-4">
        <div className="relative overflow-hidden rounded-[4px] border border-white/10 bg-black p-4">
          <div className="relative flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.16em] text-gray-500 font-[family-name:var(--hydra-font-mono)]">SYS.CORE.ENTITY</div>
              <div className={`mt-1 text-sm font-semibold ${theme.text} font-[family-name:var(--hydra-font-mono)]`}>{theme.label}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-[0.16em] text-gray-500 font-[family-name:var(--hydra-font-mono)]">MECH.ORGANISM</div>
              <div className="mt-1 text-xs text-gray-400 font-[family-name:var(--hydra-font-mono)]">plates // antennas // reactor</div>
            </div>
          </div>

          <div className="relative mt-4">
            <div ref={containerRef} onPointerMove={handlePointerMove} onPointerLeave={handlePointerLeave}
              className="relative mx-auto w-full max-w-[980px] transition-transform duration-200 ease-out"
              style={{ aspectRatio: '2 / 1', transform: 'perspective(1400px) rotateX(0deg) rotateY(0deg) scale(1)' }}>
              <div onClick={disabled ? undefined : onInvokeYennefer} role="button" tabIndex={disabled ? -1 : 0}
                className={`group absolute inset-0 overflow-hidden rounded-[4px] border border-white/8 bg-black transition-all ${disabled ? 'cursor-not-allowed opacity-80' : 'cursor-pointer hover:border-white/16'}`}>
                <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
              </div>

              <div className="absolute inset-0 pointer-events-none">
                <div className="pointer-events-auto absolute inset-x-3 bottom-2 flex flex-wrap items-end justify-between gap-2">
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                    <div className="rounded-[2px] border border-white/10 bg-black/70 px-2 py-0.5 text-[8px] uppercase tracking-[0.14em] text-gray-400 font-[family-name:var(--hydra-font-mono)]">Mech Entity</div>
                    {kindCounts.workspace > 0 && (
                      <span className="flex items-center gap-1 rounded-[2px] border border-white/10 bg-black/65 px-1.5 py-0.5 text-[8px] uppercase tracking-[0.1em] text-gray-400 font-[family-name:var(--hydra-font-mono)]">
                        <span className="inline-block h-1.5 w-1.5 rounded-[1px]" style={{ background: KIND_COLORS.workspace }} />
                        WS {kindCounts.workspace}
                      </span>
                    )}
                    {kindCounts.agent > 0 && (
                      <span className="flex items-center gap-1 rounded-[2px] border border-white/10 bg-black/65 px-1.5 py-0.5 text-[8px] uppercase tracking-[0.1em] text-gray-400 font-[family-name:var(--hydra-font-mono)]">
                        <span className="inline-block h-1.5 w-1.5 rounded-[1px]" style={{ background: KIND_COLORS.agent }} />
                        AG {kindCounts.agent}
                      </span>
                    )}
                    {kindCounts.port > 0 && (
                      <span className="flex items-center gap-1 rounded-[2px] border border-white/10 bg-black/65 px-1.5 py-0.5 text-[8px] uppercase tracking-[0.1em] text-gray-400 font-[family-name:var(--hydra-font-mono)]">
                        <span className="inline-block h-1.5 w-1.5 rounded-[1px]" style={{ background: KIND_COLORS.port }} />
                        PT {kindCounts.port}
                      </span>
                    )}
                    {kindCounts.git > 0 && (
                      <span className="flex items-center gap-1 rounded-[2px] border border-white/10 bg-black/65 px-1.5 py-0.5 text-[8px] uppercase tracking-[0.1em] text-gray-400 font-[family-name:var(--hydra-font-mono)]">
                        <span className="inline-block h-1.5 w-1.5 rounded-[1px]" style={{ background: KIND_COLORS.git }} />
                        GIT {kindCounts.git}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    {onToggleMono && (
                      <button type="button" onClick={(e) => { e.stopPropagation(); onToggleMono() }}
                        className={`rounded-[2px] border px-2 py-0.5 text-[8px] uppercase tracking-[0.12em] font-[family-name:var(--hydra-font-mono)] transition-colors ${mono ? 'border-white/25 bg-white/15 text-white' : 'border-white/10 bg-black/60 text-gray-500 hover:text-gray-300'}`}>
                        {mono ? 'mono' : 'color'}
                      </button>
                    )}
                    <div className="rounded-[2px] border border-white/10 bg-black/70 px-2 py-0.5 text-[8px] uppercase tracking-[0.14em] text-gray-400 font-[family-name:var(--hydra-font-mono)]">live</div>
                    <div className="flex items-center gap-1.5 rounded-[2px] border border-white/10 bg-black/70 px-2 py-0.5">
                      <span className={`h-1.5 w-1.5 rounded-[1px] ${theme.text} bg-current shadow-[0_0_8px_currentColor]`} />
                      <span className={`text-[8px] uppercase tracking-[0.12em] font-[family-name:var(--hydra-font-mono)] ${theme.text}`}>{titleCase(yenneferStyle)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-[4px] border border-white/10 bg-black/25 p-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,0.62fr)_minmax(0,0.95fr)_minmax(0,0.72fr)]">
            <div>
              <div className="text-[10px] uppercase tracking-[0.16em] text-gray-500 font-[family-name:var(--hydra-font-mono)]">Interface</div>
              <div className="mt-1 text-sm font-semibold text-gray-100 font-[family-name:var(--hydra-font-mono)]">{titleCase(yenneferStyle)} Lens</div>
              <div className="mt-1 truncate text-xs text-gray-500 font-[family-name:var(--hydra-font-mono)]" title={lmStudioUrl}>{endpoint}</div>
              {privacyMode && (
                <div className="mt-2 inline-flex items-center gap-1 rounded-[2px] border border-emerald-300/20 bg-emerald-500/10 px-2 py-1 text-[9px] uppercase tracking-[0.18em] text-emerald-100 font-[family-name:var(--hydra-font-mono)]">
                  <span className="h-1.5 w-1.5 rounded-[1px] bg-emerald-300 shadow-[0_0_6px_rgba(110,231,183,0.85)]" />
                  Secure View
                </div>
              )}
              {onSetYenneferStyle && (
                <div className="mt-3">
                  <label className="block text-[10px] uppercase tracking-[0.16em] text-gray-500 font-[family-name:var(--hydra-font-mono)]">Lens Control</label>
                  <select value={yenneferStyle} disabled={lensDisabled}
                    onChange={(e) => onSetYenneferStyle(e.target.value as YenneferStyle)}
                    className="mt-2 w-full rounded-[4px] border border-white/10 bg-black/30 px-3 py-2 text-xs text-gray-200 font-[family-name:var(--hydra-font-mono)] transition-colors disabled:cursor-not-allowed disabled:text-gray-500">
                    <option value="adaptive">Adaptive</option>
                    <option value="throughput">Throughput</option>
                    <option value="creative">Creative</option>
                    <option value="strict">Strict</option>
                  </select>
                </div>
              )}
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-2">
              <MetricPill label="Swarm" value={`${activeAgents}/${totalAgents} active`} emphasis={mode === 'throughput'} />
              <MetricPill label="Memory" value={`${Math.round(memoryUsage)}%`} emphasis={memoryUsage >= 85} />
              <MetricPill label="CPU" value={`${Math.round(cpuUsage)}%`} emphasis={cpuUsage >= 80} />
              <MetricPill label="Ports" value={`${listenerCount} listeners`} />
            </div>
            <div className="rounded-[4px] border border-white/10 bg-black/20 p-3">
              <div className="text-[10px] uppercase tracking-[0.16em] text-gray-500 font-[family-name:var(--hydra-font-mono)]">Readout</div>
              <div className={`mt-2 text-sm font-semibold ${theme.text} font-[family-name:var(--hydra-font-mono)]`}>{theme.label}</div>
              <p className="mt-2 text-xs leading-relaxed text-gray-300">{theme.detail}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-[4px] border border-white/10 bg-black/25 p-3">
        <div className="grid gap-2 lg:grid-cols-3">
          <ActionNode label="Request Briefing" detail="Run the structured ops pass." accent="bg-amber-700/20 text-amber-200 hover:bg-amber-600/25" disabled={disabled} onClick={onRequestBriefing} />
          <ActionNode label="Invoke Repair" detail="Probe and rebuild the LM Studio path." accent="bg-amber-700/20 text-amber-100 hover:bg-amber-600/25" disabled={disabled} onClick={onRepair} />
          <ActionNode label="Invoke Yennefer" detail="Open the channel through the entity." accent="bg-amber-700/20 text-amber-100 hover:bg-amber-600/25" disabled={disabled} onClick={onInvokeYennefer} />
        </div>
      </div>
    </div>
  )
}
