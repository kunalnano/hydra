import { useState, useEffect, useCallback, useMemo } from 'react'
import type {
  FirewallState,
  SecurityScanResult,
  SecurityPosture,
  PostureHistoryEntry
} from '../../../shared/types'
import { Sparkline } from '../components/Sparkline'
import { redactSensitiveText, usePrivacyStore } from '../stores/privacy'

const SCAN_COMMANDS = [
  { command: 'survey', label: 'Survey', tag: 'ST-01', color: '#4ade80' },
  { command: 'illuminate', label: 'Illuminate', tag: 'ST-02', color: '#fbbf24' },
  { command: 'shadowfax', label: 'Shadowfax', tag: 'ST-03', color: '#38bdf8' },
  { command: 'delve', label: 'Delve', tag: 'ST-04', color: '#fb7185' },
  { command: 'scry', label: 'Scry', tag: 'ST-05', color: '#a78bfa' }
] as const

function gradeColor(grade: string): string {
  const letter = grade.charAt(0).toUpperCase()
  if (letter === 'A' || letter === 'B') return '#4ade80'
  if (letter === 'C') return '#fbbf24'
  return '#f87171'
}

function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ago`
}

export function SecurityPanel(): JSX.Element {
  const privacyMode = usePrivacyStore((s) => s.privacyMode)
  const [firewall, setFirewall] = useState<FirewallState | null>(null)
  const [scanResult, setScanResult] = useState<SecurityScanResult | null>(null)
  const [posture, setPosture] = useState<SecurityPosture | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedCommand, setSelectedCommand] = useState<string>('survey')
  const [postureHistory, setPostureHistory] = useState<PostureHistoryEntry[]>([])
  const [lastScanTimestamp, setLastScanTimestamp] = useState<number | null>(null)
  const [staffMissing, setStaffMissing] = useState(false)

  useEffect(() => {
    window.helm
      .getFirewallRules()
      .then(setFirewall)
      .catch(() => {})
    const unsub = window.helm.onFirewallState((state) => setFirewall(state))
    return unsub
  }, [])

  useEffect(() => {
    const unsub = window.helm.onSecurityScanResult((result) => {
      setScanResult(result)
      setSelectedCommand(result.command)
      if (result.status === 'complete' || result.status === 'error') {
        setLoading(false)
        if (result.status === 'error' && result.output?.includes('not found')) {
          setStaffMissing(true)
        }
      }
    })
    return unsub
  }, [])

  useEffect(() => {
    const unsub = window.helm.onSecurityPosture?.((nextPosture) => {
      setPosture(nextPosture)
      setLastScanTimestamp(Date.now())
      window.helm.queryPostureHistory(10).then(setPostureHistory).catch(() => {})
    })
    return unsub
  }, [])

  useEffect(() => {
    window.helm
      .queryPostureHistory(10)
      .then((history) => {
        setPostureHistory(history)
        if (history.length > 0) setLastScanTimestamp(history[0].timestamp)
      })
      .catch(() => {})
  }, [])

  const runScan = useCallback(async (command: string): Promise<void> => {
    setLoading(true)
    setSelectedCommand(command)
    setStaffMissing(false)
    setScanResult({ id: '', command, output: '', timestamp: Date.now(), status: 'running' })
    try {
      const result = await window.helm.requestSecurityScan(command)
      setScanResult(result)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Scan failed'
      if (msg.includes('not found')) setStaffMissing(true)
      setScanResult({ id: '', command, output: msg, timestamp: Date.now(), status: 'error' })
    } finally {
      setLoading(false)
    }
  }, [])

  const sparklineScores = useMemo(
    () => postureHistory.slice().reverse().map((entry) => entry.score),
    [postureHistory]
  )
  const improving =
    sparklineScores.length >= 2
      ? sparklineScores[sparklineScores.length - 1] >= sparklineScores[0]
      : true

  const displayOutput = scanResult?.output
    ? privacyMode ? redactSensitiveText(scanResult.output) : scanResult.output
    : ''
  const displayVerdict = posture?.verdict
    ? privacyMode ? redactSensitiveText(posture.verdict) : posture.verdict
    : null

  const score = posture?.overallScore ?? 0
  const grade = posture?.grade ?? '--'
  const accent = gradeColor(grade === '--' ? 'C' : grade)
  const hasScanData = posture || scanResult
  const hasCategories = Boolean(posture && posture.categories.length > 0)
  const hasRecentHistory = postureHistory.length > 0
  const showInsightsRail = hasCategories || hasRecentHistory

  return (
    <div className="h-full flex flex-col gap-3 overflow-y-auto text-sm">
      {/* Header row: grade + verdict + firewall */}
      <div className="flex flex-wrap items-stretch gap-3">
        {/* Grade orb */}
        <div
          className="relative flex flex-col items-center justify-center rounded-md border border-white/10 bg-black/30 px-6 py-4 min-w-[120px]"
          style={{ boxShadow: posture ? `0 0 20px ${accent}18` : undefined }}
        >
          <div className="text-[9px] uppercase tracking-[0.18em] text-gray-500 font-[family-name:var(--helm-font-mono)]">
            Posture
          </div>
          <div
            className="mt-1 text-3xl font-bold font-[family-name:var(--helm-font-mono)]"
            style={{ color: accent }}
          >
            {grade}
          </div>
          <div className="mt-1 text-[11px] text-gray-400 font-[family-name:var(--helm-font-mono)]">
            {posture ? `${score}%` : 'No scan'}
          </div>
          {lastScanTimestamp && (
            <div className="mt-1 text-[9px] text-gray-600">{relativeTime(lastScanTimestamp)}</div>
          )}
        </div>

        {/* Verdict + sparkline */}
        <div className="flex-1 min-w-[200px] rounded-md border border-white/10 bg-black/25 p-3 flex flex-col justify-between">
          <div>
            <div className="text-[9px] uppercase tracking-[0.18em] text-gray-500 font-[family-name:var(--helm-font-mono)]">
              {staffMissing ? 'Staff of Gandalf Not Found' : 'Verdict'}
            </div>
            {staffMissing ? (
              <p className="mt-2 text-xs text-amber-200 leading-relaxed">
                The <span className="font-mono">staff</span> CLI binary is not installed or not in your PATH.
                Security scans require Staff of Gandalf to be available on this machine.
              </p>
            ) : displayVerdict ? (
              <p className="mt-2 text-xs text-gray-200 leading-relaxed">{displayVerdict}</p>
            ) : (
              <p className="mt-2 text-xs text-gray-500">Run a scan to get a security assessment.</p>
            )}
          </div>
          {sparklineScores.length >= 2 && (
            <div className="mt-2 h-8">
              <Sparkline
                data={sparklineScores}
                color={improving ? '#4ade80' : '#f87171'}
                filled
                width={280}
                height={32}
              />
            </div>
          )}
        </div>

        {/* Firewall summary */}
        <div className="rounded-md border border-white/10 bg-black/25 p-3 min-w-[140px]">
          <div className="text-[9px] uppercase tracking-[0.18em] text-gray-500 font-[family-name:var(--helm-font-mono)]">
            Firewall
          </div>
          {firewall && firewall.rules.length > 0 ? (
            <div className="mt-2 space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-xs text-gray-300">{firewall.totalAllowed} allowed</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-rose-400" />
                <span className="text-xs text-gray-300">{firewall.totalBlocked} blocked</span>
              </div>
            </div>
          ) : (
            <div className="mt-2 text-xs text-gray-600">No firewall data</div>
          )}
        </div>
      </div>

      {/* Scan buttons row */}
      <div className="flex flex-wrap gap-2">
        {SCAN_COMMANDS.map((cmd) => {
          const isActive = cmd.command === selectedCommand
          const isRunning = loading && isActive
          return (
            <button
              key={cmd.command}
              type="button"
              onClick={() => { void runScan(cmd.command) }}
              disabled={loading}
              className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium transition-all ${
                isActive
                  ? 'border-white/20 bg-white/8 text-white'
                  : 'border-white/8 bg-black/20 text-gray-400 hover:border-white/14 hover:text-gray-200'
              } disabled:opacity-60 disabled:cursor-not-allowed`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'animate-pulse' : ''}`}
                style={{ background: cmd.color }}
              />
              <span className="font-[family-name:var(--helm-font-mono)] text-[10px] tracking-wider uppercase">
                {cmd.tag}
              </span>
              {cmd.label}
            </button>
          )
        })}
      </div>

      {/* Scan output + insights */}
      <div
        className={`flex-1 min-h-0 grid gap-3 ${
          showInsightsRail ? 'xl:grid-cols-[minmax(0,1.5fr)_minmax(260px,0.72fr)]' : ''
        }`}
      >
        {/* Scan console */}
        <div className="rounded-md border border-white/10 bg-black/25 p-3 flex flex-col min-h-[240px]">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="text-[9px] uppercase tracking-[0.18em] text-gray-500 font-[family-name:var(--helm-font-mono)]">
              Scan Console
            </div>
            {scanResult && (
              <span className={`text-[9px] uppercase tracking-wider font-[family-name:var(--helm-font-mono)] ${
                scanResult.status === 'complete' ? 'text-emerald-400' :
                scanResult.status === 'error' ? 'text-rose-400' :
                scanResult.status === 'running' ? 'text-amber-400' : 'text-gray-500'
              }`}>
                {scanResult.status}
              </span>
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-auto">
            {!hasScanData && !staffMissing && (
              <div className="flex h-full items-center justify-center">
                <div className="max-w-md space-y-3 text-center">
                  <div className="text-sm text-gray-300">Choose a scan to inspect this machine.</div>
                  <div className="text-xs leading-relaxed text-gray-500">
                    Raw CLI output appears here while the scan runs. Parsed category scores and recent grades
                    show up in a smaller insights rail only after HELM has something real to summarize.
                  </div>
                </div>
              </div>
            )}
            {scanResult?.status === 'running' && (
              <div className="flex h-full items-center justify-center">
                <div className="text-xs text-amber-200 font-[family-name:var(--helm-font-mono)] animate-pulse">
                  Running {selectedCommand}...
                </div>
              </div>
            )}
            {(scanResult?.status === 'complete' || scanResult?.status === 'error') && (
              <pre
                className="text-xs leading-relaxed font-[family-name:var(--helm-font-mono)] whitespace-pre-wrap"
                style={{
                  color: scanResult.status === 'error' ? '#fda4af' : '#e8ddf5',
                  overflowWrap: 'anywhere'
                }}
              >
                {displayOutput}
              </pre>
            )}
          </div>
        </div>

        {showInsightsRail && (
          <div className="flex flex-col gap-3 min-h-[200px]">
            {hasCategories && posture ? (
              <div className="rounded-md border border-white/10 bg-black/25 p-3 flex-1">
                <div className="text-[9px] uppercase tracking-[0.18em] text-gray-500 font-[family-name:var(--helm-font-mono)] mb-2">
                  Insights
                </div>
                <div className="space-y-2">
                  {posture.categories.map((cat) => (
                    <div key={cat.name} className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-300 truncate">{cat.name}</span>
                          <span
                            className="font-[family-name:var(--helm-font-mono)] font-semibold"
                            style={{ color: gradeColor(cat.score >= 80 ? 'A' : cat.score >= 60 ? 'C' : 'D') }}
                          >
                            {cat.score}
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 rounded-full bg-black/40 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${cat.score}%`,
                              background: gradeColor(cat.score >= 80 ? 'A' : cat.score >= 60 ? 'C' : 'D')
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {hasRecentHistory && (
              <div className="rounded-md border border-white/10 bg-black/25 p-3">
                <div className="text-[9px] uppercase tracking-[0.18em] text-gray-500 font-[family-name:var(--helm-font-mono)] mb-2">
                  Recent
                </div>
                <div className="space-y-1">
                  {postureHistory.slice(0, 4).map((entry) => (
                    <div key={entry.timestamp} className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">{relativeTime(entry.timestamp)}</span>
                      <span
                        className="font-semibold font-[family-name:var(--helm-font-mono)]"
                        style={{ color: gradeColor(entry.grade) }}
                      >
                        {entry.grade}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
