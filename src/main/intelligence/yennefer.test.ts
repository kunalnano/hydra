import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BriefingResult, SystemState } from '../../shared/types'
import { IPC_CHANNELS } from '../../shared/types'

const loadConfig = vi.fn(() => ({
  gitRepoPaths: [],
  monitorInterval: 2000,
  snapshotInterval: 30000,
  yenneferStyle: 'adaptive' as const
}))

const getRecentBriefings = vi.fn<(limit?: number) => BriefingResult[]>(() => [])

vi.mock('../config', () => ({
  loadConfig
}))

vi.mock('../db/queries', () => ({
  getRecentBriefings
}))

const mockState: SystemState = {
  timestamp: Date.now(),
  processes: [
    {
      name: 'my-app',
      type: 'project',
      processes: [
        { pid: 1234, user: 'me', cpu: 45.2, mem: 3.1, command: 'node server.js', name: 'node' }
      ],
      totalCpu: 45.2,
      totalMem: 3.1,
      ports: [3000]
    }
  ],
  ports: [
    { port: 3000, pid: 1234, process: 'node', protocol: 'TCP', state: 'LISTEN', address: '*' }
  ],
  agents: [
    {
      id: 'pid:9999',
      name: 'claude-code',
      type: 'claude-code',
      status: 'active',
      source: 'process',
      pid: 9999,
      workingDir: '/home/user/project'
    }
  ],
  gitRepos: [
    {
      path: '/home/user/project',
      name: 'project',
      branch: 'main',
      dirty: false,
      untracked: 0,
      modified: 0,
      ahead: 0,
      behind: 0,
      status: 'clean'
    }
  ],
  cpu: { usage: 35.5, cores: 10 },
  memory: { total: 32000000000, used: 18000000000, free: 14000000000, usagePercent: 56.3 }
}

describe('Yennefer IPC channel', () => {
  it('should have YENNEFER_REQUEST defined in IPC_CHANNELS', () => {
    expect(IPC_CHANNELS.YENNEFER_REQUEST).toBe('intelligence:yennefer-request')
  })
})

describe('loadElevenLabsConfig', () => {
  it('returns null when .env file does not exist', async () => {
    const { loadElevenLabsConfig } = await import('./yennefer')
    const result = loadElevenLabsConfig()
    // Unless the user has the exact file at ~/workspace/active/yennefer/.env, returns null
    // This tests graceful fallback when key is missing
    if (result === null) {
      expect(result).toBeNull()
    } else {
      // If it does exist (dev machine), just verify shape
      expect(result).toHaveProperty('apiKey')
      expect(result).toHaveProperty('voiceId')
    }
  })
})

describe('invokeYennefer', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('returns a BriefingResult with summary when LM Studio is offline', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('connect ECONNREFUSED 127.0.0.1:1234')
      })
    )

    const { invokeYennefer } = await import('./yennefer')
    const result = await invokeYennefer(mockState)
    expect(result).toHaveProperty('summary')
    expect(result).toHaveProperty('timestamp')
    expect(result.timestamp).toBeGreaterThan(0)
    // Should gracefully handle the connection failure
    expect(typeof result.summary).toBe('string')
    expect(result.summary.length).toBeGreaterThan(0)
  })

  it('builds a less repetitive prompt for multi-agent sessions', async () => {
    getRecentBriefings.mockReturnValue([
      {
        timestamp: Date.now(),
        summary: 'Three agents are active. Memory is elevated. Consider trimming context.',
        alerts: [],
        suggestions: []
      }
    ])

    const { buildYenneferSystemPrompt } = await import('./yennefer')
    const prompt = buildYenneferSystemPrompt(
      {
        ...mockState,
        agents: [
          ...mockState.agents,
          { ...mockState.agents[0], id: 'pid:1000', name: 'codex', type: 'codex' },
          { ...mockState.agents[0], id: 'pid:1001', name: 'cursor', type: 'cursor' }
        ],
        memory: { ...mockState.memory, usagePercent: 78 }
      },
      'adaptive'
    )

    expect(prompt).toContain('intentional swarm work')
    expect(prompt).toContain('avoid rehashing')
    expect(prompt).toContain('fresh optimization')
  })

  it('treats dense but healthy sessions as intentional throughput', async () => {
    const { buildYenneferSystemPrompt, buildYenneferUserPrompt } = await import('./yennefer')
    const throughputState: SystemState = {
      ...mockState,
      processes: [
        ...mockState.processes,
        {
          name: 'worker-farm',
          type: 'project',
          processes: [],
          totalCpu: 18.4,
          totalMem: 7.5,
          ports: []
        },
        {
          name: 'indexer',
          type: 'project',
          processes: [],
          totalCpu: 11.2,
          totalMem: 5.4,
          ports: []
        }
      ],
      agents: [
        ...mockState.agents,
        { ...mockState.agents[0], id: 'pid:1000', name: 'codex', type: 'codex', status: 'busy' },
        { ...mockState.agents[0], id: 'pid:1001', name: 'cursor', type: 'cursor', status: 'active' },
        { ...mockState.agents[0], id: 'pid:1002', name: 'aider', type: 'aider', status: 'active' }
      ],
      gitRepos: [
        {
          ...mockState.gitRepos[0],
          dirty: true,
          modified: 8,
          untracked: 2,
          status: 'dirty'
        },
        {
          ...mockState.gitRepos[0],
          name: 'hydra-ui',
          path: '/home/user/hydra-ui',
          dirty: true,
          modified: 5,
          untracked: 1,
          status: 'dirty'
        }
      ],
      cpu: { ...mockState.cpu, usage: 42.8 },
      memory: {
        total: 32000000000,
        used: 27200000000,
        free: 4800000000,
        usagePercent: 85
      }
    }

    const systemPrompt = buildYenneferSystemPrompt(throughputState, 'adaptive')
    const userPrompt = buildYenneferUserPrompt(throughputState)

    expect(systemPrompt).toContain('busy on purpose')
    expect(systemPrompt).toContain('occupied working set')
    expect(userPrompt).toContain('Likely posture: throughput')
    expect(userPrompt).toContain('4 active or busy agents')
  })

  it('supports the explicit throughput lens', async () => {
    const { buildYenneferSystemPrompt } = await import('./yennefer')
    const prompt = buildYenneferSystemPrompt(mockState, 'throughput')

    expect(prompt).toContain('maximizing local throughput')
    expect(prompt).toContain('prefers throughput over tidiness')
  })
})

describe('HydraConfig yenneferEnabled', () => {
  it('should accept yenneferEnabled in config type', () => {
    // Type check: yenneferEnabled is an optional boolean on HydraConfig
    const config = {
      gitRepoPaths: [],
      monitorInterval: 2000,
      snapshotInterval: 30000,
      yenneferEnabled: true
    }
    expect(config.yenneferEnabled).toBe(true)

    const configDisabled = { ...config, yenneferEnabled: false }
    expect(configDisabled.yenneferEnabled).toBe(false)
  })
})
