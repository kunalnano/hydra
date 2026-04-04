import { readdirSync, readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { execSync } from 'child_process'
import { load, dump } from 'js-yaml'
import type { BrickItem, BrickLane, BrickQueueState } from '../shared/types'

const HELM_DIR = join(homedir(), '.helm')
const BRICKS_DIR = join(HELM_DIR, 'bricks')
const LANES: BrickLane[] = ['backlog', 'claimed', 'done', 'reviewed']

function ensureDirs(): void {
  for (const lane of LANES) {
    const dir = join(BRICKS_DIR, lane)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
  }
}

function priorityOrder(p: string): number {
  if (p.startsWith('p0')) return 0
  if (p.startsWith('p1')) return 1
  if (p.startsWith('p2')) return 2
  if (p.startsWith('p3')) return 3
  return 4
}

function readLane(lane: BrickLane): BrickItem[] {
  const dir = join(BRICKS_DIR, lane)
  if (!existsSync(dir)) return []

  return readdirSync(dir)
    .filter((f: string) => f.endsWith('.yaml') || f.endsWith('.yml'))
    .map((f: string) => {
      const raw = readFileSync(join(dir, f), 'utf-8')
      const brick = load(raw) as BrickItem
      brick.lane = lane
      return brick
    })
    .sort((a: BrickItem, b: BrickItem) => {
      const pOrd = priorityOrder(a.priority) - priorityOrder(b.priority)
      if (pOrd !== 0) return pOrd
      return a.created.localeCompare(b.created)
    })
}

export function getBrickQueue(): BrickQueueState {
  ensureDirs()
  return {
    backlog: readLane('backlog'),
    claimed: readLane('claimed'),
    done: readLane('done'),
    reviewed: readLane('reviewed')
  }
}

function findBrickFile(lane: BrickLane, brickId: string): string | null {
  const dir = join(BRICKS_DIR, lane)
  if (!existsSync(dir)) return null
  const files = readdirSync(dir).filter((f: string) => f.endsWith('.yaml'))
  for (const f of files) {
    const raw = readFileSync(join(dir, f), 'utf-8')
    const brick = load(raw) as BrickItem
    if (brick.id === brickId) return join(dir, f)
  }
  return null
}

function helmGitCommit(message: string): void {
  try {
    execSync('git add -A', { cwd: HELM_DIR, stdio: 'pipe' })
    execSync(`git commit -m ${JSON.stringify(message)}`, { cwd: HELM_DIR, stdio: 'pipe' })
  } catch {
    // Not a git repo or nothing to commit
  }
}

export function approveBrick(brickId: string): { success: boolean; error?: string } {
  const padded = brickId.padStart(3, '0')
  const srcPath = findBrickFile('done', padded)
  if (!srcPath) return { success: false, error: `Brick ${padded} not found in done/` }

  const raw = readFileSync(srcPath, 'utf-8')
  const brick = load(raw) as BrickItem
  const filename = srcPath.split('/').pop()!
  const dstPath = join(BRICKS_DIR, 'reviewed', filename)

  brick.status = 'reviewed'
  brick.review_status = 'approved'
  writeFileSync(dstPath, dump(brick, { lineWidth: -1 }))
  unlinkSync(srcPath)

  helmGitCommit(`review: ${padded} ${brick.title}`)
  return { success: true }
}

export function rejectBrick(
  brickId: string,
  note?: string
): { success: boolean; error?: string } {
  const padded = brickId.padStart(3, '0')
  const srcPath = findBrickFile('done', padded)
  if (!srcPath) return { success: false, error: `Brick ${padded} not found in done/` }

  const raw = readFileSync(srcPath, 'utf-8')
  const brick = load(raw) as BrickItem
  const filename = srcPath.split('/').pop()!
  const dstPath = join(BRICKS_DIR, 'backlog', filename)

  brick.status = 'backlog'
  brick.review_status = 'rejected'
  brick.claimed_by = null
  brick.claimed_at = null
  brick.completed_at = null
  if (note) brick.notes = note
  writeFileSync(dstPath, dump(brick, { lineWidth: -1 }))
  unlinkSync(srcPath)

  helmGitCommit(`reject: ${padded} ${brick.title}`)
  return { success: true }
}
