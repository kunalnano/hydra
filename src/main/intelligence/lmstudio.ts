import { networkInterfaces } from 'os'
import { exec } from 'child_process'
import { promisify } from 'util'
import type { LmStudioHealResult, LmStudioProbeAttempt } from '../../shared/types'
import { loadConfig, saveConfig } from '../config'

const DEFAULT_LM_STUDIO_URL = 'http://localhost:1234'
const MODEL_DISCOVERY_TIMEOUT_MS = 1500
const ARP_TIMEOUT_MS = 1500
const execAsync = promisify(exec)

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

function getLocalIPv4s(): string[] {
  const addresses: string[] = []
  const interfaces = networkInterfaces()
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family !== 'IPv4') continue
      addresses.push(entry.address)
    }
  }
  return [...new Set(addresses)]
}

function isPrivateIPv4(ip: string): boolean {
  return (
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)
  )
}

export function parseArpNeighborIps(output: string): string[] {
  const neighbors = output
    .split('\n')
    .map((line) => line.match(/\((\d+\.\d+\.\d+\.\d+)\)/)?.[1] || null)
    .filter((ip): ip is string => ip !== null)
    .filter((ip) => isPrivateIPv4(ip))

  return [...new Set(neighbors)]
}

async function getArpNeighborUrls(): Promise<string[]> {
  try {
    const { stdout } = await execAsync('arp -an', { timeout: ARP_TIMEOUT_MS })
    const localIps = new Set(getLocalIPv4s())
    return parseArpNeighborIps(stdout)
      .filter((ip) => !localIps.has(ip))
      .map((ip) => `http://${ip}:1234`)
  } catch {
    return []
  }
}

async function buildCandidateUrls(): Promise<string[]> {
  const config = loadConfig()
  const configured = normalizeLmStudioUrl(config.lmStudioUrl || '')
  const envUrl = normalizeLmStudioUrl(process.env.LM_STUDIO_URL || '')

  const candidates = [
    configured,
    envUrl,
    DEFAULT_LM_STUDIO_URL,
    'http://127.0.0.1:1234'
  ].filter((value): value is string => Boolean(value))

  for (const ip of getLocalIPv4s()) {
    if (ip === '127.0.0.1') continue
    candidates.push(`http://${ip}:1234`)
  }

  const arpCandidates = await getArpNeighborUrls()
  return [...new Set([...candidates, ...arpCandidates])]
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

  const candidates = await buildCandidateUrls()
  for (const candidate of candidates) {
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
  const remoteHint =
    previousLabel && /^https?:\/\/(?!localhost|127\.0\.0\.1)/.test(previousLabel)
      ? ' If LM Studio runs on another machine, enable "Serve on Local Network" there and allow inbound TCP 1234 through that machine\'s firewall.'
      : ''

  return {
    success: false,
    repaired: false,
    message: attemptedUrls
      ? `LM Studio is unreachable. Checked ${attemptedUrls}.${remoteHint}`
      : `LM Studio is unreachable.${remoteHint}`,
    previousUrl: previousLabel,
    attempts
  }
}
