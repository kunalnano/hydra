import { beforeEach, describe, expect, it } from 'vitest'
import {
  _computeNetworkState,
  _computeNetworkStateFromEntries,
  hasUsableNettopData,
  parseNetstatOutput,
  parseNettopOutput,
  parseNettopSnapshot,
  resetNetworkState,
  selectNetworkSource
} from './network'

const SAMPLE_NETTOP_OUTPUT = `,bytes_in,bytes_out,
Chrome.1234,1048576,524288,
Electron Helper.5678,262144,131072,`

const SAMPLE_MULTI_INTERFACE = `,bytes_in,bytes_out,
Chrome.1234,1048576,524288,
Chrome.1234,100000,50000,
Electron Helper.5678,262144,131072,`

const SAMPLE_CONNECTION_SNAPSHOT = `,state,bytes_in,bytes_out,
Claude Helper.1744,,14404,24112,
tcp4 192.168.7.199:55329<->18.97.36.78:443,Established,14404,24112,
Stream Deck.2839,,774812,98570,
tcp4 127.0.0.1:28196<->127.0.0.1:49936,Established,25121,14834,
tcp4 127.0.0.1:28196<->127.0.0.1:49956,Established,669829,3062,
Remote Box.9999,,38400,11200,
tcp6 fe80::34:22a0:91cd:80e2%en8.50160<->fe80::188e:de3f:efcc:f519%en8.49158,Established,38400,11200,`

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
    expect(parseNettopOutput(',bytes_in,bytes_out,')).toEqual([])
  })
})

describe('parseNettopSnapshot', () => {
  it('extracts process and connection rows with network scope classification', () => {
    const snapshot = parseNettopSnapshot(SAMPLE_CONNECTION_SNAPSHOT)

    expect(snapshot.processes).toHaveLength(3)
    expect(snapshot.connections).toHaveLength(4)

    expect(snapshot.connections[0]).toMatchObject({
      processName: 'Claude Helper',
      pid: 1744,
      remoteAddress: '18.97.36.78',
      remotePort: 443,
      scope: 'internet',
      state: 'Established'
    })

    expect(snapshot.connections[1]).toMatchObject({
      processName: 'Stream Deck',
      remoteAddress: '127.0.0.1',
      scope: 'loopback'
    })

    expect(snapshot.connections[3]).toMatchObject({
      processName: 'Remote Box',
      scope: 'lan'
    })
  })
})

describe('hasUsableNettopData', () => {
  it('returns false when nettop only reports zero counters', () => {
    const entries = parseNettopOutput(`,bytes_in,bytes_out,
Slack.1111,0,0,
Chrome.2222,0,0,`)
    expect(hasUsableNettopData(entries)).toBe(false)
  })

  it('returns true when at least one entry has traffic counters', () => {
    expect(hasUsableNettopData(parseNettopOutput(SAMPLE_NETTOP_OUTPUT))).toBe(true)
  })
})

describe('selectNetworkSource', () => {
  it('falls back to netstat when nettop only reports zero counters', () => {
    const zeroSnapshot = parseNettopSnapshot(`,state,bytes_in,bytes_out,
Slack.1111,,0,0,
Chrome.2222,,0,0,`)
    const netstatEntries = [
      { name: 'en0', pid: -1, bytesIn: 1428632542, bytesOut: 186614454 }
    ]

    const selected = selectNetworkSource(zeroSnapshot, netstatEntries)

    expect(selected.mode).toBe('netstat')
    expect(selected.processes).toEqual(netstatEntries)
    expect(selected.connections).toEqual([])
  })

  it('prefers aggregated nettop data when counters are usable', () => {
    const snapshot = parseNettopSnapshot(SAMPLE_CONNECTION_SNAPSHOT)
    const netstatEntries = [
      { name: 'en0', pid: -1, bytesIn: 1428632542, bytesOut: 186614454 }
    ]

    const selected = selectNetworkSource(snapshot, netstatEntries)

    expect(selected.mode).toBe('nettop')
    expect(selected.processes).toEqual([
      { name: 'Claude Helper', pid: 1744, bytesIn: 14404, bytesOut: 24112 },
      { name: 'Stream Deck', pid: 2839, bytesIn: 774812, bytesOut: 98570 },
      { name: 'Remote Box', pid: 9999, bytesIn: 38400, bytesOut: 11200 }
    ])
    expect(selected.connections).toHaveLength(4)
  })
})

describe('rate computation', () => {
  beforeEach(() => {
    resetNetworkState()
  })

  it('returns zero rates on first call', () => {
    const state = _computeNetworkState(SAMPLE_CONNECTION_SNAPSHOT, 1000000)
    expect(state.processes).toHaveLength(3)
    expect(state.connections).toHaveLength(4)
    expect(state.processes.every((entry) => entry.bytesInPerSec === 0)).toBe(true)
    expect(state.connections.every((entry) => entry.bytesOutPerSec === 0)).toBe(true)
  })

  it('computes per-second process and connection deltas across snapshots', () => {
    _computeNetworkState(SAMPLE_CONNECTION_SNAPSHOT, 1000000)

    const output2 = `,state,bytes_in,bytes_out,
Claude Helper.1744,,16404,30112,
tcp4 192.168.7.199:55329<->18.97.36.78:443,Established,16404,30112,
Stream Deck.2839,,794812,118570,
tcp4 127.0.0.1:28196<->127.0.0.1:49936,Established,35121,24834,
tcp4 127.0.0.1:28196<->127.0.0.1:49956,Established,679829,5062,
Remote Box.9999,,48400,21200,
tcp6 fe80::34:22a0:91cd:80e2%en8.50160<->fe80::188e:de3f:efcc:f519%en8.49158,Established,48400,21200,`

    const state2 = _computeNetworkState(output2, 1002000)

    const claude = state2.processes.find((entry) => entry.pid === 1744)!
    expect(claude.bytesInPerSec).toBe(1000)
    expect(claude.bytesOutPerSec).toBe(3000)

    const remotePeer = state2.connections.find(
      (entry) => entry.remoteAddress === '18.97.36.78'
    )!
    expect(remotePeer.bytesInPerSec).toBe(1000)
    expect(remotePeer.bytesOutPerSec).toBe(3000)

    const loopbackPeer = state2.connections.find(
      (entry) => entry.remoteAddress === '127.0.0.1' && entry.remotePort === 49936
    )!
    expect(loopbackPeer.bytesInPerSec).toBe(5000)
    expect(loopbackPeer.bytesOutPerSec).toBe(5000)
  })

  it('aggregates multiple process rows for the same pid before computing totals', () => {
    const state = _computeNetworkState(SAMPLE_MULTI_INTERFACE, 1000000)
    const chrome = state.processes.find((entry) => entry.pid === 1234)!

    expect(chrome.bytesIn).toBe(1148576)
    expect(chrome.bytesOut).toBe(574288)
    expect(state.processes).toHaveLength(2)
  })
})

describe('parseNetstatOutput', () => {
  const SAMPLE_NETSTAT = `Name       Mtu   Network       Address            Ipkts Ierrs     Ibytes    Opkts Oerrs     Obytes  Coll
lo0        16384 <Link#1>                       1281901     0  349772063  1281901     0  349772063     0
en0        1500  <Link#14>   0a:cd:f8:ab:e7:42  1429100     0 1446262099   511318     0  191414496     0
en0        1500  10.0.0/24  10.0.0.1    1429100     - 1446262099   511318     -  191414496     -
awdl0      1500  <Link#16>   ea:3e:5f:ef:c9:a9     6989     0    6467975     4276     0    1252756     0
gif0*      1280  <Link#2>                             0     0          0        0     0          0     0`

  it('parses active interfaces from netstat -ib', () => {
    const result = parseNetstatOutput(SAMPLE_NETSTAT)
    expect(result).toEqual([
      { name: 'en0', bytesIn: 1446262099, bytesOut: 191414496 },
      { name: 'awdl0', bytesIn: 6467975, bytesOut: 1252756 }
    ])
  })

  it('returns empty for header-only output', () => {
    const header = 'Name       Mtu   Network       Address            Ipkts Ierrs     Ibytes    Opkts Oerrs     Obytes  Coll'
    expect(parseNetstatOutput(header)).toEqual([])
  })
})

describe('netstat fallback rate computation', () => {
  it('computes rates from two interface snapshots 2 seconds apart', () => {
    const previousEntries = [{ name: 'en0', pid: -1, bytesIn: 1446262099, bytesOut: 191414496 }]
    const currentEntries = [{ name: 'en0', pid: -1, bytesIn: 1446266099, bytesOut: 191416496 }]

    const state = _computeNetworkStateFromEntries(previousEntries, currentEntries, 2000, 1002000)

    expect(state.processes).toHaveLength(1)
    expect(state.connections).toEqual([])
    expect(state.sourceMode).toBe('netstat')
    expect(state.processes[0].bytesInPerSec).toBe(2000)
    expect(state.processes[0].bytesOutPerSec).toBe(1000)
  })
})
