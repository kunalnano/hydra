import { useState, useEffect, useCallback } from 'react'
import type { FirewallState, SecurityScanResult, SecurityPosture } from '../../../../shared/types'
import { GaugeArc } from '../components/GaugeArc'
import { DonutChart } from '../components/DonutChart'

const SCAN_COMMANDS = [
  { command: 'survey', description: 'Full security assessment' },
  { command: 'illuminate', description: 'Host discovery (ping sweep)' },
  { command: 'shadowfax', description: 'Fast port scan' },
  { command: 'delve', description: 'Deep vulnerability scan' },
  { command: 'scry', description: 'DNS & domain intelligence' }
]

function gradeColor(grade: string): string {
  const letter = grade.charAt(0).toUpperCase()
  if (letter === 'A' || letter === 'B') return '#4ade80'
  if (letter === 'C') return '#fbbf24'
  return '#f87171'
}

export function SecurityPanel(): JSX.Element {
  const [firewall, setFirewall] = useState<FirewallState | null>(null)
  const [scanResult, setScanResult] = useState<SecurityScanResult | null>(null)
  const [posture, setPosture] = useState<SecurityPosture | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedCommand, setSelectedCommand] = useState<string | null>(null)

  // Fetch firewall rules on mount and subscribe to updates
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

  // Subscribe to scan result updates
  useEffect(() => {
    const unsub = window.hydra.onSecurityScanResult((result) => {
      setScanResult(result)
      if (result.status === 'complete' || result.status === 'error') {
        setLoading(false)
      }
    })
    return unsub
  }, [])

  // Subscribe to posture updates
  useEffect(() => {
    const unsub = window.hydra.onSecurityPosture?.((p) => setPosture(p))
    return unsub
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

  const secondaryCommands = SCAN_COMMANDS.filter((sc) => sc.command !== 'survey')

  return (
    <div className="h-full flex flex-col text-sm gap-3 overflow-y-auto">
      {/* A. Posture Gauge Section — HERO */}
      <div className="flex flex-col items-center pt-1">
        {posture ? (
          <div className="flex items-center gap-4">
            <GaugeArc
              value={posture.overallScore}
              grade={posture.grade}
              color={gradeColor(posture.grade)}
              size={90}
            />
            <div className="flex flex-col gap-0.5">
              <span className="text-lg font-bold" style={{ color: gradeColor(posture.grade) }}>
                {posture.grade}
              </span>
              <span className="text-xs text-gray-400 italic max-w-[180px]">{posture.verdict}</span>
            </div>
          </div>
        ) : (
          <div className="text-xs text-gray-600 py-4">
            Run a survey to see your security posture
          </div>
        )}
      </div>

      {/* B. Category Bars */}
      {posture && posture.categories.length > 0 && (
        <div className="flex flex-col gap-1.5 px-1">
          {posture.categories.map((cat) => (
            <div key={cat.name} className="flex items-center gap-2 text-xs">
              <span className="w-28 text-gray-400 truncate">{cat.name}</span>
              <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    cat.score >= 80
                      ? 'bg-green-500'
                      : cat.score >= 60
                        ? 'bg-amber-500'
                        : 'bg-red-500'
                  }`}
                  style={{ width: `${cat.score}%` }}
                />
              </div>
              <span className="w-8 text-right text-gray-500 font-mono">{cat.score}</span>
            </div>
          ))}
        </div>
      )}

      {/* C. Firewall Summary — compact */}
      <div className="px-1">
        {firewall && firewall.rules.length > 0 ? (
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <DonutChart
              segments={[
                { value: firewall.totalAllowed, color: '#4ade80', label: 'Allowed' },
                { value: firewall.totalBlocked, color: '#f87171', label: 'Blocked' }
              ]}
              size={40}
            />
            <span>
              <span className="text-green-400 font-mono font-medium">{firewall.totalAllowed}</span>{' '}
              allowed /{' '}
              <span className="text-red-400 font-mono font-medium">{firewall.totalBlocked}</span>{' '}
              blocked
            </span>
          </div>
        ) : (
          <div className="text-xs text-gray-600">Firewall rules not available</div>
        )}
      </div>

      {/* D. Scan Controls */}
      <div className="flex flex-col gap-2 px-1">
        {/* Primary: Scan Home Network */}
        <button
          onClick={() => runScan('survey')}
          disabled={loading}
          className={`w-full py-1.5 text-xs font-medium rounded transition-colors disabled:cursor-not-allowed ${
            loading && selectedCommand === 'survey'
              ? 'bg-blue-800 text-blue-200'
              : 'bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50'
          }`}
        >
          {loading && selectedCommand === 'survey' ? (
            <span className="inline-flex items-center gap-1.5">
              <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Scanning...
            </span>
          ) : (
            'Scan Home Network'
          )}
        </button>

        {/* Secondary: pill buttons for individual commands */}
        <div className="flex flex-wrap gap-1.5">
          {secondaryCommands.map((sc) => {
            const isActive = loading && selectedCommand === sc.command
            return (
              <button
                key={sc.command}
                onClick={() => runScan(sc.command)}
                disabled={loading}
                title={sc.description}
                className={`px-2 py-0.5 text-xs rounded-full border transition-colors disabled:cursor-not-allowed ${
                  isActive
                    ? 'bg-amber-900/50 border-amber-700 text-amber-300'
                    : 'bg-gray-800 hover:bg-gray-700 text-gray-300 border-gray-700 disabled:opacity-50'
                }`}
              >
                {isActive && (
                  <span className="inline-block w-3 h-3 mr-1 align-middle">
                    <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                  </span>
                )}
                {sc.command}
              </button>
            )
          })}
        </div>
      </div>

      {/* E. Results Area — scrollable terminal */}
      <div className="flex-1 min-h-0 px-1">
        {!scanResult && !posture && (
          <div className="text-gray-600 text-xs flex items-center justify-center h-full">
            Run a security scan using Staff of Gandalf
          </div>
        )}

        {scanResult?.status === 'running' && (
          <div className="text-amber-400 text-xs animate-pulse">
            Running {scanResult.command}...
          </div>
        )}

        {scanResult?.status === 'complete' && (
          <pre className="bg-gray-950 text-green-400 font-mono text-xs p-2 rounded overflow-y-auto max-h-[200px] whitespace-pre-wrap">
            {scanResult.output}
          </pre>
        )}

        {scanResult?.status === 'error' && (
          <div className="text-red-400 text-xs">{scanResult.output}</div>
        )}
      </div>
    </div>
  )
}
