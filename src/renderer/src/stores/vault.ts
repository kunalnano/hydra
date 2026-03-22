import { create } from 'zustand'

// ── Types ──────────────────────────────────────────────────────────

export interface VaultSearchResult {
  chunk_id: string
  snippet: string
  source_path: string
  heading_path: string | null
  client: string | null
  doc_type: string | null
  fused_score: number
  matched_in: 'dense' | 'sparse' | 'both'
  dense_score: number | null
  sparse_score: number | null
}

export interface VaultSearchResponse {
  results: VaultSearchResult[]
  query: string
  result_count: number
}

export interface VaultChunk {
  chunk_id: string
  text: string
  source_path: string
  heading_path: string | null
  client: string | null
  doc_type: string | null
  tags: string[]
  entity_refs: string[]
  identifiers: string[]
  updated_at: string | null
  word_count: number | null
}

export interface VaultHealthStatus {
  online: boolean
  endpoint: string
  qdrant_ok: boolean
  last_check: number
  last_reindex: string | null
  total_chunks: number | null
  error: string | null
}

export interface VaultPushResult {
  success: boolean
  file_path: string | null
  error: string | null
}

export interface VaultReindexResult {
  success: boolean
  files_processed: number | null
  duration_ms: number | null
  error: string | null
}

export interface VaultSearchFilters {
  client?: string
  doc_type?: string
  top_k: number
}

export interface VaultOperation {
  type: string
  success: boolean
  message: string
  timestamp: number
}

// ── Mock Data ──────────────────────────────────────────────────────

const MOCK_HEALTH: VaultHealthStatus = {
  online: true,
  endpoint: 'http://127.0.0.1:8742',
  qdrant_ok: true,
  last_check: Date.now(),
  last_reindex: '2026-03-22T12:00:00Z',
  total_chunks: 1798,
  error: null
}

const MOCK_RESULTS: VaultSearchResult[] = [
  {
    chunk_id: 'abc123',
    snippet: "Bell Canada's platform scale limits are hitting entity ceilings at 18-19k entities. The soft launch approach was recommended to avoid...",
    source_path: 'reference/bell-canada-context.md',
    heading_path: 'Scale Limits > Entity Ceiling',
    client: 'Bell Canada',
    doc_type: 'client-context',
    fused_score: 0.8742,
    matched_in: 'both',
    dense_score: 0.8521,
    sparse_score: 0.7103
  },
  {
    chunk_id: 'def456',
    snippet: 'The HELM thesis argues that MCP makes bottom-up developer platforms viable. Traditional IDPs assume institutional structure...',
    source_path: 'reference/helm-thesis-and-strategy.md',
    heading_path: 'The Core Thesis',
    client: null,
    doc_type: 'note',
    fused_score: 0.7956,
    matched_in: 'dense',
    dense_score: 0.7956,
    sparse_score: null
  },
  {
    chunk_id: 'ghi789',
    snippet: 'Thomson Reuters GitHub Ocean integration escalation -- Eamon Mason raised concerns about ingestion pipeline reliability for their...',
    source_path: 'reference/tr-escalation-notes.md',
    heading_path: 'Escalation Timeline',
    client: 'Thomson Reuters',
    doc_type: 'client-context',
    fused_score: 0.7234,
    matched_in: 'sparse',
    dense_score: null,
    sparse_score: 0.7234
  },
  {
    chunk_id: 'jkl012',
    snippet: 'Weekly planning workflow: start with vault search for open threads, review Granola meeting notes from the past week, check...',
    source_path: 'reference/weekly-workflow.md',
    heading_path: null,
    client: null,
    doc_type: 'note',
    fused_score: 0.6891,
    matched_in: 'both',
    dense_score: 0.6543,
    sparse_score: 0.6102
  },
  {
    chunk_id: 'mno345',
    snippet: 'Bread Financial 30/60/90 implementation plan: Phase 1 covers initial catalog seeding, team onboarding, and basic scorecard...',
    source_path: 'Meetings/bread-financial-kickoff.md',
    heading_path: 'Implementation Timeline',
    client: 'Bread Financial',
    doc_type: 'meeting',
    fused_score: 0.6455,
    matched_in: 'dense',
    dense_score: 0.6455,
    sparse_score: null
  }
]

const MOCK_CHUNK: VaultChunk = {
  chunk_id: 'abc123',
  text: "# Bell Canada — Platform Scale Limits\n\nBell Canada's platform deployment is hitting entity ceilings at 18-19k entities...\n\n## Entity Ceiling\n\nThe current ceiling appears to be around 18,000-19,000 entities before query timeouts become frequent. The platform team has confirmed this is a known constraint in the current ingestion architecture.\n\n### Symptoms\n- Query timeouts increase above 15k entities\n- Scorecard refresh times degrade from ~2s to ~8s\n- Bulk operations (catalog sync, scorecard rebuild) start failing intermittently\n\n## Recommended Approach\n\nSoft launch at the current entity count, monitor query performance, and work with R&D on the ingestion architecture improvements committed for Q2.\n\n### Timeline\n1. **Week 1-2:** Lock entity count at current level, monitor performance baselines\n2. **Week 3-4:** R&D delivers ingestion architecture v2 (committed for Q2)\n3. **Week 5+:** Gradually increase entity count with performance gates",
  source_path: 'reference/bell-canada-context.md',
  heading_path: 'Scale Limits > Entity Ceiling',
  client: 'Bell Canada',
  doc_type: 'client-context',
  tags: ['bell-canada', 'scale', 'entity-ceiling', 'q2-priority'],
  entity_refs: ['Bell Canada', 'Yonatan'],
  identifiers: ['ERR-QUERY-TIMEOUT-4401'],
  updated_at: '2026-03-18',
  word_count: 342
}

// ── Store ──────────────────────────────────────────────────────────

interface VaultStore {
  health: VaultHealthStatus | null
  healthLoading: boolean

  query: string
  filters: VaultSearchFilters
  results: VaultSearchResult[]
  searching: boolean
  lastSearchTime: number | null

  activeChunk: VaultChunk | null
  chunkLoading: boolean

  reindexing: boolean
  pushing: boolean
  pulling: boolean
  lastOperation: VaultOperation | null

  pushModalOpen: boolean

  setQuery: (q: string) => void
  setFilters: (f: Partial<VaultSearchFilters>) => void
  checkHealth: () => Promise<void>
  search: () => Promise<void>
  openChunk: (chunkId: string) => Promise<void>
  closeChunk: () => void
  triggerReindex: () => Promise<void>
  pushNote: (title: string, content: string, folder?: string, tags?: string[]) => Promise<void>
  pullSync: () => Promise<void>
  setPushModalOpen: (open: boolean) => void
}

export const useVaultStore = create<VaultStore>((set, get) => ({
  health: null,
  healthLoading: false,

  query: '',
  filters: { top_k: 8 },
  results: [],
  searching: false,
  lastSearchTime: null,

  activeChunk: null,
  chunkLoading: false,

  reindexing: false,
  pushing: false,
  pulling: false,
  lastOperation: null,

  pushModalOpen: false,

  setQuery: (q) => set({ query: q }),
  setFilters: (f) => set((s) => ({ filters: { ...s.filters, ...f } })),
  setPushModalOpen: (open) => set({ pushModalOpen: open }),

  checkHealth: async () => {
    set({ healthLoading: true })
    try {
      // TODO: Replace with window.helm.vaultHealth() when backend lands
      await new Promise((r) => setTimeout(r, 300))
      set({ health: { ...MOCK_HEALTH, last_check: Date.now() }, healthLoading: false })
    } catch {
      set({
        health: {
          online: false,
          endpoint: 'http://127.0.0.1:8742',
          qdrant_ok: false,
          last_check: Date.now(),
          last_reindex: null,
          total_chunks: null,
          error: 'Could not reach vault-rag server'
        },
        healthLoading: false
      })
    }
  },

  search: async () => {
    const { query, filters } = get()
    if (!query.trim()) return
    set({ searching: true, results: [] })
    try {
      // TODO: Replace with window.helm.vaultSearch(query, filters)
      await new Promise((r) => setTimeout(r, 600))
      const filtered = MOCK_RESULTS.filter((r) => {
        if (filters.doc_type && r.doc_type !== filters.doc_type) return false
        if (filters.client && r.client && !r.client.toLowerCase().includes(filters.client.toLowerCase())) return false
        return true
      }).slice(0, filters.top_k)
      set({ results: filtered, searching: false, lastSearchTime: Date.now() })
    } catch {
      set({ results: [], searching: false })
    }
  },

  openChunk: async (chunkId) => {
    set({ chunkLoading: true })
    try {
      // TODO: Replace with window.helm.vaultOpenChunk(chunkId)
      await new Promise((r) => setTimeout(r, 400))
      set({ activeChunk: { ...MOCK_CHUNK, chunk_id: chunkId }, chunkLoading: false })
    } catch {
      set({ chunkLoading: false })
    }
  },

  closeChunk: () => set({ activeChunk: null }),

  triggerReindex: async () => {
    set({ reindexing: true })
    try {
      // TODO: Replace with window.helm.vaultReindex()
      await new Promise((r) => setTimeout(r, 2000))
      set({
        reindexing: false,
        lastOperation: {
          type: 'reindex',
          success: true,
          message: 'Reindexed 1798 files in 4.2s',
          timestamp: Date.now()
        }
      })
    } catch {
      set({
        reindexing: false,
        lastOperation: {
          type: 'reindex',
          success: false,
          message: 'Reindex failed',
          timestamp: Date.now()
        }
      })
    }
  },

  pushNote: async (title, _content, folder, _tags) => {
    set({ pushing: true })
    try {
      // TODO: Replace with window.helm.vaultPushNote(title, content, folder)
      await new Promise((r) => setTimeout(r, 800))
      const targetFolder = folder || 'Inbox'
      set({
        pushing: false,
        pushModalOpen: false,
        lastOperation: {
          type: 'push',
          success: true,
          message: `Pushed "${title}" to ${targetFolder}/`,
          timestamp: Date.now()
        }
      })
    } catch {
      set({
        pushing: false,
        lastOperation: {
          type: 'push',
          success: false,
          message: 'Push failed',
          timestamp: Date.now()
        }
      })
    }
  },

  pullSync: async () => {
    set({ pulling: true })
    try {
      // TODO: Replace with window.helm.vaultPullSync()
      await new Promise((r) => setTimeout(r, 1200))
      set({
        pulling: false,
        lastOperation: {
          type: 'pull',
          success: true,
          message: 'Pulled 3 files, reindex triggered',
          timestamp: Date.now()
        }
      })
    } catch {
      set({
        pulling: false,
        lastOperation: {
          type: 'pull',
          success: false,
          message: 'Pull failed',
          timestamp: Date.now()
        }
      })
    }
  }
}))
