import { describe, it, expect } from 'vitest'
import { parseLsofOutput } from './ports'

const SAMPLE_LSOF_OUTPUT = `COMMAND   PID     USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node     1234 alsharma   22u  IPv4 0x1234567890      0t0  TCP *:3000 (LISTEN)
node     1234 alsharma   23u  IPv4 0x1234567891      0t0  TCP 127.0.0.1:3001 (LISTEN)
postgres 3456 alsharma    5u  IPv4 0x1234567892      0t0  TCP *:5432 (LISTEN)
node     4567 alsharma   18u  IPv4 0x1234567893      0t0  TCP *:8080 (LISTEN)
node     1234 alsharma   24u  IPv4 0x1234567894      0t0  TCP 127.0.0.1:3000->127.0.0.1:54321 (ESTABLISHED)
redis-se 6789 alsharma    6u  IPv4 0x1234567895      0t0  TCP 127.0.0.1:6379 (LISTEN)`

describe('parseLsofOutput', () => {
  it('parses lsof output into PortInfo array', () => {
    const result = parseLsofOutput(SAMPLE_LSOF_OUTPUT)
    expect(result.length).toBeGreaterThan(0)
  })

  it('extracts port numbers correctly', () => {
    const result = parseLsofOutput(SAMPLE_LSOF_OUTPUT)
    const ports = result.map((p) => p.port)
    expect(ports).toContain(3000)
    expect(ports).toContain(5432)
    expect(ports).toContain(8080)
    expect(ports).toContain(6379)
  })

  it('maps ports to process names', () => {
    const result = parseLsofOutput(SAMPLE_LSOF_OUTPUT)
    const pg = result.find((p) => p.port === 5432)
    expect(pg?.process).toBe('postgres')
    expect(pg?.pid).toBe(3456)
  })

  it('detects LISTEN vs ESTABLISHED state', () => {
    const result = parseLsofOutput(SAMPLE_LSOF_OUTPUT)
    const listen = result.filter((p) => p.state === 'LISTEN')
    const established = result.filter((p) => p.state === 'ESTABLISHED')
    expect(listen.length).toBeGreaterThan(0)
    expect(established.length).toBeGreaterThan(0)
  })

  it('extracts bind address', () => {
    const result = parseLsofOutput(SAMPLE_LSOF_OUTPUT)
    const localOnly = result.find((p) => p.port === 3001)
    expect(localOnly?.address).toBe('127.0.0.1')
    const wildcard = result.find((p) => p.port === 3000 && p.state === 'LISTEN')
    expect(wildcard?.address).toBe('*')
  })

  it('handles empty output gracefully', () => {
    const result = parseLsofOutput('')
    expect(result).toEqual([])
  })

  it('handles header-only output', () => {
    const result = parseLsofOutput(
      'COMMAND   PID     USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME'
    )
    expect(result).toEqual([])
  })

  it('extracts correct protocol', () => {
    const result = parseLsofOutput(SAMPLE_LSOF_OUTPUT)
    result.forEach((p) => {
      expect(['TCP', 'UDP']).toContain(p.protocol)
    })
  })

  it('returns correct count of entries', () => {
    const result = parseLsofOutput(SAMPLE_LSOF_OUTPUT)
    // 6 data lines in sample output
    expect(result.length).toBe(6)
  })
})
