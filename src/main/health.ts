import type { ProcessGroup, GitRepoInfo } from '../shared/types'

export type HealthLevel = 'green' | 'yellow' | 'red'

export interface WorkspaceHealth {
  name: string
  level: HealthLevel
  reasons: string[]
}

export interface SystemHealth {
  overall: HealthLevel
  workspaces: WorkspaceHealth[]
}

const LEVEL_PRIORITY: Record<HealthLevel, number> = { green: 0, yellow: 1, red: 2 }

function worst(a: HealthLevel, b: HealthLevel): HealthLevel {
  return LEVEL_PRIORITY[a] >= LEVEL_PRIORITY[b] ? a : b
}

export function scoreWorkspace(
  group: ProcessGroup,
  repo: GitRepoInfo | undefined,
  frozenPids: Set<number>
): WorkspaceHealth {
  let level: HealthLevel = 'green'
  const reasons: string[] = []

  if (group.totalCpu > 95) {
    level = worst(level, 'red')
    reasons.push('CPU > 95%')
  } else if (group.totalCpu > 80) {
    level = worst(level, 'yellow')
    reasons.push('CPU > 80%')
  }

  if (group.totalMem > 85) {
    level = worst(level, 'red')
    reasons.push('Memory > 85%')
  } else if (group.totalMem > 70) {
    level = worst(level, 'yellow')
    reasons.push('Memory > 70%')
  }

  if (repo && repo.dirty && repo.ahead > 10) {
    level = worst(level, 'yellow')
    reasons.push(`${repo.ahead} commits ahead, dirty`)
  }

  if (group.processes.length > 0) {
    const frozenCount = group.processes.filter((p) => frozenPids.has(p.pid)).length
    if (frozenCount === group.processes.length) {
      level = worst(level, 'yellow')
      reasons.push('All processes frozen')
    }
  }

  return { name: group.name, level, reasons }
}

export function scoreSystem(
  groups: ProcessGroup[],
  repos: GitRepoInfo[],
  frozenPids: Set<number>
): SystemHealth {
  const repoMap = new Map(repos.map((r) => [r.name, r]))

  const workspaces = groups
    .filter((g) => g.type !== 'other')
    .map((g) => scoreWorkspace(g, repoMap.get(g.name), frozenPids))

  let overall: HealthLevel = 'green'
  for (const w of workspaces) {
    overall = worst(overall, w.level)
  }

  return { overall, workspaces }
}
