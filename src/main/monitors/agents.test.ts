import { describe, it, expect } from 'vitest'
import { detectAgents } from './agents'
import type { ProcessInfo } from '../../shared/types'

const mockProcesses: ProcessInfo[] = [
  {
    pid: 2345,
    user: 'alsharma',
    cpu: 12.1,
    mem: 3.4,
    command: '/Users/alsharma/.nvm/versions/node/v22.0.0/bin/node /usr/local/bin/claude',
    name: 'node',
    cwd: '/Users/alsharma/Documents/ai/myAIProjects/Alfred'
  },
  {
    pid: 5678,
    user: 'alsharma',
    cpu: 1.2,
    mem: 0.8,
    command: '/usr/local/bin/codex --task refactor',
    name: 'codex',
    cwd: '/Users/alsharma/Documents/ai/myAIProjects/health-scoring'
  },
  {
    pid: 1234,
    user: 'alsharma',
    cpu: 5.2,
    mem: 1.3,
    command: 'node /Users/alsharma/Documents/ai/myAIProjects/Alfred/node_modules/.bin/vite',
    name: 'node',
    cwd: '/Users/alsharma/Documents/ai/myAIProjects/Alfred'
  }
]

describe('detectAgents', () => {
  it('identifies Claude Code processes', () => {
    const agents = detectAgents(mockProcesses)
    const claude = agents.find((a) => a.type === 'claude-code')
    expect(claude).toBeDefined()
    expect(claude!.pid).toBe(2345)
    expect(claude!.name).toBe('Claude Code')
  })

  it('identifies Codex processes', () => {
    const agents = detectAgents(mockProcesses)
    const codex = agents.find((a) => a.type === 'codex')
    expect(codex).toBeDefined()
    expect(codex!.pid).toBe(5678)
  })

  it('does not flag non-agent processes', () => {
    const agents = detectAgents(mockProcesses)
    expect(agents.length).toBe(2)
  })

  it('detects working directory for agents', () => {
    const agents = detectAgents(mockProcesses)
    const claude = agents.find((a) => a.type === 'claude-code')
    expect(claude!.workingDir).toBe('/Users/alsharma/Documents/ai/myAIProjects/Alfred')
  })
})
