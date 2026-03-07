import { useState, useEffect, useCallback } from 'react'
import type { BriefingResult, BriefingAlert } from '../../../shared/types'

const SEVERITY_STYLES: Record<BriefingAlert['severity'], string> = {
  info: 'text-blue-400 bg-blue-950/30 border-blue-900',
  warning: 'text-amber-400 bg-amber-950/30 border-amber-900',
  critical: 'text-red-400 bg-red-950/30 border-red-900'
}

const SOURCE_TAG_STYLES: Record<string, string> = {
  processes: 'bg-blue-900/50 text-blue-400',
  ports: 'bg-teal-900/50 text-teal-400',
  agents: 'bg-amber-900/50 text-amber-400',
  git: 'bg-purple-900/50 text-purple-400',
  memory: 'bg-pink-900/50 text-pink-400',
  cpu: 'bg-green-900/50 text-green-400',
  briefing: 'bg-gray-800 text-gray-400'
}

export function BriefingPanel(): JSX.Element {
  const [briefing, setBriefing] = useState<BriefingResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lmStudioUrl, setLmStudioUrl] = useState<string>('http://localhost:1234')

  useEffect(() => {
    window.hydra.getConfig().then((cfg) => {
      if (cfg.lmStudioUrl) setLmStudioUrl(cfg.lmStudioUrl)
    }).catch(() => {})
  }, [])

  const requestBriefing = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.hydra.requestBriefing()
      if (result) {
        setBriefing(result)
      } else {
        setError('No system state available yet')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Briefing failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const unsub = window.hydra.onBriefingShortcut(() => {
      requestBriefing()
    })
    return unsub
  }, [requestBriefing])

  return (
    <div className="h-full flex flex-col text-sm">
      <div className="flex items-center justify-between pb-3">
        <button
          onClick={requestBriefing}
          disabled={loading}
          className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded transition-colors font-medium"
        >
          {loading ? 'Generating...' : 'Request Briefing'}
        </button>
        {briefing && (
          <span className="text-xs text-gray-600 font-mono">
            {new Date(briefing.timestamp).toLocaleTimeString()}
          </span>
        )}
      </div>
      <div className="text-[10px] text-gray-600 font-mono pb-2 truncate" title={lmStudioUrl}>
        → {lmStudioUrl}
      </div>

      {error && <div className="text-red-400 text-xs mb-2">{error}</div>}

      {!briefing && !loading && !error && (
        <div className="text-gray-600 text-xs flex-1 flex items-center justify-center">
          Press the button or Cmd+B for a Local AI (LM Studio) briefing
        </div>
      )}

      {briefing && (
        <div className="flex-1 overflow-y-auto space-y-3">
          {/* Summary */}
          <p className="text-gray-300 leading-relaxed">{briefing.summary}</p>

          {/* Alerts */}
          {briefing.alerts.length > 0 && (
            <div className="space-y-1.5">
              {briefing.alerts.map((alert, i) => (
                <div
                  key={i}
                  className={`text-xs px-2 py-1.5 rounded border flex items-start gap-2 ${SEVERITY_STYLES[alert.severity]}`}
                >
                  <span className="font-bold uppercase text-[10px] shrink-0 mt-0.5">
                    {alert.severity}
                  </span>
                  <span className="flex-1">{alert.message}</span>
                  {alert.source && (
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded-full shrink-0 ${SOURCE_TAG_STYLES[alert.source] || 'bg-gray-800 text-gray-500'}`}
                    >
                      {alert.source}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Suggestions */}
          {briefing.suggestions.length > 0 && (
            <div className="space-y-1">
              <div className="text-gray-500 text-xs uppercase tracking-wider">Suggestions</div>
              {briefing.suggestions.map((s, i) => (
                <div
                  key={i}
                  className="text-gray-400 text-xs pl-3 border-l-2 border-cyan-900/50 flex gap-2"
                >
                  <span className="text-cyan-700 font-mono shrink-0">{i + 1}.</span>
                  <span>{s}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
