import { describe, it, expect } from 'vitest'
import { scoreWorkspace, scoreSystem } from './health'
import type { ProcessGroup, GitRepoInfo } from '../shared/types'

function makeGroup(overrides: Partial<ProcessGroup> = {}): ProcessGroup {
  return {
    name: 'test-app',
    type: 'project',
    processes: [],
    totalCpu: 10,
    totalMem: 20,
    ports: [3000],
    ...overrides
  }
}

function makeRepo(overrides: Partial<GitRepoInfo> = {}): GitRepoInfo {
  return {
    path: '/test',
    name: 'test-app',
    branch: 'main',
    dirty: false,
    untracked: 0,
    modified: 0,
    ahead: 0,
    behind: 0,
    status: 'clean',
    ...overrides
  }
}

describe('scoreWorkspace', () => {
  it('returns green for healthy workspace', () => {
    const result = scoreWorkspace(makeGroup(), undefined, new Set())
    expect(result.level).toBe('green')
    expect(result.reasons).toHaveLength(0)
  })

  it('returns yellow for CPU > 80%', () => {
    const result = scoreWorkspace(makeGroup({ totalCpu: 85 }), undefined, new Set())
    expect(result.level).toBe('yellow')
    expect(result.reasons).toContain('CPU > 80%')
  })

  it('returns red for CPU > 95%', () => {
    const result = scoreWorkspace(makeGroup({ totalCpu: 97 }), undefined, new Set())
    expect(result.level).toBe('red')
    expect(result.reasons).toContain('CPU > 95%')
  })

  it('returns yellow for memory > 70%', () => {
    const result = scoreWorkspace(makeGroup({ totalMem: 75 }), undefined, new Set())
    expect(result.level).toBe('yellow')
    expect(result.reasons).toContain('Memory > 70%')
  })

  it('returns red for memory > 85%', () => {
    const result = scoreWorkspace(makeGroup({ totalMem: 90 }), undefined, new Set())
    expect(result.level).toBe('red')
    expect(result.reasons).toContain('Memory > 85%')
  })

  it('returns yellow for dirty git with many unpushed commits', () => {
    const repo = makeRepo({ dirty: true, ahead: 12 })
    const result = scoreWorkspace(makeGroup(), repo, new Set())
    expect(result.level).toBe('yellow')
    expect(result.reasons.some((r) => r.includes('ahead'))).toBe(true)
  })

  it('returns yellow when all processes are frozen', () => {
    const group = makeGroup({
      processes: [
        { pid: 100, user: 'test', cpu: 0, mem: 1, command: 'node', name: 'node' },
        { pid: 101, user: 'test', cpu: 0, mem: 1, command: 'node', name: 'node' }
      ]
    })
    const result = scoreWorkspace(group, undefined, new Set([100, 101]))
    expect(result.level).toBe('yellow')
    expect(result.reasons.some((r) => r.includes('frozen'))).toBe(true)
  })

  it('worst condition wins (red > yellow)', () => {
    const result = scoreWorkspace(makeGroup({ totalCpu: 97, totalMem: 75 }), undefined, new Set())
    expect(result.level).toBe('red')
  })
})

describe('scoreSystem', () => {
  it('returns green when all workspaces are green', () => {
    const groups = [makeGroup(), makeGroup({ name: 'other-app' })]
    const result = scoreSystem(groups, [], new Set())
    expect(result.overall).toBe('green')
  })

  it('returns red if any workspace is red', () => {
    const groups = [makeGroup(), makeGroup({ name: 'hot-app', totalCpu: 97 })]
    const result = scoreSystem(groups, [], new Set())
    expect(result.overall).toBe('red')
  })
})
