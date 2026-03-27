import { execFile } from 'child_process'
import { access, mkdir, writeFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import type {
  HelmConfig,
  VaultChunk,
  VaultHealthStatus,
  VaultPushResult,
  VaultReindexResult,
  VaultSearchResponse
} from '../shared/types'

const DEFAULT_VAULT_RAG_ENDPOINT = 'http://127.0.0.1:8742'
const DEFAULT_VAULT_PATH = join(homedir(), 'Documents', 'ai', 'obsidian-vault')
const DEFAULT_VAULT_RAG_LOCATION = 'local'
const DEFAULT_VAULT_RAG_REMOTE_HOST = 'stormbreaker'
const DEFAULT_LOCAL_VAULT_RAG_PATH = join(homedir(), 'vault-rag')
const EXEC_TIMEOUT_MS = 10 * 60 * 1000

type VaultSearchFilters = { client?: string; doc_type?: string; top_k?: number }
type VaultChunkResult = VaultChunk | { error: string }
type VaultPullSyncResult = { success: boolean; files_updated: number; error?: string }

function execFileAsync(
  file: string,
  args: string[],
  options?: { cwd?: string; timeout?: number }
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(file, args, options ?? {}, (error, stdout, stderr) => {
      if (error) {
        reject(
          Object.assign(error, {
            stdout: typeof stdout === 'string' ? stdout : '',
            stderr: typeof stderr === 'string' ? stderr : ''
          })
        )
        return
      }

      resolve({
        stdout: typeof stdout === 'string' ? stdout : '',
        stderr: typeof stderr === 'string' ? stderr : ''
      })
    })
  })
}

function normalizeEndpoint(endpoint: string): string {
  return endpoint.trim().replace(/\/+$/, '') || DEFAULT_VAULT_RAG_ENDPOINT
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return 'Unknown error'
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || /abort/i.test(error.message))
}

function parseFilesProcessed(output: string): number | null {
  const patterns = [
    /processed\s+(\d+)\s+files?/i,
    /indexed\s+(\d+)\s+files?/i,
    /(\d+)\s+files?\s+processed/i,
    /files_processed["'=:\s]+(\d+)/i
  ]

  for (const pattern of patterns) {
    const match = output.match(pattern)
    if (match) {
      return Number.parseInt(match[1], 10)
    }
  }

  return null
}

function parseDurationMs(output: string): number | null {
  const msPatterns = [
    /duration(?:_ms)?["'=:\s]+(\d+(?:\.\d+)?)/i,
    /completed in\s+(\d+(?:\.\d+)?)\s*ms/i,
    /finished in\s+(\d+(?:\.\d+)?)\s*ms/i
  ]

  for (const pattern of msPatterns) {
    const match = output.match(pattern)
    if (match) {
      return Math.round(Number.parseFloat(match[1]))
    }
  }

  const secondsPatterns = [
    /completed in\s+(\d+(?:\.\d+)?)\s*s/i,
    /finished in\s+(\d+(?:\.\d+)?)\s*s/i,
    /duration["'=:\s]+(\d+(?:\.\d+)?)\s*s/i,
    /took\s+(\d+(?:\.\d+)?)\s*s/i
  ]

  for (const pattern of secondsPatterns) {
    const match = output.match(pattern)
    if (match) {
      return Math.round(Number.parseFloat(match[1]) * 1000)
    }
  }

  return null
}

function parseFilesUpdated(output: string): number {
  if (/already up to date\.?/i.test(output)) {
    return 0
  }

  const summaryMatch = output.match(/(\d+)\s+files?\s+changed/i)
  if (summaryMatch) {
    return Number.parseInt(summaryMatch[1], 10)
  }

  const fileLines = output.match(/^\s+.+\|\s+\d+/gm)
  return fileLines?.length ?? 0
}

function escapeYamlString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function sanitizeNoteTitle(title: string): string {
  const sanitized = title.trim().replace(/[\/\\?%*:|"<>]/g, '-').replace(/\s+/g, ' ')
  return sanitized || 'untitled'
}

function buildHealthError(response: Response, body: string): string {
  return `Vault RAG returned ${response.status}${body ? `: ${body}` : ''}`
}

export class VaultClient {
  private endpoint: string
  private vaultPath: string
  private location: 'local' | 'remote'
  private remoteHost: string
  private timeout = 10_000

  constructor(
    config: Pick<
      HelmConfig,
      'vaultRagEndpoint' | 'vaultPath' | 'vaultRagLocation' | 'vaultRagRemoteHost'
    >
  ) {
    this.endpoint = normalizeEndpoint(config.vaultRagEndpoint || DEFAULT_VAULT_RAG_ENDPOINT)
    this.vaultPath = config.vaultPath || DEFAULT_VAULT_PATH
    this.location = config.vaultRagLocation || DEFAULT_VAULT_RAG_LOCATION
    this.remoteHost = config.vaultRagRemoteHost || DEFAULT_VAULT_RAG_REMOTE_HOST
  }

  private async fetchWithTimeout(input: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeout)

    try {
      return await fetch(input, {
        ...init,
        signal: controller.signal
      })
    } finally {
      clearTimeout(timeout)
    }
  }

  private async triggerReindexIfOnline(): Promise<void> {
    try {
      const health = await this.health()
      if (health.online) {
        void this.triggerReindex()
      }
    } catch {
      // Best-effort only.
    }
  }

  async health(): Promise<VaultHealthStatus> {
    const lastCheck = Date.now()

    try {
      const response = await this.fetchWithTimeout(`${this.endpoint}/health`)
      if (!response.ok) {
        const body = await response.text().catch(() => '')
        return {
          online: false,
          endpoint: this.endpoint,
          qdrant_ok: false,
          last_check: lastCheck,
          last_reindex: null,
          total_chunks: null,
          error: buildHealthError(response, body)
        }
      }

      const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>
      const totalChunks =
        typeof payload.total_chunks === 'number'
          ? payload.total_chunks
          : typeof (payload.stats as Record<string, unknown> | undefined)?.total_chunks === 'number'
            ? ((payload.stats as Record<string, unknown>).total_chunks as number)
            : null

      return {
        online: true,
        endpoint: this.endpoint,
        qdrant_ok: Boolean(payload.qdrant_ok),
        last_check: lastCheck,
        last_reindex: typeof payload.last_reindex === 'string' ? payload.last_reindex : null,
        total_chunks: totalChunks,
        error: null
      }
    } catch (error) {
      return {
        online: false,
        endpoint: this.endpoint,
        qdrant_ok: false,
        last_check: lastCheck,
        last_reindex: null,
        total_chunks: null,
        error: isAbortError(error) ? 'Connection timed out' : formatErrorMessage(error)
      }
    }
  }

  async search(query: string, filters?: VaultSearchFilters): Promise<VaultSearchResponse> {
    const body: Record<string, string | number> = { query }

    if (filters?.client) body.client = filters.client
    if (filters?.doc_type) body.doc_type = filters.doc_type
    if (typeof filters?.top_k === 'number') body.top_k = filters.top_k

    try {
      const response = await this.fetchWithTimeout(`${this.endpoint}/api/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      if (!response.ok) {
        return { results: [], query, result_count: 0 }
      }

      const payload = (await response.json().catch(() => ({}))) as Partial<VaultSearchResponse>
      const results = Array.isArray(payload.results) ? payload.results : []

      return {
        results,
        query: typeof payload.query === 'string' ? payload.query : query,
        result_count:
          typeof payload.result_count === 'number' ? payload.result_count : results.length
      }
    } catch {
      return { results: [], query, result_count: 0 }
    }
  }

  async openChunk(chunkId: string): Promise<VaultChunkResult> {
    try {
      const response = await this.fetchWithTimeout(
        `${this.endpoint}/api/chunks/${encodeURIComponent(chunkId)}`
      )

      if (!response.ok) {
        const body = await response.text().catch(() => '')
        return {
          error: `Vault chunk request failed with ${response.status}${body ? `: ${body}` : ''}`
        }
      }

      return (await response.json()) as VaultChunk
    } catch (error) {
      return {
        error: isAbortError(error) ? 'Connection timed out' : formatErrorMessage(error)
      }
    }
  }

  async triggerReindex(): Promise<VaultReindexResult> {
    try {
      const result =
        this.location === 'remote'
          ? await execFileAsync(
              'ssh',
              [this.remoteHost, 'cd ~/vault-rag && python scripts/full_reindex.py'],
              { timeout: EXEC_TIMEOUT_MS }
            )
          : await execFileAsync('python3', ['scripts/full_reindex.py'], {
              cwd: DEFAULT_LOCAL_VAULT_RAG_PATH,
              timeout: EXEC_TIMEOUT_MS
            })

      const combinedOutput = [result.stdout, result.stderr].filter(Boolean).join('\n')
      return {
        success: true,
        files_processed: parseFilesProcessed(combinedOutput),
        duration_ms: parseDurationMs(combinedOutput),
        error: null
      }
    } catch (error) {
      const stdout = typeof (error as { stdout?: unknown })?.stdout === 'string' ? (error as { stdout: string }).stdout : ''
      const stderr = typeof (error as { stderr?: unknown })?.stderr === 'string' ? (error as { stderr: string }).stderr : ''
      const errorMessage = [stderr.trim(), stdout.trim(), formatErrorMessage(error)]
        .filter(Boolean)
        .join(' | ')

      return {
        success: false,
        files_processed: null,
        duration_ms: null,
        error: errorMessage
      }
    }
  }

  async pushNote(title: string, content: string, folder?: string): Promise<VaultPushResult> {
    const sanitizedTitle = sanitizeNoteTitle(title)
    const targetFolder = folder?.trim() || 'Inbox'
    const filePath = join(this.vaultPath, targetFolder, `${sanitizedTitle}.md`)

    try {
      await access(filePath)
      return {
        success: false,
        file_path: null,
        error: `File already exists at ${filePath}`
      }
    } catch {
      // Expected for new files.
    }

    const frontmatter = [
      '---',
      `title: "${escapeYamlString(title || sanitizedTitle)}"`,
      `created: ${new Date().toISOString().slice(0, 10)}`,
      'source: helm',
      '---',
      ''
    ].join('\n')

    try {
      await mkdir(join(this.vaultPath, targetFolder), { recursive: true })
      await writeFile(filePath, `${frontmatter}\n${content}`, 'utf-8')
    } catch (error) {
      return {
        success: false,
        file_path: null,
        error: formatErrorMessage(error)
      }
    }

    try {
      await execFileAsync('git', ['-C', this.vaultPath, 'add', filePath], {
        timeout: 30_000
      })
      await execFileAsync(
        'git',
        ['-C', this.vaultPath, 'commit', '-m', `HELM: add ${sanitizedTitle}`],
        { timeout: 30_000 }
      )
    } catch (error) {
      console.warn('[vault] git add/commit skipped after note write:', formatErrorMessage(error))
    }

    void this.triggerReindexIfOnline()

    return {
      success: true,
      file_path: filePath,
      error: null
    }
  }

  async pullSync(): Promise<VaultPullSyncResult> {
    try {
      const result = await execFileAsync('git', ['-C', this.vaultPath, 'pull', '--ff-only'], {
        timeout: 60_000
      })
      const combinedOutput = [result.stdout, result.stderr].filter(Boolean).join('\n')
      const filesUpdated = parseFilesUpdated(combinedOutput)

      if (filesUpdated > 0) {
        void this.triggerReindexIfOnline()
      }

      return {
        success: true,
        files_updated: filesUpdated
      }
    } catch (error) {
      const stdout = typeof (error as { stdout?: unknown })?.stdout === 'string' ? (error as { stdout: string }).stdout : ''
      const stderr = typeof (error as { stderr?: unknown })?.stderr === 'string' ? (error as { stderr: string }).stderr : ''
      const errorMessage = [stderr.trim(), stdout.trim(), formatErrorMessage(error)]
        .filter(Boolean)
        .join(' | ')

      return {
        success: false,
        files_updated: 0,
        error: errorMessage
      }
    }
  }
}

export type { VaultChunkResult, VaultPullSyncResult, VaultSearchFilters }
