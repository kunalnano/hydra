import { useState, useEffect, useCallback } from 'react'
import type { FirewallState, SecurityScanResult } from '../../../../shared/types'

const SCAN_COMMANDS = [
  { command: 'survey', description: 'Network reconnaissance survey' },
  { command: 'illuminate', description: 'Port & service illumination' },
  { command: 'shadowfax', description: 'Quick network speed analysis' },
  { command: 'delve', description: 'Deep vulnerability assessment' },
  { command: 'scry', description: 'DNS & domain intelligence' }
]

export function SecurityPanel(): JSX.Element {
  const [firewall, setFirewall] = useState<FirewallState | null>(null)
  const [scanResult, setScanResult] = useState<SecurityScanResult | null>(null)
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

  // Subscribe to scan result updates (for streaming/real-time results)
  useEffect(() => {
    const unsub = window.hydra.onSecurityScanResult((result) => {
      setScanResult(result)
      if (result.status === 'complete' || result.status === 'error') {
        setLoading(false)
      }
    })
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

  return (
    <div className="h-full flex flex-col text-sm">
      {/* Section 1: Firewall Summary */}
      <div className="pb-2 mb-2 border-b border-gray-800">
        {firewall && firewall.rules.length > 0 ? (
          <div className="text-xs text-gray-400">
            LuLu Firewall:{' '}
            <span className="text-green-400 font-mono font-medium">{firewall.totalAllowed}</span>{' '}
            allowed /{' '}
            <span className="text-red-400 font-mono font-medium">{firewall.totalBlocked}</span>{' '}
            blocked
          </div>
        ) : (
          <div className="text-xs text-gray-600">Firewall rules not available</div>
        )}
      </div>

      {/* Section 2: Security Scan */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Scan command buttons */}
        <div className="flex flex-wrap gap-1.5 pb-2">
          {SCAN_COMMANDS.map((sc) => {
            const isActive = loading && selectedCommand === sc.command
            return (
              <button
                key={sc.command}
                onClick={() => runScan(sc.command)}
                disabled={loading}
                title={sc.description}
                className={`px-2 py-0.5 text-xs rounded border transition-colors disabled:cursor-not-allowed ${
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

        {/* Scan results area */}
        <div className="flex-1 min-h-0">
          {!scanResult && (
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
    </div>
  )
}
