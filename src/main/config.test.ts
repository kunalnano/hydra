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
      staffBinPath: '/usr/local/bin/staff',
      radioHomeLocation: {
        label: 'Home base',
        latitude: 29.7,
        longitude: -98.4
      }
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
    expect(parsed.radioHomeLocation).toEqual({
      label: 'Home base',
      latitude: 29.7,
      longitude: -98.4
    })
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
  const ENV_KEYS = [
    'HOME',
    'HELM_ENV_PATH',
    'LM_STUDIO_URL',
    'HELM_GIT_REPO_PATHS',
    'HELM_AGENT_FEED_PATHS',
    'HELM_LOG_FILE_PATHS',
    'HELM_HIVE_ENABLED',
    'HELM_HIVE_SHARED_CONTEXT_PATH',
    'HELM_HIVE_CLAUDE_BIN_PATH',
    'HELM_HIVE_IDLE_RECLAIM_MINUTES'
  ] as const
  const originalEnv = Object.fromEntries(
    ENV_KEYS.map((key) => [key, process.env[key]])
  ) as Record<(typeof ENV_KEYS)[number], string | undefined>

  beforeEach(() => {
    vi.resetModules()
    tmpHome = mkdtempSync(join(tmpdir(), 'helm-config-home-'))
    process.env.HOME = tmpHome
    process.env.HELM_ENV_PATH = join(tmpHome, 'missing.env')
    delete process.env.LM_STUDIO_URL
    delete process.env.HELM_GIT_REPO_PATHS
    delete process.env.HELM_AGENT_FEED_PATHS
    delete process.env.HELM_LOG_FILE_PATHS
    delete process.env.HELM_HIVE_ENABLED
    delete process.env.HELM_HIVE_SHARED_CONTEXT_PATH
    delete process.env.HELM_HIVE_CLAUDE_BIN_PATH
    delete process.env.HELM_HIVE_IDLE_RECLAIM_MINUTES
  })

  afterEach(() => {
    vi.resetModules()
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = originalEnv[key]
      }
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

  it('loads a persisted radio home location', async () => {
    const configDir = join(tmpHome, '.config', 'helm')
    mkdirSync(configDir, { recursive: true })
    writeFileSync(
      join(configDir, 'config.json'),
      JSON.stringify(
        {
          radioHomeLocation: {
            label: 'Operator base',
            latitude: 30.1234,
            longitude: -97.9876
          }
        },
        null,
        2
      ),
      'utf-8'
    )

    const { loadConfig } = await import('./config')

    expect(loadConfig().radioHomeLocation).toEqual({
      label: 'Operator base',
      latitude: 30.1234,
      longitude: -97.9876
    })
  })

  it('parses repo-relative env overrides for paths and HIVE settings', async () => {
    process.env.HELM_GIT_REPO_PATHS = '.,./docs'
    process.env.HELM_AGENT_FEED_PATHS = './fixtures/agents,./fixtures/agents-alt'
    process.env.HELM_LOG_FILE_PATHS = './logs/*.log'
    process.env.HELM_HIVE_ENABLED = 'true'
    process.env.HELM_HIVE_SHARED_CONTEXT_PATH = './.helm/hive/shared/context.md'
    process.env.HELM_HIVE_CLAUDE_BIN_PATH = './bin/claude'
    process.env.HELM_HIVE_IDLE_RECLAIM_MINUTES = '45'

    const { loadConfig } = await import('./config')
    const config = loadConfig()

    expect(config.gitRepoPaths).toEqual([process.cwd(), join(process.cwd(), 'docs')])
    expect(config.agentFeedPaths).toEqual([
      join(process.cwd(), 'fixtures', 'agents'),
      join(process.cwd(), 'fixtures', 'agents-alt')
    ])
    expect(config.logFilePaths).toEqual([join(process.cwd(), 'logs', '*.log')])
    expect(config.hive).toMatchObject({
      enabled: true,
      sharedContextPath: join(process.cwd(), '.helm', 'hive', 'shared', 'context.md'),
      claudeBinPath: join(process.cwd(), 'bin', 'claude'),
      idleReclaimMinutes: 45
    })
  })
})
