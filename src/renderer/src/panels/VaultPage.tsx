import { useEffect, useRef } from 'react'
import { useVaultStore } from '../stores/vault'
import { VaultStatusBar } from './VaultStatusBar'
import { VaultSearchBar } from './VaultSearchBar'
import { VaultResultsList } from './VaultResultsList'
import { VaultChunkViewer } from './VaultChunkViewer'
import { VaultPushModal } from './VaultPushModal'

export function VaultPagePanel(): JSX.Element {
  const checkHealth = useVaultStore((s) => s.checkHealth)
  const health = useVaultStore((s) => s.health)
  const healthTimerRef = useRef<number | null>(null)

  // Health check on mount and every 30s
  useEffect(() => {
    void checkHealth()
    healthTimerRef.current = window.setInterval(() => void checkHealth(), 30000)
    return () => {
      if (healthTimerRef.current) window.clearInterval(healthTimerRef.current)
    }
  }, [checkHealth])

  const offline = health !== null && !health.online

  return (
    <div className="vault-page">
      <VaultStatusBar />

      {offline ? (
        <div className="vault-offline-state">
          <div className="vault-offline-icon">&#x26A0;</div>
          <h3 className="vault-offline-title">Vault RAG Server Unavailable</h3>
          <p className="vault-offline-desc">
            Could not reach {health?.endpoint ?? 'the server'}.
            {health?.error && <><br />{health.error}</>}
          </p>
          <p className="vault-offline-hint">
            Push Note and Pull Sync still work in local-only mode.
          </p>
          <button
            type="button"
            className="vault-action-btn vault-action-btn--primary"
            onClick={() => void checkHealth()}
          >
            Retry Connection
          </button>
        </div>
      ) : (
        <>
          <VaultSearchBar />
          <div className="vault-split-view">
            <VaultResultsList />
            <VaultChunkViewer />
          </div>
        </>
      )}

      <VaultPushModal />
    </div>
  )
}
