import { describe, it, expect } from 'vitest'
import { parseGitStatus, parseGitAheadBehind, parseGitLog, resolveGitScanDirs } from './git'

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

describe('parseGitLog', () => {
  it('parses standard commits without co-author', () => {
    const log = 'abc1234567890|John Doe|john@example.com|1700000000|fix: update config|§§§'
    const result = parseGitLog(log, 'my-repo')
    expect(result).toHaveLength(1)
    expect(result[0].hash).toBe('abc1234567890')
    expect(result[0].shortHash).toBe('abc1234')
    expect(result[0].author).toBe('John Doe')
    expect(result[0].email).toBe('john@example.com')
    expect(result[0].timestamp).toBe(1700000000)
    expect(result[0].message).toBe('fix: update config')
    expect(result[0].isAiAuthored).toBe(false)
    expect(result[0].aiAgent).toBeUndefined()
    expect(result[0].repoName).toBe('my-repo')
  })

  it('detects Co-Authored-By Claude', () => {
    const log =
      'abc1234567890|Hank|hank@port.io|1700000000|feat: add dashboard|\nCo-Authored-By: Claude <noreply@anthropic.com>§§§'
    const result = parseGitLog(log, 'hydra')
    expect(result).toHaveLength(1)
    expect(result[0].isAiAuthored).toBe(true)
    expect(result[0].aiAgent).toBe('claude')
  })

  it('handles multiple commits, some AI some human', () => {
    const log = [
      'aaa1111111111|Human Dev|dev@example.com|1700000001|fix: typo|§§§',
      'bbb2222222222|Hank|hank@port.io|1700000002|feat: new panel|\nCo-Authored-By: Claude Opus <noreply@anthropic.com>§§§',
      'ccc3333333333|Bot|bot@test.com|1700000003|chore: cleanup|§§§'
    ].join('\n')
    const result = parseGitLog(log, 'test-repo')
    expect(result).toHaveLength(3)
    expect(result[0].isAiAuthored).toBe(false)
    expect(result[1].isAiAuthored).toBe(true)
    expect(result[1].aiAgent).toBe('claude')
    expect(result[2].isAiAuthored).toBe(false)
  })

  it('matches co-authored-by case-insensitively', () => {
    const log =
      'abc1234567890|Dev|dev@example.com|1700000000|feat: thing|\nco-authored-by: Claude Sonnet <noreply@anthropic.com>§§§'
    const result = parseGitLog(log, 'repo')
    expect(result[0].isAiAuthored).toBe(true)
    expect(result[0].aiAgent).toBe('claude')
  })

  it('returns empty array for empty log output', () => {
    expect(parseGitLog('', 'repo')).toEqual([])
    expect(parseGitLog('  \n  ', 'repo')).toEqual([])
  })

  it('detects AI agent via author email (noreply@anthropic.com)', () => {
    const log = 'abc1234567890|Claude|noreply@anthropic.com|1700000000|auto: format code|§§§'
    const result = parseGitLog(log, 'repo')
    expect(result[0].isAiAuthored).toBe(true)
    expect(result[0].aiAgent).toBe('claude')
  })

  it('detects copilot via co-author', () => {
    const log =
      'abc1234567890|Dev|dev@example.com|1700000000|feat: add thing|\nCo-Authored-By: GitHub Copilot <copilot@github.com>§§§'
    const result = parseGitLog(log, 'repo')
    expect(result[0].isAiAuthored).toBe(true)
    expect(result[0].aiAgent).toBe('copilot')
  })

  it('handles commits with pipes in the message body', () => {
    const log =
      'abc1234567890|Dev|dev@example.com|1700000000|fix: handle a|b case|some body text§§§'
    const result = parseGitLog(log, 'repo')
    expect(result).toHaveLength(1)
    expect(result[0].message).toBe('fix: handle a')
  })
})

describe('resolveGitScanDirs', () => {
  it('uses configured scan roots when provided', () => {
    expect(resolveGitScanDirs(['/tmp/repos', '/var/work'])).toEqual(['/tmp/repos', '/var/work'])
  })

  it('falls back to the default root when config is empty', () => {
    const dirs = resolveGitScanDirs([])
    expect(dirs).toEqual([process.cwd()])
  })
})
