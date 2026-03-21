import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readSharedContext, writeSharedContext, ensureHiveDirectories } from './context'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn()
}))

const mockExistsSync = vi.mocked(existsSync)
const mockReadFileSync = vi.mocked(readFileSync)
const mockWriteFileSync = vi.mocked(writeFileSync)
const mockMkdirSync = vi.mocked(mkdirSync)

describe('readSharedContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty string when file does not exist', () => {
    mockExistsSync.mockReturnValue(false)
    expect(readSharedContext('/path/to/context.md')).toBe('')
  })

  it('returns file contents when file exists', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('# HIVE Context\nObjective: build something')
    const result = readSharedContext('/path/to/context.md')
    expect(result).toBe('# HIVE Context\nObjective: build something')
  })

  it('returns empty string on read error', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockImplementation(() => { throw new Error('EACCES') })
    expect(readSharedContext('/path/to/context.md')).toBe('')
  })
})

describe('writeSharedContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExistsSync.mockReturnValue(true)
  })

  it('writes markdown with objective', () => {
    writeSharedContext('/tmp/hive/shared/context.md', 'Build the auth module')
    expect(mockWriteFileSync).toHaveBeenCalledTimes(1)
    const content = mockWriteFileSync.mock.calls[0][1] as string
    expect(content).toContain('Build the auth module')
    expect(content).toContain('# HIVE Shared Context')
    expect(content).toContain('## Current Objective')
    expect(content).toContain('## Active Decisions')
    expect(content).toContain('## Blockers')
    expect(content).toContain('## Recent Outputs')
  })

  it('includes custom sections when provided', () => {
    writeSharedContext('/tmp/hive/shared/context.md', 'Test objective', {
      decisions: 'Use React for the frontend',
      blockers: 'Waiting on API spec'
    })
    const content = mockWriteFileSync.mock.calls[0][1] as string
    expect(content).toContain('Use React for the frontend')
    expect(content).toContain('Waiting on API spec')
  })

  it('includes timestamp', () => {
    writeSharedContext('/tmp/hive/shared/context.md', 'Test')
    const content = mockWriteFileSync.mock.calls[0][1] as string
    expect(content).toContain('Last updated:')
  })
})

describe('ensureHiveDirectories', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates parent directory and subdirectories when missing', () => {
    mockExistsSync.mockReturnValue(false)
    ensureHiveDirectories('/tmp/hive/shared/context.md')
    expect(mockMkdirSync).toHaveBeenCalled()
  })

  it('is idempotent when directories exist', () => {
    mockExistsSync.mockReturnValue(true)
    ensureHiveDirectories('/tmp/hive/shared/context.md')
    expect(mockMkdirSync).not.toHaveBeenCalled()
  })
})
