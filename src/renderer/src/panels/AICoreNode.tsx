import { useId, useRef } from 'react'
import type { YenneferStyle } from '../../../shared/types'

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

interface MeshNode {
  id: string
  x: number
  y: number
  r: number
  delayMs: number
}

const SPHERE = { cx: 396, cy: 194, r: 172 }

const MESH_NODES: MeshNode[] = [
  { id: 'n01', x: 246, y: 124, r: 2.2, delayMs: 60 },
  { id: 'n02', x: 266, y: 92, r: 2.0, delayMs: 140 },
  { id: 'n03', x: 298, y: 74, r: 2.2, delayMs: 220 },
  { id: 'n04', x: 338, y: 62, r: 2.5, delayMs: 300 },
  { id: 'n05', x: 378, y: 56, r: 2.7, delayMs: 380 },
  { id: 'n06', x: 422, y: 60, r: 3.2, delayMs: 460 },
  { id: 'n07', x: 464, y: 76, r: 2.9, delayMs: 540 },
  { id: 'n08', x: 504, y: 100, r: 2.6, delayMs: 620 },
  { id: 'n09', x: 532, y: 128, r: 2.3, delayMs: 700 },
  { id: 'n10', x: 236, y: 164, r: 2.1, delayMs: 100 },
  { id: 'n11', x: 278, y: 144, r: 2.4, delayMs: 180 },
  { id: 'n12', x: 320, y: 128, r: 2.8, delayMs: 260 },
  { id: 'n13', x: 364, y: 118, r: 3.2, delayMs: 340 },
  { id: 'n14', x: 408, y: 122, r: 3.7, delayMs: 420 },
  { id: 'n15', x: 452, y: 128, r: 3.2, delayMs: 500 },
  { id: 'n16', x: 494, y: 144, r: 2.8, delayMs: 580 },
  { id: 'n17', x: 526, y: 170, r: 2.2, delayMs: 660 },
  { id: 'n18', x: 230, y: 206, r: 2.0, delayMs: 140 },
  { id: 'n19', x: 268, y: 190, r: 2.4, delayMs: 220 },
  { id: 'n20', x: 308, y: 178, r: 2.9, delayMs: 300 },
  { id: 'n21', x: 352, y: 170, r: 3.4, delayMs: 380 },
  { id: 'n22', x: 396, y: 172, r: 4.1, delayMs: 460 },
  { id: 'n23', x: 440, y: 176, r: 3.5, delayMs: 540 },
  { id: 'n24', x: 482, y: 190, r: 2.9, delayMs: 620 },
  { id: 'n25', x: 520, y: 210, r: 2.4, delayMs: 700 },
  { id: 'n26', x: 238, y: 246, r: 2.1, delayMs: 180 },
  { id: 'n27', x: 278, y: 232, r: 2.5, delayMs: 260 },
  { id: 'n28', x: 320, y: 220, r: 2.9, delayMs: 340 },
  { id: 'n29', x: 364, y: 216, r: 3.4, delayMs: 420 },
  { id: 'n30', x: 408, y: 220, r: 3.8, delayMs: 500 },
  { id: 'n31', x: 452, y: 226, r: 3.1, delayMs: 580 },
  { id: 'n32', x: 492, y: 240, r: 2.6, delayMs: 660 },
  { id: 'n33', x: 520, y: 266, r: 2.1, delayMs: 740 },
  { id: 'n34', x: 258, y: 288, r: 2.0, delayMs: 220 },
  { id: 'n35', x: 296, y: 274, r: 2.3, delayMs: 300 },
  { id: 'n36', x: 338, y: 264, r: 2.7, delayMs: 380 },
  { id: 'n37', x: 382, y: 258, r: 3.0, delayMs: 460 },
  { id: 'n38', x: 426, y: 260, r: 2.7, delayMs: 540 },
  { id: 'n39', x: 468, y: 272, r: 2.4, delayMs: 620 },
  { id: 'n40', x: 500, y: 292, r: 2.0, delayMs: 700 },
  { id: 'n41', x: 296, y: 318, r: 1.8, delayMs: 260 },
  { id: 'n42', x: 336, y: 312, r: 2.1, delayMs: 340 },
  { id: 'n43', x: 378, y: 308, r: 2.3, delayMs: 420 },
  { id: 'n44', x: 420, y: 310, r: 2.1, delayMs: 500 },
  { id: 'n45', x: 458, y: 320, r: 1.8, delayMs: 580 }
]

const MESH_LINKS: Array<[string, string]> = [
  ['n01', 'n02'],
  ['n01', 'n10'],
  ['n01', 'n11'],
  ['n02', 'n03'],
  ['n02', 'n11'],
  ['n03', 'n04'],
  ['n03', 'n11'],
  ['n03', 'n12'],
  ['n04', 'n05'],
  ['n04', 'n12'],
  ['n04', 'n13'],
  ['n05', 'n06'],
  ['n05', 'n13'],
  ['n05', 'n14'],
  ['n06', 'n07'],
  ['n06', 'n14'],
  ['n06', 'n15'],
  ['n07', 'n08'],
  ['n07', 'n15'],
  ['n07', 'n16'],
  ['n08', 'n09'],
  ['n08', 'n16'],
  ['n08', 'n17'],
  ['n09', 'n17'],
  ['n10', 'n11'],
  ['n10', 'n18'],
  ['n10', 'n19'],
  ['n11', 'n12'],
  ['n11', 'n19'],
  ['n11', 'n20'],
  ['n12', 'n13'],
  ['n12', 'n20'],
  ['n12', 'n21'],
  ['n13', 'n14'],
  ['n13', 'n21'],
  ['n13', 'n22'],
  ['n14', 'n15'],
  ['n14', 'n22'],
  ['n14', 'n23'],
  ['n15', 'n16'],
  ['n15', 'n23'],
  ['n15', 'n24'],
  ['n16', 'n17'],
  ['n16', 'n24'],
  ['n16', 'n25'],
  ['n17', 'n25'],
  ['n18', 'n19'],
  ['n18', 'n26'],
  ['n19', 'n20'],
  ['n19', 'n26'],
  ['n19', 'n27'],
  ['n20', 'n21'],
  ['n20', 'n27'],
  ['n20', 'n28'],
  ['n21', 'n22'],
  ['n21', 'n28'],
  ['n21', 'n29'],
  ['n22', 'n23'],
  ['n22', 'n29'],
  ['n22', 'n30'],
  ['n23', 'n24'],
  ['n23', 'n30'],
  ['n23', 'n31'],
  ['n24', 'n25'],
  ['n24', 'n31'],
  ['n24', 'n32'],
  ['n25', 'n32'],
  ['n25', 'n33'],
  ['n26', 'n27'],
  ['n26', 'n34'],
  ['n27', 'n28'],
  ['n27', 'n34'],
  ['n27', 'n35'],
  ['n28', 'n29'],
  ['n28', 'n35'],
  ['n28', 'n36'],
  ['n29', 'n30'],
  ['n29', 'n36'],
  ['n29', 'n37'],
  ['n30', 'n31'],
  ['n30', 'n37'],
  ['n30', 'n38'],
  ['n31', 'n32'],
  ['n31', 'n38'],
  ['n31', 'n39'],
  ['n32', 'n33'],
  ['n32', 'n39'],
  ['n32', 'n40'],
  ['n33', 'n40'],
  ['n34', 'n35'],
  ['n34', 'n41'],
  ['n35', 'n36'],
  ['n35', 'n41'],
  ['n35', 'n42'],
  ['n36', 'n37'],
  ['n36', 'n42'],
  ['n36', 'n43'],
  ['n37', 'n38'],
  ['n37', 'n43'],
  ['n37', 'n44'],
  ['n38', 'n39'],
  ['n38', 'n44'],
  ['n38', 'n45'],
  ['n39', 'n40'],
  ['n39', 'n45'],
  ['n41', 'n42'],
  ['n42', 'n43'],
  ['n43', 'n44'],
  ['n44', 'n45']
]

const NODE_MAP = new Map(MESH_NODES.map((node) => [node.id, node]))

const DUST_POINTS: Array<[number, number]> = [
  [206, 124],
  [222, 156],
  [214, 214],
  [232, 276],
  [266, 338],
  [312, 46],
  [332, 96],
  [318, 344],
  [386, 36],
  [386, 350],
  [452, 50],
  [466, 100],
  [476, 344],
  [532, 88],
  [556, 138],
  [564, 288]
]

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

function getBaseMotionProfile(mode: AICoreMode): {
  pulseMs: number
  scanMs: number
  shimmerMs: number
  driftMs: number
} {
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

function MetricPill({
  label,
  value,
  emphasis = false
}: {
  label: string
  value: string
  emphasis?: boolean
}): JSX.Element {
  return (
    <div
      className={`rounded-[18px] border px-3 py-2 ${
        emphasis ? 'border-white/18 bg-white/10' : 'border-white/10 bg-black/20'
      }`}
    >
      <div className="text-[10px] uppercase tracking-[0.24em] text-gray-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-gray-100">{value}</div>
    </div>
  )
}

function ActionNode({
  label,
  detail,
  accent,
  disabled,
  onClick
}: {
  label: string
  detail: string
  accent: string
  disabled: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-[22px] border px-3 py-3 text-left transition-all ${
        disabled
          ? 'cursor-not-allowed border-white/10 bg-white/5 text-gray-500'
          : `border-white/10 ${accent} hover:-translate-y-0.5 hover:border-white/20`
      }`}
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.22em]">{label}</div>
      <div className="mt-1 text-xs text-gray-300">{detail}</div>
    </button>
  )
}

function ReadoutCell({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-[16px] border border-white/10 bg-black/24 px-3 py-2">
      <div className="text-[9px] uppercase tracking-[0.24em] text-gray-500">{label}</div>
      <div className="mt-1 text-sm font-medium text-gray-100">{value}</div>
    </div>
  )
}

export function AICoreNode({
  mode,
  activeAgents,
  totalAgents,
  cpuUsage,
  memoryUsage,
  listenerCount,
  yenneferStyle,
  lmStudioUrl,
  disabled,
  onInvokeYennefer,
  onRequestBriefing,
  onRepair
}: AICoreNodeProps): JSX.Element {
  const theme = MODE_THEME[mode]
  const sphereRef = useRef<HTMLDivElement | null>(null)
  const uid = useId().replace(/:/g, '')
  const clipId = `hydra-clip-${uid}`
  const glowId = `hydra-glow-${uid}`
  const sweepId = `hydra-sweep-${uid}`
  const hullId = `hydra-hull-${uid}`
  const endpoint = lmStudioUrl.replace(/^https?:\/\//, '')

  const baseMotion = getBaseMotionProfile(mode)
  const liveFactor =
    activeAgents * 0.55 + Math.max(0, memoryUsage - 70) * 0.08 + Math.max(0, cpuUsage - 40) * 0.05
  const pulseMs = Math.max(880, Math.round(baseMotion.pulseMs - liveFactor * 120))
  const scanMs = Math.max(1600, Math.round(baseMotion.scanMs - liveFactor * 85))
  const shimmerMs = Math.max(1100, Math.round(baseMotion.shimmerMs - liveFactor * 70))
  const driftMs = Math.max(4800, Math.round(baseMotion.driftMs - liveFactor * 140))

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    const element = sphereRef.current
    if (!element) return
    const rect = element.getBoundingClientRect()
    const x = (event.clientX - rect.left) / rect.width - 0.5
    const y = (event.clientY - rect.top) / rect.height - 0.5
    const rotateY = x * 10
    const rotateX = y * -8
    element.style.transform = `perspective(1400px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale(1.015)`
  }

  function handlePointerLeave(): void {
    const element = sphereRef.current
    if (!element) return
    element.style.transform = 'perspective(1400px) rotateX(0deg) rotateY(0deg) scale(1)'
  }

  return (
    <div
      className={`space-y-4 rounded-[28px] border ${theme.border} bg-gradient-to-br ${theme.shell} p-4 shadow-[0_18px_60px_rgba(0,0,0,0.32)]`}
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(260px,0.72fr)]">
        <div className="relative overflow-hidden rounded-[24px] border border-white/10 bg-black/28 p-4">
          <div
            className="absolute inset-0 opacity-28"
            style={{
              backgroundImage:
                'linear-gradient(rgba(121,168,201,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(121,168,201,0.1) 1px, transparent 1px)',
              backgroundSize: '34px 34px'
            }}
          />
          <div
            className="absolute inset-0 opacity-55"
            style={{
              backgroundImage:
                'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0) 24%, rgba(255,255,255,0.04) 68%, rgba(255,255,255,0))'
            }}
          />
          <div
            className="absolute -left-20 top-[-14%] h-[150%] w-24 rotate-[16deg] blur-xl"
            style={{
              background: `linear-gradient(90deg, rgba(255,255,255,0) 0%, ${theme.beam} 48%, rgba(255,255,255,0) 100%)`,
              animation: `hydra-scan-sweep ${scanMs}ms linear infinite`
            }}
          />

          <div className="relative flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.34em] text-gray-500">
                Data Visualization
              </div>
              <div className={`mt-1 text-sm font-semibold ${theme.text}`}>{theme.label}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-[0.26em] text-gray-500">
                Live Lattice
              </div>
              <div className="mt-1 text-xs text-gray-300">Hydra AI mesh // contained sphere</div>
            </div>
          </div>

          <div className="relative mt-4 grid gap-4 lg:grid-cols-[196px_minmax(0,1fr)]">
            <div className="space-y-3">
              <div className="rounded-[18px] border border-white/10 bg-black/24 p-3">
                <div className="text-[10px] uppercase tracking-[0.28em] text-gray-500">Live Feed</div>
                <p className="mt-2 text-sm leading-relaxed text-gray-300">{theme.detail}</p>
              </div>

              <div className="grid gap-2">
                <ReadoutCell label="Endpoint" value={endpoint} />
                <ReadoutCell label="Lens" value={titleCase(yenneferStyle)} />
                <ReadoutCell label="Mode" value={theme.label} />
                <ReadoutCell
                  label="Load"
                  value={`${activeAgents}/${totalAgents} agents | ${Math.round(memoryUsage)}% mem`}
                />
              </div>
            </div>

            <div
              ref={sphereRef}
              onPointerMove={handlePointerMove}
              onPointerLeave={handlePointerLeave}
              className="relative transition-transform duration-200 ease-out"
              style={{ transform: 'perspective(1400px) rotateX(0deg) rotateY(0deg) scale(1)' }}
            >
              <button
                onClick={onInvokeYennefer}
                disabled={disabled}
                className={`group relative h-[370px] w-full overflow-hidden rounded-[22px] border border-white/10 bg-black/18 text-left transition-all ${
                  disabled ? 'cursor-not-allowed opacity-80' : 'hover:border-white/20'
                }`}
              >
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
                    <linearGradient id={sweepId} x1="0%" y1="0%" x2="100%" y2="100%">
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
                    <rect
                      x={SPHERE.cx - SPHERE.r}
                      y={SPHERE.cy - SPHERE.r}
                      width={SPHERE.r * 2}
                      height={SPHERE.r * 2}
                      fill="rgba(4,10,18,0.28)"
                    />

                    <g opacity="0.52">
                      {[26, 52, 78, 104, 130, 156].map((rx, index) => (
                        <ellipse
                          key={`meridian-${rx}`}
                          cx={SPHERE.cx}
                          cy={SPHERE.cy}
                          rx={Math.max(22, rx)}
                          ry={SPHERE.r}
                          fill="none"
                          stroke={theme.meshDim}
                          strokeWidth={index % 2 === 0 ? 1 : 0.8}
                        />
                      ))}
                      {[154, 128, 98, 70, 42].map((ry, index) => (
                        <ellipse
                          key={`latitude-${ry}`}
                          cx={SPHERE.cx}
                          cy={SPHERE.cy}
                          rx={SPHERE.r}
                          ry={ry}
                          fill="none"
                          stroke={theme.meshDim}
                          strokeWidth={index % 2 === 0 ? 1 : 0.8}
                        />
                      ))}
                      <ellipse
                        cx={SPHERE.cx}
                        cy={SPHERE.cy}
                        rx={SPHERE.r}
                        ry={SPHERE.r * 0.92}
                        fill="none"
                        stroke={theme.meshDim}
                        strokeWidth="1.2"
                        opacity="0.7"
                      />
                    </g>

                    <g opacity="0.85">
                      <animateTransform
                        attributeName="transform"
                        type="translate"
                        values="0 0;5 -3;0 0;-4 2;0 0"
                        dur={`${driftMs}ms`}
                        repeatCount="indefinite"
                      />
                      <animateTransform
                        additive="sum"
                        attributeName="transform"
                        type="scale"
                        values={`1 ${1};1.012 1.008;1 1;0.996 1.004;1 1`}
                        dur={`${pulseMs * 3}ms`}
                        repeatCount="indefinite"
                      />

                      <path
                        d="M238 106C286 60 390 42 470 80C546 116 586 192 572 258C556 330 490 370 412 372C330 374 248 338 224 270C200 204 190 156 238 106Z"
                        fill={`url(#${hullId})`}
                        stroke={theme.meshDim}
                        strokeWidth="1.1"
                        opacity="0.78"
                      >
                        <animate
                          attributeName="opacity"
                          values="0.42;0.82;0.42"
                          dur={`${pulseMs}ms`}
                          repeatCount="indefinite"
                        />
                      </path>

                      {DUST_POINTS.map(([x, y], index) => (
                        <circle
                          key={`dust-${index}`}
                          cx={x}
                          cy={y}
                          r="1.3"
                          fill={theme.meshDim}
                          opacity="0.66"
                        >
                          <animate
                            attributeName="opacity"
                            values="0.15;0.62;0.15"
                            dur={`${shimmerMs + index * 30}ms`}
                            begin={`${(index * 70) % 900}ms`}
                            repeatCount="indefinite"
                          />
                        </circle>
                      ))}

                      {MESH_LINKS.map(([fromId, toId], index) => {
                        const from = NODE_MAP.get(fromId)
                        const to = NODE_MAP.get(toId)
                        if (!from || !to) return null
                        return (
                          <line
                            key={`${fromId}-${toId}`}
                            x1={from.x}
                            y1={from.y}
                            x2={to.x}
                            y2={to.y}
                            stroke={theme.meshStroke}
                            strokeWidth={index % 7 === 0 ? 1.35 : 0.92}
                            opacity={index % 5 === 0 ? 0.74 : 0.42}
                          >
                            <animate
                              attributeName="opacity"
                              values={index % 6 === 0 ? '0.18;0.96;0.18' : '0.12;0.64;0.12'}
                              dur={`${shimmerMs + (index % 9) * 120}ms`}
                              begin={`${(index * 95) % 1500}ms`}
                              repeatCount="indefinite"
                            />
                          </line>
                        )
                      })}

                      {MESH_NODES.map((node) => (
                        <g key={node.id}>
                          <circle
                            cx={node.x}
                            cy={node.y}
                            r={node.r + 4}
                            fill={theme.glow}
                            opacity="0.18"
                          >
                            <animate
                              attributeName="opacity"
                              values="0.05;0.24;0.05"
                              dur={`${pulseMs + node.delayMs}ms`}
                              begin={`${node.delayMs}ms`}
                              repeatCount="indefinite"
                            />
                          </circle>
                          <circle cx={node.x} cy={node.y} r={node.r} fill={theme.nodeFill}>
                            <animate
                              attributeName="r"
                              values={`${node.r};${node.r + 1.4};${node.r}`}
                              dur={`${pulseMs + node.delayMs}ms`}
                              begin={`${node.delayMs}ms`}
                              repeatCount="indefinite"
                            />
                          </circle>
                          <circle
                            cx={node.x}
                            cy={node.y}
                            r={node.r + 2}
                            fill="none"
                            stroke={theme.meshStroke}
                            strokeWidth="0.85"
                            opacity="0.35"
                          >
                            <animate
                              attributeName="r"
                              values={`${node.r + 1};${node.r + 8};${node.r + 1}`}
                              dur={`${pulseMs + node.delayMs}ms`}
                              begin={`${node.delayMs}ms`}
                              repeatCount="indefinite"
                            />
                            <animate
                              attributeName="opacity"
                              values="0.4;0;0.4"
                              dur={`${pulseMs + node.delayMs}ms`}
                              begin={`${node.delayMs}ms`}
                              repeatCount="indefinite"
                            />
                          </circle>
                        </g>
                      ))}

                      <path
                        d="M268 188C306 152 366 138 430 150C472 158 510 176 528 202"
                        fill="none"
                        stroke={theme.meshStroke}
                        strokeWidth="1.8"
                        opacity="0.82"
                      >
                        <animate
                          attributeName="opacity"
                          values="0.28;0.98;0.28"
                          dur={`${pulseMs}ms`}
                          repeatCount="indefinite"
                        />
                      </path>
                      <path
                        d="M258 230C304 258 368 266 430 252C476 242 512 220 536 192"
                        fill="none"
                        stroke={theme.meshStroke}
                        strokeWidth="1.6"
                        opacity="0.78"
                      >
                        <animate
                          attributeName="opacity"
                          values="0.24;0.92;0.24"
                          dur={`${pulseMs + 180}ms`}
                          repeatCount="indefinite"
                        />
                      </path>
                    </g>

                    <rect
                      x={SPHERE.cx - SPHERE.r - 50}
                      y={SPHERE.cy - SPHERE.r}
                      width="70"
                      height={SPHERE.r * 2}
                      fill={`url(#${sweepId})`}
                    >
                      <animate
                        attributeName="x"
                        values={`${SPHERE.cx - SPHERE.r - 60};${SPHERE.cx + SPHERE.r + 40}`}
                        dur={`${scanMs}ms`}
                        repeatCount="indefinite"
                      />
                    </rect>
                  </g>

                  <circle
                    cx={SPHERE.cx}
                    cy={SPHERE.cy}
                    r={SPHERE.r}
                    fill="none"
                    stroke={theme.meshStroke}
                    strokeWidth="1.4"
                    opacity="0.82"
                  />
                  <circle
                    cx={SPHERE.cx}
                    cy={SPHERE.cy}
                    r={SPHERE.r + 12}
                    fill="none"
                    stroke={theme.meshDim}
                    strokeDasharray="4 12"
                    strokeWidth="1"
                    opacity="0.68"
                  >
                    <animateTransform
                      attributeName="transform"
                      type="rotate"
                      values={`0 ${SPHERE.cx} ${SPHERE.cy};360 ${SPHERE.cx} ${SPHERE.cy}`}
                      dur={`${driftMs}ms`}
                      repeatCount="indefinite"
                    />
                  </circle>

                  <line x1="100" y1="116" x2="212" y2="148" stroke={theme.meshDim} strokeWidth="1" />
                  <line x1="552" y1="108" x2="530" y2="146" stroke={theme.meshDim} strokeWidth="1" />
                  <line x1="174" y1="318" x2="246" y2="268" stroke={theme.meshDim} strokeWidth="1" />
                </svg>

                <div className="absolute left-6 top-6 rounded-full border border-white/10 bg-black/45 px-3 py-1 text-[10px] uppercase tracking-[0.28em] text-gray-300">
                  Wireframe Intelligence
                </div>
                <div className="absolute right-6 top-6 rounded-full border border-white/10 bg-black/45 px-3 py-1 text-[10px] uppercase tracking-[0.28em] text-gray-300">
                  live // contained
                </div>

                <div className="absolute left-5 top-16 grid w-[170px] gap-2">
                  <ReadoutCell label="Sphere Mode" value={theme.label} />
                  <ReadoutCell label="Endpoint" value={endpoint} />
                </div>

                <div className="absolute right-6 top-16 max-w-[180px] text-right text-[11px] leading-relaxed text-gray-300">
                  Tap the sphere to invoke Yennefer. The lattice pulse rate follows live load.
                </div>

                <div className="absolute bottom-5 left-6 flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${theme.text} bg-current shadow-[0_0_18px_currentColor]`} />
                  <span className={`text-[11px] uppercase tracking-[0.26em] ${theme.text}`}>
                    {titleCase(yenneferStyle)} lens
                  </span>
                </div>

                <div className="absolute bottom-5 right-6 text-[11px] text-gray-300">
                  {disabled ? 'Mesh occupied' : 'Interactive sphere online'}
                </div>
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-[24px] border border-white/10 bg-black/25 p-4">
          <div className="space-y-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.3em] text-gray-500">Interface</div>
              <div className="mt-1 text-sm font-semibold text-gray-100">
                {titleCase(yenneferStyle)} Lens
              </div>
              <div className="mt-1 truncate text-xs text-gray-500" title={lmStudioUrl}>
                {lmStudioUrl}
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
              <MetricPill
                label="Swarm"
                value={`${activeAgents}/${totalAgents} active`}
                emphasis={mode === 'throughput'}
              />
              <MetricPill
                label="Memory"
                value={`${Math.round(memoryUsage)}%`}
                emphasis={memoryUsage >= 85}
              />
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
          <ActionNode
            label="Request Briefing"
            detail="Run the structured ops pass."
            accent="bg-blue-600/20 text-blue-100 hover:bg-blue-500/25"
            disabled={disabled}
            onClick={onRequestBriefing}
          />
          <ActionNode
            label="Invoke Repair"
            detail="Probe and rebuild the LM Studio path."
            accent="bg-emerald-600/20 text-emerald-100 hover:bg-emerald-500/25"
            disabled={disabled}
            onClick={onRepair}
          />
          <ActionNode
            label="Invoke Yennefer"
            detail="Open the channel through the sphere."
            accent="bg-violet-600/20 text-violet-100 hover:bg-violet-500/25"
            disabled={disabled}
            onClick={onInvokeYennefer}
          />
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
