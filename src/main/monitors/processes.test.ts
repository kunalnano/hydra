import { describe, it, expect } from 'vitest'
import { parseProcessOutput, groupProcesses } from './processes'

const SAMPLE_PS_OUTPUT = `USER               PID  %CPU %MEM      VSZ    RSS   TT  STAT STARTED      TIME COMMAND
testuser          1234   5.2  1.3  5073456  45632 s001  S+   10:30AM   0:12.34 node /Users/testuser/Documents/ai/myAIProjects/Alfred/node_modules/.bin/vite
testuser          2345  12.1  3.4  6012345  98765 s002  S+   09:15AM   1:23.45 /Users/testuser/.nvm/versions/node/v22.0.0/bin/node /usr/local/bin/claude
testuser          3456   0.1  0.5  4012345  12345 s003  S    08:00AM   0:02.10 /usr/local/bin/postgres -D /usr/local/var/postgres
root               567   0.0  0.1  2012345   4567   ??  Ss   07:00AM   0:00.50 /usr/sbin/syslogd
testuser          4567   8.3  2.1  5512345  76543 s004  S+   10:45AM   0:45.67 node /Users/testuser/Documents/ai/myAIProjects/health-scoring/server.js
testuser          5678   1.2  0.8  3012345  23456 s005  S+   11:00AM   0:05.00 /usr/local/bin/codex --task refactor`

describe('parseProcessOutput', () => {
  it('parses ps aux output into ProcessInfo array', () => {
    const result = parseProcessOutput(SAMPLE_PS_OUTPUT)
    expect(result).toHaveLength(6)
    expect(result[0]).toEqual({
      pid: 1234,
      user: 'testuser',
      cpu: 5.2,
      mem: 1.3,
      command: 'node /Users/testuser/Documents/ai/myAIProjects/Alfred/node_modules/.bin/vite',
      name: 'node',
      cwd: '/Users/testuser/Documents/ai/myAIProjects/Alfred'
    })
  })

  it('skips the header line', () => {
    const result = parseProcessOutput(SAMPLE_PS_OUTPUT)
    expect(result.every((p) => p.pid > 0)).toBe(true)
  })

  it('detects working directory from command args', () => {
    const result = parseProcessOutput(SAMPLE_PS_OUTPUT)
    const viteProc = result.find((p) => p.pid === 1234)
    expect(viteProc?.cwd).toBe('/Users/testuser/Documents/ai/myAIProjects/Alfred')
  })
})

describe('groupProcesses', () => {
  it('groups processes by detected project directory', () => {
    const processes = parseProcessOutput(SAMPLE_PS_OUTPUT)
    const groups = groupProcesses(processes)
    const alfredGroup = groups.find((g) => g.name === 'Alfred')
    expect(alfredGroup).toBeDefined()
    expect(alfredGroup!.type).toBe('project')
    expect(alfredGroup!.processes.length).toBeGreaterThanOrEqual(1)
  })

  it('identifies agent processes', () => {
    const processes = parseProcessOutput(SAMPLE_PS_OUTPUT)
    const groups = groupProcesses(processes)
    const agentGroup = groups.find((g) => g.type === 'agent')
    expect(agentGroup).toBeDefined()
    expect(agentGroup!.processes.some((p) => p.command.includes('claude'))).toBe(true)
  })

  it('identifies service processes', () => {
    const processes = parseProcessOutput(SAMPLE_PS_OUTPUT)
    const groups = groupProcesses(processes)
    const serviceGroup = groups.find((g) => g.type === 'service')
    expect(serviceGroup).toBeDefined()
    expect(serviceGroup!.processes.some((p) => p.name === 'postgres')).toBe(true)
  })

  it('calculates totalCpu and totalMem per group', () => {
    const processes = parseProcessOutput(SAMPLE_PS_OUTPUT)
    const groups = groupProcesses(processes)
    groups.forEach((g) => {
      const expectedCpu = g.processes.reduce((sum, p) => sum + p.cpu, 0)
      expect(g.totalCpu).toBeCloseTo(expectedCpu, 1)
    })
  })
})
