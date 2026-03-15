import { networkInterfaces } from 'os'
import type { LmStudioHealResult, LmStudioProbeAttempt } from '../../shared/types'
import { loadConfig, saveConfig } from '../config'

const DEFAULT_LM_STUDIO_URL = 'http://localhost:1234'
const MODEL_DISCOVERY_TIMEOUT_MS = 1500

function normalizeLmStudioUrl(rawUrl: string): string | null {
  const trimmed = rawUrl.trim()
  if (!trimmed) return null

  try {
    const parsed = new URL(trimmed)
    parsed.hash = ''
    parsed.search = ''

    let pathname = parsed.pathname.replace(/\/+$/, '')
    if (pathname.endsWith('/v1')) {
      pathname = pathname.slice(0, -3)
    }
    parsed.pathname = pathname || ''

    return parsed.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

export function isLmStudioConnectivityError(message: string): boolean {
  const normalized = message.toLowerCase()
  return [
    'fetch failed',
    'econnrefused',
    'enotfound',
    'ehostunreach',
    'etimedout',
    'networkerror',
    'abort'
  ].some((token) => normalized.includes(token))
}

function buildCandidateUrls(): string[] {
  const config = loadConfig()
  const configured = normalizeLmStudioUrl(config.lmStudioUrl || '')
  const envUrl = normalizeLmStudioUrl(process.env.LM_STUDIO_URL || '')

  const candidates = [
    configured,
    envUrl,
    DEFAULT_LM_STUDIO_URL,
    'http://127.0.0.1:1234'
  ].filter((value): value is string => Boolean(value))

  const interfaces = networkInterfaces()
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family !== 'IPv4' || entry.internal) continue
      candidates.push(`http://${entry.address}:1234`)
    }
  }

  return [...new Set(candidates)]
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetchImpl(url, {
      headers: { Authorization: 'Bearer lm-studio' },
      signal: controller.signal
    })
  } finally {
    clearTimeout(timeout)
  }
}

export async function probeLmStudioEndpoint(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch
): Promise<LmStudioProbeAttempt> {
  const normalized = normalizeLmStudioUrl(baseUrl)
  if (!normalized) {
    return { url: baseUrl, ok: false, error: 'Invalid LM Studio URL' }
  }

  try {
    const response = await fetchWithTimeout(
      fetchImpl,
      `${normalized}/v1/models`,
      MODEL_DISCOVERY_TIMEOUT_MS
    )

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      return {
        url: normalized,
        ok: false,
        error: `LM Studio returned ${response.status}${body ? `: ${body}` : ''}`
      }
    }

    const payload = await response.json().catch(() => ({}))
    const model =
      Array.isArray(payload?.data) && typeof payload.data[0]?.id === 'string'
        ? payload.data[0].id
        : 'local-model'

    return { url: normalized, ok: true, model }
  } catch (err) {
    return {
      url: normalized,
      ok: false,
      error: err instanceof Error ? err.message : 'Unknown error'
    }
  }
}

export async function healLmStudioConnection(options?: {
  persist?: boolean
  fetchImpl?: typeof fetch
}): Promise<LmStudioHealResult> {
  const fetchImpl = options?.fetchImpl || fetch
  const config = loadConfig()
  const configuredValue = (config.lmStudioUrl || process.env.LM_STUDIO_URL || '').trim()
  const previousUrl = normalizeLmStudioUrl(configuredValue)
  const previousLabel = previousUrl || configuredValue || undefined
  const attempts: LmStudioProbeAttempt[] = []

  for (const candidate of buildCandidateUrls()) {
    const probe = await probeLmStudioEndpoint(candidate, fetchImpl)
    attempts.push(probe)

    if (!probe.ok) continue

    const repaired = Boolean(previousLabel && previousUrl !== probe.url)
    if (options?.persist && repaired) {
      saveConfig({ ...config, lmStudioUrl: probe.url })
    }

    return {
      success: true,
      repaired,
      message: repaired
        ? `LM Studio endpoint repaired: ${previousLabel} -> ${probe.url}`
        : `LM Studio reachable at ${probe.url}`,
      url: probe.url,
      model: probe.model,
      previousUrl: repaired ? previousLabel : undefined,
      attempts
    }
  }

  const attemptedUrls = attempts.map((attempt) => attempt.url).join(', ')
  return {
    success: false,
    repaired: false,
    message: attemptedUrls
      ? `LM Studio is unreachable. Checked ${attemptedUrls}.`
      : 'LM Studio is unreachable.',
    previousUrl: previousLabel,
    attempts
  }
}
