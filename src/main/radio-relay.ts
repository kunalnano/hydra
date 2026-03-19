import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as WebReadableStream } from 'node:stream/web'

type RadioRelaySource =
  | { kind: 'remote'; value: string; extensionHint?: string }
  | { kind: 'local'; value: string; extensionHint?: string }

let relayServer: ReturnType<typeof createServer> | null = null
let relayBaseUrlPromise: Promise<string> | null = null

const AUDIO_MIME_BY_EXT: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  flac: 'audio/flac'
}

function encodeRelayValue(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url')
}

function decodeRelayValue(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8')
}

function mimeTypeForPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return AUDIO_MIME_BY_EXT[ext] ?? 'application/octet-stream'
}

function normalizeExtensionHint(extensionHint: string | undefined): string | null {
  if (!extensionHint) return null
  const normalized = extensionHint.toLowerCase().replace(/^\./, '')
  return normalized in AUDIO_MIME_BY_EXT ? normalized : null
}

function inferExtension(value: string): string | null {
  try {
    const parsed = new URL(value)
    const ext = parsed.pathname.split('.').pop()?.toLowerCase() ?? ''
    return ext in AUDIO_MIME_BY_EXT ? ext : null
  } catch {
    const ext = value.split('.').pop()?.toLowerCase() ?? ''
    return ext in AUDIO_MIME_BY_EXT ? ext : null
  }
}

function relayFileExtension(source: RadioRelaySource): string | null {
  return normalizeExtensionHint(source.extensionHint) ?? inferExtension(source.value) ?? null
}

function stripRelayExtension(value: string): string {
  const dotIndex = value.indexOf('.')
  return dotIndex === -1 ? value : value.slice(0, dotIndex)
}

function parseRangeHeader(
  rangeHeader: string | undefined,
  totalBytes: number
): { start: number; end: number } | null {
  if (!rangeHeader || !rangeHeader.startsWith('bytes=')) return null

  const [startPart, endPart] = rangeHeader.replace('bytes=', '').split('-', 2)
  if (!startPart && !endPart) return null

  let start = startPart ? Number(startPart) : NaN
  let end = endPart ? Number(endPart) : NaN

  if (Number.isNaN(start)) {
    const suffixLength = Number(endPart)
    if (Number.isNaN(suffixLength) || suffixLength <= 0) return null
    start = Math.max(totalBytes - suffixLength, 0)
    end = totalBytes - 1
  } else if (Number.isNaN(end)) {
    end = totalBytes - 1
  }

  if (start < 0 || end < start || start >= totalBytes) return null

  return {
    start,
    end: Math.min(end, totalBytes - 1)
  }
}

function writeCorsHeaders(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Range,Content-Type')
  res.setHeader('Cache-Control', 'no-store')
}

function writeTextError(
  res: ServerResponse,
  statusCode: number,
  message: string
): void {
  if (res.headersSent) {
    res.end()
    return
  }

  writeCorsHeaders(res)
  res.writeHead(statusCode, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end(message)
}

function copyProxyHeaders(upstreamHeaders: Headers, res: ServerResponse): void {
  const headerNames = [
    'content-type',
    'content-length',
    'content-range',
    'accept-ranges',
    'icy-br',
    'icy-description',
    'icy-genre',
    'icy-metaint',
    'icy-name'
  ]

  for (const name of headerNames) {
    const value = upstreamHeaders.get(name)
    if (value) res.setHeader(name, value)
  }
}

function isAllowedRemoteUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

async function handleRemoteRelay(
  req: IncomingMessage,
  res: ServerResponse,
  encodedTarget: string
): Promise<void> {
  const targetUrl = decodeRelayValue(stripRelayExtension(encodedTarget))
  if (!isAllowedRemoteUrl(targetUrl)) {
    writeTextError(res, 400, 'Unsupported relay target')
    return
  }

  const upstreamHeaders = new Headers()
  if (req.headers.range) {
    upstreamHeaders.set('Range', req.headers.range)
  }
  upstreamHeaders.set('User-Agent', 'HydraRadioRelay/1.0')

  const abortController = new AbortController()
  req.on('close', () => abortController.abort())

  let upstream: Response
  try {
    upstream = await fetch(targetUrl, {
      headers: upstreamHeaders,
      redirect: 'follow',
      signal: abortController.signal
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown upstream error'
    writeTextError(res, 502, message)
    return
  }

  writeCorsHeaders(res)
  res.statusCode = upstream.status
  copyProxyHeaders(upstream.headers, res)

  if (!upstream.headers.get('content-type')) {
    res.setHeader('content-type', 'audio/mpeg')
  }

  if (req.method === 'HEAD' || !upstream.body) {
    res.end()
    return
  }

  const upstreamBody = Readable.fromWeb(upstream.body as unknown as WebReadableStream<Uint8Array>)

  try {
    await pipeline(upstreamBody, res)
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (!message.includes('aborted') && !message.includes('Premature close')) {
      writeTextError(res, 502, 'Relay stream interrupted')
    }
  }
}

async function handleLocalRelay(
  req: IncomingMessage,
  res: ServerResponse,
  encodedPath: string
): Promise<void> {
  const filePath = decodeRelayValue(stripRelayExtension(encodedPath))

  let fileStat
  try {
    fileStat = await stat(filePath)
  } catch {
    writeTextError(res, 404, 'Local audio file not found')
    return
  }

  if (!fileStat.isFile()) {
    writeTextError(res, 404, 'Local audio file not found')
    return
  }

  const byteRange = parseRangeHeader(req.headers.range, fileStat.size)
  const start = byteRange?.start ?? 0
  const end = byteRange?.end ?? fileStat.size - 1
  const chunkSize = end - start + 1

  writeCorsHeaders(res)
  res.setHeader('Content-Type', mimeTypeForPath(filePath))
  res.setHeader('Accept-Ranges', 'bytes')
  res.setHeader('Content-Length', String(chunkSize))

  if (byteRange) {
    res.statusCode = 206
    res.setHeader('Content-Range', `bytes ${start}-${end}/${fileStat.size}`)
  } else {
    res.statusCode = 200
  }

  if (req.method === 'HEAD') {
    res.end()
    return
  }

  const fileStream = createReadStream(filePath, { start, end })
  req.on('close', () => fileStream.destroy())

  try {
    await pipeline(fileStream, res)
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (!message.includes('aborted') && !message.includes('Premature close')) {
      writeTextError(res, 500, 'Local audio stream interrupted')
    }
  }
}

async function handleRelayRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!req.url) {
    writeTextError(res, 400, 'Missing relay URL')
    return
  }

  if (req.method === 'OPTIONS') {
    writeCorsHeaders(res)
    res.writeHead(204)
    res.end()
    return
  }

  const requestUrl = new URL(req.url, 'http://127.0.0.1')

  if (requestUrl.pathname === '/health') {
    writeCorsHeaders(res)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
    return
  }

  if (requestUrl.pathname.startsWith('/remote/')) {
    await handleRemoteRelay(req, res, requestUrl.pathname.slice('/remote/'.length))
    return
  }

  if (requestUrl.pathname.startsWith('/local/')) {
    await handleLocalRelay(req, res, requestUrl.pathname.slice('/local/'.length))
    return
  }

  writeTextError(res, 404, 'Unknown relay route')
}

async function ensureRelayBaseUrl(): Promise<string> {
  if (relayBaseUrlPromise) return relayBaseUrlPromise

  relayBaseUrlPromise = new Promise((resolve, reject) => {
    relayServer = createServer((req, res) => {
      void handleRelayRequest(req, res)
    })

    relayServer.once('error', reject)
    relayServer.listen(0, '127.0.0.1', () => {
      const address = relayServer?.address()
      if (!address || typeof address === 'string') {
        reject(new Error('Could not determine radio relay address'))
        return
      }

      resolve(`http://127.0.0.1:${address.port}`)
    })
  })

  return relayBaseUrlPromise
}

export async function getRadioRelayUrl(source: RadioRelaySource): Promise<string> {
  const baseUrl = await ensureRelayBaseUrl()
  const encodedValue = encodeRelayValue(source.value)
  const fileExtension = relayFileExtension(source)
  const extensionSuffix = fileExtension ? `.${fileExtension}` : ''
  return source.kind === 'remote'
    ? `${baseUrl}/remote/${encodedValue}${extensionSuffix}`
    : `${baseUrl}/local/${encodedValue}${extensionSuffix}`
}

export async function stopRadioRelayServer(): Promise<void> {
  relayBaseUrlPromise = null

  if (!relayServer) return

  const server = relayServer
  relayServer = null

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error)
        return
      }
      resolve()
    })
  })
}

export const __radioRelayInternals = {
  decodeRelayValue,
  encodeRelayValue,
  isAllowedRemoteUrl,
  mimeTypeForPath,
  normalizeExtensionHint,
  parseRangeHeader,
  relayFileExtension,
  stripRelayExtension
}
