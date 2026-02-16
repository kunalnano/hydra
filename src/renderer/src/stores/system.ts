import { create } from 'zustand'
import type { SystemState } from '../../../shared/types'

interface SystemStore {
  state: SystemState | null
  isConnected: boolean
  initialize: () => Promise<void>
  refresh: () => void
}

export const useSystemStore = create<SystemStore>((set) => ({
  state: null,
  isConnected: false,

  initialize: async () => {
    try {
      const initialState = await window.hydra.getInitialState()
      set({ state: initialState, isConnected: true })

      window.hydra.onSystemStateUpdate((newState) => {
        set({ state: newState })
      })
    } catch (err) {
      console.error('Failed to initialize system store:', err)
      set({ isConnected: false })
    }
  },

  refresh: () => {
    window.hydra.requestRefresh()
  }
}))
