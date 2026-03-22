import { afterEach, describe, expect, it } from 'vitest'
import {
  checkForUpdates,
  compareVersions,
  getUpdateStatus,
  normalizeVersion
} from './updater'

const originalUpdateChecks = process.env.HELM_UPDATE_CHECK_ENABLED

afterEach(() => {
  if (originalUpdateChecks === undefined) {
    delete process.env.HELM_UPDATE_CHECK_ENABLED
  } else {
    process.env.HELM_UPDATE_CHECK_ENABLED = originalUpdateChecks
  }
})

describe('normalizeVersion', () => {
  it('strips a leading v prefix', () => {
    expect(normalizeVersion('v4.0.2')).toBe('4.0.2')
  })

  it('drops prerelease suffixes for comparisons', () => {
    expect(normalizeVersion('4.0.2-beta.1')).toBe('4.0.2')
  })

  it('returns null for invalid values', () => {
    expect(normalizeVersion('main')).toBeNull()
  })
})

describe('compareVersions', () => {
  it('orders versions numerically', () => {
    expect(compareVersions('4.0.10', '4.0.2')).toBe(1)
    expect(compareVersions('4.1.0', '4.2.0')).toBe(-1)
    expect(compareVersions('4.0.2', '4.0.2')).toBe(0)
  })
})

describe('checkForUpdates', () => {
  it('returns available when GitHub has a newer release', async () => {
    const status = await checkForUpdates({
      currentVersion: '4.0.1',
      fetchImpl: (async () =>
        ({
          ok: true,
          json: async () => ({
            tag_name: 'v4.0.2',
            name: 'HELM v4.0.2',
            html_url: 'https://github.com/kunalnano/hydra/releases/tag/v4.0.2',
            published_at: '2026-03-22T15:00:00Z'
          })
        }) as Response) as typeof fetch
    })

    expect(status.kind).toBe('available')
    expect(status.latestVersion).toBe('4.0.2')
    expect(status.releaseUrl).toContain('/releases/tag/v4.0.2')
  })

  it('returns up-to-date when current version matches latest release', async () => {
    const status = await checkForUpdates({
      currentVersion: '4.0.2',
      fetchImpl: (async () =>
        ({
          ok: true,
          json: async () => ({
            tag_name: 'v4.0.2',
            html_url: 'https://github.com/kunalnano/hydra/releases/tag/v4.0.2'
          })
        }) as Response) as typeof fetch
    })

    expect(status.kind).toBe('up-to-date')
    expect(status.latestVersion).toBe('4.0.2')
  })

  it('surfaces fetch errors without throwing', async () => {
    const status = await checkForUpdates({
      currentVersion: '4.0.1',
      fetchImpl: (async () => {
        throw new Error('network offline')
      }) as typeof fetch
    })

    expect(status.kind).toBe('error')
    expect(status.message).toContain('network offline')
  })

  it('can be disabled through env', async () => {
    process.env.HELM_UPDATE_CHECK_ENABLED = 'false'

    const status = await checkForUpdates({
      currentVersion: '4.0.1',
      fetchImpl: (async () => {
        throw new Error('should not be called')
      }) as typeof fetch
    })

    expect(status.kind).toBe('idle')
    expect(getUpdateStatus().kind).toBe('idle')
  })
})
