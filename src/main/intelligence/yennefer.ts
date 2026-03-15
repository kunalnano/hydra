import { readFileSync } from 'fs'
import { join } from 'path'
import { homedir, tmpdir } from 'os'
import { writeFileSync, unlinkSync } from 'fs'
import { spawn } from 'child_process'
import type { SystemState, BriefingResult } from '../../shared/types'
import { buildBriefingPrompt } from './briefing'
import { healLmStudioConnection, isLmStudioConnectivityError } from './lmstudio'

const YENNEFER_SYSTEM_PROMPT =
  'You are Yennefer of Vengerberg. Brilliant, sardonic, and intolerant of ' +
  'mediocrity. You are analyzing a developer\'s workstation. Be concise, ' +
  'withering when warranted, and deliver your assessment like you\'re doing ' +
  'them a favor by bothering at all. Two to three sentences maximum. No ' +
  'markdown. No bullet points. Speak in plain sentences.'

interface ElevenLabsConfig {
  apiKey: string
  voiceId: string
}

export function loadElevenLabsConfig(): ElevenLabsConfig | null {
  try {
    const envPath = join(homedir(), 'workspace', 'active', 'yennefer', '.env')
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
  const prompt = buildBriefingPrompt(state)
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
          { role: 'system', content: YENNEFER_SYSTEM_PROMPT },
          { role: 'user', content: prompt }
        ],
        max_tokens: 256,
        temperature: 0.7
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
