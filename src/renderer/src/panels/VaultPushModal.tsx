import { useEffect, useRef, useState } from 'react'
import { useVaultStore } from '../stores/vault'

const FOLDERS = [
  { value: 'Inbox', label: 'Inbox' },
  { value: 'reference', label: 'Reference' },
  { value: 'Claude', label: 'Claude' },
  { value: 'Meetings', label: 'Meetings' }
]

export function VaultPushModal(): JSX.Element {
  const pushModalOpen = useVaultStore((s) => s.pushModalOpen)
  const setPushModalOpen = useVaultStore((s) => s.setPushModalOpen)
  const pushNote = useVaultStore((s) => s.pushNote)
  const pushing = useVaultStore((s) => s.pushing)

  const [title, setTitle] = useState('')
  const [folder, setFolder] = useState('Inbox')
  const [customFolder, setCustomFolder] = useState('')
  const [content, setContent] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [error, setError] = useState<string | null>(null)

  const titleRef = useRef<HTMLInputElement | null>(null)
  const overlayRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (pushModalOpen) {
      titleRef.current?.focus()
      setTitle('')
      setFolder('Inbox')
      setCustomFolder('')
      setContent('')
      setTagsInput('')
      setError(null)
    }
  }, [pushModalOpen])

  useEffect(() => {
    if (!pushModalOpen) return
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setPushModalOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [pushModalOpen, setPushModalOpen])

  if (!pushModalOpen) return <></>

  const handleSubmit = (): void => {
    if (!title.trim()) {
      setError('Title is required')
      return
    }
    const targetFolder = folder === '__custom' ? customFolder.trim() || 'Inbox' : folder
    const tags = tagsInput.split(',').map((t) => t.trim()).filter(Boolean)
    void pushNote(title.trim(), content, targetFolder, tags)
  }

  return (
    <div
      ref={overlayRef}
      className="vault-modal-overlay"
      onClick={(e) => { if (e.target === overlayRef.current) setPushModalOpen(false) }}
    >
      <div className="vault-modal" role="dialog" aria-modal="true">
        <div className="vault-modal-header">
          <span className="vault-modal-title">Push Note to Vault</span>
          <button type="button" className="vault-chunk-close" onClick={() => setPushModalOpen(false)}>x</button>
        </div>

        <div className="vault-modal-body">
          {error && <div className="vault-modal-error">{error}</div>}

          <label className="vault-modal-field">
            <span className="vault-modal-label">Title</span>
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Note title (becomes filename)"
              className="vault-search-input"
            />
          </label>

          <label className="vault-modal-field">
            <span className="vault-modal-label">Folder</span>
            <div className="vault-modal-folder-row">
              <select
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
                className="vault-filter-select"
              >
                {FOLDERS.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
                <option value="__custom">Custom...</option>
              </select>
              {folder === '__custom' && (
                <input
                  type="text"
                  value={customFolder}
                  onChange={(e) => setCustomFolder(e.target.value)}
                  placeholder="path/to/folder"
                  className="vault-filter-input"
                />
              )}
            </div>
          </label>

          <label className="vault-modal-field">
            <span className="vault-modal-label">Content</span>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write your note in markdown..."
              className="vault-modal-textarea"
              rows={12}
            />
          </label>

          <label className="vault-modal-field">
            <span className="vault-modal-label">Tags</span>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="tag1, tag2, tag3"
              className="vault-search-input"
            />
            {tagsInput && (
              <div className="vault-modal-tag-preview">
                {tagsInput.split(',').map((t) => t.trim()).filter(Boolean).map((t) => (
                  <span key={t} className="vault-meta-pill">#{t}</span>
                ))}
              </div>
            )}
          </label>
        </div>

        <div className="vault-modal-footer">
          <button
            type="button"
            className="vault-action-btn"
            onClick={() => setPushModalOpen(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="vault-action-btn vault-action-btn--primary"
            onClick={handleSubmit}
            disabled={pushing || !title.trim()}
          >
            {pushing ? <span className="vault-spinner" /> : 'Push Note'}
          </button>
        </div>
      </div>
    </div>
  )
}
