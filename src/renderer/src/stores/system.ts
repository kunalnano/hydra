import { create } from 'zustand'
import type { SystemState } from '../../../shared/types'
import { useTimeSeriesStore } from './timeseries'

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

        const netIn = newState.network?.totalBytesInPerSec ?? 0
        const netOut = newState.network?.totalBytesOutPerSec ?? 0
        useTimeSeriesStore
          .getState()
          .push(newState.cpu.usage, newState.memory.usagePercent, netIn, netOut)
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
