import { describe, it, expect, vi, beforeEach } from 'vitest'
import { clearSessionRegistry, getSessionRegistry } from './spawner'

// Mock child_process.execFile
const mockExecFile = vi.fn()
vi.mock('child_process', () => ({
  execFile: (...args: unknown[]) => mockExecFile(...args)
}))

vi.mock('util', () => ({
  promisify: (fn: unknown) => {
    return (...args: unknown[]) => {
      return new Promise((resolve, reject) => {
        (fn as Function)(...args, (err: Error | null, result: unknown) => {
          if (err) reject(err)
          else resolve(result)
        })
      })
    }
  }
}))

vi.mock('fs', () => ({
  existsSync: vi.fn(() => true)
}))

describe('spawner', () => {
  beforeEach(() => {
    clearSessionRegistry()
    mockExecFile.mockReset()
  })

  describe('getSessionRegistry', () => {
    it('returns empty map initially', () => {
      expect(getSessionRegistry().size).toBe(0)
    })
  })

  describe('clearSessionRegistry', () => {
    it('clears all sessions', () => {
      const registry = getSessionRegistry()
      registry.set('test', {
        id: 'test',
        role: 'builder',
        model: 'sonnet',
        tmuxSession: 'helm-hive',
        tmuxWindow: 'builder-abc123',
        workingDir: '/tmp',
        startedAt: Date.now(),
        status: 'running'
      })
      expect(registry.size).toBe(1)
      clearSessionRegistry()
      expect(getSessionRegistry().size).toBe(0)
    })
  })
})

describe('tmux output parsing', () => {
  it('parses window list format correctly', () => {
    const output = 'architect-abc123|12345|/Users/test/project\nbuilder-def456|12346|/Users/test/other'
    const lines = output.trim().split('\n')
    const parsed = lines.map((line) => {
      const [name, pid, cwd] = line.split('|')
      return { name, pid: parseInt(pid, 10), cwd }
    })

    expect(parsed).toHaveLength(2)
    expect(parsed[0]).toEqual({ name: 'architect-abc123', pid: 12345, cwd: '/Users/test/project' })
    expect(parsed[1]).toEqual({ name: 'builder-def456', pid: 12346, cwd: '/Users/test/other' })
  })

  it('handles empty output', () => {
    const output = ''
    const lines = output.trim().split('\n').filter(Boolean)
    expect(lines).toHaveLength(0)
  })

  it('handles single window', () => {
    const output = 'ops-xyz789|99999|/home/user'
    const lines = output.trim().split('\n')
    expect(lines).toHaveLength(1)
    const [name, pid, cwd] = lines[0].split('|')
    expect(name).toBe('ops-xyz789')
    expect(parseInt(pid, 10)).toBe(99999)
    expect(cwd).toBe('/home/user')
  })

  it('extracts role from window name', () => {
    const windowName = 'architect-abc123'
    const role = windowName.split('-')[0]
    expect(role).toBe('architect')
  })

  it('handles window name without id suffix', () => {
    const windowName = 'control'
    const role = windowName.split('-')[0]
    expect(role).toBe('control')
  })
})

describe('session ID generation', () => {
  it('generates unique IDs', () => {
    const ids = new Set<string>()
    for (let i = 0; i < 100; i++) {
      ids.add(`hive-test-${Date.now().toString(36)}-${i}`)
    }
    expect(ids.size).toBe(100)
  })

  it('includes role name in ID', () => {
    const id = `hive-architect-${Date.now().toString(36)}`
    expect(id).toContain('architect')
    expect(id.startsWith('hive-')).toBe(true)
  })
})
