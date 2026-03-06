import { watch, type FSWatcher } from 'fs'
import { readFile, stat } from 'fs/promises'
import { basename, join } from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import type { LogLine } from '../../shared/types'

const execAsync = promisify(exec)

type LogCallback = (lines: LogLine[]) => void

interface WatchedFile {
  path: string
  label: string
  offset: number
  watcher: FSWatcher | null
}

const MAX_INITIAL_LINES = 100
const watchedFiles = new Map<string, WatchedFile>()
let logCallback: LogCallback | null = null

function classifyLevel(text: string): LogLine['level'] {
  const lower = text.toLowerCase()
  if (lower.includes('error') || lower.includes('err ') || lower.includes('fatal')) return 'error'
  if (lower.includes('warn') || lower.includes('warning')) return 'warn'
  if (lower.includes('debug') || lower.includes('trace')) return 'debug'
  return 'info'
}

async function tailFile(
  filePath: string,
  fromOffset: number
): Promise<{ lines: LogLine[]; newOffset: number }> {
  try {
    const stats = await stat(filePath)
    if (stats.size <= fromOffset) return { lines: [], newOffset: fromOffset }

    const content = await readFile(filePath, 'utf-8')
    const newContent = content.slice(fromOffset)
    const label = basename(filePath)

    const lines = newContent
      .split('\n')
      .filter((l) => l.trim().length > 0)
      .map((text) => ({
        timestamp: Date.now(),
        source: label,
        text: text.trim(),
        level: classifyLevel(text)
      }))

    return { lines, newOffset: stats.size }
  } catch {
    return { lines: [], newOffset: fromOffset }
  }
}

async function getInitialLines(filePath: string): Promise<{ lines: LogLine[]; offset: number }> {
  try {
    const content = await readFile(filePath, 'utf-8')
    const allLines = content.split('\n').filter((l) => l.trim().length > 0)
    const label = basename(filePath)

    const recentLines = allLines.slice(-MAX_INITIAL_LINES).map((text) => ({
      timestamp: Date.now(),
      source: label,
      text: text.trim(),
      level: classifyLevel(text)
    }))

    return { lines: recentLines, offset: Buffer.byteLength(content, 'utf-8') }
  } catch {
    return { lines: [], offset: 0 }
  }
}

async function watchLogFile(filePath: string): Promise<void> {
  if (watchedFiles.has(filePath)) return

  const { lines: initialLines, offset } = await getInitialLines(filePath)

  const watched: WatchedFile = {
    path: filePath,
    label: basename(filePath),
    offset,
    watcher: null
  }

  if (initialLines.length > 0 && logCallback) {
    logCallback(initialLines)
  }

  try {
    watched.watcher = watch(filePath, async (eventType) => {
      if (eventType === 'change') {
        const { lines, newOffset } = await tailFile(filePath, watched.offset)
        watched.offset = newOffset
        if (lines.length > 0 && logCallback) {
          logCallback(lines)
        }
      }
    })
  } catch {
    // File may not be watchable
  }

  watchedFiles.set(filePath, watched)
}

async function discoverLogFiles(): Promise<string[]> {
  const home = process.env.HOME || ''
  const patterns = [join(home, '.claude', 'projects', '*', 'logs', '*.log'), '/tmp/hydra-*.log']

  const files: string[] = []

  for (const pattern of patterns) {
    try {
      const { stdout } = await execAsync(`ls ${pattern} 2>/dev/null || true`)
      const found = stdout
        .trim()
        .split('\n')
        .filter((f) => f.length > 0)
      files.push(...found)
    } catch {
      // Pattern matched nothing
    }
  }

  return files
}

export async function startLogMonitoring(callback: LogCallback): Promise<string[]> {
  logCallback = callback

  const files = await discoverLogFiles()
  for (const file of files) {
    await watchLogFile(file)
  }

  return files
}

export function stopLogMonitoring(): void {
  for (const watched of watchedFiles.values()) {
    watched.watcher?.close()
  }
  watchedFiles.clear()
  logCallback = null
}

export function getLogSources(): string[] {
  return Array.from(watchedFiles.keys())
}
