import { useVaultStore } from '../stores/vault'

function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'never'
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function VaultStatusBar(): JSX.Element {
  const health = useVaultStore((s) => s.health)
  const reindexing = useVaultStore((s) => s.reindexing)
  const pulling = useVaultStore((s) => s.pulling)
  const triggerReindex = useVaultStore((s) => s.triggerReindex)
  const pullSync = useVaultStore((s) => s.pullSync)
  const setPushModalOpen = useVaultStore((s) => s.setPushModalOpen)
  const lastOperation = useVaultStore((s) => s.lastOperation)

  const online = health?.online ?? false
  const chunks = health?.total_chunks ?? null
  const lastReindex = health?.last_reindex ?? null

  return (
    <div className="vault-status-bar">
      <div className="vault-status-left">
        <span className={`vault-health-dot ${online ? 'vault-health-dot--online' : 'vault-health-dot--offline'}`} />
        <span className="vault-status-label">
          {online ? 'Online' : 'Offline'}
        </span>
        {health?.endpoint && (
          <span className="vault-status-endpoint">{health.endpoint}</span>
        )}
        <span className="vault-status-divider" />
        <span className="vault-status-stat">
          {chunks !== null ? `${chunks.toLocaleString()} chunks` : 'No data'}
        </span>
        <span className="vault-status-divider" />
        <span className="vault-status-stat">
          Last reindex: {formatRelativeTime(lastReindex)}
        </span>
      </div>

      <div className="vault-status-right">
        {lastOperation && Date.now() - lastOperation.timestamp < 8000 && (
          <span className={`vault-toast ${lastOperation.success ? 'vault-toast--success' : 'vault-toast--error'}`}>
            {lastOperation.message}
          </span>
        )}

        <button
          type="button"
          className="vault-action-btn"
          onClick={() => void pullSync()}
          disabled={pulling || !online}
          title={online ? 'Pull latest from git and reindex' : 'Vault offline'}
        >
          {pulling ? (
            <span className="vault-spinner" />
          ) : (
            <span>Pull Sync</span>
          )}
        </button>

        <button
          type="button"
          className="vault-action-btn"
          onClick={() => void triggerReindex()}
          disabled={reindexing || !online}
          title={online ? 'Trigger full reindex' : 'Vault offline'}
        >
          {reindexing ? (
            <span className="vault-spinner" />
          ) : (
            <span>Reindex</span>
          )}
        </button>

        <button
          type="button"
          className="vault-action-btn vault-action-btn--primary"
          onClick={() => setPushModalOpen(true)}
          title="Push a new note to the vault"
        >
          + Push Note
        </button>
      </div>
    </div>
  )
}
