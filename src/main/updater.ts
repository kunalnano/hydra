import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { UpdateStatus } from '../shared/types'
import { getAppRoot, loadEnvironment } from './app-paths'

const DEFAULT_RELEASE_API_URL = 'https://api.github.com/repos/kunalnano/hydra/releases/latest'
const DEFAULT_CHANGELOG_URL = 'https://github.com/kunalnano/hydra/blob/main/CHANGELOG.md'
const UPDATE_TIMEOUT_MS = 5000

interface GitHubReleasePayload {
  tag_name?: unknown
  name?: unknown
  html_url?: unknown
  published_at?: unknown
}

let currentStatus: UpdateStatus = {
  kind: 'idle',
  currentVersion: resolveCurrentVersion()
}

function parseBooleanEnv(name: string): boolean | undefined {
  const rawValue = process.env[name]?.trim().toLowerCase()
  if (!rawValue) return undefined

  if (['1', 'true', 'yes', 'on'].includes(rawValue)) return true
  if (['0', 'false', 'no', 'off'].includes(rawValue)) return false
  return undefined
}

export function normalizeVersion(rawValue: string): string | null {
  const trimmed = rawValue.trim().replace(/^v/i, '')
  if (!trimmed) return null

  const match = trimmed.match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/)
  if (!match) return null
  return `${Number.parseInt(match[1], 10)}.${Number.parseInt(match[2], 10)}.${Number.parseInt(match[3], 10)}`
}

export function compareVersions(left: string, right: string): number {
  const normalizedLeft = normalizeVersion(left)
  const normalizedRight = normalizeVersion(right)
  if (!normalizedLeft || !normalizedRight) {
    return 0
  }

  const leftParts = normalizedLeft.split('.').map((value) => Number.parseInt(value, 10))
  const rightParts = normalizedRight.split('.').map((value) => Number.parseInt(value, 10))

  for (let index = 0; index < 3; index++) {
    if (leftParts[index] > rightParts[index]) return 1
    if (leftParts[index] < rightParts[index]) return -1
  }

  return 0
}

export function resolveCurrentVersion(): string {
  try {
    const packagePath = join(getAppRoot(), 'package.json')
    if (!existsSync(packagePath)) return '0.0.0'

    const parsed = JSON.parse(readFileSync(packagePath, 'utf-8')) as { version?: unknown }
    const version = typeof parsed.version === 'string' ? normalizeVersion(parsed.version) : null
    return version || '0.0.0'
  } catch {
    return '0.0.0'
  }
}

function getReleaseApiUrl(): string {
  loadEnvironment()
  return process.env.HELM_UPDATE_API_URL?.trim() || DEFAULT_RELEASE_API_URL
}

function getChangelogUrl(): string {
  loadEnvironment()
  return process.env.HELM_CHANGELOG_URL?.trim() || DEFAULT_CHANGELOG_URL
}

function setStatus(nextStatus: UpdateStatus): UpdateStatus {
  currentStatus = nextStatus
  return currentStatus
}

async function fetchWithTimeout(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetchImpl(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'helm-update-checker'
      },
      signal: controller.signal
    })
  } finally {
    clearTimeout(timeout)
  }
}

export function getUpdateStatus(): UpdateStatus {
  return { ...currentStatus, currentVersion: resolveCurrentVersion() }
}

export async function checkForUpdates(options?: {
  currentVersion?: string
  fetchImpl?: typeof fetch
  releaseApiUrl?: string
  changelogUrl?: string
}): Promise<UpdateStatus> {
  loadEnvironment()

  const checksEnabled = parseBooleanEnv('HELM_UPDATE_CHECK_ENABLED')
  const currentVersion = normalizeVersion(options?.currentVersion || resolveCurrentVersion()) || '0.0.0'
  const changelogUrl = options?.changelogUrl || getChangelogUrl()

  if (checksEnabled === false) {
    return setStatus({
      kind: 'idle',
      currentVersion,
      changelogUrl,
      message: 'Update checks disabled'
    })
  }

  const fetchImpl = options?.fetchImpl || fetch
  const releaseApiUrl = options?.releaseApiUrl || getReleaseApiUrl()

  setStatus({
    kind: 'checking',
    currentVersion,
    changelogUrl,
    checkedAt: Date.now()
  })

  try {
    const response = await fetchWithTimeout(releaseApiUrl, fetchImpl, UPDATE_TIMEOUT_MS)
    if (!response.ok) {
      return setStatus({
        kind: 'error',
        currentVersion,
        changelogUrl,
        checkedAt: Date.now(),
        message: `Update check failed with HTTP ${response.status}`
      })
    }

    const payload = (await response.json()) as GitHubReleasePayload
    const latestVersion = typeof payload.tag_name === 'string' ? normalizeVersion(payload.tag_name) : null

    if (!latestVersion) {
      return setStatus({
        kind: 'error',
        currentVersion,
        changelogUrl,
        checkedAt: Date.now(),
        message: 'Latest release tag is missing or invalid'
      })
    }

    const releaseName = typeof payload.name === 'string' ? payload.name : undefined
    const releaseUrl = typeof payload.html_url === 'string' ? payload.html_url : undefined
    const publishedAt = typeof payload.published_at === 'string' ? payload.published_at : undefined

    if (compareVersions(latestVersion, currentVersion) > 0) {
      return setStatus({
        kind: 'available',
        currentVersion,
        latestVersion,
        releaseName,
        releaseUrl,
        changelogUrl,
        publishedAt,
        checkedAt: Date.now(),
        message: `Update available: v${latestVersion}`
      })
    }

    return setStatus({
      kind: 'up-to-date',
      currentVersion,
      latestVersion,
      releaseName,
      releaseUrl,
      changelogUrl,
      publishedAt,
      checkedAt: Date.now(),
      message: 'Running the latest released version'
    })
  } catch (error) {
    return setStatus({
      kind: 'error',
      currentVersion,
      changelogUrl,
      checkedAt: Date.now(),
      message: error instanceof Error ? error.message : 'Unknown update check error'
    })
  }
}
