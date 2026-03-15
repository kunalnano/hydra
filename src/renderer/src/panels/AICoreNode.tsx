import { useId, useRef } from 'react'
import type { YenneferStyle } from '../../../shared/types'
import { SPHERE, MERIDIAN_RX, LATITUDE_RY, GLOBE_NODES, DUST_POINTS } from './globe-data'

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
    hullFill: string
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
    hullFill: 'rgba(38,167,196,0.12)',
    glow: 'rgba(59,204,255,0.3)'
  },
  thinking: {
    label: 'Hydra Thinking',
    detail: 'The wireframe is tightening around active context while Yennefer resolves the next read.',
    shell: 'from-[#100b25] via-[#0c1831] to-[#050912]',
    border: 'border-violet-300/32',
    text: 'text-violet-100',
    meshStroke: 'rgba(220,195,255,0.76)',
    meshDim: 'rgba(139,106,212,0.22)',
    hullFill: 'rgba(128,87,247,0.12)',
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
    hullFill: 'rgba(42,176,136,0.12)',
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
    hullFill: 'rgba(213,138,48,0.12)',
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
    hullFill: 'rgba(225,79,129,0.12)',
    glow: 'rgba(251,113,133,0.3)'
  },
  throughput: {
    label: 'Throughput Mode',
    detail: 'The sphere is intentionally saturated. Density is a feature until the lattice starts to choke.',
    shell: 'from-[#061915] via-[#0a2130] to-[#050b10]',
    border: 'border-teal-300/32',
    text: 'text-teal-100',
    meshStroke: 'rgba(185,255,245,0.76)',
    meshDim: 'rgba(71,182,171,0.2)',
    hullFill: 'rgba(32,168,154,0.12)',
    glow: 'rgba(45,212,191,0.3)'
  }
}

// Google colors
const GCOLORS = ['#4285F4', '#EA4335', '#FBBC05', '#34A853']
const G_GLOW = [
  'rgba(66,133,244,0.4)',
  'rgba(234,67,53,0.4)',
  'rgba(251,188,5,0.4)',
  'rgba(52,168,83,0.4)'
]

/** Deterministic pseudo-random 0-1 from index + seed */
function prand(index: number, seed: number): number {
  return (((index * 2654435761 + seed * 340573) >>> 0) % 10000) / 10000
}

/** Per-node twinkle parameters: like stars in a night sky */
function nodeTwinkle(index: number) {
  const colorOffset = ((index * 7 + 3) % 4)
  const shifted = [...GCOLORS.slice(colorOffset), ...GCOLORS.slice(0, colorOffset)]
  const shiftedGlow = [...G_GLOW.slice(colorOffset), ...G_GLOW.slice(0, colorOffset)]

  // Color cycle duration: 1.6-3.8s, each node different
  const colorDur = 1600 + Math.round(prand(index, 1) * 2200)

  // Twinkle (opacity) duration: 0.8-3.5s
  const twinkleDur = 800 + Math.round(prand(index, 2) * 2700)

  // Size pulse duration: 1.2-4.0s
  const sizeDur = 1200 + Math.round(prand(index, 3) * 2800)

  // Base radius: most nodes small, some randomly bigger
  const isBright = prand(index, 4) > 0.72
  const baseR = isBright ? 2.8 + prand(index, 5) * 1.8 : 1.6 + prand(index, 6) * 1.2

  // Twinkle amplitude: how much opacity varies
  const dimFloor = isBright ? 0.35 : 0.08
  const brightCeil = isBright ? 0.95 : 0.55

  // Size pulse amplitude
  const rMin = baseR * 0.7
  const rMax = baseR * (isBright ? 1.8 : 1.3)

  // Stagger begin so nodes don't sync up
  const beginOffset = Math.round(prand(index, 7) * 3000)

  return {
    fills: shifted.join(';') + ';' + shifted[0],
    glows: shiftedGlow.join(';') + ';' + shiftedGlow[0],
    colorDur,
    twinkleDur,
    sizeDur,
    baseR,
    dimFloor,
    brightCeil,
    rMin,
    rMax,
    beginOffset,
    isBright,
    startColor: GCOLORS[colorOffset],
    startGlow: G_GLOW[colorOffset]
  }
}

function getMotionProfile(mode: AICoreMode) {
  switch (mode) {
    case 'thinking':
      return { pulseMs: 1400, shimmerMs: 1900, driftMs: 8800 }
    case 'repairing':
      return { pulseMs: 1500, shimmerMs: 1700, driftMs: 8200 }
    case 'speaking':
      return { pulseMs: 1700, shimmerMs: 2100, driftMs: 9600 }
    case 'offline':
      return { pulseMs: 2400, shimmerMs: 2500, driftMs: 11200 }
    case 'throughput':
      return { pulseMs: 1300, shimmerMs: 1600, driftMs: 7200 }
    default:
      return { pulseMs: 1800, shimmerMs: 2200, driftMs: 10400 }
  }
}

function titleCase(v: string): string {
  return v[0].toUpperCase() + v.slice(1)
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
  const hullId = `hydra-hull-${uid}`
  const endpoint = lmStudioUrl.replace(/^https?:\/\//, '')

  const liveFactor =
    activeAgents * 0.55 + Math.max(0, memoryUsage - 70) * 0.08 + Math.max(0, cpuUsage - 40) * 0.05
  const motion = getMotionProfile(mode)
  const pulseMs = Math.max(880, Math.round(motion.pulseMs - liveFactor * 120))
  const shimmerMs = Math.max(1100, Math.round(motion.shimmerMs - liveFactor * 70))
  const driftMs = Math.max(4800, Math.round(motion.driftMs - liveFactor * 140))

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

  return (
    <div className={`space-y-4 rounded-[28px] border ${theme.border} bg-gradient-to-br ${theme.shell} p-4 shadow-[0_18px_60px_rgba(0,0,0,0.32)]`}>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(260px,0.72fr)]">
        <div className="relative overflow-hidden rounded-[24px] border border-white/10 bg-black/28 p-4">
          <div className="absolute inset-0 opacity-28" style={{
            backgroundImage: 'linear-gradient(rgba(121,168,201,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(121,168,201,0.1) 1px, transparent 1px)',
            backgroundSize: '34px 34px'
          }} />
          <div className="absolute inset-0 opacity-55" style={{
            backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0) 24%, rgba(255,255,255,0.04) 68%, rgba(255,255,255,0))'
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
                    <linearGradient id={hullId} x1="24%" y1="24%" x2="82%" y2="76%">
                      <stop offset="0%" stopColor={theme.hullFill} />
                      <stop offset="100%" stopColor="rgba(255,255,255,0)" />
                    </linearGradient>
                  </defs>

                  <rect x="0" y="0" width="640" height="390" fill={`url(#${glowId})`} />

                  <g clipPath={`url(#${clipId})`}>
                    <rect x={SPHERE.cx - SPHERE.r} y={SPHERE.cy - SPHERE.r}
                      width={SPHERE.r * 2} height={SPHERE.r * 2} fill="rgba(4,10,18,0.28)" />

                    {/* Wireframe: meridians + latitudes */}
                    <g opacity="0.44">
                      {MERIDIAN_RX.map((rx, i) => (
                        <ellipse key={`m-${rx}`} cx={SPHERE.cx} cy={SPHERE.cy}
                          rx={Math.max(22, rx)} ry={SPHERE.r}
                          fill="none" stroke={theme.meshDim} strokeWidth={i % 2 === 0 ? 0.9 : 0.6} />
                      ))}
                      {LATITUDE_RY.map((ry, i) => (
                        <ellipse key={`l-${ry}`} cx={SPHERE.cx} cy={SPHERE.cy}
                          rx={SPHERE.r} ry={ry}
                          fill="none" stroke={theme.meshDim} strokeWidth={i % 2 === 0 ? 0.9 : 0.6} />
                      ))}
                    </g>

                    {/* Equator: prominent horizontal band */}
                    <line x1={SPHERE.cx - SPHERE.r} y1={SPHERE.cy} x2={SPHERE.cx + SPHERE.r} y2={SPHERE.cy}
                      stroke={theme.meshStroke} strokeWidth="1.2" opacity="0.5" />

                    {/* Mesh group with drift + breathing */}
                    <g opacity="0.9">
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

                      {/* Night-sky nodes: independent twinkling in Google colors */}
                      {GLOBE_NODES.map((node, i) => {
                        const t = nodeTwinkle(i)
                        return (
                          <g key={`gn-${i}`}>
                            {/* Core dot: color-cycling, size-pulsing, opacity-twinkling */}
                            <circle cx={node.x} cy={node.y} r={t.baseR} fill={t.startColor}
                              opacity={t.dimFloor}>
                              <animate attributeName="fill" values={t.fills}
                                dur={`${t.colorDur}ms`} repeatCount="indefinite" />
                              <animate attributeName="opacity"
                                values={`${t.dimFloor};${t.brightCeil};${t.dimFloor}`}
                                dur={`${t.twinkleDur}ms`} begin={`${t.beginOffset}ms`} repeatCount="indefinite" />
                              <animate attributeName="r"
                                values={`${t.rMin};${t.rMax};${t.rMin}`}
                                dur={`${t.sizeDur}ms`} begin={`${t.beginOffset}ms`} repeatCount="indefinite" />
                            </circle>
                            {/* Glow halo for brighter nodes */}
                            {t.isBright && (
                              <circle cx={node.x} cy={node.y} r={t.rMax * 2.5} fill={t.startGlow} opacity="0">
                                <animate attributeName="fill" values={t.glows}
                                  dur={`${t.colorDur}ms`} repeatCount="indefinite" />
                                <animate attributeName="opacity" values="0;0.35;0"
                                  dur={`${t.twinkleDur}ms`} begin={`${t.beginOffset}ms`} repeatCount="indefinite" />
                              </circle>
                            )}
                          </g>
                        )
                      })}
                    </g>
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
    </div>
  )
}
