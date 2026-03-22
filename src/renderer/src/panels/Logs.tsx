import { useState, useEffect, useRef } from 'react'
import type { LogLine } from '../../../shared/types'

const MAX_LINES = 500

const LEVEL_COLORS: Record<LogLine['level'], string> = {
  info: 'text-gray-400',
  warn: 'text-amber-400',
  error: 'text-red-400',
  debug: 'text-gray-600'
}

export function LogsPanel(): JSX.Element {
  const [lines, setLines] = useState<LogLine[]>([])
  const [sources, setSources] = useState<string[]>([])
  const [autoScroll, setAutoScroll] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    Promise.all([
      window.helm.getLogSources().catch(() => []),
      window.helm.queryLogs(MAX_LINES).catch(() => [])
    ]).then(([initialSources, initialLines]) => {
      setSources(initialSources)
      setLines(initialLines)
    })

    const unsubscribe = window.helm.onLogLines((newLines) => {
      setLines((prev) => {
        const updated = [...prev, ...newLines]
        return updated.slice(-MAX_LINES)
      })
    })

    return unsubscribe
  }, [])

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [lines, autoScroll])

  const handleScroll = (): void => {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 50)
  }

  const clearHistory = async (): Promise<void> => {
    await window.helm.clearLogs()
    setLines([])
  }

  if (sources.length === 0 && lines.length === 0) {
    return (
      <div className="text-gray-600 text-sm h-full flex items-center justify-center">
        <div className="text-center">
          <div>No log sources found</div>
          <div className="text-xs mt-1 text-gray-700">
            Logs will appear from the default Claude log roots or any paths configured in `.env`.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between text-xs text-gray-600 pb-2">
        <span>
          {sources.length} source{sources.length !== 1 ? 's' : ''} | {lines.length} lines
        </span>
        <button onClick={() => void clearHistory()} className="hover:text-gray-400 transition-colors">
          Clear History
        </button>
      </div>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto font-mono text-xs leading-5 space-y-px"
      >
        {lines.map((line, i) => (
          <div key={i} className="flex gap-2 hover:bg-gray-800/30 px-1 rounded">
            <span className="text-gray-700 shrink-0 w-16">
              {new Date(line.timestamp).toLocaleTimeString([], { hour12: false })}
            </span>
            <span className="text-gray-600 shrink-0 w-20 truncate">{line.source}</span>
            <span className={LEVEL_COLORS[line.level]}>{line.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
