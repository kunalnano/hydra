import { useVaultStore } from '../stores/vault'

function MetadataPill({ label }: { label: string }): JSX.Element {
  return <span className="vault-meta-pill">{label}</span>
}

function ChunkPlaceholder(): JSX.Element {
  const health = useVaultStore((s) => s.health)
  return (
    <div className="vault-chunk-placeholder">
      <div className="vault-chunk-placeholder-icon">&#x1F50D;</div>
      <div className="vault-chunk-placeholder-title">Select a result</div>
      <p className="vault-chunk-placeholder-desc">
        Click a search result to view the full chunk with metadata.
      </p>
      {health?.online && health.total_chunks && (
        <div className="vault-chunk-placeholder-stats">
          {health.total_chunks.toLocaleString()} chunks indexed
        </div>
      )}
    </div>
  )
}

export function VaultChunkViewer(): JSX.Element {
  const activeChunk = useVaultStore((s) => s.activeChunk)
  const chunkLoading = useVaultStore((s) => s.chunkLoading)
  const closeChunk = useVaultStore((s) => s.closeChunk)

  if (chunkLoading) {
    return (
      <div className="vault-chunk-viewer">
        <div className="vault-empty-state"><span className="vault-spinner" /> Loading chunk...</div>
      </div>
    )
  }

  if (!activeChunk) {
    return (
      <div className="vault-chunk-viewer">
        <ChunkPlaceholder />
      </div>
    )
  }

  return (
    <div className="vault-chunk-viewer">
      <div className="vault-chunk-header">
        <div className="vault-chunk-path">
          <span className="vault-chunk-source">{activeChunk.source_path}</span>
          {activeChunk.heading_path && (
            <>
              <span className="vault-chunk-sep">&gt;</span>
              <span className="vault-chunk-heading">{activeChunk.heading_path}</span>
            </>
          )}
        </div>
        <button type="button" className="vault-chunk-close" onClick={closeChunk} title="Close">x</button>
      </div>

      <div className="vault-chunk-meta-strip">
        {activeChunk.doc_type && <MetadataPill label={activeChunk.doc_type} />}
        {activeChunk.client && <MetadataPill label={activeChunk.client} />}
        {activeChunk.word_count && <MetadataPill label={`${activeChunk.word_count} words`} />}
        {activeChunk.updated_at && <MetadataPill label={`Updated ${activeChunk.updated_at}`} />}
      </div>

      <div className="vault-chunk-body">
        <pre className="vault-chunk-text">{activeChunk.text}</pre>
      </div>

      {(activeChunk.tags.length > 0 || activeChunk.entity_refs.length > 0 || activeChunk.identifiers.length > 0) && (
        <div className="vault-chunk-footer">
          {activeChunk.tags.length > 0 && (
            <div className="vault-chunk-meta-row">
              <span className="vault-chunk-meta-label">Tags</span>
              <div className="vault-chunk-meta-pills">
                {activeChunk.tags.map((tag) => <MetadataPill key={tag} label={`#${tag}`} />)}
              </div>
            </div>
          )}
          {activeChunk.entity_refs.length > 0 && (
            <div className="vault-chunk-meta-row">
              <span className="vault-chunk-meta-label">Entities</span>
              <div className="vault-chunk-meta-pills">
                {activeChunk.entity_refs.map((ref) => <MetadataPill key={ref} label={ref} />)}
              </div>
            </div>
          )}
          {activeChunk.identifiers.length > 0 && (
            <div className="vault-chunk-meta-row">
              <span className="vault-chunk-meta-label">IDs</span>
              <div className="vault-chunk-meta-pills">
                {activeChunk.identifiers.map((id) => <MetadataPill key={id} label={id} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
