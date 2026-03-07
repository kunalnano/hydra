import { describe, it, expect, beforeEach } from 'vitest'
import {
  parseNettopOutput,
  parseNetstatOutput,
  hasUsableNettopData,
  selectNetworkSource,
  resetNetworkState,
  _computeNetworkState
} from './network'

const SAMPLE_NETTOP_OUTPUT = `,bytes_in,bytes_out,
Chrome.1234,1048576,524288,
Electron Helper.5678,262144,131072,`

const SAMPLE_MULTI_INTERFACE = `,bytes_in,bytes_out,
Chrome.1234,1048576,524288,
Chrome.1234,100000,50000,
Electron Helper.5678,262144,131072,`

describe('parseNettopOutput', () => {
  it('parses nettop CSV output into raw entries', () => {
    const result = parseNettopOutput(SAMPLE_NETTOP_OUTPUT)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({
      name: 'Chrome',
      pid: 1234,
      bytesIn: 1048576,
      bytesOut: 524288
    })
    expect(result[1]).toEqual({
      name: 'Electron Helper',
      pid: 5678,
      bytesIn: 262144,
      bytesOut: 131072
    })
  })

  it('returns empty array for empty output', () => {
    expect(parseNettopOutput('')).toEqual([])
  })

  it('returns empty array for header-only output', () => {
    const headerOnly = ',bytes_in,bytes_out,'
    expect(parseNettopOutput(headerOnly)).toEqual([])
  })

  it('handles process names with spaces', () => {
    const output = `,bytes_in,bytes_out,
Electron Helper.5678,262144,131072,`
    const result = parseNettopOutput(output)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Electron Helper')
    expect(result[0].pid).toBe(5678)
  })

  it('skips lines without a valid PID', () => {
    const output = `,bytes_in,bytes_out,
SomeProcess,1000,2000,
Chrome.1234,1048576,524288,`
    const result = parseNettopOutput(output)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Chrome')
  })
})

describe('hasUsableNettopData', () => {
  it('returns false when nettop only reports zero counters', () => {
    const output = `,bytes_in,bytes_out,
Slack.1111,0,0,
Chrome.2222,0,0,`
    const entries = parseNettopOutput(output)
    expect(hasUsableNettopData(entries)).toBe(false)
  })

  it('returns true when at least one entry has traffic counters', () => {
    const entries = parseNettopOutput(SAMPLE_NETTOP_OUTPUT)
    expect(hasUsableNettopData(entries)).toBe(true)
  })
})

describe('selectNetworkSource', () => {
  it('falls back to netstat when nettop only reports zero counters', () => {
    const zeroNettop = parseNettopOutput(`,bytes_in,bytes_out,
Slack.1111,0,0,
Chrome.2222,0,0,`)
    const netstatEntries = [
      { name: 'en0', pid: -1, bytesIn: 1428632542, bytesOut: 186614454 }
    ]

    const selected = selectNetworkSource(zeroNettop, netstatEntries)

    expect(selected.mode).toBe('netstat')
    expect(selected.entries).toEqual(netstatEntries)
  })

  it('prefers aggregated nettop data when counters are usable', () => {
    const nettopEntries = parseNettopOutput(SAMPLE_MULTI_INTERFACE)
    const netstatEntries = [
      { name: 'en0', pid: -1, bytesIn: 1428632542, bytesOut: 186614454 }
    ]

    const selected = selectNetworkSource(nettopEntries, netstatEntries)

    expect(selected.mode).toBe('nettop')
    expect(selected.entries).toEqual([
      { name: 'Chrome', pid: 1234, bytesIn: 1148576, bytesOut: 574288 },
      { name: 'Electron Helper', pid: 5678, bytesIn: 262144, bytesOut: 131072 }
    ])
  })
})

describe('rate computation', () => {
  beforeEach(() => {
    resetNetworkState()
  })

  it('returns zero rates on first call (no previous snapshot)', () => {
    const state = _computeNetworkState(SAMPLE_NETTOP_OUTPUT, 1000000)
    expect(state.processes).toHaveLength(2)
    expect(state.processes[0].bytesInPerSec).toBe(0)
    expect(state.processes[0].bytesOutPerSec).toBe(0)
    expect(state.totalBytesInPerSec).toBe(0)
    expect(state.totalBytesOutPerSec).toBe(0)
  })

  it('computes per-second rates from two consecutive snapshots', () => {
    // First call: baseline
    const t1 = 1000000
    _computeNetworkState(SAMPLE_NETTOP_OUTPUT, t1)

    // Second call: 2 seconds later with increased bytes
    const output2 = `,bytes_in,bytes_out,
Chrome.1234,1058576,534288,
Electron Helper.5678,272144,141072,`
    const t2 = t1 + 2000 // 2 seconds later

    const state2 = _computeNetworkState(output2, t2)

    // Chrome: deltaIn = 1058576 - 1048576 = 10000, deltaOut = 534288 - 524288 = 10000
    // Rate = 10000 / 2 = 5000 bytes/sec
    const chrome = state2.processes.find((p) => p.pid === 1234)!
    expect(chrome.bytesInPerSec).toBe(5000)
    expect(chrome.bytesOutPerSec).toBe(5000)

    // Electron: deltaIn = 272144 - 262144 = 10000, deltaOut = 141072 - 131072 = 10000
    // Rate = 10000 / 2 = 5000 bytes/sec
    const electron = state2.processes.find((p) => p.pid === 5678)!
    expect(electron.bytesInPerSec).toBe(5000)
    expect(electron.bytesOutPerSec).toBe(5000)

    // Totals
    expect(state2.totalBytesInPerSec).toBe(10000)
    expect(state2.totalBytesOutPerSec).toBe(10000)
  })

  it('handles new processes appearing in second snapshot', () => {
    const output1 = `,bytes_in,bytes_out,
Chrome.1234,1048576,524288,`
    _computeNetworkState(output1, 1000000)

    // Second snapshot has a new process
    const output2 = `,bytes_in,bytes_out,
Chrome.1234,1058576,534288,
Firefox.9999,500000,250000,`
    const state2 = _computeNetworkState(output2, 1002000)

    // Firefox is new — no previous data, so rate should be 0
    const firefox = state2.processes.find((p) => p.pid === 9999)!
    expect(firefox.bytesInPerSec).toBe(0)
    expect(firefox.bytesOutPerSec).toBe(0)

    // Chrome should still have computed rates
    const chrome = state2.processes.find((p) => p.pid === 1234)!
    expect(chrome.bytesInPerSec).toBe(5000)
  })
})

describe('parseNetstatOutput', () => {
  const SAMPLE_NETSTAT = `Name       Mtu   Network       Address            Ipkts Ierrs     Ibytes    Opkts Oerrs     Obytes  Coll
lo0        16384 <Link#1>                       1281901     0  349772063  1281901     0  349772063     0
en0        1500  <Link#14>   0a:cd:f8:ab:e7:42  1377177     0 1428632542   497465     0  186614454     0
en0        1500  10.0.0/24  10.0.0.1    1377177     - 1428632542   497465     -  186614454     -
awdl0      1500  <Link#16>   ea:3e:5f:ef:c9:a9     6989     0    6467975     4276     0    1252756     0
gif0*      1280  <Link#2>                             0     0          0        0     0          0     0`

  it('parses active interfaces from netstat -ibn', () => {
    const result = parseNetstatOutput(SAMPLE_NETSTAT)
    expect(result.length).toBe(2) // en0 and awdl0 (lo0 skipped, gif0* skipped, duplicate en0 skipped)
    expect(result[0]).toEqual({ name: 'en0', bytesIn: 1428632542, bytesOut: 186614454 })
    expect(result[1]).toEqual({ name: 'awdl0', bytesIn: 6467975, bytesOut: 1252756 })
  })

  it('skips loopback and inactive interfaces', () => {
    const result = parseNetstatOutput(SAMPLE_NETSTAT)
    expect(result.every((r) => !r.name.startsWith('lo'))).toBe(true)
    expect(result.every((r) => !r.name.endsWith('*'))).toBe(true)
  })

  it('returns empty for empty output', () => {
    expect(parseNetstatOutput('')).toEqual([])
  })

  it('returns empty for header-only', () => {
    const header = 'Name       Mtu   Network       Address            Ipkts Ierrs     Ibytes    Opkts Oerrs     Obytes  Coll'
    expect(parseNetstatOutput(header)).toEqual([])
  })
})

describe('aggregation by PID', () => {
  beforeEach(() => {
    resetNetworkState()
  })

  it('aggregates multiple interface entries for the same PID', () => {
    const state = _computeNetworkState(SAMPLE_MULTI_INTERFACE, 1000000)

    // Chrome.1234 appears twice: 1048576+100000 = 1148576 bytesIn, 524288+50000 = 574288 bytesOut
    const chrome = state.processes.find((p) => p.pid === 1234)!
    expect(chrome.bytesIn).toBe(1148576)
    expect(chrome.bytesOut).toBe(574288)

    // Should only have 2 unique processes (Chrome and Electron Helper)
    expect(state.processes).toHaveLength(2)
  })

  it('computes rates correctly after aggregation across two snapshots', () => {
    // First snapshot with multi-interface
    _computeNetworkState(SAMPLE_MULTI_INTERFACE, 1000000)

    // Second snapshot — Chrome increased on both interfaces
    const output2 = `,bytes_in,bytes_out,
Chrome.1234,1058576,534288,
Chrome.1234,110000,60000,
Electron Helper.5678,272144,141072,`
    const state2 = _computeNetworkState(output2, 1001000) // 1 second later

    // Chrome aggregated: t1 = 1148576 in, 574288 out; t2 = 1168576 in, 594288 out
    // Delta: 20000 in, 20000 out over 1 second
    const chrome = state2.processes.find((p) => p.pid === 1234)!
    expect(chrome.bytesInPerSec).toBe(20000)
    expect(chrome.bytesOutPerSec).toBe(20000)
  })
})
