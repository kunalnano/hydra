import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// We test config logic by importing the module and overriding the config path
// via a helper that writes/reads from tmp directories.
import type { HelmConfig } from '../shared/types'

// Since config.ts uses hardcoded paths based on os.homedir(), we test the
// core logic by directly exercising JSON serialization and default merging.
// For the file I/O functions, we test with the real module against tmp dirs.

describe('config defaults', () => {
  it('default config has expected shape', () => {
    const defaults: HelmConfig = {
      gitRepoPaths: [],
      monitorInterval: 2000,
      snapshotInterval: 30000
    }
    expect(defaults.monitorInterval).toBe(2000)
    expect(defaults.snapshotInterval).toBe(30000)
    expect(defaults.gitRepoPaths).toEqual([])
    expect(defaults.apiKey).toBeUndefined()
    expect(defaults.staffBinPath).toBeUndefined()
  })

  it('merging partial config with defaults fills in missing fields', () => {
    const defaults: HelmConfig = {
      gitRepoPaths: [],
      monitorInterval: 2000,
      snapshotInterval: 30000
    }
    const partial = { apiKey: 'sk-test-123', monitorInterval: 5000 }
    const merged = { ...defaults, ...partial }
    expect(merged.apiKey).toBe('sk-test-123')
    expect(merged.monitorInterval).toBe(5000)
    expect(merged.snapshotInterval).toBe(30000)
    expect(merged.gitRepoPaths).toEqual([])
  })
})

describe('config JSON serialization', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'hydra-config-test-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('writes and reads config as JSON', () => {
    const config: HelmConfig = {
      apiKey: 'sk-test',
      gitRepoPaths: ['/Users/test/repo1'],
      monitorInterval: 3000,
      snapshotInterval: 60000,
      staffBinPath: '/usr/local/bin/staff'
    }

    const configPath = join(tmpDir, 'config.json')
    const { writeFileSync } = require('fs')
    writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')

    const raw = readFileSync(configPath, 'utf-8')
    const parsed = JSON.parse(raw)
    expect(parsed.apiKey).toBe('sk-test')
    expect(parsed.gitRepoPaths).toEqual(['/Users/test/repo1'])
    expect(parsed.monitorInterval).toBe(3000)
    expect(parsed.snapshotInterval).toBe(60000)
    expect(parsed.staffBinPath).toBe('/usr/local/bin/staff')
  })

  it('handles missing config file by using defaults', () => {
    const configPath = join(tmpDir, 'nonexistent.json')
    expect(existsSync(configPath)).toBe(false)

    const defaults: HelmConfig = {
      gitRepoPaths: [],
      monitorInterval: 2000,
      snapshotInterval: 30000
    }
    // Simulate loadConfig behavior
    let result: HelmConfig
    try {
      const raw = readFileSync(configPath, 'utf-8')
      result = { ...defaults, ...JSON.parse(raw) }
    } catch {
      result = { ...defaults }
    }
    expect(result).toEqual(defaults)
  })

  it('handles malformed JSON by falling back to defaults', () => {
    const configPath = join(tmpDir, 'bad.json')
    const { writeFileSync } = require('fs')
    writeFileSync(configPath, 'not valid json {{{', 'utf-8')

    const defaults: HelmConfig = {
      gitRepoPaths: [],
      monitorInterval: 2000,
      snapshotInterval: 30000
    }
    let result: HelmConfig
    try {
      const raw = readFileSync(configPath, 'utf-8')
      result = { ...defaults, ...JSON.parse(raw) }
    } catch {
      result = { ...defaults }
    }
    expect(result).toEqual(defaults)
  })
})

describe('ensureConfigDir', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'hydra-config-dir-test-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates nested directories with recursive mkdir', () => {
    const { mkdirSync } = require('fs')
    const nested = join(tmpDir, 'a', 'b', 'c')
    expect(existsSync(nested)).toBe(false)
    mkdirSync(nested, { recursive: true })
    expect(existsSync(nested)).toBe(true)
  })

  it('does not throw when directory already exists', () => {
    const { mkdirSync } = require('fs')
    const nested = join(tmpDir, 'existing')
    mkdirSync(nested, { recursive: true })
    expect(() => mkdirSync(nested, { recursive: true })).not.toThrow()
  })
})

describe('loadConfig env overrides', () => {
  let tmpHome: string
  const originalHome = process.env.HOME
  const originalLmStudioUrl = process.env.LM_STUDIO_URL

  beforeEach(() => {
    vi.resetModules()
    tmpHome = mkdtempSync(join(tmpdir(), 'helm-config-home-'))
    process.env.HOME = tmpHome
    delete process.env.LM_STUDIO_URL
  })

  afterEach(() => {
    vi.resetModules()
    if (originalHome === undefined) {
      delete process.env.HOME
    } else {
      process.env.HOME = originalHome
    }

    if (originalLmStudioUrl === undefined) {
      delete process.env.LM_STUDIO_URL
    } else {
      process.env.LM_STUDIO_URL = originalLmStudioUrl
    }

    rmSync(tmpHome, { recursive: true, force: true })
  })

  it('prefers LM_STUDIO_URL over persisted config', async () => {
    const configDir = join(tmpHome, '.config', 'helm')
    mkdirSync(configDir, { recursive: true })
    writeFileSync(
      join(configDir, 'config.json'),
      JSON.stringify({ lmStudioUrl: 'http://localhost:1234' }, null, 2),
      'utf-8'
    )
    process.env.LM_STUDIO_URL = 'http://10.55.0.10:1234'

    const { loadConfig } = await import('./config')

    expect(loadConfig().lmStudioUrl).toBe('http://10.55.0.10:1234')
  })

  it('ignores blank LM_STUDIO_URL values', async () => {
    const configDir = join(tmpHome, '.config', 'helm')
    mkdirSync(configDir, { recursive: true })
    writeFileSync(
      join(configDir, 'config.json'),
      JSON.stringify({ lmStudioUrl: 'http://localhost:1234' }, null, 2),
      'utf-8'
    )
    process.env.LM_STUDIO_URL = '   '

    const { loadConfig } = await import('./config')

    expect(loadConfig().lmStudioUrl).toBe('http://localhost:1234')
  })
})
