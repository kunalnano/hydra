import { describe, it, expect } from 'vitest'
import { parseGitStatus, parseGitAheadBehind } from './git'

describe('parseGitStatus', () => {
  it('parses clean repo status', () => {
    const result = parseGitStatus('')
    expect(result.dirty).toBe(false)
    expect(result.modified).toBe(0)
    expect(result.untracked).toBe(0)
  })

  it('counts modified files', () => {
    const statusOutput = ' M src/index.ts\n M src/app.tsx\nMM src/utils.ts'
    const result = parseGitStatus(statusOutput)
    expect(result.modified).toBe(3)
    expect(result.dirty).toBe(true)
  })

  it('counts untracked files', () => {
    const statusOutput = '?? new-file.ts\n?? another.ts\n M existing.ts'
    const result = parseGitStatus(statusOutput)
    expect(result.untracked).toBe(2)
    expect(result.modified).toBe(1)
  })
})

describe('parseGitAheadBehind', () => {
  it('parses ahead count', () => {
    const result = parseGitAheadBehind('[ahead 3]')
    expect(result).toEqual({ ahead: 3, behind: 0 })
  })

  it('parses behind count', () => {
    const result = parseGitAheadBehind('[behind 5]')
    expect(result).toEqual({ ahead: 0, behind: 5 })
  })

  it('parses ahead and behind', () => {
    const result = parseGitAheadBehind('[ahead 2, behind 3]')
    expect(result).toEqual({ ahead: 2, behind: 3 })
  })

  it('handles no remote tracking', () => {
    const result = parseGitAheadBehind('')
    expect(result).toEqual({ ahead: 0, behind: 0 })
  })
})
