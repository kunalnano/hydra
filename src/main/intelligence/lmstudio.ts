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

function isIPv4Address(value: string): boolean {
  return /^\d+\.\d+\.\d+\.\d+$/.test(value)
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

function buildSubnetCandidateUrls(baseUrl: string | null): string[] {
  if (!baseUrl) return []

  try {
    const parsed = new URL(baseUrl)
    if (!isIPv4Address(parsed.hostname) || !isPrivateIPv4(parsed.hostname)) {
      return []
    }

    const octets = parsed.hostname.split('.').map((segment) => Number.parseInt(segment, 10))
    const currentHost = octets[3]
    const base = octets.slice(0, 3).join('.')
    const orderedHosts: number[] = []

    for (let distance = 1; distance < 255; distance++) {
      const higher = currentHost + distance
      const lower = currentHost - distance

      if (higher >= 1 && higher <= 254) orderedHosts.push(higher)
      if (lower >= 1 && lower <= 254) orderedHosts.push(lower)
    }

    return orderedHosts.map((host) => `${parsed.protocol}//${base}.${host}${parsed.port ? `:${parsed.port}` : ''}`)
  } catch {
    return []
  }
}

async function buildCandidateUrls(): Promise<{ priority: string[]; subnet: string[] }> {
  const config = loadConfig()
  const configured = normalizeLmStudioUrl(config.lmStudioUrl || '')
  const envUrl = normalizeLmStudioUrl(process.env.LM_STUDIO_URL || '')

  const priority = [
    configured,
    envUrl,
    DEFAULT_LM_STUDIO_URL,
    'http://127.0.0.1:1234'
  ].filter((value): value is string => Boolean(value))

  for (const ip of getLocalIPv4s()) {
    if (ip === '127.0.0.1') continue
    priority.push(`http://${ip}:1234`)
  }

  const arpCandidates = await getArpNeighborUrls()
  const uniquePriority = [...new Set([...priority, ...arpCandidates])]
  const uniquePrioritySet = new Set(uniquePriority)
  const subnet = [
    ...buildSubnetCandidateUrls(configured),
    ...buildSubnetCandidateUrls(envUrl)
  ].filter((candidate) => !uniquePrioritySet.has(candidate))

  return {
    priority: uniquePriority,
    subnet: [...new Set(subnet)]
  }
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
  fetchImpl: typeof fetch = fetch,
  timeoutMs = MODEL_DISCOVERY_TIMEOUT_MS
): Promise<LmStudioProbeAttempt> {
  const normalized = normalizeLmStudioUrl(baseUrl)
  if (!normalized) {
    return { url: baseUrl, ok: false, error: 'Invalid LM Studio URL' }
  }

  try {
    const response = await fetchWithTimeout(
      fetchImpl,
      `${normalized}/v1/models`,
      timeoutMs
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

async function probeCandidateBatch(
  candidates: string[],
  fetchImpl: typeof fetch,
  timeoutMs: number,
  batchSize = 16
): Promise<{ attempts: LmStudioProbeAttempt[]; success?: LmStudioProbeAttempt }> {
  const attempts: LmStudioProbeAttempt[] = []

  for (let index = 0; index < candidates.length; index += batchSize) {
    const batch = candidates.slice(index, index + batchSize)
    const probes = await Promise.all(
      batch.map((candidate) => probeLmStudioEndpoint(candidate, fetchImpl, timeoutMs))
    )
    attempts.push(...probes)

    const success = probes.find((probe) => probe.ok)
    if (success) {
      return { attempts, success }
    }
  }

  return { attempts }
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

  const { priority, subnet } = await buildCandidateUrls()
  for (const candidate of priority) {
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

  if (subnet.length > 0) {
    const subnetScan = await probeCandidateBatch(subnet, fetchImpl, 750, 24)
    attempts.push(...subnetScan.attempts)

    if (subnetScan.success) {
      const repaired = Boolean(previousLabel && previousUrl !== subnetScan.success.url)
      if (options?.persist && repaired) {
        saveConfig({ ...config, lmStudioUrl: subnetScan.success.url })
      }

      return {
        success: true,
        repaired,
        message: repaired
          ? `LM Studio endpoint repaired: ${previousLabel} -> ${subnetScan.success.url}`
          : `LM Studio reachable at ${subnetScan.success.url}`,
        url: subnetScan.success.url,
        model: subnetScan.success.model,
        previousUrl: repaired ? previousLabel : undefined,
        attempts
      }
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
