import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type { BriefingResult, BriefingAlert, YenneferStyle } from '../../../shared/types'
import { useSystemStore } from '../stores/system'
import { maskEndpoint, redactSensitiveText, usePrivacyStore } from '../stores/privacy'
import { AICoreNode, type AICoreMode } from './AICoreNode'

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

const MODE_LABELS: Record<AICoreMode, string> = {
  idle: 'Hydra Awake',
  thinking: 'Hydra Thinking',
  speaking: 'Yennefer Live',
  repairing: 'Repairing',
  offline: 'Isolated',
  throughput: 'Throughput'
}

interface BriefingPanelProps {
  variant?: 'compact' | 'full'
}

export function BriefingPanel({ variant = 'compact' }: BriefingPanelProps): JSX.Element {
  const systemState = useSystemStore((s) => s.state)
  const privacyMode = usePrivacyStore((s) => s.privacyMode)
  const [briefing, setBriefing] = useState<BriefingResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [yenneferLoading, setYenneferLoading] = useState(false)
  const [healing, setHealing] = useState(false)
  const [savingStyle, setSavingStyle] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [lmStudioUrl, setLmStudioUrl] = useState<string>('http://localhost:1234')
  const [yenneferEnabled, setYenneferEnabled] = useState(true)
  const [yenneferStyle, setYenneferStyle] = useState<YenneferStyle>('adaptive')
  const [recentCoreMode, setRecentCoreMode] = useState<AICoreMode | null>(null)
  const [monoLattice, setMonoLattice] = useState(false)
  const coreTimerRef = useRef<number | null>(null)

  const activeAgents =
    systemState?.agents.filter((agent) => agent.status === 'active' || agent.status === 'busy').length || 0
  const totalAgents = systemState?.agents.length || 0
  const listenerCount = systemState?.ports.filter((port) => port.state === 'LISTEN').length || 0
  const cpuUsage = systemState?.cpu.usage || 0
  const memoryUsage = systemState?.memory.usagePercent || 0

  const pulseCore = useCallback((mode: AICoreMode): void => {
    if (coreTimerRef.current !== null) {
      window.clearTimeout(coreTimerRef.current)
    }
    setRecentCoreMode(mode)
    coreTimerRef.current = window.setTimeout(() => {
      setRecentCoreMode(null)
      coreTimerRef.current = null
    }, 6000)
  }, [])

  const refreshConfig = useCallback(async (): Promise<void> => {
    const cfg = await window.hydra.getConfig()
    if (cfg.lmStudioUrl) setLmStudioUrl(cfg.lmStudioUrl)
    if (cfg.yenneferEnabled === false) setYenneferEnabled(false)
    if (cfg.yenneferStyle) setYenneferStyle(cfg.yenneferStyle)
  }, [])

  useEffect(() => {
    refreshConfig().catch(() => {})
  }, [refreshConfig])

  useEffect(() => {
    return () => {
      if (coreTimerRef.current !== null) {
        window.clearTimeout(coreTimerRef.current)
      }
    }
  }, [])

  const requestBriefing = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    setNotice(null)
    try {
      const result = await window.hydra.requestBriefing()
      if (result) {
        setBriefing(result)
        pulseCore('speaking')
      } else {
        setError('No system state available yet')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Briefing failed')
    } finally {
      setLoading(false)
      refreshConfig().catch(() => {})
    }
  }, [refreshConfig])

  const healLmStudio = useCallback(async (): Promise<void> => {
    setHealing(true)
    setError(null)
    setNotice(null)
    try {
      const result = await window.hydra.healLmStudio()
      if (result.url) setLmStudioUrl(result.url)
      if (result.success) {
        setNotice(result.message)
        pulseCore('speaking')
      } else {
        setError(result.message)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'LM Studio repair failed')
    } finally {
      setHealing(false)
      refreshConfig().catch(() => {})
    }
  }, [refreshConfig])

  const invokeYennefer = useCallback(async (): Promise<void> => {
    setYenneferLoading(true)
    setError(null)
    setNotice(null)
    try {
      const result = await window.hydra.requestYennefer()
      if (result) {
        setBriefing(result)
        pulseCore('speaking')
      } else {
        setError('No system state available yet')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Yennefer invocation failed')
    } finally {
      setYenneferLoading(false)
      refreshConfig().catch(() => {})
    }
  }, [refreshConfig])

  useEffect(() => {
    const unsub = window.hydra.onBriefingShortcut(() => {
      requestBriefing()
    })
    return unsub
  }, [requestBriefing])

  useEffect(() => {
    const unsub = window.hydra.onYenneferShortcut(() => {
      invokeYennefer()
    })
    return unsub
  }, [invokeYennefer])

  const updateYenneferStyle = useCallback(async (nextStyle: YenneferStyle): Promise<void> => {
    setYenneferStyle(nextStyle)
    setSavingStyle(true)
    setNotice(null)
    setError(null)
    try {
      const current = await window.hydra.getConfig()
      await window.hydra.saveConfig({ ...current, yenneferStyle: nextStyle })
      setNotice(`Yennefer lens set to ${nextStyle}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save Yennefer lens')
    } finally {
      setSavingStyle(false)
    }
  }, [])

  const coreMode: AICoreMode = (() => {
    const lowerError = error?.toLowerCase() || ''
    const lowerSummary = briefing?.summary.toLowerCase() || ''
    const lmStudioOffline =
      lowerError.includes('lm studio') ||
      lowerError.includes('reachable') ||
      lowerError.includes('offline') ||
      lowerSummary.includes('lm studio offline') ||
      lowerSummary.includes('unable to reach')

    if (healing) return 'repairing'
    if (loading || yenneferLoading) return 'thinking'
    if (lmStudioOffline) return 'offline'
    if (recentCoreMode) return recentCoreMode

    const throughputReady =
      (yenneferStyle === 'throughput' || activeAgents >= 3 || totalAgents >= 4) &&
      cpuUsage < 80 &&
      (memoryUsage < 94 || (systemState?.memory.free || 0) / 1e9 >= 2.5)

    if (systemState && throughputReady) return 'throughput'
    return 'idle'
  })()

  const isFull = variant === 'full'
  const displayLmStudioUrl = privacyMode ? maskEndpoint(lmStudioUrl) : lmStudioUrl
  const displayBriefing = useMemo(() => {
    if (!briefing) return null
    if (!privacyMode) return briefing

    return {
      ...briefing,
      summary: redactSensitiveText(briefing.summary),
      alerts: briefing.alerts.map((alert) => ({
        ...alert,
        message: redactSensitiveText(alert.message),
        source: redactSensitiveText(alert.source)
      })),
      suggestions: briefing.suggestions.map((suggestion) => redactSensitiveText(suggestion))
    }
  }, [briefing, privacyMode])
  const displayError = error ? (privacyMode ? redactSensitiveText(error) : error) : null
  const displayNotice = notice ? (privacyMode ? redactSensitiveText(notice) : notice) : null

  return (
    <div className={isFull ? 'space-y-3 text-sm' : 'h-full flex flex-col text-sm'}>
      {variant === 'full' && yenneferEnabled ? (
        <div className="pb-4">
          <AICoreNode
            mode={coreMode}
            mono={monoLattice}
            activeAgents={activeAgents}
            totalAgents={totalAgents}
            cpuUsage={cpuUsage}
            memoryUsage={memoryUsage}
            listenerCount={listenerCount}
            yenneferStyle={yenneferStyle}
            lmStudioUrl={displayLmStudioUrl}
            privacyMode={privacyMode}
            disabled={loading || yenneferLoading || healing}
            processes={systemState?.processes}
            agents={systemState?.agents}
            ports={systemState?.ports}
            gitRepos={systemState?.gitRepos}
            onRequestBriefing={requestBriefing}
            onRepair={healLmStudio}
            onInvokeYennefer={invokeYennefer}
            onToggleMono={() => setMonoLattice((m) => !m)}
            onSetYenneferStyle={updateYenneferStyle}
            lensDisabled={savingStyle || yenneferLoading}
          />
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 pb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={requestBriefing}
              disabled={loading || yenneferLoading || healing}
              className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded transition-colors font-medium"
            >
              {loading ? 'Generating...' : 'Request Briefing'}
            </button>
            <button
              onClick={healLmStudio}
              disabled={loading || yenneferLoading || healing}
              className="px-3 py-1.5 text-xs bg-emerald-700 hover:bg-emerald-600 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded transition-colors font-medium"
            >
              {healing ? 'Repairing...' : 'Invoke Repair'}
            </button>
            {yenneferEnabled && (
              <button
                onClick={invokeYennefer}
                disabled={loading || yenneferLoading || healing}
                className="px-3 py-1.5 text-xs bg-violet-600 hover:bg-violet-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded transition-colors font-medium"
              >
                {yenneferLoading ? 'Channeling...' : '\u2694\uFE0F Invoke Yennefer'}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-2.5 py-1">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                coreMode === 'offline'
                  ? 'bg-rose-400 shadow-[0_0_14px_rgba(251,113,133,0.65)]'
                  : coreMode === 'repairing'
                    ? 'bg-amber-300 shadow-[0_0_14px_rgba(252,211,77,0.65)]'
                    : coreMode === 'thinking'
                      ? 'bg-violet-400 animate-pulse shadow-[0_0_14px_rgba(167,139,250,0.65)]'
                      : coreMode === 'throughput'
                        ? 'bg-teal-300 shadow-[0_0_14px_rgba(94,234,212,0.65)]'
                        : 'bg-cyan-300 shadow-[0_0_14px_rgba(103,232,249,0.65)]'
              }`}
            />
            <span className="text-[10px] uppercase tracking-[0.26em] text-gray-400">
              {coreMode === 'throughput' ? 'Hydra Alive' : MODE_LABELS[coreMode]}
            </span>
          </div>
        </div>
      )}

      {isFull ? (
        displayBriefing && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/8 bg-black/10 px-3 py-2">
            <div className="min-w-0 flex-1 text-[10px] text-gray-600 font-mono truncate" title={displayLmStudioUrl}>
              → {displayLmStudioUrl}
            </div>
            {privacyMode && (
              <span className="rounded-full border border-emerald-300/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-emerald-200">
                Secure View
              </span>
            )}
            <span className="text-[10px] text-gray-600 font-mono">
              {new Date(displayBriefing.timestamp).toLocaleTimeString()}
            </span>
          </div>
        )
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 pb-2">
            <div className="text-[10px] text-gray-600 font-mono truncate" title={displayLmStudioUrl}>
              → {displayLmStudioUrl}
            </div>
            {displayBriefing && (
              <span className="text-xs text-gray-600 font-mono">
                {new Date(displayBriefing.timestamp).toLocaleTimeString()}
              </span>
            )}
          </div>

          {yenneferEnabled && (
            <div className="flex items-center justify-between gap-3 pb-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-gray-500">Yennefer Lens</div>
                <div className="text-[11px] text-gray-600">
                  Throughput treats dense work as intentional. Creative varies the read.
                </div>
              </div>
              <select
                value={yenneferStyle}
                disabled={savingStyle || yenneferLoading}
                onChange={(e) => updateYenneferStyle(e.target.value as YenneferStyle)}
                className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 disabled:text-gray-500"
              >
                <option value="adaptive">Adaptive</option>
                <option value="throughput">Throughput</option>
                <option value="creative">Creative</option>
                <option value="strict">Strict</option>
              </select>
            </div>
          )}
        </>
      )}

      {displayError && <div className="text-red-400 text-xs mb-2">{displayError}</div>}
      {displayNotice && <div className="text-emerald-400 text-xs mb-2">{displayNotice}</div>}

      {!isFull && !displayBriefing && !loading && !displayError && (
        <div
          className="text-gray-600 text-xs flex-1 flex items-center justify-center"
        >
          Press the button or Cmd+B for a Local AI (LM Studio) briefing
        </div>
      )}

      {displayBriefing && (
        <div
          className={
            isFull
              ? 'max-h-[280px] space-y-3 overflow-y-auto rounded-xl border border-white/8 bg-black/10 p-3'
              : 'flex-1 overflow-y-auto space-y-3'
          }
        >
          {/* Summary */}
          <p className="text-gray-300 leading-relaxed">{displayBriefing.summary}</p>

          {/* Alerts */}
          {displayBriefing.alerts.length > 0 && (
            <div className="space-y-1.5">
              {displayBriefing.alerts.map((alert, i) => (
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
          {displayBriefing.suggestions.length > 0 && (
            <div className="space-y-1">
              <div className="text-gray-500 text-xs uppercase tracking-wider">Suggestions</div>
              {displayBriefing.suggestions.map((s, i) => (
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
