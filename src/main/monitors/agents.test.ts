import { describe, it, expect } from 'vitest'
import { detectAgents } from './agents'
import type { ProcessInfo } from '../../shared/types'

const mockProcesses: ProcessInfo[] = [
  {
    pid: 2345,
    user: 'testuser',
    cpu: 12.1,
    mem: 3.4,
    command: '/Users/testuser/.nvm/versions/node/v22.0.0/bin/node /usr/local/bin/claude',
    name: 'node',
    cwd: '/Users/testuser/Documents/ai/myAIProjects/Alfred'
  },
  {
    pid: 5678,
    user: 'testuser',
    cpu: 1.2,
    mem: 0.8,
    command: '/usr/local/bin/codex --task refactor',
    name: 'codex',
    cwd: '/Users/testuser/Documents/ai/myAIProjects/health-scoring'
  },
  {
    pid: 1234,
    user: 'testuser',
    cpu: 5.2,
    mem: 1.3,
    command: 'node /Users/testuser/Documents/ai/myAIProjects/Alfred/node_modules/.bin/vite',
    name: 'node',
    cwd: '/Users/testuser/Documents/ai/myAIProjects/Alfred'
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

  it('identifies Codex desktop app-server processes', () => {
    const procs: ProcessInfo[] = [
      {
        pid: 88081,
        user: 'test',
        cpu: 12.9,
        mem: 0.4,
        command: '/Applications/Codex.app/Contents/Resources/codex app-server --analytics-default-enabled',
        name: 'codex'
      }
    ]
    const agents = detectAgents(procs)
    expect(agents).toHaveLength(1)
    expect(agents[0].type).toBe('codex')
    expect(agents[0].name).toBe('Codex')
  })

  it('does not flag non-agent processes', () => {
    const agents = detectAgents(mockProcesses)
    expect(agents.length).toBe(2)
  })

  it('detects working directory for agents', () => {
    const agents = detectAgents(mockProcesses)
    const claude = agents.find((a) => a.type === 'claude-code')
    expect(claude!.workingDir).toBe('/Users/testuser/Documents/ai/myAIProjects/Alfred')
  })

  it('identifies Cursor processes', () => {
    const procs: ProcessInfo[] = [
      {
        pid: 9001,
        user: 'test',
        cpu: 8,
        mem: 2,
        command: '/Applications/Cursor.app/Contents/MacOS/cursor',
        name: 'cursor'
      }
    ]
    const agents = detectAgents(procs)
    expect(agents).toHaveLength(1)
    expect(agents[0].type).toBe('cursor')
    expect(agents[0].name).toBe('Cursor')
  })

  it('identifies Aider processes', () => {
    const procs: ProcessInfo[] = [
      {
        pid: 9002,
        user: 'test',
        cpu: 3,
        mem: 1,
        command: '/usr/local/bin/aider --model gpt-4',
        name: 'aider'
      }
    ]
    const agents = detectAgents(procs)
    expect(agents).toHaveLength(1)
    expect(agents[0].type).toBe('aider')
    expect(agents[0].name).toBe('Aider')
  })

  it('identifies Continue processes', () => {
    const procs: ProcessInfo[] = [
      {
        pid: 9003,
        user: 'test',
        cpu: 2,
        mem: 0.5,
        command: '/extensions/.continue/server',
        name: 'continue'
      }
    ]
    const agents = detectAgents(procs)
    expect(agents).toHaveLength(1)
    expect(agents[0].type).toBe('continue')
    expect(agents[0].name).toBe('Continue')
  })

  it('identifies Gemini Chrome app', () => {
    const procs: ProcessInfo[] = [
      {
        pid: 9005,
        user: 'test',
        cpu: 4,
        mem: 1,
        command:
          '/Users/test/Applications/Chrome Apps.localized/Gemini.app/Contents/MacOS/app_mode_loader',
        name: 'app_mode_loader'
      }
    ]
    const agents = detectAgents(procs)
    expect(agents).toHaveLength(1)
    expect(agents[0].type).toBe('gemini')
    expect(agents[0].name).toBe('Gemini')
  })

  it('does not detect Claude Desktop as Claude Code', () => {
    const procs: ProcessInfo[] = [
      {
        pid: 674,
        user: 'test',
        cpu: 6,
        mem: 0.6,
        command: '/Applications/Claude.app/Contents/MacOS/Claude',
        name: 'Claude'
      }
    ]
    const agents = detectAgents(procs)
    expect(agents).toHaveLength(0)
  })

  it('does not detect codex helper tooling as the main Codex agent', () => {
    const procs: ProcessInfo[] = [
      {
        pid: 68259,
        user: 'test',
        cpu: 0,
        mem: 0,
        command: 'node /opt/homebrew/bin/codex-cli-mcp-tool',
        name: 'node'
      }
    ]
    const agents = detectAgents(procs)
    expect(agents).toHaveLength(0)
  })

  it('numbers multiple instances of same agent type', () => {
    const procs: ProcessInfo[] = [
      { pid: 100, user: 'test', cpu: 10, mem: 1, command: '/usr/local/bin/claude', name: 'claude' },
      { pid: 101, user: 'test', cpu: 5, mem: 1, command: 'claude', name: 'claude' }
    ]
    const agents = detectAgents(procs)
    expect(agents).toHaveLength(2)
    expect(agents[0].name).toBe('Claude Code')
    expect(agents[1].name).toBe('Claude Code #2')
  })

  it('identifies Copilot processes', () => {
    const procs: ProcessInfo[] = [
      {
        pid: 9004,
        user: 'test',
        cpu: 6,
        mem: 1.5,
        command: '/usr/lib/github-copilot/copilot-agent',
        name: 'copilot-agent'
      }
    ]
    const agents = detectAgents(procs)
    expect(agents).toHaveLength(1)
    expect(agents[0].type).toBe('copilot')
    expect(agents[0].name).toBe('Copilot')
  })

  it('returns active status for CPU > 5%', () => {
    const procs: ProcessInfo[] = [
      { pid: 100, user: 'test', cpu: 10, mem: 1, command: '/usr/local/bin/claude', name: 'claude' }
    ]
    const agents = detectAgents(procs)
    expect(agents[0].status).toBe('active')
  })

  it('returns busy status for CPU > 1% and <= 5%', () => {
    const procs: ProcessInfo[] = [
      { pid: 101, user: 'test', cpu: 3, mem: 1, command: '/usr/local/bin/claude', name: 'claude' }
    ]
    const agents = detectAgents(procs)
    expect(agents[0].status).toBe('busy')
  })

  it('returns idle status for CPU <= 1%', () => {
    const procs: ProcessInfo[] = [
      { pid: 102, user: 'test', cpu: 0.5, mem: 1, command: '/usr/local/bin/claude', name: 'claude' }
    ]
    const agents = detectAgents(procs)
    expect(agents[0].status).toBe('idle')
  })

  it('returns idle status for CPU exactly 1%', () => {
    const procs: ProcessInfo[] = [
      { pid: 103, user: 'test', cpu: 1, mem: 1, command: '/usr/local/bin/claude', name: 'claude' }
    ]
    const agents = detectAgents(procs)
    expect(agents[0].status).toBe('idle')
  })

  it('returns active status for CPU exactly 5.1%', () => {
    const procs: ProcessInfo[] = [
      { pid: 104, user: 'test', cpu: 5.1, mem: 1, command: '/usr/local/bin/claude', name: 'claude' }
    ]
    const agents = detectAgents(procs)
    expect(agents[0].status).toBe('active')
  })
})
