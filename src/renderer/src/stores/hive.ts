import { create } from 'zustand'
import type { HiveSessionInfo, HiveSpawnRequest, HiveSpawnResult } from '../../../shared/types'

interface HiveStore {
  sessions: HiveSessionInfo[]
  loading: boolean
  error: string | null

  initialize: () => void
  refresh: () => Promise<void>
  spawn: (request: HiveSpawnRequest) => Promise<HiveSpawnResult>
  killSession: (sessionId: string) => Promise<void>
  sendMessage: (sessionId: string, message: string) => Promise<{ success: boolean; error?: string }>
  attach: (sessionId: string) => Promise<void>
  updateContext: (objective: string) => Promise<void>
  getContext: () => Promise<string>
}

export const useHiveStore = create<HiveStore>((set, get) => ({
  sessions: [],
  loading: false,
  error: null,

  initialize: () => {
    // Initial fetch
    get().refresh()

    // Subscribe to session updates
    window.helm.onHiveSessionUpdate((sessions) => {
      set({ sessions })
    })
  },

  refresh: async () => {
    try {
      const sessions = await window.helm.hiveListSessions()
      set({ sessions })
    } catch (err) {
      console.error('[hive-store] Failed to list sessions:', err)
    }
  },

  spawn: async (request) => {
    set({ loading: true, error: null })
    try {
      const result = await window.helm.hiveSpawn(request)
      if (result.success) {
        await get().refresh()
      } else {
        set({ error: result.error ?? 'Spawn failed' })
      }
      return result
    } catch (err) {
      const error = `Spawn error: ${err}`
      set({ error })
      return { success: false, error }
    } finally {
      set({ loading: false })
    }
  },

  killSession: async (sessionId) => {
    await window.helm.hiveKillSession(sessionId)
    await get().refresh()
  },

  sendMessage: async (sessionId, message) => {
    return window.helm.hiveSendMessage(sessionId, message)
  },

  attach: async (sessionId) => {
    await window.helm.hiveAttach(sessionId)
  },

  updateContext: async (objective) => {
    await window.helm.hiveUpdateContext(objective)
  },

  getContext: async () => {
    return window.helm.hiveGetContext()
  }
}))
