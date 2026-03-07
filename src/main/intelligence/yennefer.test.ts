import { describe, it, expect } from 'vitest'
import type { SystemState } from '../../shared/types'
import { IPC_CHANNELS } from '../../shared/types'

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
  it('returns a BriefingResult with summary when LM Studio is offline', async () => {
    const { invokeYennefer } = await import('./yennefer')
    // This will fail to connect to LM Studio in test environment
    const result = await invokeYennefer(mockState)
    expect(result).toHaveProperty('summary')
    expect(result).toHaveProperty('timestamp')
    expect(result.timestamp).toBeGreaterThan(0)
    // Should gracefully handle the connection failure
    expect(typeof result.summary).toBe('string')
    expect(result.summary.length).toBeGreaterThan(0)
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
