import { useState, useEffect, useCallback } from 'react'
import type { BriefingResult, BriefingAlert } from '../../../../shared/types'

const SEVERITY_STYLES: Record<BriefingAlert['severity'], string> = {
  info: 'text-blue-400 bg-blue-950/30 border-blue-900',
  warning: 'text-amber-400 bg-amber-950/30 border-amber-900',
  critical: 'text-red-400 bg-red-950/30 border-red-900'
}

export function BriefingPanel(): JSX.Element {
  const [briefing, setBriefing] = useState<BriefingResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

      {error && <div className="text-red-400 text-xs mb-2">{error}</div>}

      {!briefing && !loading && !error && (
        <div className="text-gray-600 text-xs flex-1 flex items-center justify-center">
          Press the button or Cmd+B for an AI briefing
        </div>
      )}

      {briefing && (
        <div className="flex-1 overflow-y-auto space-y-3">
          <p className="text-gray-300 leading-relaxed">{briefing.summary}</p>

          {briefing.alerts.length > 0 && (
            <div className="space-y-1">
              {briefing.alerts.map((alert, i) => (
                <div
                  key={i}
                  className={`text-xs px-2 py-1.5 rounded border ${SEVERITY_STYLES[alert.severity]}`}
                >
                  <span className="font-medium uppercase text-[10px] mr-1">{alert.severity}</span>
                  {alert.message}
                </div>
              ))}
            </div>
          )}

          {briefing.suggestions.length > 0 && (
            <div className="space-y-1">
              <div className="text-gray-500 text-xs uppercase tracking-wider">Suggestions</div>
              {briefing.suggestions.map((s, i) => (
                <div key={i} className="text-gray-400 text-xs pl-2 border-l border-gray-800">
                  {s}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
