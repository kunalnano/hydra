import { readFileSync } from 'fs'
import { join } from 'path'
import { homedir, tmpdir } from 'os'
import { writeFileSync, unlinkSync } from 'fs'
import { spawn } from 'child_process'
import type { SystemState, BriefingResult, YenneferStyle } from '../../shared/types'
import { healLmStudioConnection, isLmStudioConnectivityError } from './lmstudio'
import { loadConfig } from '../config'
import { getRecentBriefings } from '../db/queries'
import { loadEnvironment, resolvePathSetting } from '../app-paths'

const YENNEFER_STYLE_GUIDANCE: Record<YenneferStyle, string> = {
  adaptive:
    'Stay sharp, but calibrate your severity to actual pressure. Avoid repeating the obvious. If the workstation is coping, offer a fresh optimization or coordination idea instead of scolding.',
  throughput:
    'Assume the operator is intentionally maximizing local throughput. Dense agent activity, hot RAM, and several dirty repos are normal costs of shipping. Only object when throughput is actually being threatened.',
  creative:
    'Be more inventive and surprising with your phrasing, but remain useful. Prefer a novel angle, an unexpected optimization, or a sharper systems insight over the same old warning.',
  strict:
    'Be stern and exacting. Call out real inefficiency quickly, but still avoid repeating yourself unless the situation has materially worsened.'
}

function getYenneferStyle(): YenneferStyle {
  return loadConfig().yenneferStyle || 'adaptive'
}

function getRecentBriefingSummaries(limit = 3): string[] {
  try {
    return getRecentBriefings(limit)
      .map((entry) => entry.summary.trim().replace(/\s+/g, ' '))
      .filter((summary) => summary.length > 0)
      .slice(0, limit)
      .map((summary) => summary.slice(0, 180))
  } catch {
    return []
  }
}

interface SessionIntentProfile {
  posture: 'throughput' | 'balanced' | 'strained'
  summary: string
  signals: string[]
}

function getSessionIntentProfile(state: SystemState): SessionIntentProfile {
  const activeAgents = state.agents.filter((agent) => agent.status === 'active' || agent.status === 'busy')
  const dirtyRepos = state.gitRepos.filter((repo) => repo.dirty).length
  const projectGroups = state.processes.filter((group) => group.type === 'project').length
  const freeMemoryGb = state.memory.free / 1e9
  const cpuModerate = state.cpu.usage < 75
  const memoryManageable = state.memory.usagePercent < 94 || freeMemoryGb >= 2.5
  const throughputLikely =
    activeAgents.length >= 3 || dirtyRepos >= 2 || projectGroups >= 3 || state.processes.length >= 6

  if (throughputLikely && cpuModerate && memoryManageable) {
    return {
      posture: 'throughput',
      summary:
        'This looks like an intentional high-throughput work session, not a cleanup failure. Treat density as leverage unless there is evidence of actual instability.',
      signals: [
        `${activeAgents.length} active or busy agents`,
        `${dirtyRepos} dirty repos in motion`,
        `${projectGroups} active project groups`,
        `${freeMemoryGb.toFixed(1)}GB free memory remaining`
      ]
    }
  }

  if (state.cpu.usage >= 90 || state.memory.usagePercent >= 94 || freeMemoryGb < 1.5) {
    return {
      posture: 'strained',
      summary:
        'The workstation is under real resource strain. Critique the constraint itself, not the mere fact that the operator is working hard.',
      signals: [
        `CPU at ${state.cpu.usage.toFixed(1)}%`,
        `Memory at ${state.memory.usagePercent.toFixed(1)}%`,
        `${freeMemoryGb.toFixed(1)}GB free memory remaining`
      ]
    }
  }

  return {
    posture: 'balanced',
    summary: 'This is a normal active session. Be concise and focus on the highest-leverage next move.',
    signals: [
      `${activeAgents.length} active or busy agents`,
      `${dirtyRepos} dirty repos in motion`,
      `${projectGroups} active project groups`
    ]
  }
}

function getWorkloadContext(state: SystemState, style: YenneferStyle): string[] {
  const notes: string[] = []
  const agentCount = state.agents.length
  const activeAgents = state.agents.filter((agent) => agent.status === 'active' || agent.status === 'busy')
  const freeMemoryGb = state.memory.free / 1e9
  const intent = getSessionIntentProfile(state)

  if (style === 'throughput') {
    notes.push(
      'The operator explicitly prefers throughput over tidiness. Praise effective saturation and only complain when it blocks progress.'
    )
  }

  notes.push(intent.summary)

  if (agentCount >= 3 && state.cpu.usage < 65 && state.memory.usagePercent < 88) {
    notes.push(
      `There are ${agentCount} active agents, but the machine is still coping. Treat that as intentional swarm work unless another signal is genuinely degraded.`
    )
  } else if (agentCount >= 3) {
    notes.push(
      `There are ${agentCount} active agents. Focus on coordination, batching, or model placement if resource pressure is real.`
    )
  }

  if (state.cpu.usage < 50) {
    notes.push('CPU is only moderate. Do not pretend CPU is the primary crisis unless another signal supports it.')
  } else if (state.cpu.usage >= 80) {
    notes.push('CPU pressure is genuinely notable. Prioritize it if it is constraining the session.')
  }

  if (state.memory.usagePercent >= 85 && freeMemoryGb >= 3 && activeAgents.length >= 3) {
    notes.push(
      `Memory is hot at ${state.memory.usagePercent.toFixed(1)}%, but ${freeMemoryGb.toFixed(1)}GB remains free. Treat that as an occupied working set unless there are signs of thrash.`
    )
  } else if (state.memory.usagePercent >= 85) {
    notes.push('Memory pressure is the most plausible constraint. Prefer memory-reduction tactics over generic complaints.')
  } else if (state.memory.usagePercent >= 70) {
    notes.push('Memory is elevated but not yet catastrophic. Suggest one practical memory optimization instead of doom.')
  }

  if (state.gitRepos.some((repo) => repo.dirty)) {
    notes.push('Dirty repos are context, not automatically a problem. Mention them only if they create real operational risk.')
  }

  return notes
}

export function buildYenneferSystemPrompt(state: SystemState, style: YenneferStyle): string {
  const recentSummaries = getRecentBriefingSummaries()
  const recentContext =
    recentSummaries.length > 0
      ? `Recent outputs to avoid rehashing unless conditions materially changed:\n- ${recentSummaries.join('\n- ')}`
      : ''

  const workloadContext = getWorkloadContext(state, style)

  return [
    'You are Yennefer of Vengerberg. Brilliant, sardonic, and incisive.',
    'You are analyzing a developer workstation and should sound like an elite operator, not a dashboard parser.',
    YENNEFER_STYLE_GUIDANCE[style],
    'Respond in two to four plain sentences. No markdown. No bullet points.',
    'Make one primary judgment, one secondary observation at most, and end with one concrete next move.',
    'If the same issue keeps recurring, only bring it up again if it worsened or if you have a genuinely different prescription.',
    'If multi-agent load is intentional and the machine is coping, treat it as normal and recommend a smarter operating pattern instead of acting scandalized.',
    'When a session is clearly busy on purpose, start from what is working and then suggest a better operating pattern. Do not moralize about dense utilization.',
    workloadContext.length > 0 ? `Operational context:\n- ${workloadContext.join('\n- ')}` : '',
    recentContext
  ]
    .filter(Boolean)
    .join('\n\n')
}

export function buildYenneferUserPrompt(state: SystemState): string {
  const activeAgents = state.agents.filter((agent) => agent.status === 'active' || agent.status === 'busy')
  const dirtyRepos = state.gitRepos.filter((repo) => repo.dirty)
  const intent = getSessionIntentProfile(state)
  const projectGroups = state.processes
    .filter((group) => group.type === 'project')
    .sort((a, b) => b.totalCpu + b.totalMem - (a.totalCpu + a.totalMem))
    .slice(0, 6)
  const listeningPorts = state.ports.filter((port) => port.state === 'LISTEN').slice(0, 8)

  const sections = [
    `## Operator Posture\n- Likely posture: ${intent.posture}\n- ${intent.summary}\n- Signals: ${intent.signals.join(', ')}`,
    `## Resource Envelope\n- CPU: ${state.cpu.usage.toFixed(1)}% across ${state.cpu.cores} cores\n- Memory: ${state.memory.usagePercent.toFixed(1)}% used, ${(state.memory.free / 1e9).toFixed(1)}GB free`,
    `## Agent Swarm\n- ${activeAgents.length} active or busy agents out of ${state.agents.length} total`,
    dirtyRepos.length > 0
      ? `## Workspaces In Motion\n${dirtyRepos
          .slice(0, 6)
          .map((repo) => `- ${repo.name}: ${repo.branch} (${repo.status}, ${repo.modified} modified, ${repo.untracked} untracked)`)
          .join('\n')}`
      : '',
    projectGroups.length > 0
      ? `## Hottest Project Groups\n${projectGroups
          .map(
            (group) =>
              `- ${group.name}: CPU ${group.totalCpu.toFixed(1)}%, MEM ${group.totalMem.toFixed(1)}%${group.ports.length > 0 ? `, ports ${group.ports.join(', ')}` : ''}`
          )
          .join('\n')}`
      : '',
    listeningPorts.length > 0
      ? `## Listening Ports\n${listeningPorts
          .map((port) => `- :${port.port} (${port.process}, ${port.protocol})`)
          .join('\n')}`
      : ''
  ]

  return sections.filter(Boolean).join('\n\n')
}

function getYenneferTemperature(style: YenneferStyle): number {
  switch (style) {
    case 'throughput':
      return 0.7
    case 'creative':
      return 1
    case 'strict':
      return 0.55
    default:
      return 0.8
  }
}

interface ElevenLabsConfig {
  apiKey: string
  voiceId: string
}

export function loadElevenLabsConfig(): ElevenLabsConfig | null {
  try {
    loadEnvironment()

    const directApiKey = process.env.ELEVENLABS_API_KEY?.trim()
    const directVoiceId = process.env.ELEVENLABS_VOICE_ID?.trim()
    if (directApiKey && directVoiceId) {
      return { apiKey: directApiKey, voiceId: directVoiceId }
    }

    const configuredEnvPath = process.env.HELM_YENNEFER_ENV_PATH?.trim()
    const envPath = configuredEnvPath
      ? resolvePathSetting(configuredEnvPath)
      : join(homedir(), 'workspace', 'active', 'yennefer', '.env')
    const content = readFileSync(envPath, 'utf-8')
    let apiKey = ''
    let voiceId = ''
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (trimmed.startsWith('#') || !trimmed.includes('=')) continue
      const eqIdx = trimmed.indexOf('=')
      const key = trimmed.slice(0, eqIdx).trim()
      const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
      if (key === 'ELEVENLABS_API_KEY') apiKey = value
      if (key === 'ELEVENLABS_VOICE_ID') voiceId = value
    }
    if (!apiKey || !voiceId) return null
    return { apiKey, voiceId }
  } catch {
    return null
  }
}

async function speakWithElevenLabs(text: string, config: ElevenLabsConfig): Promise<void> {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${config.voiceId}`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': config.apiKey
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_turbo_v2_5',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75
      }
    })
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`ElevenLabs returned ${response.status}: ${body}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  const tempPath = join(tmpdir(), `yennefer-${Date.now()}.mp3`)
  writeFileSync(tempPath, Buffer.from(arrayBuffer))

  return new Promise<void>((resolve) => {
    const child = spawn('afplay', [tempPath], { stdio: 'ignore' })
    child.on('close', () => {
      try {
        unlinkSync(tempPath)
      } catch {
        /* ignore cleanup failure */
      }
      resolve()
    })
    child.on('error', () => {
      try {
        unlinkSync(tempPath)
      } catch {
        /* ignore cleanup failure */
      }
      resolve()
    })
  })
}

export async function invokeYennefer(state: SystemState): Promise<BriefingResult> {
  const prompt = buildYenneferUserPrompt(state)
  const yenneferStyle = getYenneferStyle()
  const connection = await healLmStudioConnection({ persist: true })

  if (!connection.success || !connection.url) {
    return {
      summary: connection.message,
      alerts: [
        {
          severity: 'warning',
          message: connection.message,
          source: 'briefing'
        }
      ],
      suggestions: ['Start LM Studio local server or repair the configured endpoint'],
      timestamp: Date.now()
    }
  }

  let text: string
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 120000)

    const response = await fetch(`${connection.url}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer lm-studio' },
      body: JSON.stringify({
        model: connection.model || 'local-model',
        messages: [
          { role: 'system', content: buildYenneferSystemPrompt(state, yenneferStyle) },
          { role: 'user', content: prompt }
        ],
        max_tokens: 256,
        temperature: getYenneferTemperature(yenneferStyle)
      }),
      signal: controller.signal
    })

    clearTimeout(timeout)

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`LM Studio returned ${response.status}: ${body}`)
    }

    const data = await response.json()
    text = data.choices?.[0]?.message?.content || 'Yennefer has nothing to say to you.'
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const isOffline = isLmStudioConnectivityError(message)
    return {
      summary: isOffline
        ? `LM Studio offline — Yennefer cannot reach ${connection.url}.`
        : `Yennefer invocation failed: ${message}`,
      alerts: [
        {
          severity: 'warning',
          message: isOffline
            ? 'LM Studio is not reachable.'
            : `LM Studio error: ${message}`,
          source: 'briefing'
        }
      ],
      suggestions: isOffline
        ? ['Retry after LM Studio is serving the OpenAI-compatible API']
        : ['Check LM Studio server logs'],
      timestamp: Date.now()
    }
  }

  // Fire-and-forget TTS — failures are silent
  const elevenLabsConfig = loadElevenLabsConfig()
  if (elevenLabsConfig) {
    speakWithElevenLabs(text, elevenLabsConfig).catch((err) => {
      console.warn('[yennefer] ElevenLabs TTS failed:', err instanceof Error ? err.message : err)
    })
  }

  return {
    summary: text.trim(),
    alerts:
      connection.repaired && connection.previousUrl
        ? [
            {
              severity: 'info',
              message: `LM Studio endpoint auto-repaired to ${connection.url}`,
              source: 'briefing'
            }
          ]
        : [],
    suggestions:
      connection.repaired && connection.previousUrl
        ? [`Hydra switched from ${connection.previousUrl} to ${connection.url}.`]
        : [],
    raw: text,
    timestamp: Date.now()
  }
}
