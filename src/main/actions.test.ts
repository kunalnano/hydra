import { describe, it, expect } from 'vitest'
import { isProtectedProcess, validatePid, PROTECTED_PROCESSES } from './actions'

describe('isProtectedProcess', () => {
  it('returns true for protected system processes', () => {
    expect(isProtectedProcess('Finder')).toBe(true)
    expect(isProtectedProcess('WindowServer')).toBe(true)
    expect(isProtectedProcess('loginwindow')).toBe(true)
    expect(isProtectedProcess('kernel_task')).toBe(true)
  })

  it('returns true for Hydra itself', () => {
    expect(isProtectedProcess('Electron')).toBe(true)
    expect(isProtectedProcess('HYDRA')).toBe(true)
    expect(isProtectedProcess('hydra')).toBe(true)
  })

  it('returns false for normal processes', () => {
    expect(isProtectedProcess('node')).toBe(false)
    expect(isProtectedProcess('postgres')).toBe(false)
    expect(isProtectedProcess('python3')).toBe(false)
  })

  it('matches case-insensitively', () => {
    expect(isProtectedProcess('finder')).toBe(true)
    expect(isProtectedProcess('WINDOWSERVER')).toBe(true)
  })
})

describe('validatePid', () => {
  it('returns false for PID 0 or negative', () => {
    expect(validatePid(0)).toBe(false)
    expect(validatePid(-1)).toBe(false)
  })

  it('returns false for PID 1 (init/launchd)', () => {
    expect(validatePid(1)).toBe(false)
  })

  it('returns true for normal PIDs', () => {
    expect(validatePid(1234)).toBe(true)
    expect(validatePid(99999)).toBe(true)
  })
})

describe('PROTECTED_PROCESSES', () => {
  it('contains critical system processes', () => {
    const names = PROTECTED_PROCESSES.map((n) => n.toLowerCase())
    expect(names).toContain('finder')
    expect(names).toContain('windowserver')
    expect(names).toContain('loginwindow')
    expect(names).toContain('kernel_task')
  })
})
