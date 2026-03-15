import { beforeEach, describe, expect, it, vi } from 'vitest'

const loadConfig = vi.fn()
const saveConfig = vi.fn()
const networkInterfaces = vi.fn()

vi.mock('../config', () => ({
  loadConfig,
  saveConfig
}))

vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os')
  return {
    ...actual,
    networkInterfaces
  }
})

describe('healLmStudioConnection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    loadConfig.mockReturnValue({
      gitRepoPaths: [],
      monitorInterval: 2000,
      snapshotInterval: 30000,
      lmStudioUrl: 'http://192.168.7.200:1234'
    })
    networkInterfaces.mockReturnValue({})
  })

  it('repairs a stale configured URL by falling back to localhost', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url === 'http://192.168.7.200:1234/v1/models') {
        throw new Error('fetch failed')
      }

      return {
        ok: true,
        json: async () => ({ data: [{ id: 'mistral-local' }] })
      } as Response
    })

    const { healLmStudioConnection } = await import('./lmstudio')
    const result = await healLmStudioConnection({ persist: true, fetchImpl: fetchImpl as typeof fetch })

    expect(result.success).toBe(true)
    expect(result.repaired).toBe(true)
    expect(result.url).toBe('http://localhost:1234')
    expect(result.model).toBe('mistral-local')
    expect(result.previousUrl).toBe('http://192.168.7.200:1234')
    expect(saveConfig).toHaveBeenCalledWith(
      expect.objectContaining({ lmStudioUrl: 'http://localhost:1234' })
    )
  })

  it('does not rewrite config when the configured endpoint is already healthy', async () => {
    const fetchImpl = vi.fn(async () => {
      return {
        ok: true,
        json: async () => ({ data: [{ id: 'healthy-model' }] })
      } as Response
    })

    const { healLmStudioConnection } = await import('./lmstudio')
    const result = await healLmStudioConnection({ persist: true, fetchImpl: fetchImpl as typeof fetch })

    expect(result.success).toBe(true)
    expect(result.repaired).toBe(false)
    expect(result.url).toBe('http://192.168.7.200:1234')
    expect(saveConfig).not.toHaveBeenCalled()
  })

  it('reports the checked endpoints when nothing is reachable', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('connect ECONNREFUSED 127.0.0.1:1234')
    })

    const { healLmStudioConnection, isLmStudioConnectivityError } = await import('./lmstudio')
    const result = await healLmStudioConnection({ persist: true, fetchImpl: fetchImpl as typeof fetch })

    expect(result.success).toBe(false)
    expect(result.message).toContain('Checked')
    expect(result.attempts.length).toBeGreaterThan(0)
    expect(isLmStudioConnectivityError('fetch failed')).toBe(true)
    expect(isLmStudioConnectivityError('connect ECONNREFUSED 127.0.0.1:1234')).toBe(true)
  })
})
