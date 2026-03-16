import { useId, useMemo, useRef } from 'react'
import type {
  YenneferStyle,
  ProcessGroup,
  AgentInfo,
  PortInfo,
  GitRepoInfo
} from '../../../shared/types'
import { SPHERE, MERIDIAN_RX, LATITUDE_RY, GLOBE_NODES, DUST_POINTS } from './globe-data'

export type AICoreMode =
  | 'idle'
  | 'thinking'
  | 'speaking'
  | 'repairing'
  | 'offline'
  | 'throughput'

/** Entity kind determines node color */
export type EntityKind = 'workspace' | 'agent' | 'port' | 'git' | 'ambient'

interface LatticeEntity {
  kind: EntityKind
  name: string
  /** 0-1 activity level driving brightness/size */
  activity: number
}

interface AICoreNodeProps {
  mode: AICoreMode
  mono?: boolean
  activeAgents: number
  totalAgents: number
  cpuUsage: number
  memoryUsage: number
  listenerCount: number
  yenneferStyle: YenneferStyle
  lmStudioUrl: string
  disabled: boolean
  processes?: ProcessGroup[]
  agents?: AgentInfo[]
  ports?: PortInfo[]
  gitRepos?: GitRepoInfo[]
  onInvokeYennefer: () => void
  onRequestBriefing: () => void
  onRepair: () => void
  onToggleMono?: () => void
  onSetYenneferStyle?: (style: YenneferStyle) => void
  lensDisabled?: boolean
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

const MODE_THEME: Record<AICoreMode, {
  label: string; detail: string; shell: string; border: string; text: string
  meshStroke: string; meshDim: string; hullFill: string; glow: string
}> = {
  idle: {
    label: 'Hydra Awake',
    detail: 'The sphere is coherent, quiet, and waiting for the next command.',
    shell: 'from-[#061521] via-[#081d2f] to-[#04080f]',
    border: 'border-cyan-300/30', text: 'text-cyan-100',
    meshStroke: 'rgba(179,243,255,0.7)', meshDim: 'rgba(86,165,194,0.2)',
    hullFill: 'rgba(38,167,196,0.12)', glow: 'rgba(59,204,255,0.3)'
  },
  thinking: {
    label: 'Hydra Thinking',
    detail: 'The wireframe is tightening around active context while Yennefer resolves the next read.',
    shell: 'from-[#100b25] via-[#0c1831] to-[#050912]',
    border: 'border-violet-300/32', text: 'text-violet-100',
    meshStroke: 'rgba(220,195,255,0.76)', meshDim: 'rgba(139,106,212,0.22)',
    hullFill: 'rgba(128,87,247,0.12)', glow: 'rgba(167,139,250,0.32)'
  },
  speaking: {
    label: 'Yennefer Channel Open',
    detail: 'Inference has resolved. The sphere brightens because the answer is ready.',
    shell: 'from-[#07191c] via-[#0a2133] to-[#041015]',
    border: 'border-emerald-300/30', text: 'text-emerald-100',
    meshStroke: 'rgba(190,255,234,0.74)', meshDim: 'rgba(63,186,147,0.2)',
    hullFill: 'rgba(42,176,136,0.12)', glow: 'rgba(52,211,153,0.3)'
  },
  repairing: {
    label: 'Repair Cycle Active',
    detail: 'Hydra is testing paths and rebuilding the LM Studio route from inside the mesh.',
    shell: 'from-[#1b1106] via-[#121c2c] to-[#080a10]',
    border: 'border-amber-300/32', text: 'text-amber-100',
    meshStroke: 'rgba(255,228,183,0.76)', meshDim: 'rgba(202,147,66,0.2)',
    hullFill: 'rgba(213,138,48,0.12)', glow: 'rgba(245,158,11,0.3)'
  },
  offline: {
    label: 'Core Isolated',
    detail: 'The sphere is alive, but the external inference line is down and the mesh runs cold.',
    shell: 'from-[#1b0a13] via-[#121725] to-[#07090f]',
    border: 'border-rose-300/32', text: 'text-rose-100',
    meshStroke: 'rgba(255,193,214,0.72)', meshDim: 'rgba(212,92,132,0.2)',
    hullFill: 'rgba(225,79,129,0.12)', glow: 'rgba(251,113,133,0.3)'
  },
  throughput: {
    label: 'Throughput Mode',
    detail: 'The sphere is intentionally saturated. Density is a feature until the lattice starts to choke.',
    shell: 'from-[#061915] via-[#0a2130] to-[#050b10]',
    border: 'border-teal-300/32', text: 'text-teal-100',
    meshStroke: 'rgba(185,255,245,0.76)', meshDim: 'rgba(71,182,171,0.2)',
    hullFill: 'rgba(32,168,154,0.12)', glow: 'rgba(45,212,191,0.3)'
  }
}

// ---------------------------------------------------------------------------
// Entity-to-color mapping
// ---------------------------------------------------------------------------

const KIND_COLOR: Record<EntityKind, { fill: string; glow: string }> = {
  workspace: { fill: '#4285F4', glow: 'rgba(66,133,244,0.4)' },
  agent:     { fill: '#EA4335', glow: 'rgba(234,67,53,0.4)' },
  port:      { fill: '#FBBC05', glow: 'rgba(251,188,5,0.4)' },
  git:       { fill: '#34A853', glow: 'rgba(52,168,83,0.4)' },
  ambient:   { fill: '#9aa0a6', glow: 'rgba(154,160,166,0.25)' }
}

const KIND_COLOR_MONO: Record<EntityKind, { fill: string; glow: string }> = {
  workspace: { fill: '#f0f0f0', glow: 'rgba(240,240,240,0.35)' },
  agent:     { fill: '#d4d4d4', glow: 'rgba(212,212,212,0.35)' },
  port:      { fill: '#e8e8e8', glow: 'rgba(232,232,232,0.35)' },
  git:       { fill: '#c0c0c0', glow: 'rgba(192,192,192,0.35)' },
  ambient:   { fill: '#888888', glow: 'rgba(136,136,136,0.2)' }
}

// ---------------------------------------------------------------------------
// System entity flattening
// ---------------------------------------------------------------------------

function buildEntities(
  processes?: ProcessGroup[],
  agents?: AgentInfo[],
  ports?: PortInfo[],
  gitRepos?: GitRepoInfo[]
): LatticeEntity[] {
  const entities: LatticeEntity[] = []

  if (processes) {
    for (const g of processes) {
      const cpuActivity = Math.min(1, g.totalCpu / 100)
      entities.push({ kind: 'workspace', name: g.name, activity: Math.max(0.15, cpuActivity) })
    }
  }
  if (agents) {
    for (const a of agents) {
      const act = a.status === 'active' || a.status === 'busy' ? 0.9
        : a.status === 'idle' ? 0.4 : 0.15
      entities.push({ kind: 'agent', name: a.name, activity: act })
    }
  }
  if (ports) {
    for (const p of ports) {
      if (p.state !== 'LISTEN') continue
      entities.push({ kind: 'port', name: `${p.port}/${p.process}`, activity: 0.5 })
    }
  }
  if (gitRepos) {
    for (const r of gitRepos) {
      const act = r.dirty ? 0.7 : r.ahead > 0 ? 0.5 : 0.25
      entities.push({ kind: 'git', name: r.name, activity: act })
    }
  }
  return entities
}

// ---------------------------------------------------------------------------
// Per-node visual params
// ---------------------------------------------------------------------------

function prand(index: number, seed: number): number {
  return (((index * 2654435761 + seed * 340573) >>> 0) % 10000) / 10000
}

function nodeVisuals(index: number, entity: LatticeEntity | null, mono: boolean) {
  const palette = mono ? KIND_COLOR_MONO : KIND_COLOR
  const kind = entity?.kind ?? 'ambient'
  const { fill, glow } = palette[kind]
  const activity = entity?.activity ?? (0.05 + prand(index, 8) * 0.2)

  const twinkleDur = 800 + Math.round(prand(index, 2) * 2700)
  const sizeDur = 1200 + Math.round(prand(index, 3) * 2800)
  const beginOffset = Math.round(prand(index, 7) * 3000)

  const isEntity = entity !== null
  const baseR = isEntity ? 2.2 + activity * 2.8 : 1.2 + prand(index, 6) * 1.0
  const dimFloor = isEntity ? 0.2 + activity * 0.3 : 0.06
  const brightCeil = isEntity ? 0.6 + activity * 0.4 : 0.35
  const rMin = baseR * 0.75
  const rMax = baseR * (isEntity ? 1.5 + activity * 0.5 : 1.2)

  return { fill, glow, twinkleDur, sizeDur, beginOffset, baseR, dimFloor, brightCeil, rMin, rMax, isEntity }
}

function dustVisuals(index: number, kind: EntityKind, mono: boolean) {
  const palette = mono ? KIND_COLOR_MONO : KIND_COLOR
  const { fill, glow } = palette[kind]
  const twinkleDur = 1100 + Math.round(prand(index, 11) * 2200)
  const beginOffset = Math.round(prand(index, 13) * 2400)
  const baseOpacity = kind === 'ambient' ? 0.16 : 0.24
  const peakOpacity = kind === 'ambient' ? 0.38 : 0.58
  const baseRadius = kind === 'ambient' ? 1.05 : 1.35
  return { fill, glow, twinkleDur, beginOffset, baseOpacity, peakOpacity, baseRadius }
}

// ---------------------------------------------------------------------------
// Motion
// ---------------------------------------------------------------------------

function getMotionProfile(mode: AICoreMode) {
  switch (mode) {
    case 'thinking':  return { pulseMs: 1400, shimmerMs: 1900, driftMs: 8800 }
    case 'repairing': return { pulseMs: 1500, shimmerMs: 1700, driftMs: 8200 }
    case 'speaking':  return { pulseMs: 1700, shimmerMs: 2100, driftMs: 9600 }
    case 'offline':   return { pulseMs: 2400, shimmerMs: 2500, driftMs: 11200 }
    case 'throughput': return { pulseMs: 1300, shimmerMs: 1600, driftMs: 7200 }
    default:          return { pulseMs: 1800, shimmerMs: 2200, driftMs: 10400 }
  }
}

function titleCase(v: string): string { return v[0].toUpperCase() + v.slice(1) }

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

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AICoreNode({
  mode, mono = false, activeAgents, totalAgents, cpuUsage, memoryUsage, listenerCount,
  yenneferStyle, lmStudioUrl, disabled,
  processes, agents, ports, gitRepos,
  onInvokeYennefer, onRequestBriefing, onRepair, onToggleMono, onSetYenneferStyle, lensDisabled = false
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

  // Build entity list from live system data
  const entities = useMemo(
    () => buildEntities(processes, agents, ports, gitRepos),
    [processes, agents, ports, gitRepos]
  )

  // Map entities to globe node positions (first N get real entities, rest ambient)
  const nodeCount = GLOBE_NODES.length
  const entityMap: Array<LatticeEntity | null> = useMemo(() => {
    const map: Array<LatticeEntity | null> = new Array(nodeCount).fill(null)
    // Spread entities evenly across node positions using stride
    const stride = entities.length > 0 ? Math.max(1, Math.floor(nodeCount / entities.length)) : 1
    for (let i = 0; i < entities.length && i * stride < nodeCount; i++) {
      map[i * stride] = entities[i]
    }
    return map
  }, [entities, nodeCount])

  // Count entities by kind for the legend
  const kindCounts = useMemo(() => {
    const c = { workspace: 0, agent: 0, port: 0, git: 0 }
    for (const e of entities) if (e.kind !== 'ambient') c[e.kind]++
    return c
  }, [entities])

  const twinkleKinds = useMemo(() => {
    const activeKinds: EntityKind[] = []
    if (kindCounts.workspace > 0) activeKinds.push('workspace')
    if (kindCounts.agent > 0) activeKinds.push('agent')
    if (kindCounts.port > 0) activeKinds.push('port')
    if (kindCounts.git > 0) activeKinds.push('git')
    if (activeKinds.length === 0) activeKinds.push('ambient')
    return activeKinds
  }, [kindCounts])

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
      <div className="space-y-4">
        <div className="relative overflow-hidden rounded-[24px] border border-white/10 bg-black/28 p-4">
          <div className="absolute inset-0 opacity-28" style={{
            backgroundImage: 'linear-gradient(rgba(121,168,201,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(121,168,201,0.1) 1px, transparent 1px)',
            backgroundSize: '34px 34px'
          }} />
          <div className="absolute inset-0 opacity-55" style={{
            backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0) 24%, rgba(255,255,255,0.04) 68%, rgba(255,255,255,0))'
          }} />

          {/* Header row */}
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
            <div
              ref={sphereRef}
              onPointerMove={handlePointerMove}
              onPointerLeave={handlePointerLeave}
              className="relative mx-auto w-full max-w-[980px] transition-transform duration-200 ease-out"
              style={{
                aspectRatio: '2 / 1',
                transform: 'perspective(1400px) rotateX(0deg) rotateY(0deg) scale(1)'
              }}
            >
              <div
                onClick={disabled ? undefined : onInvokeYennefer}
                role="button"
                tabIndex={disabled ? -1 : 0}
                className={`group absolute inset-0 overflow-hidden rounded-[22px] border border-white/10 bg-black/18 transition-all ${disabled ? 'cursor-not-allowed opacity-80' : 'cursor-pointer hover:border-white/20'}`}
              >
                <svg className="absolute inset-0 h-full w-full" viewBox="0 0 792 388" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
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

                  <rect x="0" y="0" width="792" height="388" fill={`url(#${glowId})`} />

                  <g clipPath={`url(#${clipId})`}>
                    <rect x={SPHERE.cx - SPHERE.r} y={SPHERE.cy - SPHERE.r}
                      width={SPHERE.r * 2} height={SPHERE.r * 2} fill="rgba(4,10,18,0.28)" />

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

                    <line x1={SPHERE.cx - SPHERE.r} y1={SPHERE.cy} x2={SPHERE.cx + SPHERE.r} y2={SPHERE.cy}
                      stroke={theme.meshStroke} strokeWidth="1.2" opacity="0.5" />

                    <g opacity="0.9">
                      <animateTransform attributeName="transform" type="translate"
                        values="0 0;5 -3;0 0;-4 2;0 0" dur={`${driftMs}ms`} repeatCount="indefinite" />
                      <animateTransform additive="sum" attributeName="transform" type="scale"
                        values="1 1;1.012 1.008;1 1;0.996 1.004;1 1" dur={`${pulseMs * 3}ms`} repeatCount="indefinite" />

                      <path d="M238 106C286 60 390 42 470 80C546 116 586 192 572 258C556 330 490 370 412 372C330 374 248 338 224 270C200 204 190 156 238 106Z"
                        fill={`url(#${hullId})`} stroke={theme.meshDim} strokeWidth="1.1" opacity="0.78">
                        <animate attributeName="opacity" values="0.42;0.82;0.42" dur={`${pulseMs}ms`} repeatCount="indefinite" />
                      </path>

                      {DUST_POINTS.map(([x, y], i) => {
                        const kind = twinkleKinds[i % twinkleKinds.length]
                        const v = dustVisuals(i, kind, mono)
                        return (
                          <g key={`d-${i}`}>
                            <circle cx={x} cy={y} r={v.baseRadius * 3.2} fill={v.glow} opacity="0">
                              <animate
                                attributeName="opacity"
                                values={`0;${kind === 'ambient' ? '0.12' : '0.26'};0`}
                                dur={`${v.twinkleDur}ms`}
                                begin={`${v.beginOffset}ms`}
                                repeatCount="indefinite"
                              />
                              <animate
                                attributeName="r"
                                values={`${(v.baseRadius * 2.4).toFixed(2)};${(v.baseRadius * 4.1).toFixed(2)};${(v.baseRadius * 2.4).toFixed(2)}`}
                                dur={`${Math.max(1200, v.twinkleDur + 320)}ms`}
                                begin={`${v.beginOffset}ms`}
                                repeatCount="indefinite"
                              />
                            </circle>
                            <circle cx={x} cy={y} r={v.baseRadius} fill={v.fill} opacity={v.baseOpacity}>
                              <animate
                                attributeName="opacity"
                                values={`${v.baseOpacity};${v.peakOpacity};${v.baseOpacity}`}
                                dur={`${Math.max(900, shimmerMs - 260) + i * 18}ms`}
                                begin={`${v.beginOffset}ms`}
                                repeatCount="indefinite"
                              />
                              <animate
                                attributeName="r"
                                values={`${v.baseRadius};${(v.baseRadius * 1.55).toFixed(2)};${v.baseRadius}`}
                                dur={`${v.twinkleDur}ms`}
                                begin={`${v.beginOffset}ms`}
                                repeatCount="indefinite"
                              />
                            </circle>
                            <circle cx={x} cy={y} r={Math.max(0.55, v.baseRadius * 0.42)} fill="rgba(241,252,255,0.92)" opacity="0.4">
                              <animate
                                attributeName="opacity"
                                values="0.28;0.92;0.28"
                                dur={`${Math.max(860, v.twinkleDur - 120)}ms`}
                                begin={`${v.beginOffset}ms`}
                                repeatCount="indefinite"
                              />
                              <animate
                                attributeName="r"
                                values={`${Math.max(0.55, v.baseRadius * 0.36).toFixed(2)};${Math.max(0.9, v.baseRadius * 0.64).toFixed(2)};${Math.max(0.55, v.baseRadius * 0.36).toFixed(2)}`}
                                dur={`${Math.max(820, v.twinkleDur - 200)}ms`}
                                begin={`${v.beginOffset}ms`}
                                repeatCount="indefinite"
                              />
                            </circle>
                          </g>
                        )
                      })}

                      {GLOBE_NODES.map((node, i) => {
                        const v = nodeVisuals(i, entityMap[i], mono)
                        return (
                          <g key={`gn-${i}`}>
                            <circle cx={node.x} cy={node.y} r={v.baseR} fill={v.fill} opacity={v.dimFloor}>
                              <animate attributeName="opacity"
                                values={`${v.dimFloor};${v.brightCeil};${v.dimFloor}`}
                                dur={`${v.twinkleDur}ms`} begin={`${v.beginOffset}ms`} repeatCount="indefinite" />
                              <animate attributeName="r" values={`${v.rMin};${v.rMax};${v.rMin}`}
                                dur={`${v.sizeDur}ms`} begin={`${v.beginOffset}ms`} repeatCount="indefinite" />
                            </circle>
                            {v.isEntity && (
                              <circle cx={node.x} cy={node.y} r={v.rMax * 2.5} fill={v.glow} opacity="0">
                                <animate attributeName="opacity" values="0;0.35;0"
                                  dur={`${v.twinkleDur}ms`} begin={`${v.beginOffset}ms`} repeatCount="indefinite" />
                              </circle>
                            )}
                          </g>
                        )
                      })}
                    </g>
                  </g>

                  <circle cx={SPHERE.cx} cy={SPHERE.cy} r={SPHERE.r}
                    fill="none" stroke={theme.meshStroke} strokeWidth="1.4" opacity="0.82" />
                  <circle cx={SPHERE.cx} cy={SPHERE.cy} r={SPHERE.r + 12}
                    fill="none" stroke={theme.meshDim} strokeDasharray="4 12" strokeWidth="1" opacity="0.68">
                    <animateTransform attributeName="transform" type="rotate"
                      values={`0 ${SPHERE.cx} ${SPHERE.cy};360 ${SPHERE.cx} ${SPHERE.cy}`}
                      dur={`${driftMs}ms`} repeatCount="indefinite" />
                  </circle>
                </svg>

                {/* Overlay badges stay inside the aspect-ratio frame so the sphere never spills into neighboring panels. */}
                <div className="absolute inset-0 pointer-events-none">
                  <div className="pointer-events-auto absolute inset-x-4 bottom-3 flex flex-wrap items-end justify-between gap-3">
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                      <div className="rounded-full border border-white/10 bg-black/60 px-2.5 py-1 text-[9px] uppercase tracking-[0.24em] text-gray-300">
                        Wireframe Intelligence
                      </div>
                      {entities.length > 0 && (
                        <>
                          {kindCounts.workspace > 0 && (
                            <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/55 px-2 py-1 text-[9px] uppercase tracking-[0.16em] text-gray-300">
                              <span className="inline-block h-2 w-2 rounded-full" style={{ background: mono ? '#f0f0f0' : '#4285F4' }} />
                              <span>Workspaces</span>
                              <span className="text-white">{kindCounts.workspace}</span>
                            </span>
                          )}
                          {kindCounts.agent > 0 && (
                            <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/55 px-2 py-1 text-[9px] uppercase tracking-[0.16em] text-gray-300">
                              <span className="inline-block h-2 w-2 rounded-full" style={{ background: mono ? '#d4d4d4' : '#EA4335' }} />
                              <span>Agents</span>
                              <span className="text-white">{kindCounts.agent}</span>
                            </span>
                          )}
                          {kindCounts.port > 0 && (
                            <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/55 px-2 py-1 text-[9px] uppercase tracking-[0.16em] text-gray-300">
                              <span className="inline-block h-2 w-2 rounded-full" style={{ background: mono ? '#e8e8e8' : '#FBBC05' }} />
                              <span>Ports</span>
                              <span className="text-white">{kindCounts.port}</span>
                            </span>
                          )}
                          {kindCounts.git > 0 && (
                            <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/55 px-2 py-1 text-[9px] uppercase tracking-[0.16em] text-gray-300">
                              <span className="inline-block h-2 w-2 rounded-full" style={{ background: mono ? '#c0c0c0' : '#34A853' }} />
                              <span>Git</span>
                              <span className="text-white">{kindCounts.git}</span>
                            </span>
                          )}
                        </>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {onToggleMono && (
                        <button type="button" onClick={(e) => { e.stopPropagation(); onToggleMono() }}
                          className={`rounded-full border px-2 py-1 text-[9px] uppercase tracking-[0.2em] transition-colors ${
                            mono
                              ? 'border-white/25 bg-white/15 text-white'
                              : 'border-white/10 bg-black/60 text-gray-400 hover:text-gray-200'
                          }`}>
                          {mono ? 'mono' : 'color'}
                        </button>
                      )}
                      <div className="rounded-full border border-white/10 bg-black/60 px-2.5 py-1 text-[9px] uppercase tracking-[0.24em] text-gray-300">
                        live
                      </div>
                      <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/60 px-2.5 py-1">
                        <span className={`h-2 w-2 rounded-full ${theme.text} bg-current shadow-[0_0_14px_currentColor]`} />
                        <span className={`text-[9px] uppercase tracking-[0.22em] ${theme.text}`}>{titleCase(yenneferStyle)} lens</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-[24px] border border-white/10 bg-black/25 p-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,0.62fr)_minmax(0,0.95fr)_minmax(0,0.72fr)]">
            <div>
              <div className="text-[10px] uppercase tracking-[0.3em] text-gray-500">Interface</div>
              <div className="mt-1 text-sm font-semibold text-gray-100">{titleCase(yenneferStyle)} Lens</div>
              <div className="mt-1 truncate text-xs text-gray-500" title={lmStudioUrl}>{endpoint}</div>
              {onSetYenneferStyle && (
                <div className="mt-3">
                  <label className="block text-[10px] uppercase tracking-[0.24em] text-gray-500">
                    Lens Control
                  </label>
                  <select
                    value={yenneferStyle}
                    disabled={lensDisabled}
                    onChange={(event) => onSetYenneferStyle(event.target.value as YenneferStyle)}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-gray-200 transition-colors disabled:cursor-not-allowed disabled:text-gray-500"
                  >
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

            <div className="rounded-[18px] border border-white/10 bg-black/20 p-3">
              <div className="text-[10px] uppercase tracking-[0.26em] text-gray-500">Readout</div>
              <div className={`mt-2 text-sm font-semibold ${theme.text}`}>{theme.label}</div>
              <p className="mt-2 text-xs leading-relaxed text-gray-300">{theme.detail}</p>
            </div>
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
