import { useState, useEffect, useCallback, useMemo } from 'react'
import type {
  FirewallState,
  SecurityScanResult,
  SecurityPosture,
  PostureHistoryEntry
} from '../../../shared/types'
import { GaugeArc } from '../components/GaugeArc'
import { DonutChart } from '../components/DonutChart'
import { Sparkline } from '../components/Sparkline'
import { redactSensitiveText, usePrivacyStore } from '../stores/privacy'

const SCAN_COMMANDS = [
  {
    command: 'survey',
    label: 'Survey',
    deckId: 'ST-01',
    description: 'Full security assessment across the local posture surface.',
    accent: 'from-emerald-300/24 via-emerald-200/10 to-transparent',
    border: 'border-emerald-300/20',
    text: 'text-emerald-100'
  },
  {
    command: 'illuminate',
    label: 'Illuminate',
    deckId: 'ST-02',
    description: 'Host discovery pass for the surrounding network.',
    accent: 'from-amber-200/26 via-orange-200/10 to-transparent',
    border: 'border-amber-300/20',
    text: 'text-amber-100'
  },
  {
    command: 'shadowfax',
    label: 'Shadowfax',
    deckId: 'ST-03',
    description: 'Fast listener sweep tuned for quick route checks.',
    accent: 'from-sky-300/24 via-cyan-200/10 to-transparent',
    border: 'border-sky-300/20',
    text: 'text-sky-100'
  },
  {
    command: 'delve',
    label: 'Delve',
    deckId: 'ST-04',
    description: 'Deeper vulnerability probing when the surface looks unstable.',
    accent: 'from-rose-300/24 via-orange-200/10 to-transparent',
    border: 'border-rose-300/20',
    text: 'text-rose-100'
  },
  {
    command: 'scry',
    label: 'Scry',
    deckId: 'ST-05',
    description: 'External DNS and domain intelligence pass.',
    accent: 'from-violet-300/24 via-fuchsia-200/10 to-transparent',
    border: 'border-violet-300/20',
    text: 'text-violet-100'
  }
] as const

function gradeColor(grade: string): string {
  const letter = grade.charAt(0).toUpperCase()
  if (letter === 'A' || letter === 'B') return '#4ade80'
  if (letter === 'C') return '#fbbf24'
  return '#f87171'
}

function scoreTone(score: number): {
  bar: string
  text: string
  border: string
} {
  if (score >= 80) {
    return {
      bar: 'from-emerald-300 to-lime-200',
      text: 'text-emerald-100',
      border: 'border-emerald-300/20'
    }
  }
  if (score >= 60) {
    return {
      bar: 'from-amber-200 to-orange-200',
      text: 'text-amber-100',
      border: 'border-amber-300/20'
    }
  }
  return {
    bar: 'from-rose-300 to-orange-200',
    text: 'text-rose-100',
    border: 'border-rose-300/20'
  }
}

function StaffIcon({ size = 20 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M10 3.5V18" stroke="#ffd280" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="10" cy="3.5" r="2.6" fill="rgba(255,210,128,0.2)" stroke="#ffd280" strokeWidth="0.9" />
      <circle cx="10" cy="3.5" r="1.15" fill="#fff1c7" />
      <path d="M7.4 6.5c1.5 0.6 3.7 0.6 5.2 0" stroke="rgba(255,210,128,0.6)" strokeWidth="0.8" strokeLinecap="round" />
    </svg>
  )
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

function SecurityOrb({
  posture,
  loading,
  activeCommand
}: {
  posture: SecurityPosture | null
  loading: boolean
  activeCommand: string | null
}): JSX.Element {
  const score = posture?.overallScore ?? 0
  const grade = posture?.grade ?? '--'
  const accent = gradeColor(grade === '--' ? 'C' : grade)

  return (
    <div className="relative flex h-[220px] items-center justify-center overflow-hidden rounded-[4px] border border-amber-200/10 bg-black/35">
      <div
        className={`absolute inset-4 rounded-full border border-white/8 ${loading ? 'animate-pulse' : ''}`}
        style={{ boxShadow: `0 0 30px ${accent}22` }}
      />
      <div className="absolute inset-10 rounded-full border border-white/6" />
      <div className="absolute inset-[3.4rem] rounded-full border border-white/6" />
      <div
        className="absolute h-28 w-28 rounded-full blur-2xl"
        style={{ background: `radial-gradient(circle, ${accent}55 0%, transparent 72%)` }}
      />
      <div className="absolute top-6 left-6 rounded-[4px] border border-white/10 bg-black/55 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-amber-100 font-[family-name:var(--hydra-font-mono)]">
        Staff Relay
      </div>
      <div className="absolute right-6 top-6 rounded-[4px] border border-white/10 bg-black/55 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-gray-400 font-[family-name:var(--hydra-font-mono)]">
        {loading ? `Casting ${activeCommand ?? 'survey'}` : 'Ward Stable'}
      </div>
      <div className="relative z-10 flex flex-col items-center gap-1 text-center">
        <StaffIcon size={28} />
        <div className="mt-1 text-[11px] uppercase tracking-[0.22em] text-gray-500 font-[family-name:var(--hydra-font-mono)]">
          Orbiter
        </div>
        <div
          className="text-4xl font-semibold font-[family-name:var(--hydra-font-mono)]"
          style={{ color: accent }}
        >
          {grade}
        </div>
        <div className="text-xs text-gray-300 font-[family-name:var(--hydra-font-mono)]">
          {posture ? `${score}% posture` : 'Awaiting first scan'}
        </div>
      </div>
      <div
        className="absolute bottom-0 left-1/2 h-14 w-px -translate-x-1/2"
        style={{ background: `linear-gradient(180deg, transparent, ${accent})` }}
      />
    </div>
  )
}

function SecurityMetric({
  label,
  value,
  detail,
  tone = 'text-gray-100'
}: {
  label: string
  value: string
  detail: string
  tone?: string
}): JSX.Element {
  return (
    <div className="rounded-[4px] border border-white/10 bg-black/30 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.18em] text-gray-500 font-[family-name:var(--hydra-font-mono)]">
        {label}
      </div>
      <div className={`mt-1 text-lg font-semibold font-[family-name:var(--hydra-font-mono)] ${tone}`}>
        {value}
      </div>
      <div className="mt-1 text-[11px] text-gray-400">{detail}</div>
    </div>
  )
}

function ScanDeckCard({
  meta,
  active,
  loading,
  onClick
}: {
  meta: (typeof SCAN_COMMANDS)[number]
  active: boolean
  loading: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={`group relative overflow-hidden rounded-[4px] border bg-black/25 p-3 text-left transition-all ${
        active
          ? `${meta.border} -translate-y-0.5 shadow-[0_16px_40px_rgba(0,0,0,0.35)]`
          : 'border-white/10 hover:-translate-y-0.5 hover:border-white/16'
      } disabled:cursor-not-allowed disabled:opacity-70`}
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${meta.accent} opacity-70`} />
      <div className="relative z-10">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-gray-500 font-[family-name:var(--hydra-font-mono)]">
              {meta.deckId}
            </div>
            <div className={`mt-1 text-sm font-semibold ${active ? meta.text : 'text-white'}`}>
              {meta.label}
            </div>
          </div>
          <div className="rounded-[4px] border border-white/10 bg-black/40 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-gray-300 font-[family-name:var(--hydra-font-mono)]">
            {loading && active ? 'Casting' : 'Ready'}
          </div>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-gray-300">{meta.description}</p>
      </div>
    </button>
  )
}

function CategoryCard({
  name,
  score,
  summary
}: {
  name: string
  score: number
  summary: string
}): JSX.Element {
  const tone = scoreTone(score)

  return (
    <div className={`rounded-[4px] border bg-black/25 p-3 ${tone.border}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-gray-500 font-[family-name:var(--hydra-font-mono)]">
            {name}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-gray-300">{summary}</p>
        </div>
        <div className={`text-lg font-semibold font-[family-name:var(--hydra-font-mono)] ${tone.text}`}>
          {score}
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/40">
        <div className={`h-full rounded-full bg-gradient-to-r ${tone.bar}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  )
}

function FirewallLedger({ firewall }: { firewall: FirewallState | null }): JSX.Element {
  if (!firewall || firewall.rules.length === 0) {
    return (
      <div className="rounded-[4px] border border-white/10 bg-black/30 p-3 text-xs text-gray-500">
        Firewall rules are not available in this session.
      </div>
    )
  }

  return (
    <div className="rounded-[4px] border border-white/10 bg-black/30 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-gray-500 font-[family-name:var(--hydra-font-mono)]">
            Firewall Ledger
          </div>
          <div className="mt-1 text-xs text-gray-300">
            LuLu state summarized into allow versus block pressure.
          </div>
        </div>
        <DonutChart
          segments={[
            { value: firewall.totalAllowed, color: '#4ade80', label: 'Allowed' },
            { value: firewall.totalBlocked, color: '#f87171', label: 'Blocked' }
          ]}
          size={64}
        />
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <SecurityMetric
          label="Allowed"
          value={`${firewall.totalAllowed}`}
          detail="Permitted rules"
          tone="text-emerald-100"
        />
        <SecurityMetric
          label="Blocked"
          value={`${firewall.totalBlocked}`}
          detail="Denied rules"
          tone="text-rose-100"
        />
      </div>
    </div>
  )
}

export function SecurityPanel(): JSX.Element {
  const privacyMode = usePrivacyStore((s) => s.privacyMode)
  const [firewall, setFirewall] = useState<FirewallState | null>(null)
  const [scanResult, setScanResult] = useState<SecurityScanResult | null>(null)
  const [posture, setPosture] = useState<SecurityPosture | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedCommand, setSelectedCommand] = useState<string | null>(null)
  const [postureHistory, setPostureHistory] = useState<PostureHistoryEntry[]>([])
  const [lastScanTimestamp, setLastScanTimestamp] = useState<number | null>(null)

  useEffect(() => {
    window.hydra
      .getFirewallRules()
      .then(setFirewall)
      .catch(() => {})
    const unsub = window.hydra.onFirewallState((state) => {
      setFirewall(state)
    })
    return unsub
  }, [])

  useEffect(() => {
    const unsub = window.hydra.onSecurityScanResult((result) => {
      setScanResult(result)
      setSelectedCommand(result.command)
      if (result.status === 'complete' || result.status === 'error') {
        setLoading(false)
      }
    })
    return unsub
  }, [])

  useEffect(() => {
    const unsub = window.hydra.onSecurityPosture?.((nextPosture) => {
      setPosture(nextPosture)
      setLastScanTimestamp(Date.now())
      window.hydra
        .queryPostureHistory(10)
        .then(setPostureHistory)
        .catch(() => {})
    })
    return unsub
  }, [])

  useEffect(() => {
    window.hydra
      .queryPostureHistory(10)
      .then((history) => {
        setPostureHistory(history)
        if (history.length > 0) {
          setLastScanTimestamp(history[0].timestamp)
        }
      })
      .catch(() => {})
  }, [])

  const runScan = useCallback(async (command: string): Promise<void> => {
    setLoading(true)
    setSelectedCommand(command)
    setScanResult({ id: '', command, output: '', timestamp: Date.now(), status: 'running' })
    try {
      const result = await window.hydra.requestSecurityScan(command)
      setScanResult(result)
    } catch (err) {
      setScanResult({
        id: '',
        command,
        output: err instanceof Error ? err.message : 'Scan failed',
        timestamp: Date.now(),
        status: 'error'
      })
    } finally {
      setLoading(false)
    }
  }, [])

  const activeCommand =
    SCAN_COMMANDS.find((item) => item.command === (selectedCommand ?? scanResult?.command)) ?? SCAN_COMMANDS[0]
  const trendDelta =
    postureHistory.length >= 2 && posture ? posture.overallScore - postureHistory[1].score : null
  const sparklineScores = useMemo(
    () =>
      postureHistory
        .slice()
        .reverse()
        .map((entry) => entry.score),
    [postureHistory]
  )
  const improving =
    sparklineScores.length >= 2
      ? sparklineScores[sparklineScores.length - 1] >= sparklineScores[0]
      : true
  const displayScanOutput = scanResult?.output
    ? privacyMode
      ? redactSensitiveText(scanResult.output)
      : scanResult.output
    : ''
  const displayVerdict = posture?.verdict
    ? privacyMode
      ? redactSensitiveText(posture.verdict)
      : posture.verdict
    : 'Run a security pass to light the staff.'

  return (
    <div className="h-full flex flex-col gap-4 overflow-y-auto text-sm">
      <div className="relative overflow-hidden rounded-[4px] border border-amber-300/14 bg-[radial-gradient(circle_at_top_left,rgba(255,210,128,0.14),transparent_34%),linear-gradient(180deg,rgba(18,14,6,0.94),rgba(6,5,3,0.98))] p-4">
        <div className="pointer-events-none absolute inset-0 opacity-35">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/35 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 h-20 bg-[radial-gradient(circle_at_center,rgba(255,210,128,0.12),transparent_70%)]" />
        </div>
        <div className="relative">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-gray-500 font-[family-name:var(--hydra-font-mono)]">
                Security Theater
              </div>
              <h3 className="mt-1 text-lg font-semibold text-amber-100">Staff of Gandalf</h3>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-gray-300">
                Live posture deck for scans, firewall pressure, and the current security verdict.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-[4px] border border-white/10 bg-black/35 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-gray-400 font-[family-name:var(--hydra-font-mono)]">
                {activeCommand.deckId}
              </span>
              {privacyMode && (
                <span className="rounded-[4px] border border-emerald-300/20 bg-emerald-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-emerald-100 font-[family-name:var(--hydra-font-mono)]">
                  Secure View
                </span>
              )}
              {lastScanTimestamp && (
                <span className="rounded-[4px] border border-white/10 bg-black/35 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-gray-400 font-[family-name:var(--hydra-font-mono)]">
                  Last scan {relativeTime(lastScanTimestamp)}
                </span>
              )}
            </div>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)_260px]">
            <SecurityOrb posture={posture} loading={loading} activeCommand={selectedCommand} />

            <div className="space-y-3">
              <div className="rounded-[4px] border border-white/10 bg-black/28 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-gray-500 font-[family-name:var(--hydra-font-mono)]">
                      Gandalf says
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-amber-50">{displayVerdict}</p>
                  </div>
                  {trendDelta !== null && (
                    <div
                      className={`rounded-[4px] border px-2 py-1 text-xs font-[family-name:var(--hydra-font-mono)] ${
                        trendDelta > 0
                          ? 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100'
                          : trendDelta < 0
                            ? 'border-rose-300/20 bg-rose-500/10 text-rose-100'
                            : 'border-white/10 bg-black/30 text-gray-300'
                      }`}
                    >
                      {trendDelta > 0 ? '+' : ''}
                      {trendDelta} trend
                    </div>
                  )}
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <SecurityMetric
                  label="Focused Spell"
                  value={activeCommand.label}
                  detail="Selected scan routine"
                  tone={activeCommand.text}
                />
                <SecurityMetric
                  label="Posture"
                  value={posture ? `${posture.overallScore}%` : '--'}
                  detail={posture ? `${posture.grade} grade` : 'No scan yet'}
                  tone={posture ? scoreTone(posture.overallScore).text : 'text-gray-100'}
                />
                <SecurityMetric
                  label="Firewall"
                  value={
                    firewall ? `${firewall.totalAllowed}/${firewall.totalBlocked}` : '--'
                  }
                  detail="Allow / block ledger"
                  tone="text-amber-100"
                />
                <SecurityMetric
                  label="History"
                  value={`${postureHistory.length}`}
                  detail="Stored posture snapshots"
                  tone="text-sky-100"
                />
              </div>

              <div className="rounded-[4px] border border-white/10 bg-black/28 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-gray-500 font-[family-name:var(--hydra-font-mono)]">
                      Posture Wave
                    </div>
                    <div className="mt-1 text-xs text-gray-300">
                      Ten most recent grades rendered as a live security horizon.
                    </div>
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.18em] font-[family-name:var(--hydra-font-mono)] text-gray-500">
                    {improving ? 'Improving' : 'Softening'}
                  </div>
                </div>
                <div className="mt-3 h-16">
                  {sparklineScores.length >= 2 ? (
                    <Sparkline
                      data={sparklineScores}
                      color={improving ? '#4ade80' : '#f87171'}
                      filled={true}
                      width={360}
                      height={64}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center rounded-[4px] border border-white/10 bg-black/30 text-xs text-gray-500">
                      Run a few scans to form the wave.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-3">
              <div className="rounded-[4px] border border-white/10 bg-black/30 p-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-gray-500 font-[family-name:var(--hydra-font-mono)]">
                  Grade Arc
                </div>
                <div className="mt-3 flex items-center justify-center">
                  {posture ? (
                    <GaugeArc
                      value={posture.overallScore}
                      grade={posture.grade}
                      color={gradeColor(posture.grade)}
                      size={132}
                    />
                  ) : (
                    <div className="flex h-[132px] w-[132px] items-center justify-center rounded-full border border-white/10 bg-black/35 text-xs text-gray-500">
                      Awaiting scan
                    </div>
                  )}
                </div>
              </div>

              <FirewallLedger firewall={firewall} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-2 xl:grid-cols-5">
        {SCAN_COMMANDS.map((meta) => (
          <ScanDeckCard
            key={meta.command}
            meta={meta}
            active={meta.command === (selectedCommand ?? scanResult?.command ?? 'survey')}
            loading={loading}
            onClick={() => runScan(meta.command)}
          />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="space-y-4">
          <div className="rounded-[4px] border border-white/10 bg-black/25 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-gray-500 font-[family-name:var(--hydra-font-mono)]">
                  Risk Lattice
                </div>
                <div className="mt-1 text-xs text-gray-300">
                  Category-by-category breakdown from the most recent Staff pass.
                </div>
              </div>
              <StaffIcon size={18} />
            </div>

            {posture && posture.categories.length > 0 ? (
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {posture.categories.map((category) => (
                  <CategoryCard
                    key={category.name}
                    name={category.name}
                    score={category.score}
                    summary={privacyMode ? redactSensitiveText(category.summary) : category.summary}
                  />
                ))}
              </div>
            ) : (
              <div className="mt-3 flex min-h-[180px] items-center justify-center rounded-[4px] border border-dashed border-white/10 bg-black/25 text-xs text-gray-500">
                Survey the machine to light the lattice.
              </div>
            )}
          </div>

          <div className="rounded-[4px] border border-white/10 bg-black/25 p-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-gray-500 font-[family-name:var(--hydra-font-mono)]">
              Recent Grades
            </div>
            <div className="mt-3 space-y-2">
              {postureHistory.length > 0 ? (
                postureHistory.slice(0, 5).map((entry) => (
                  <div
                    key={entry.timestamp}
                    className="flex items-center justify-between gap-3 rounded-[4px] border border-white/10 bg-black/28 px-3 py-2"
                  >
                    <div className="text-xs text-gray-300">{relativeTime(entry.timestamp)}</div>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-gray-500 font-[family-name:var(--hydra-font-mono)]">
                      {privacyMode ? redactSensitiveText(entry.verdict) : entry.verdict}
                    </div>
                    <div
                      className="text-sm font-semibold font-[family-name:var(--hydra-font-mono)]"
                      style={{ color: gradeColor(entry.grade) }}
                    >
                      {entry.grade}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-[4px] border border-dashed border-white/10 bg-black/25 px-3 py-6 text-xs text-gray-500">
                  Posture history will appear here after the first completed scan.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-[4px] border border-white/10 bg-black/25 p-3 min-h-[360px] flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-gray-500 font-[family-name:var(--hydra-font-mono)]">
                Scan Terminal
              </div>
              <div className="mt-1 text-xs text-gray-300">
                Raw Staff output rendered in a contained operator console.
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-[4px] border border-white/10 bg-black/35 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-gray-400 font-[family-name:var(--hydra-font-mono)]">
                {scanResult?.command ?? activeCommand.command}
              </span>
              {privacyMode && (
                <span className="rounded-[4px] border border-emerald-300/20 bg-emerald-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-emerald-100 font-[family-name:var(--hydra-font-mono)]">
                  Redacted Output
                </span>
              )}
            </div>
          </div>

          <div className="mt-3 flex-1 min-h-0">
            {!scanResult && !posture && (
              <div className="flex h-full items-center justify-center rounded-[4px] border border-dashed border-white/10 bg-black/25 text-xs text-gray-500">
                Run a scan to populate the terminal and posture deck.
              </div>
            )}

            {scanResult?.status === 'running' && (
              <div className="flex h-full items-center justify-center rounded-[4px] border border-amber-300/14 bg-black/35">
                <div className="text-center">
                  <div className="text-sm font-semibold text-amber-100 font-[family-name:var(--hydra-font-mono)]">
                    Casting {scanResult.command}
                  </div>
                  <div className="mt-2 text-xs text-gray-400">
                    Staff of Gandalf is tracing the machine.
                  </div>
                </div>
              </div>
            )}

            {scanResult?.status === 'complete' && (
              <pre
                className="h-full overflow-auto rounded-[4px] border border-amber-300/12 bg-[#050401] p-3 text-xs text-amber-100 font-[family-name:var(--hydra-font-mono)] whitespace-pre-wrap"
                style={{ overflowWrap: 'anywhere' }}
              >
                {displayScanOutput}
              </pre>
            )}

            {scanResult?.status === 'error' && (
              <div className="rounded-[4px] border border-rose-300/18 bg-rose-500/10 p-3 text-xs text-rose-100">
                {displayScanOutput}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
