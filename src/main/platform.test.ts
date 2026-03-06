import { describe, it, expect } from 'vitest'
import { getPlatform, isMacOS, isLinux, isWindows, getDefaultShell } from './platform'
import type { Platform } from './platform'

describe('getPlatform', () => {
  it('returns a valid Platform value', () => {
    const valid: Platform[] = ['macos', 'linux', 'windows']
    expect(valid).toContain(getPlatform())
  })

  it('returns macos on darwin', () => {
    // Running on macOS in CI/dev
    if (process.platform === 'darwin') {
      expect(getPlatform()).toBe('macos')
    }
  })
})

describe('isMacOS', () => {
  it('returns a boolean', () => {
    expect(typeof isMacOS()).toBe('boolean')
  })

  it('matches process.platform darwin check', () => {
    expect(isMacOS()).toBe(process.platform === 'darwin')
  })
})

describe('isLinux', () => {
  it('returns a boolean', () => {
    expect(typeof isLinux()).toBe('boolean')
  })

  it('matches process.platform linux check', () => {
    expect(isLinux()).toBe(process.platform === 'linux')
  })
})

describe('isWindows', () => {
  it('returns a boolean', () => {
    expect(typeof isWindows()).toBe('boolean')
  })

  it('matches process.platform win32 check', () => {
    expect(isWindows()).toBe(process.platform === 'win32')
  })
})

describe('getDefaultShell', () => {
  it('returns a non-empty string', () => {
    const shell = getDefaultShell()
    expect(shell.length).toBeGreaterThan(0)
  })

  it('returns zsh on macOS', () => {
    if (process.platform === 'darwin') {
      expect(getDefaultShell()).toBe('/bin/zsh')
    }
  })
})
