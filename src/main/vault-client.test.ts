import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { VaultClient } from './vault-client'

const mockExecFile = vi.fn()
const mockAccess = vi.fn()
const mockMkdir = vi.fn()
const mockWriteFile = vi.fn()

vi.mock('child_process', () => ({
  execFile: (...args: unknown[]) => mockExecFile(...args)
}))

vi.mock('fs/promises', () => ({
  access: (...args: unknown[]) => mockAccess(...args),
  mkdir: (...args: unknown[]) => mockMkdir(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args)
}))

const baseConfig = {
  vaultRagEndpoint: 'http://127.0.0.1:8742',
  vaultPath: '/Users/test/Documents/ai/obsidian-vault',
  vaultRagLocation: 'local' as const,
  vaultRagRemoteHost: 'stormbreaker'
}

describe('VaultClient', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    vi.stubGlobal('fetch', fetchMock)

    mockAccess.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))
    mockMkdir.mockResolvedValue(undefined)
    mockWriteFile.mockResolvedValue(undefined)
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'offline'
    })
    mockExecFile.mockImplementation(
      (_file: string, _args: string[], _options: unknown, callback: Function) => {
        callback(null, '', '')
      }
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  describe('health()', () => {
    it('returns online status when server responds 200', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'ok', qdrant_ok: true, total_chunks: 1798 })
      })

      const client = new VaultClient(baseConfig)
      const result = await client.health()

      expect(result.online).toBe(true)
      expect(result.qdrant_ok).toBe(true)
      expect(result.endpoint).toBe('http://127.0.0.1:8742')
      expect(result.total_chunks).toBe(1798)
      expect(result.error).toBeNull()
    })

    it('returns offline status when server is unreachable', async () => {
      fetchMock.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:8742'))

      const client = new VaultClient(baseConfig)
      const result = await client.health()

      expect(result.online).toBe(false)
      expect(result.error).toContain('ECONNREFUSED')
    })

    it('returns offline on timeout', async () => {
      vi.useFakeTimers()
      fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          const signal = init?.signal as AbortSignal | undefined
          signal?.addEventListener('abort', () => {
            const error = new Error('This operation was aborted')
            error.name = 'AbortError'
            reject(error)
          })
        })
      })

      const client = new VaultClient(baseConfig)
      const pending = client.health()
      await vi.advanceTimersByTimeAsync(10_100)
      const result = await pending

      expect(result.online).toBe(false)
      expect(result.error).toContain('timed out')
    })
  })

  describe('search()', () => {
    it('sends correct POST body with query only', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ results: [], query: 'test', result_count: 0 })
      })

      const client = new VaultClient(baseConfig)
      await client.search('test')

      expect(fetchMock).toHaveBeenCalledWith(
        'http://127.0.0.1:8742/api/search',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: 'test' })
        })
      )
    })

    it('sends correct POST body with all filters', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ results: [], query: 'deep work', result_count: 0 })
      })

      const client = new VaultClient(baseConfig)
      await client.search('deep work', {
        client: 'helm',
        doc_type: 'project',
        top_k: 12
      })

      expect(fetchMock).toHaveBeenCalledWith(
        'http://127.0.0.1:8742/api/search',
        expect.objectContaining({
          body: JSON.stringify({
            query: 'deep work',
            client: 'helm',
            doc_type: 'project',
            top_k: 12
          })
        })
      )
    })

    it('returns parsed VaultSearchResponse', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          query: 'strategy',
          result_count: 1,
          results: [
            {
              chunk_id: 'chunk-1',
              snippet: 'Founder strategy note',
              source_path: 'reference/helm-thesis-and-strategy.md',
              heading_path: 'Strategy',
              client: 'helm',
              doc_type: 'project',
              fused_score: 0.92,
              matched_in: 'both',
              dense_score: 0.81,
              sparse_score: 0.73
            }
          ]
        })
      })

      const client = new VaultClient(baseConfig)
      const result = await client.search('strategy')

      expect(result.query).toBe('strategy')
      expect(result.result_count).toBe(1)
      expect(result.results[0]?.chunk_id).toBe('chunk-1')
      expect(result.results[0]?.matched_in).toBe('both')
    })

    it('returns empty results on network error', async () => {
      fetchMock.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:8742'))

      const client = new VaultClient(baseConfig)
      const result = await client.search('test')

      expect(result).toEqual({
        results: [],
        query: 'test',
        result_count: 0
      })
    })
  })

  describe('openChunk()', () => {
    it('fetches chunk by ID and returns VaultChunk', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          chunk_id: 'chunk-42',
          text: 'Hello vault',
          source_path: 'clients/acme.md',
          heading_path: null,
          client: 'acme',
          doc_type: 'meeting',
          tags: ['client/acme'],
          entity_refs: ['Acme Corp'],
          identifiers: ['meeting-42'],
          updated_at: '2026-03-22T12:00:00Z',
          word_count: 120
        })
      })

      const client = new VaultClient(baseConfig)
      const result = await client.openChunk('chunk-42')

      expect(result).toMatchObject({
        chunk_id: 'chunk-42',
        source_path: 'clients/acme.md'
      })
    })

    it('returns error for non-existent chunk', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => 'Not found'
      })

      const client = new VaultClient(baseConfig)
      const result = await client.openChunk('missing')

      expect(result).toEqual({
        error: 'Vault chunk request failed with 404: Not found'
      })
    })
  })

  describe('pushNote()', () => {
    it('writes file with correct YAML frontmatter', async () => {
      const client = new VaultClient(baseConfig)
      const result = await client.pushNote('Operator Note', 'Ship the patch', 'Inbox')

      expect(result.success).toBe(true)
      expect(mockWriteFile).toHaveBeenCalledTimes(1)
      const [filePath, contents] = mockWriteFile.mock.calls[0]
      expect(filePath).toBe('/Users/test/Documents/ai/obsidian-vault/Inbox/Operator Note.md')
      expect(contents).toContain('---\ntitle: "Operator Note"')
      expect(contents).toContain('source: helm')
      expect(contents).toContain('Ship the patch')
    })

    it('sanitizes dangerous characters in title', async () => {
      const client = new VaultClient(baseConfig)
      await client.pushNote('my/bad:file*name', 'Body')

      const [filePath] = mockWriteFile.mock.calls[0]
      expect(filePath).toBe('/Users/test/Documents/ai/obsidian-vault/Inbox/my-bad-file-name.md')
    })

    it('uses Inbox as default folder', async () => {
      const client = new VaultClient(baseConfig)
      await client.pushNote('Default Folder', 'Body')

      const [dirPath] = mockMkdir.mock.calls[0]
      expect(dirPath).toBe('/Users/test/Documents/ai/obsidian-vault/Inbox')
    })

    it('returns conflict error when file exists', async () => {
      mockAccess.mockResolvedValue(undefined)

      const client = new VaultClient(baseConfig)
      const result = await client.pushNote('Existing', 'Body')

      expect(result.success).toBe(false)
      expect(result.error).toContain('already exists')
      expect(mockWriteFile).not.toHaveBeenCalled()
    })

    it('commits to git after writing', async () => {
      const client = new VaultClient(baseConfig)
      await client.pushNote('Commit Me', 'Body')

      expect(mockExecFile).toHaveBeenNthCalledWith(
        1,
        'git',
        ['-C', '/Users/test/Documents/ai/obsidian-vault', 'add', '/Users/test/Documents/ai/obsidian-vault/Inbox/Commit Me.md'],
        expect.objectContaining({ timeout: 30000 }),
        expect.any(Function)
      )
      expect(mockExecFile).toHaveBeenNthCalledWith(
        2,
        'git',
        ['-C', '/Users/test/Documents/ai/obsidian-vault', 'commit', '-m', 'HELM: add Commit Me'],
        expect.objectContaining({ timeout: 30000 }),
        expect.any(Function)
      )
    })
  })

  describe('pullSync()', () => {
    it('returns files_updated count on successful pull', async () => {
      mockExecFile.mockImplementationOnce(
        (_file: string, _args: string[], _options: unknown, callback: Function) => {
          callback(
            null,
            'Updating abc123..def456\n note-a.md | 2 +-\n note-b.md | 1 +\n note-c.md | 3 ++-\n 3 files changed, 4 insertions(+), 2 deletions(-)\n',
            ''
          )
        }
      )

      const client = new VaultClient(baseConfig)
      const result = await client.pullSync()

      expect(result).toEqual({ success: true, files_updated: 3 })
    })

    it('returns 0 files for already up to date', async () => {
      mockExecFile.mockImplementationOnce(
        (_file: string, _args: string[], _options: unknown, callback: Function) => {
          callback(null, 'Already up to date.\n', '')
        }
      )

      const client = new VaultClient(baseConfig)
      const result = await client.pullSync()

      expect(result).toEqual({ success: true, files_updated: 0 })
    })

    it('returns error on merge conflict', async () => {
      mockExecFile.mockImplementationOnce(
        (_file: string, _args: string[], _options: unknown, callback: Function) => {
          const error = Object.assign(new Error('git pull failed'), {
            stderr: 'fatal: Not possible to fast-forward, aborting.'
          })
          callback(error, '', 'fatal: Not possible to fast-forward, aborting.')
        }
      )

      const client = new VaultClient(baseConfig)
      const result = await client.pullSync()

      expect(result.success).toBe(false)
      expect(result.error).toContain('fast-forward')
    })
  })

  describe('triggerReindex()', () => {
    it('executes local script when location=local', async () => {
      mockExecFile.mockImplementationOnce(
        (_file: string, _args: string[], _options: unknown, callback: Function) => {
          callback(null, 'Processed 12 files\nCompleted in 1.2s\n', '')
        }
      )

      const client = new VaultClient(baseConfig)
      const result = await client.triggerReindex()

      expect(mockExecFile).toHaveBeenCalledWith(
        'python3',
        ['scripts/full_reindex.py'],
        expect.objectContaining({ cwd: expect.stringContaining('/vault-rag') }),
        expect.any(Function)
      )
      expect(result).toEqual({
        success: true,
        files_processed: 12,
        duration_ms: 1200,
        error: null
      })
    })

    it('executes SSH when location=remote', async () => {
      mockExecFile.mockImplementationOnce(
        (_file: string, _args: string[], _options: unknown, callback: Function) => {
          callback(null, 'Processed 7 files\nCompleted in 500ms\n', '')
        }
      )

      const client = new VaultClient({
        ...baseConfig,
        vaultRagLocation: 'remote',
        vaultRagRemoteHost: 'stormbreaker'
      })
      await client.triggerReindex()

      expect(mockExecFile).toHaveBeenCalledWith(
        'ssh',
        ['stormbreaker', 'cd ~/vault-rag && python scripts/full_reindex.py'],
        expect.objectContaining({ timeout: 600000 }),
        expect.any(Function)
      )
    })

    it('returns error when script fails', async () => {
      mockExecFile.mockImplementationOnce(
        (_file: string, _args: string[], _options: unknown, callback: Function) => {
          const error = Object.assign(new Error('python failed'), {
            stderr: 'Traceback: bad import'
          })
          callback(error, '', 'Traceback: bad import')
        }
      )

      const client = new VaultClient(baseConfig)
      const result = await client.triggerReindex()

      expect(result.success).toBe(false)
      expect(result.error).toContain('Traceback')
    })
  })
})
