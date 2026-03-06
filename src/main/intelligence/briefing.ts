import type { SystemState, BriefingResult } from '../../shared/types'
import { scoreSystem } from '../health'
import { loadConfig } from '../config'

const LM_STUDIO_DEFAULT_URL = process.env.LM_STUDIO_URL || 'http://localhost:1234'

function getLmStudioUrl(): string {
  const config = loadConfig()
  return config.lmStudioUrl || LM_STUDIO_DEFAULT_URL
}

export function buildBriefingPrompt(state: SystemState): string {
  const sections: string[] = []

  sections.push(
    `## System Resources\n- CPU: ${state.cpu.usage.toFixed(1)}% across ${state.cpu.cores} cores\n- Memory: ${state.memory.usagePercent.toFixed(1)}% used (${(state.memory.used / 1e9).toFixed(1)}GB / ${(state.memory.total / 1e9).toFixed(1)}GB)`
  )

  if (state.processes.length > 0) {
    const procLines = state.processes.map((g) => {
      const ports = g.ports.length > 0 ? ` (port ${g.ports.join(', ')})` : ''
      return `- ${g.name} [${g.type}]: CPU ${g.totalCpu.toFixed(1)}%, MEM ${g.totalMem.toFixed(1)}%${ports}`
    })
    sections.push(`## Active Process Groups\n${procLines.join('\n')}`)
  }

  if (state.agents.length > 0) {
    const agentLines = state.agents.map(
      (a) => `- ${a.name} (${a.type}): ${a.status}${a.workingDir ? ` in ${a.workingDir}` : ''}`
    )
    sections.push(`## AI Agents\n${agentLines.join('\n')}`)
  }

  if (state.gitRepos.length > 0) {
    const repoLines = state.gitRepos.map((r) => {
      const parts = [`${r.name}: ${r.branch} (${r.status})`]
      if (r.modified > 0) parts.push(`${r.modified} modified`)
      if (r.untracked > 0) parts.push(`${r.untracked} untracked`)
      if (r.ahead > 0) parts.push(`${r.ahead} ahead`)
      if (r.behind > 0) parts.push(`${r.behind} behind`)
      return `- ${parts.join(', ')}`
    })
    sections.push(`## Git Repositories\n${repoLines.join('\n')}`)
  }

  const listeningPorts = state.ports.filter((p) => p.state === 'LISTEN')
  if (listeningPorts.length > 0) {
    const portLines = listeningPorts.map((p) => `- :${p.port} (${p.process}, ${p.protocol})`)
    sections.push(`## Listening Ports\n${portLines.join('\n')}`)
  }

  // Health scoring
  const healthResult = scoreSystem(state.processes, state.gitRepos, new Set())
  const unhealthy = healthResult.workspaces.filter((w) => w.level !== 'green')
  if (unhealthy.length > 0) {
    const healthLines = unhealthy.map(
      (w) => `- ${w.name}: ${w.level.toUpperCase()} \u2014 ${w.reasons.join(', ')}`
    )
    sections.push(`## Health Alerts\n${healthLines.join('\n')}`)
  }

  return sections.join('\n\n')
}

/**
 * Strip markdown code fences that some models wrap around JSON.
 * Handles ```json ... ```, ``` ... ```, and leading/trailing whitespace.
 */
function stripCodeFences(text: string): string {
  let cleaned = text.trim()
  // Remove ```json or ``` prefix
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '')
  // Remove trailing ```
  cleaned = cleaned.replace(/\n?```\s*$/, '')
  return cleaned.trim()
}

export function parseBriefingResponse(raw: string): BriefingResult {
  const cleaned = stripCodeFences(raw)
  try {
    const parsed = JSON.parse(cleaned)
    return {
      summary: parsed.summary || cleaned,
      alerts: Array.isArray(parsed.alerts) ? parsed.alerts : [],
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      raw,
      timestamp: Date.now()
    }
  } catch {
    return {
      summary: raw.trim(),
      alerts: [],
      suggestions: [],
      raw,
      timestamp: Date.now()
    }
  }
}

const SYSTEM_PROMPT = `You are HYDRA, an AI operations officer providing concise system briefings.

Respond with ONLY a valid JSON object. No markdown, no code fences, no explanation. Just raw JSON.

Required JSON shape:
{"summary":"2-3 sentence overview","alerts":[{"severity":"info|warning|critical","message":"...","source":"processes|ports|agents|git|memory|cpu"}],"suggestions":["actionable suggestion 1"]}

Rules:
- Be concise. This is a dashboard briefing, not a report.
- Only raise alerts for things that actually need attention.
- Suggestions should be actionable (e.g. "commit changes on project X", "agent idle — consider assigning work").
- CPU > 80% = warning. CPU > 95% = critical.
- Memory > 85% = warning. Memory > 95% = critical.
- Dirty git repos with uncommitted changes for context = info suggestion.
- Agent in "waiting" status for extended time = warning.`

export async function generateBriefing(state: SystemState): Promise<BriefingResult> {
  const prompt = buildBriefingPrompt(state)
  const baseUrl = getLmStudioUrl()

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 120000)

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer lm-studio' },
      body: JSON.stringify({
        model: 'local-model',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt }
        ],
        max_tokens: 512,
        temperature: 0.3
      }),
      signal: controller.signal
    })

    clearTimeout(timeout)

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`LM Studio returned ${response.status}: ${body}`)
    }

    const data = await response.json()
    const text = data.choices?.[0]?.message?.content || 'No response generated.'
    return parseBriefingResponse(text)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const isOffline = message.includes('ECONNREFUSED') || message.includes('abort')

    return {
      summary: isOffline
        ? 'LM Studio offline \u2014 start server at port 1234'
        : `Briefing failed: ${message}`,
      alerts: [
        {
          severity: 'warning',
          message: isOffline
            ? 'LM Studio is not running. Start it and load a model.'
            : `LM Studio error: ${message}`,
          source: 'briefing'
        }
      ],
      suggestions: isOffline
        ? ['Start LM Studio and load a model, then retry']
        : ['Check LM Studio server logs'],
      timestamp: Date.now()
    }
  }
}
