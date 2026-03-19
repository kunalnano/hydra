/**
 * Mechanical entity visualizer — geometry, antenna logic, plate/node builders.
 *
 * Each system entity (workspace, agent, port, git repo) becomes an antenna spike
 * on a breathing reactor core made of armor plates, circuit nodes, and a nucleus.
 */

export type EntityKind = 'workspace' | 'agent' | 'port' | 'git' | 'ambient'

export interface LatticeEntity {
  kind: EntityKind
  name: string
  activity: number
}

// ---------------------------------------------------------------------------
// Antenna
// ---------------------------------------------------------------------------

export interface MechAntenna {
  kind: EntityKind
  name: string
  activity: number
  angle: number
  baseLength: number
  width: number
  segments: number
  color: { r: number; g: number; b: number }
  hasNode: boolean
  nodeSize: number
  pulseFreq: number
  phase: number
  currentLength: number
  birthTime: number
  dying: boolean
  deathTime: number
}

export const ENTITY_ANTENNA_CONFIG: Record<EntityKind, {
  color: { r: number; g: number; b: number }
  segments: number
  baseWidth: number
  hasNode: boolean
}> = {
  workspace: { color: { r: 255, g: 210, b: 130 }, segments: 3, baseWidth: 2.5, hasNode: true },
  agent:     { color: { r: 255, g: 170, b: 90 },  segments: 2, baseWidth: 2.0, hasNode: true },
  port:      { color: { r: 245, g: 240, b: 210 }, segments: 2, baseWidth: 1.5, hasNode: true },
  git:       { color: { r: 200, g: 170, b: 110 }, segments: 2, baseWidth: 1.8, hasNode: true },
  ambient:   { color: { r: 160, g: 140, b: 100 }, segments: 1, baseWidth: 1.0, hasNode: false }
}

const GOLDEN_ANGLE = (2 * Math.PI) / (((1 + Math.sqrt(5)) / 2) ** 2)

function prand(i: number, s: number): number {
  return (((i * 2654435761 + s * 340573) >>> 0) % 10000) / 10000
}

export function createAntenna(
  entity: LatticeEntity,
  index: number,
  _totalCount: number,
  time: number
): MechAntenna {
  const cfg = ENTITY_ANTENNA_CONFIG[entity.kind]
  return {
    kind: entity.kind,
    name: entity.name,
    activity: entity.activity,
    angle: index * GOLDEN_ANGLE,
    baseLength: 15 + entity.activity * 35,
    width: cfg.baseWidth,
    segments: cfg.segments,
    color: cfg.color,
    hasNode: cfg.hasNode,
    nodeSize: 2 + entity.activity * 2,
    pulseFreq: 0.3 + entity.activity * 1.2,
    phase: prand(index, 42) * Math.PI * 2,
    currentLength: 0,
    birthTime: time,
    dying: false,
    deathTime: 0
  }
}

export function reconcileAntennas(
  current: MechAntenna[],
  newEntities: LatticeEntity[],
  time: number
): MechAntenna[] {
  const result: MechAntenna[] = []
  const matched = new Set<number>()

  for (const ant of current) {
    const idx = newEntities.findIndex((e, i) =>
      !matched.has(i) && e.name === ant.name && e.kind === ant.kind
    )
    if (idx >= 0) {
      matched.add(idx)
      ant.activity = newEntities[idx].activity
      ant.baseLength = 15 + ant.activity * 35
      ant.pulseFreq = 0.3 + ant.activity * 1.2
      ant.nodeSize = 2 + ant.activity * 2
      result.push(ant)
    } else if (!ant.dying) {
      ant.dying = true
      ant.deathTime = time
      result.push(ant)
    } else if (time - ant.deathTime < 0.4) {
      result.push(ant)
    }
  }

  for (let i = 0; i < newEntities.length; i++) {
    if (!matched.has(i)) {
      result.push(createAntenna(newEntities[i], result.length, result.length + 1, time))
    }
  }

  let alive = 0
  for (const a of result) {
    if (!a.dying) {
      a.angle = alive * GOLDEN_ANGLE
      alive++
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// Armor plates
// ---------------------------------------------------------------------------

export interface ArmorPlate {
  angStart: number
  angEnd: number
  gapRatio: number
  phase: number
  freq: number
  thickness: number
}

export function buildArmorPlates(count: number): ArmorPlate[] {
  const plates: ArmorPlate[] = []
  const gap = 0.04
  const sliceAng = (Math.PI * 2) / count
  for (let i = 0; i < count; i++) {
    plates.push({
      angStart: i * sliceAng + gap,
      angEnd: (i + 1) * sliceAng - gap,
      gapRatio: gap,
      phase: prand(i, 77) * Math.PI * 2,
      freq: 0.8 + prand(i, 99) * 0.4,
      thickness: 18 + prand(i, 55) * 8
    })
  }
  return plates
}

// ---------------------------------------------------------------------------
// Circuit nodes
// ---------------------------------------------------------------------------

export interface CircuitNode {
  angle: number
  dist: number
  size: number
  phase: number
  speed: number
  brightness: number
  shape: 'square' | 'diamond'
}

export function buildCircuitNodes(count: number): CircuitNode[] {
  const nodes: CircuitNode[] = []
  for (let i = 0; i < count; i++) {
    nodes.push({
      angle: prand(i, 11) * Math.PI * 2,
      dist: 8 + prand(i, 22) * 32,
      size: 1.5 + prand(i, 33) * 2.5,
      phase: prand(i, 44) * Math.PI * 2,
      speed: 0.15 + prand(i, 55) * 0.35,
      brightness: 0.3 + prand(i, 66) * 0.5,
      shape: prand(i, 77) > 0.5 ? 'diamond' : 'square'
    })
  }
  return nodes
}

// ---------------------------------------------------------------------------
// Mode params
// ---------------------------------------------------------------------------

export interface MechParams {
  bSpd: number; bAmp: number; sqSpd: number; sqAmp: number
  glow: number; spkLen: number; spkAct: number; pDrift: number
}

export const MODE_MECH_PARAMS: Record<string, MechParams> = {
  idle:       { bSpd: 0.4,  bAmp: 0.05, sqSpd: 0.5,  sqAmp: 2,  glow: 0.55, spkLen: 1.0, spkAct: 0.5, pDrift: 0.3 },
  thinking:   { bSpd: 0.7,  bAmp: 0.09, sqSpd: 1.0,  sqAmp: 4,  glow: 0.75, spkLen: 1.4, spkAct: 0.8, pDrift: 0.5 },
  speaking:   { bSpd: 0.5,  bAmp: 0.14, sqSpd: 0.7,  sqAmp: 3,  glow: 0.95, spkLen: 1.7, spkAct: 1.0, pDrift: 0.7 },
  repairing:  { bSpd: 0.3,  bAmp: 0.04, sqSpd: 0.35, sqAmp: 1.5, glow: 0.4, spkLen: 0.5, spkAct: 0.3, pDrift: 0.2 },
  offline:    { bSpd: 0.12, bAmp: 0.02, sqSpd: 0.15, sqAmp: 0.8, glow: 0.12, spkLen: 0.2, spkAct: 0.08, pDrift: 0.08 },
  throughput: { bSpd: 1.0,  bAmp: 0.11, sqSpd: 1.6,  sqAmp: 5,  glow: 1.0, spkLen: 1.9, spkAct: 1.0, pDrift: 0.9 }
}

// ---------------------------------------------------------------------------
// Simple 2D value noise for squirm
// ---------------------------------------------------------------------------

function fade(t: number): number { return t * t * t * (t * (t * 6 - 15) + 10) }
function lerp(a: number, b: number, t: number): number { return a + t * (b - a) }

const PERM = new Uint8Array(512)
;(function initPerm() {
  const p = new Uint8Array(256)
  for (let i = 0; i < 256; i++) p[i] = i
  for (let i = 255; i > 0; i--) {
    const j = ((i * 2654435761) >>> 0) % (i + 1)
    const tmp = p[i]; p[i] = p[j]; p[j] = tmp
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255]
})()

function grad2(hash: number, x: number, y: number): number {
  const h = hash & 3
  const u = h < 2 ? x : y
  const v = h < 2 ? y : x
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v)
}

export function sNoise(x: number, y: number, z: number): number {
  // Treat z as offset to x,y for a pseudo-3D effect using 2D noise
  const nx = x + z * 0.7
  const ny = y + z * 0.3
  const xi = Math.floor(nx) & 255
  const yi = Math.floor(ny) & 255
  const xf = nx - Math.floor(nx)
  const yf = ny - Math.floor(ny)
  const u = fade(xf)
  const v = fade(yf)
  const aa = PERM[PERM[xi] + yi]
  const ab = PERM[PERM[xi] + yi + 1]
  const ba = PERM[PERM[xi + 1] + yi]
  const bb = PERM[PERM[xi + 1] + yi + 1]
  return lerp(
    lerp(grad2(aa, xf, yf), grad2(ba, xf - 1, yf), u),
    lerp(grad2(ab, xf, yf - 1), grad2(bb, xf - 1, yf - 1), u),
    v
  )
}

// ---------------------------------------------------------------------------
// Core radius with breathing + squirm
// ---------------------------------------------------------------------------

const TAU = Math.PI * 2

export function coreRadius(
  angle: number, time: number, params: MechParams, baseR: number
): number {
  const breathe = 1 + Math.sin(time * params.bSpd * TAU) * params.bAmp
  const breathe2 = 1 + Math.sin(time * params.bSpd * TAU * 0.6 + 1.5) * params.bAmp * 0.5
  const squirm = sNoise(
    Math.cos(angle) * 2.5,
    Math.sin(angle) * 2.5,
    time * params.sqSpd
  ) * params.sqAmp
  const localBreathe = breathe + (breathe2 - 1) * Math.sin(angle * 3 + time * 0.4)
  return baseR * localBreathe + squirm
}

// ---------------------------------------------------------------------------
// Canvas render helpers
// ---------------------------------------------------------------------------

export function rgba(r: number, g: number, b: number, a: number): string {
  return `rgba(${r},${g},${b},${a.toFixed(3)})`
}

export function drawSquare(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, size: number, rotation: number,
  fillStyle: string
): void {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(rotation)
  ctx.fillStyle = fillStyle
  const h = size / 2
  ctx.fillRect(-h, -h, size, size)
  ctx.restore()
}

export function drawDiamond(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, size: number, rotation: number,
  fillStyle: string
): void {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(rotation + Math.PI / 4)
  ctx.fillStyle = fillStyle
  const h = size / 2
  ctx.fillRect(-h, -h, size, size)
  ctx.restore()
}

export function drawHexagon(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, r: number, rotation: number,
  fillStyle: string
): void {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(rotation)
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU
    const px = r * Math.cos(a)
    const py = r * Math.sin(a)
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
  ctx.fillStyle = fillStyle
  ctx.fill()
  ctx.restore()
}
