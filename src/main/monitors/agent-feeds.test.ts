import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  getDefaultAgentFeedPaths,
  loadExternalAgents,
  loadExternalAgentTimelineEvents,
  parseAgentState,
  parseTraceLine
} from './agent-feeds'

describe('agent feed monitor', () => {
  let tempDir: string | null = null

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true })
      tempDir = null
    }
  })

  it('parses state files into file-backed AgentInfo records', () => {
    const now = Date.parse('2026-03-07T00:06:00Z')
    const agent = parseAgentState(
      JSON.stringify({
        agent_id: 'botbotfromuk-v1',
        current_tick: 17,
        session_id: 'sess_abc123',
        session_start: '2026-03-07T00:00:00Z',
        last_heartbeat: '2026-03-07T00:05:30Z',
        total_ticks: 17,
        total_actions: 143,
        memory_count: 84,
        current_action: 'Posting JSONL schema to kunalnano/hydra issue 11',
        status: 'active',
        goals: [{ name: 'Social Presence', progress: 0.35, priority: 1 }]
      }),
      '/tmp/botbotfromuk-v1.state.json',
      now
    )

    expect(agent).toMatchObject({
      id: 'agent:botbotfromuk-v1',
      name: 'botbotfromuk-v1',
      source: 'state-file',
      status: 'active',
      currentTick: 17,
      totalActions: 143,
      memoryCount: 84,
      sessionId: 'sess_abc123',
      currentAction: 'Posting JSONL schema to kunalnano/hydra issue 11'
    })
    expect(agent?.goals).toEqual([{ name: 'Social Presence', progress: 0.35, priority: 1 }])
    expect(agent?.uptime).toBe(6 * 60 * 1000)
  })

  it('marks stale heartbeats as waiting or unknown', () => {
    const waiting = parseAgentState(
      JSON.stringify({
        agent_id: 'ticker',
        last_heartbeat: '2026-03-07T00:00:00Z'
      }),
      '/tmp/ticker.state.json',
      Date.parse('2026-03-07T00:03:00Z')
    )
    const unknown = parseAgentState(
      JSON.stringify({
        agent_id: 'ticker',
        last_heartbeat: '2026-03-07T00:00:00Z'
      }),
      '/tmp/ticker.state.json',
      Date.parse('2026-03-07T00:12:00Z')
    )

    expect(waiting?.status).toBe('waiting')
    expect(unknown?.status).toBe('unknown')
  })

  it('maps external trace actions into timeline events', () => {
    const event = parseTraceLine(
      JSON.stringify({
        ts: '2026-03-07T16:00:00Z',
        agent_id: 'botbotfromuk-v1',
        session_id: 'sess_mmkr_20260307',
        tick: 17,
        event_type: 'external_action',
        tool: 'github_api',
        target: 'kunalnano/hydra#11',
        outcome: 'success',
        metadata: { action: 'post_comment' }
      }),
      '/tmp/botbotfromuk-v1.trace.jsonl',
      8
    )

    expect(event).toMatchObject({
      type: 'agent_action',
      source: 'botbotfromuk-v1'
    })
    expect(event?.message).toContain('botbotfromuk-v1 [t17] post comment')
    expect(event?.message).toContain('kunalnano/hydra#11')
    expect(event?.ingestKey).toHaveLength(40)
  })

  it('loads state and trace files from configured feed directories', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'hydra-agent-feed-'))
    mkdirSync(tempDir, { recursive: true })

    writeFileSync(
      join(tempDir, 'bot.state.json'),
      JSON.stringify({
        agent_id: 'botbotfromuk-v1',
        current_tick: 21,
        session_id: 'sess_mmkr_20260307',
        last_heartbeat: '2026-03-07T20:00:00Z',
        current_action: 'Pushing mmkr release'
      }),
      'utf-8'
    )
    writeFileSync(
      join(tempDir, 'bot.trace.jsonl'),
      [
        JSON.stringify({
          ts: '2026-03-07T16:00:00Z',
          agent_id: 'botbotfromuk-v1',
          session_id: 'sess_mmkr_20260307',
          tick: 17,
          event_type: 'external_action',
          tool: 'github_api',
          target: 'kunalnano/hydra#11',
          outcome: 'success',
          metadata: { action: 'post_comment' }
        }),
        JSON.stringify({
          ts: '2026-03-07T20:00:00Z',
          agent_id: 'botbotfromuk-v1',
          session_id: 'sess_mmkr_20260307',
          tick: 21,
          event_type: 'tick_end',
          outcome: 'success',
          summary: 'Published mmkr v0.1.0'
        })
      ].join('\n'),
      'utf-8'
    )

    const config = {
      gitRepoPaths: [],
      monitorInterval: 2000,
      snapshotInterval: 30000,
      vaultRagEndpoint: 'http://127.0.0.1:8742',
      vaultPath: '/Users/test/Documents/ai/obsidian-vault',
      vaultRagLocation: 'local' as const,
      vaultRagRemoteHost: 'stormbreaker',
      vaultRagAutoCheck: true,
      agentFeedPaths: [tempDir]
    }
    const agents = loadExternalAgents(config, Date.parse('2026-03-07T20:01:00Z'))
    const events = loadExternalAgentTimelineEvents(config)

    expect(agents).toHaveLength(1)
    expect(agents[0].currentTick).toBe(21)
    expect(events).toHaveLength(2)
    expect(events[0].timestamp).toBeLessThan(events[1].timestamp)
    expect(events[1].type).toBe('agent_update')
  })

  it('checks the Helm agent feed path before legacy Hydra locations', () => {
    const paths = getDefaultAgentFeedPaths('/Users/tester')

    expect(paths).toEqual([
      '/Users/tester/.config/helm/agents',
      '/Users/tester/.config/hydra/agents',
      '/Users/tester/.hydra/agents'
    ])
  })
})
