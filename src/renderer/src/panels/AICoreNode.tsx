import { useId, useRef } from 'react'
import type { YenneferStyle } from '../../../shared/types'
import {
  SPHERE,
  MERIDIAN_RX,
  LATITUDE_RY,
  NUM_LONGITUDES,
  LONGITUDE_LINES,
  GLOBE_NODES,
  DUST_POINTS
} from './globe-data'

export type AICoreMode =
  | 'idle'
  | 'thinking'
  | 'speaking'
  | 'repairing'
  | 'offline'
  | 'throughput'

interface AICoreNodeProps {
  mode: AICoreMode
  activeAgents: number
  totalAgents: number
  cpuUsage: number
  memoryUsage: number
  listenerCount: number
  yenneferStyle: YenneferStyle
  lmStudioUrl: string
  disabled: boolean
  onInvokeYennefer: () => void
  onRequestBriefing: () => void
  onRepair: () => void
}

const MODE_THEME: Record<
  AICoreMode,
  {
    label: string
    detail: string
    shell: string
    border: string
    text: string
    meshStroke: string
    meshDim: string
    nodeFill: string
    hullFill: string
    beam: string
    glow: string
  }
> = {
  idle: {
    label: 'Hydra Awake',
    detail: 'The sphere is coherent, quiet, and waiting for the next command.',
    shell: 'from-[#061521] via-[#081d2f] to-[#04080f]',
    border: 'border-cyan-300/30',
    text: 'text-cyan-100',
    meshStroke: 'rgba(179,243,255,0.7)',
    meshDim: 'rgba(86,165,194,0.2)',
    nodeFill: 'rgba(242,253,255,0.96)',
    hullFill: 'rgba(38,167,196,0.12)',
    beam: 'rgba(224,248,255,0.22)',
    glow: 'rgba(59,204,255,0.3)'
  },
  thinking: {
    label: 'Hydra Thinking',
    detail:
      'The wireframe is tightening around active context while Yennefer resolves the next read.',
    shell: 'from-[#100b25] via-[#0c1831] to-[#050912]',
    border: 'border-violet-300/32',
    text: 'text-violet-100',
    meshStroke: 'rgba(220,195,255,0.76)',
    meshDim: 'rgba(139,106,212,0.22)',
    nodeFill: 'rgba(247,235,255,0.96)',
    hullFill: 'rgba(128,87,247,0.12)',
    beam: 'rgba(247,227,255,0.22)',
    glow: 'rgba(167,139,250,0.32)'
  },
  speaking: {
    label: 'Yennefer Channel Open',
    detail: 'Inference has resolved. The sphere brightens because the answer is ready.',
    shell: 'from-[#07191c] via-[#0a2133] to-[#041015]',
    border: 'border-emerald-300/30',
    text: 'text-emerald-100',
    meshStroke: 'rgba(190,255,234,0.74)',
    meshDim: 'rgba(63,186,147,0.2)',
    nodeFill: 'rgba(239,255,248,0.96)',
    hullFill: 'rgba(42,176,136,0.12)',
    beam: 'rgba(228,255,245,0.2)',
    glow: 'rgba(52,211,153,0.3)'
  },
  repairing: {
    label: 'Repair Cycle Active',
    detail: 'Hydra is testing paths and rebuilding the LM Studio route from inside the mesh.',
    shell: 'from-[#1b1106] via-[#121c2c] to-[#080a10]',
    border: 'border-amber-300/32',
    text: 'text-amber-100',
    meshStroke: 'rgba(255,228,183,0.76)',
    meshDim: 'rgba(202,147,66,0.2)',
    nodeFill: 'rgba(255,248,235,0.98)',
    hullFill: 'rgba(213,138,48,0.12)',
    beam: 'rgba(255,244,214,0.22)',
    glow: 'rgba(245,158,11,0.3)'
  },
  offline: {
    label: 'Core Isolated',
    detail: 'The sphere is alive, but the external inference line is down and the mesh runs cold.',
    shell: 'from-[#1b0a13] via-[#121725] to-[#07090f]',
    border: 'border-rose-300/32',
    text: 'text-rose-100',
    meshStroke: 'rgba(255,193,214,0.72)',
    meshDim: 'rgba(212,92,132,0.2)',
    nodeFill: 'rgba(255,239,244,0.96)',
    hullFill: 'rgba(225,79,129,0.12)',
    beam: 'rgba(255,230,237,0.18)',
    glow: 'rgba(251,113,133,0.3)'
  },
  throughput: {
    label: 'Throughput Mode',
    detail:
      'The sphere is intentionally saturated. Density is a feature until the lattice starts to choke.',
    shell: 'from-[#061915] via-[#0a2130] to-[#050b10]',
    border: 'border-teal-300/32',
    text: 'text-teal-100',
    meshStroke: 'rgba(185,255,245,0.76)',
    meshDim: 'rgba(71,182,171,0.2)',
    nodeFill: 'rgba(237,255,252,0.98)',
    hullFill: 'rgba(32,168,154,0.12)',
    beam: 'rgba(225,255,249,0.22)',
    glow: 'rgba(45,212,191,0.3)'
  }
}

// Google colors for neural weight activation effect
const G_BLUE = '#4285F4'
const G_RED = '#EA4335'
const G_YELLOW = '#FBBC05'
const G_GREEN = '#34A853'
const GCOLORS = [G_BLUE, G_RED, G_YELLOW, G_GREEN]

// Softer versions for glow halos
const G_GLOW = [
  'rgba(66,133,244,0.35)',
  'rgba(234,67,53,0.35)',
  'rgba(251,188,5,0.35)',
  'rgba(52,168,83,0.35)'
]

/** Each node gets a unique color rotation offset + cycle duration */
function nodeColorCycle(index: number): { fills: string; glows: string; dur: number } {
  const offset = ((index * 7 + 3) % 4)
  const shifted = [...GCOLORS.slice(offset), ...GCOLORS.slice(0, offset)]
  const shiftedGlow = [...G_GLOW.slice(offset), ...G_GLOW.slice(0, offset)]
  // Vary cycle duration so nodes drift out of phase (1800-3600ms)
  const dur = 1800 + ((index * 131) % 1800)
  return {
    fills: shifted.join(';') + ';' + shifted[0],
    glows: shiftedGlow.join(';') + ';' + shiftedGlow[0],
    dur
  }
}

function getSweepMs(mode: AICoreMode, liveFactor: number): number {
  const base: Record<AICoreMode, number> = {
    idle: 4200,
    thinking: 2800,
    speaking: 3400,
    repairing: 2400,
    offline: 6000,
    throughput: 2000
  }
  return Math.max(1400, Math.round(base[mode] - liveFactor * 180))
}

function getBaseMotionProfile(mode: AICoreMode) {
  switch (mode) {
    case 'thinking':
      return { pulseMs: 1400, scanMs: 3100, shimmerMs: 1900, driftMs: 8800 }
    case 'repairing':
      return { pulseMs: 1500, scanMs: 2600, shimmerMs: 1700, driftMs: 8200 }
    case 'speaking':
      return { pulseMs: 1700, scanMs: 3400, shimmerMs: 2100, driftMs: 9600 }
    case 'offline':
      return { pulseMs: 2400, scanMs: 4400, shimmerMs: 2500, driftMs: 11200 }
    case 'throughput':
      return { pulseMs: 1300, scanMs: 2300, shimmerMs: 1600, driftMs: 7200 }
    default:
      return { pulseMs: 1800, scanMs: 3600, shimmerMs: 2200, driftMs: 10400 }
  }
}

function titleCase(value: string): string {
  return value[0].toUpperCase() + value.slice(1)
}

function MetricPill({ label, value, emphasis = false }: {
  label: string; value: string; emphasis?: boolean
}): JSX.Element {
  return (
    <div className={`rounded-[18px] border px-3 py-2 ${emphasis ? 'border-white/18 bg-white/10' : 'border-white/10 bg-black/20'}`}>
      <div className="text-[10px] uppercase tracking-[0.24em] text-gray-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-gray-100">{value}</div>
    </div>
  )
}

function ActionNode({ label, detail, accent, disabled, onClick }: {
  label: string; detail: string; accent: string; disabled: boolean; onClick: () => void
}): JSX.Element {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`rounded-[22px] border px-3 py-3 text-left transition-all ${disabled
        ? 'cursor-not-allowed border-white/10 bg-white/5 text-gray-500'
        : `border-white/10 ${accent} hover:-translate-y-0.5 hover:border-white/20`}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.22em]">{label}</div>
      <div className="mt-1 text-xs text-gray-300">{detail}</div>
    </button>
  )
}

export function AICoreNode({
  mode, activeAgents, totalAgents, cpuUsage, memoryUsage, listenerCount,
  yenneferStyle, lmStudioUrl, disabled,
  onInvokeYennefer, onRequestBriefing, onRepair
}: AICoreNodeProps): JSX.Element {
  const theme = MODE_THEME[mode]
  const sphereRef = useRef<HTMLDivElement | null>(null)
  const uid = useId().replace(/:/g, '')
  const clipId = `hydra-clip-${uid}`
  const glowId = `hydra-glow-${uid}`
  const sweepGradId = `hydra-sweep-${uid}`
  const hullId = `hydra-hull-${uid}`
  const endpoint = lmStudioUrl.replace(/^https?:\/\//, '')

  const liveFactor =
    activeAgents * 0.55 + Math.max(0, memoryUsage - 70) * 0.08 + Math.max(0, cpuUsage - 40) * 0.05
  const baseMotion = getBaseMotionProfile(mode)
  const pulseMs = Math.max(880, Math.round(baseMotion.pulseMs - liveFactor * 120))
  const scanMs = Math.max(1600, Math.round(baseMotion.scanMs - liveFactor * 85))
  const shimmerMs = Math.max(1100, Math.round(baseMotion.shimmerMs - liveFactor * 70))
  const driftMs = Math.max(4800, Math.round(baseMotion.driftMs - liveFactor * 140))
  const sweepMs = getSweepMs(mode, liveFactor)

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    const el = sphereRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = (event.clientX - rect.left) / rect.width - 0.5
    const y = (event.clientY - rect.top) / rect.height - 0.5
    el.style.transform = `perspective(1400px) rotateX(${(y * -8).toFixed(2)}deg) rotateY(${(x * 10).toFixed(2)}deg) scale(1.015)`
  }

  function handlePointerLeave(): void {
    const el = sphereRef.current
    if (el) el.style.transform = 'perspective(1400px) rotateX(0deg) rotateY(0deg) scale(1)'
  }

  // Sweep timing: each longitude flashes briefly within a full sweepMs cycle.
  // All animations share dur=sweepMs. The flash is positioned via begin delay,
  // and the values pulse at the start of each instance's cycle.
  const flashOn = '0;0.06;0.18;1'

  return (
    <div className={`space-y-4 rounded-[28px] border ${theme.border} bg-gradient-to-br ${theme.shell} p-4 shadow-[0_18px_60px_rgba(0,0,0,0.32)]`}>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(260px,0.72fr)]">
        {/* Sphere viewport */}
        <div className="relative overflow-hidden rounded-[24px] border border-white/10 bg-black/28 p-4">
          {/* Background grid texture */}
          <div className="absolute inset-0 opacity-28" style={{
            backgroundImage: 'linear-gradient(rgba(121,168,201,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(121,168,201,0.1) 1px, transparent 1px)',
            backgroundSize: '34px 34px'
          }} />
          <div className="absolute inset-0 opacity-55" style={{
            backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0) 24%, rgba(255,255,255,0.04) 68%, rgba(255,255,255,0))'
          }} />
          {/* Scan sweep beam */}
          <div className="absolute -left-20 top-[-14%] h-[150%] w-24 rotate-[16deg] blur-xl" style={{
            background: `linear-gradient(90deg, rgba(255,255,255,0) 0%, ${theme.beam} 48%, rgba(255,255,255,0) 100%)`,
            animation: `hydra-scan-sweep ${scanMs}ms linear infinite`
          }} />

          <div className="relative flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.34em] text-gray-500">AI Core Lattice</div>
              <div className={`mt-1 text-sm font-semibold ${theme.text}`}>{theme.label}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-[0.26em] text-gray-500">Live Lattice</div>
              <div className="mt-1 text-xs text-gray-300">Hydra AI mesh // contained sphere</div>
            </div>
          </div>

          <div className="relative mt-4">
            <div ref={sphereRef} onPointerMove={handlePointerMove} onPointerLeave={handlePointerLeave}
              className="relative transition-transform duration-200 ease-out"
              style={{ transform: 'perspective(1400px) rotateX(0deg) rotateY(0deg) scale(1)' }}>
              <button onClick={onInvokeYennefer} disabled={disabled}
                className={`group relative h-[370px] w-full overflow-hidden rounded-[22px] border border-white/10 bg-black/18 text-left transition-all ${disabled ? 'cursor-not-allowed opacity-80' : 'hover:border-white/20'}`}>
                <svg className="absolute inset-0 h-full w-full" viewBox="0 0 640 390" aria-hidden="true">
                  <defs>
                    <clipPath id={clipId}>
                      <circle cx={SPHERE.cx} cy={SPHERE.cy} r={SPHERE.r} />
                    </clipPath>
                    <radialGradient id={glowId} cx="62%" cy="48%" r="42%">
                      <stop offset="0%" stopColor={theme.glow} />
                      <stop offset="62%" stopColor="rgba(255,255,255,0.05)" />
                      <stop offset="100%" stopColor="rgba(255,255,255,0)" />
                    </radialGradient>
                    <linearGradient id={sweepGradId} x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="rgba(255,255,255,0)" />
                      <stop offset="48%" stopColor={theme.beam} />
                      <stop offset="100%" stopColor="rgba(255,255,255,0)" />
                    </linearGradient>
                    <linearGradient id={hullId} x1="24%" y1="24%" x2="82%" y2="76%">
                      <stop offset="0%" stopColor={theme.hullFill} />
                      <stop offset="100%" stopColor="rgba(255,255,255,0)" />
                    </linearGradient>
                  </defs>

                  <rect x="0" y="0" width="640" height="390" fill={`url(#${glowId})`} />

                  <g clipPath={`url(#${clipId})`}>
                    <rect x={SPHERE.cx - SPHERE.r} y={SPHERE.cy - SPHERE.r}
                      width={SPHERE.r * 2} height={SPHERE.r * 2} fill="rgba(4,10,18,0.28)" />

                    {/* Wireframe: meridian + latitude ellipses */}
                    <g opacity="0.52">
                      {MERIDIAN_RX.map((rx, i) => (
                        <ellipse key={`m-${rx}`} cx={SPHERE.cx} cy={SPHERE.cy}
                          rx={Math.max(22, rx)} ry={SPHERE.r}
                          fill="none" stroke={theme.meshDim} strokeWidth={i % 2 === 0 ? 1 : 0.8} />
                      ))}
                      {LATITUDE_RY.map((ry, i) => (
                        <ellipse key={`l-${ry}`} cx={SPHERE.cx} cy={SPHERE.cy}
                          rx={SPHERE.r} ry={ry}
                          fill="none" stroke={theme.meshDim} strokeWidth={i % 2 === 0 ? 1 : 0.8} />
                      ))}
                      <ellipse cx={SPHERE.cx} cy={SPHERE.cy} rx={SPHERE.r} ry={SPHERE.r * 0.92}
                        fill="none" stroke={theme.meshDim} strokeWidth="1.2" opacity="0.7" />
                    </g>

                    {/* Mesh group with drift + breathing */}
                    <g opacity="0.85">
                      <animateTransform attributeName="transform" type="translate"
                        values="0 0;5 -3;0 0;-4 2;0 0" dur={`${driftMs}ms`} repeatCount="indefinite" />
                      <animateTransform additive="sum" attributeName="transform" type="scale"
                        values="1 1;1.012 1.008;1 1;0.996 1.004;1 1" dur={`${pulseMs * 3}ms`} repeatCount="indefinite" />

                      {/* Hull interior */}
                      <path d="M238 106C286 60 390 42 470 80C546 116 586 192 572 258C556 330 490 370 412 372C330 374 248 338 224 270C200 204 190 156 238 106Z"
                        fill={`url(#${hullId})`} stroke={theme.meshDim} strokeWidth="1.1" opacity="0.78">
                        <animate attributeName="opacity" values="0.42;0.82;0.42" dur={`${pulseMs}ms`} repeatCount="indefinite" />
                      </path>

                      {/* Ambient dust */}
                      {DUST_POINTS.map(([x, y], i) => (
                        <circle key={`d-${i}`} cx={x} cy={y} r="1.3" fill={theme.meshDim} opacity="0.66">
                          <animate attributeName="opacity" values="0.15;0.62;0.15"
                            dur={`${shimmerMs + i * 30}ms`} begin={`${(i * 70) % 900}ms`} repeatCount="indefinite" />
                        </circle>
                      ))}

                      {/* Longitude scan lines: dim base + sweep highlight */}
                      {LONGITUDE_LINES.map((lon) => {
                        const delay = Math.round((lon.index / NUM_LONGITUDES) * sweepMs)
                        return (
                          <g key={`lon-${lon.index}`}>
                            <line x1={lon.x} y1={lon.yTop} x2={lon.x} y2={lon.yBot}
                              stroke={theme.meshDim} strokeWidth="0.6" opacity="0.35" />
                            <line x1={lon.x} y1={lon.yTop} x2={lon.x} y2={lon.yBot}
                              stroke={theme.meshStroke} strokeWidth="1.6" opacity="0">
                              <animate attributeName="opacity" values={`0.85;0.85;0;0`}
                                keyTimes={flashOn} dur={`${sweepMs}ms`} begin={`${delay}ms`} repeatCount="indefinite" />
                            </line>
                          </g>
                        )
                      })}

                      {/* Globe nodes: Google-colored neural activations */}
                      {GLOBE_NODES.map((node, i) => {
                        const sweepDelay = Math.round((node.lonIndex / NUM_LONGITUDES) * sweepMs)
                        const cc = nodeColorCycle(i)
                        return (
                          <g key={`gn-${i}`}>
                            {/* Dim base dot, color-cycling even at rest */}
                            <circle cx={node.x} cy={node.y} r="2" fill={GCOLORS[i % 4]} opacity="0.22">
                              <animate attributeName="fill" values={cc.fills}
                                dur={`${cc.dur}ms`} repeatCount="indefinite" />
                            </circle>
                            {/* Sweep-activated bright dot */}
                            <circle cx={node.x} cy={node.y} r="2.8" fill={GCOLORS[i % 4]} opacity="0">
                              <animate attributeName="fill" values={cc.fills}
                                dur={`${cc.dur}ms`} repeatCount="indefinite" />
                              <animate attributeName="opacity" values="0.95;0.95;0;0"
                                keyTimes={flashOn} dur={`${sweepMs}ms`} begin={`${sweepDelay}ms`} repeatCount="indefinite" />
                              <animate attributeName="r" values="2.8;4.5;2.8;2.8"
                                keyTimes={flashOn} dur={`${sweepMs}ms`} begin={`${sweepDelay}ms`} repeatCount="indefinite" />
                            </circle>
                            {/* Glow halo, color-matched */}
                            <circle cx={node.x} cy={node.y} r="8" fill={G_GLOW[i % 4]} opacity="0">
                              <animate attributeName="fill" values={cc.glows}
                                dur={`${cc.dur}ms`} repeatCount="indefinite" />
                              <animate attributeName="opacity" values="0.4;0.4;0;0"
                                keyTimes="0;0.04;0.14;1" dur={`${sweepMs}ms`} begin={`${sweepDelay}ms`} repeatCount="indefinite" />
                            </circle>
                          </g>
                        )
                      })}

                    </g>

                    {/* Scan sweep overlay */}
                    <rect x={SPHERE.cx - SPHERE.r - 50} y={SPHERE.cy - SPHERE.r}
                      width="70" height={SPHERE.r * 2} fill={`url(#${sweepGradId})`}>
                      <animate attributeName="x"
                        values={`${SPHERE.cx - SPHERE.r - 60};${SPHERE.cx + SPHERE.r + 40}`}
                        dur={`${scanMs}ms`} repeatCount="indefinite" />
                    </rect>
                  </g>

                  {/* Sphere boundary */}
                  <circle cx={SPHERE.cx} cy={SPHERE.cy} r={SPHERE.r}
                    fill="none" stroke={theme.meshStroke} strokeWidth="1.4" opacity="0.82" />
                  {/* Orbiting dashed ring */}
                  <circle cx={SPHERE.cx} cy={SPHERE.cy} r={SPHERE.r + 12}
                    fill="none" stroke={theme.meshDim} strokeDasharray="4 12" strokeWidth="1" opacity="0.68">
                    <animateTransform attributeName="transform" type="rotate"
                      values={`0 ${SPHERE.cx} ${SPHERE.cy};360 ${SPHERE.cx} ${SPHERE.cy}`}
                      dur={`${driftMs}ms`} repeatCount="indefinite" />
                  </circle>
                </svg>

                <div className="absolute left-6 top-6 rounded-full border border-white/10 bg-black/45 px-3 py-1 text-[10px] uppercase tracking-[0.28em] text-gray-300">
                  Wireframe Intelligence
                </div>
                <div className="absolute right-6 top-6 rounded-full border border-white/10 bg-black/45 px-3 py-1 text-[10px] uppercase tracking-[0.28em] text-gray-300">
                  live // contained
                </div>
                <div className="absolute bottom-5 left-6 flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${theme.text} bg-current shadow-[0_0_18px_currentColor]`} />
                  <span className={`text-[11px] uppercase tracking-[0.26em] ${theme.text}`}>{titleCase(yenneferStyle)} lens</span>
                </div>
                <div className="absolute bottom-5 right-6 text-[11px] text-gray-300">
                  {disabled ? 'Mesh occupied' : 'Interactive sphere online'}
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <div className="flex flex-col justify-between rounded-[24px] border border-white/10 bg-black/25 p-4">
          <div className="space-y-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.3em] text-gray-500">Interface</div>
              <div className="mt-1 text-sm font-semibold text-gray-100">{titleCase(yenneferStyle)} Lens</div>
              <div className="mt-1 truncate text-xs text-gray-500" title={lmStudioUrl}>{endpoint}</div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
              <MetricPill label="Swarm" value={`${activeAgents}/${totalAgents} active`} emphasis={mode === 'throughput'} />
              <MetricPill label="Memory" value={`${Math.round(memoryUsage)}%`} emphasis={memoryUsage >= 85} />
              <MetricPill label="CPU" value={`${Math.round(cpuUsage)}%`} emphasis={cpuUsage >= 80} />
              <MetricPill label="Ports" value={`${listenerCount} listeners`} />
            </div>
          </div>
          <div className="mt-4 rounded-[18px] border border-white/10 bg-black/20 p-3">
            <div className="text-[10px] uppercase tracking-[0.26em] text-gray-500">Readout</div>
            <div className={`mt-2 text-sm font-semibold ${theme.text}`}>{theme.label}</div>
            <p className="mt-2 text-xs leading-relaxed text-gray-300">{theme.detail}</p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="rounded-[24px] border border-white/10 bg-black/25 p-3">
        <div className="grid gap-2 lg:grid-cols-3">
          <ActionNode label="Request Briefing" detail="Run the structured ops pass."
            accent="bg-blue-600/20 text-blue-100 hover:bg-blue-500/25" disabled={disabled} onClick={onRequestBriefing} />
          <ActionNode label="Invoke Repair" detail="Probe and rebuild the LM Studio path."
            accent="bg-emerald-600/20 text-emerald-100 hover:bg-emerald-500/25" disabled={disabled} onClick={onRepair} />
          <ActionNode label="Invoke Yennefer" detail="Open the channel through the sphere."
            accent="bg-violet-600/20 text-violet-100 hover:bg-violet-500/25" disabled={disabled} onClick={onInvokeYennefer} />
        </div>
      </div>

      <style>{`
        @keyframes hydra-scan-sweep {
          0% { transform: translate3d(0, 0, 0); opacity: 0; }
          8% { opacity: 0.84; }
          52% { opacity: 0.62; }
          100% { transform: translate3d(760px, 0, 0); opacity: 0; }
        }
      `}</style>
    </div>
  )
}
