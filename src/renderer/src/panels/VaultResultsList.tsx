import type { VaultSearchResult } from '../stores/vault'
import { useVaultStore } from '../stores/vault'

function MatchedInDot({ matched }: { matched: 'dense' | 'sparse' | 'both' }): JSX.Element {
  const colors: Record<string, string> = {
    dense: 'vault-match--dense',
    sparse: 'vault-match--sparse',
    both: 'vault-match--both'
  }
  return (
    <span className={`vault-match-dot ${colors[matched] ?? ''}`} title={`Matched in: ${matched}`} />
  )
}

function DocTypeBadge({ docType }: { docType: string | null }): JSX.Element | null {
  if (!docType) return null
  const badgeClass: Record<string, string> = {
    'client-context': 'vault-doctype--client',
    meeting: 'vault-doctype--meeting',
    note: 'vault-doctype--note',
    daily: 'vault-doctype--daily',
    template: 'vault-doctype--template',
    project: 'vault-doctype--project'
  }
  return (
    <span className={`vault-doctype-badge ${badgeClass[docType] ?? ''}`}>
      {docType}
    </span>
  )
}

function ResultCard({ result, active, onClick }: {
  result: VaultSearchResult
  active: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button
      type="button"
      className={`vault-result-card ${active ? 'vault-result-card--active' : ''}`}
      onClick={onClick}
    >
      <div className="vault-result-header">
        <MatchedInDot matched={result.matched_in} />
        <span className="vault-result-score">{result.fused_score.toFixed(3)}</span>
        <DocTypeBadge docType={result.doc_type} />
        {result.client && <span className="vault-result-client">{result.client}</span>}
      </div>

      <p className="vault-result-snippet">{result.snippet}</p>

      <div className="vault-result-path">
        <span className="vault-result-source">{result.source_path}</span>
        {result.heading_path && (
          <>
            <span className="vault-result-sep">&gt;</span>
            <span className="vault-result-heading">{result.heading_path}</span>
          </>
        )}
      </div>
    </button>
  )
}

export function VaultResultsList(): JSX.Element {
  const results = useVaultStore((s) => s.results)
  const searching = useVaultStore((s) => s.searching)
  const query = useVaultStore((s) => s.query)
  const activeChunk = useVaultStore((s) => s.activeChunk)
  const openChunk = useVaultStore((s) => s.openChunk)
  const lastSearchTime = useVaultStore((s) => s.lastSearchTime)

  if (searching) {
    return (
      <div className="vault-results-list">
        <div className="vault-empty-state">
          <span className="vault-spinner" /> Searching...
        </div>
      </div>
    )
  }

  if (lastSearchTime && results.length === 0) {
    return (
      <div className="vault-results-list">
        <div className="vault-empty-state">
          No results for &ldquo;{query}&rdquo;. Try broader terms or remove filters.
        </div>
      </div>
    )
  }

  if (results.length === 0) {
    return (
      <div className="vault-results-list">
        <div className="vault-empty-state">
          Search your vault to see results here.
        </div>
      </div>
    )
  }

  return (
    <div className="vault-results-list">
      {results.map((result) => (
        <ResultCard
          key={result.chunk_id}
          result={result}
          active={activeChunk?.chunk_id === result.chunk_id}
          onClick={() => void openChunk(result.chunk_id)}
        />
      ))}
    </div>
  )
}
