import Anthropic from '@anthropic-ai/sdk'
import type { SystemState, BriefingResult } from '../../shared/types'

let client: Anthropic | null = null

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic()
  }
  return client
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

  return sections.join('\n\n')
}

export function parseBriefingResponse(raw: string): BriefingResult {
  try {
    const parsed = JSON.parse(raw)
    return {
      summary: parsed.summary || raw,
      alerts: Array.isArray(parsed.alerts) ? parsed.alerts : [],
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      timestamp: Date.now()
    }
  } catch {
    return {
      summary: raw.trim(),
      alerts: [],
      suggestions: [],
      timestamp: Date.now()
    }
  }
}

const SYSTEM_PROMPT = `You are HYDRA, an AI operations officer providing concise system briefings.

Analyze the system state and respond with JSON:
{
  "summary": "2-3 sentence overview of system health and activity",
  "alerts": [{"severity": "info|warning|critical", "message": "...", "source": "processes|ports|agents|git|memory|cpu"}],
  "suggestions": ["actionable suggestion 1", "..."]
}

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

  try {
    const anthropic = getClient()
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }]
    })

    const text =
      message.content[0].type === 'text' ? message.content[0].text : 'No response generated.'
    return parseBriefingResponse(text)
  } catch (err) {
    return {
      summary: `Briefing failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      alerts: [{ severity: 'warning', message: 'Could not reach Claude API', source: 'briefing' }],
      suggestions: ['Check ANTHROPIC_API_KEY environment variable'],
      timestamp: Date.now()
    }
  }
}
