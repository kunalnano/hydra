import { useVaultStore } from '../stores/vault'

const DOC_TYPES = [
  { value: '', label: 'All types' },
  { value: 'note', label: 'Note' },
  { value: 'daily', label: 'Daily' },
  { value: 'client-context', label: 'Client Context' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'template', label: 'Template' },
  { value: 'project', label: 'Project' }
]

export function VaultSearchBar(): JSX.Element {
  const query = useVaultStore((s) => s.query)
  const setQuery = useVaultStore((s) => s.setQuery)
  const filters = useVaultStore((s) => s.filters)
  const setFilters = useVaultStore((s) => s.setFilters)
  const search = useVaultStore((s) => s.search)
  const searching = useVaultStore((s) => s.searching)
  const health = useVaultStore((s) => s.health)
  const online = health?.online ?? false

  return (
    <div className="vault-search-bar">
      <div className="vault-search-row">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void search() }}
          placeholder="Search your vault..."
          className="vault-search-input"
          disabled={!online}
        />
        <button
          type="button"
          className="vault-action-btn vault-action-btn--primary"
          onClick={() => void search()}
          disabled={searching || !query.trim() || !online}
        >
          {searching ? <span className="vault-spinner" /> : 'Search'}
        </button>
      </div>

      <div className="vault-filter-row">
        <select
          value={filters.doc_type ?? ''}
          onChange={(e) => setFilters({ doc_type: e.target.value || undefined })}
          className="vault-filter-select"
          disabled={!online}
        >
          {DOC_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>

        <input
          type="text"
          value={filters.client ?? ''}
          onChange={(e) => setFilters({ client: e.target.value || undefined })}
          placeholder="Client filter"
          className="vault-filter-input"
          disabled={!online}
        />

        <label className="vault-topk-label">
          <span className="vault-topk-text">top_k</span>
          <input
            type="number"
            min={1}
            max={20}
            value={filters.top_k}
            onChange={(e) => setFilters({ top_k: Math.max(1, Math.min(20, Number(e.target.value) || 8)) })}
            className="vault-topk-input"
            disabled={!online}
          />
        </label>
      </div>
    </div>
  )
}
