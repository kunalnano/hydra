import { create } from 'zustand'
import type {
  SystemState,
  ProcessSignalType,
  ProcessActionResult,
  GroupActionResult
} from '../../../shared/types'
import { useTimeSeriesStore } from './timeseries'

interface SystemStore {
  state: SystemState | null
  isConnected: boolean
  frozenPids: Set<number>
  initialize: () => Promise<void>
  refresh: () => void
  killProcess: (pid: number, expectedName?: string) => Promise<ProcessActionResult>
  signalProcess: (pid: number, signal: ProcessSignalType) => Promise<ProcessActionResult>
  killGroup: (
    processes: { pid: number; name: string }[],
    groupName: string
  ) => Promise<GroupActionResult>
}

export const useSystemStore = create<SystemStore>((set) => ({
  state: null,
  isConnected: false,
  frozenPids: new Set<number>(),

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
  },

  killProcess: async (pid, expectedName) => {
    const result = await window.hydra.killProcess(pid, expectedName)
    if (result.success) {
      set((s) => {
        const next = new Set(s.frozenPids)
        next.delete(pid)
        return { frozenPids: next }
      })
    }
    return result
  },

  signalProcess: async (pid, signal) => {
    const result = await window.hydra.signalProcess(pid, signal)
    if (result.success) {
      set((s) => {
        const next = new Set(s.frozenPids)
        if (signal === 'SIGSTOP') next.add(pid)
        if (signal === 'SIGCONT') next.delete(pid)
        return { frozenPids: next }
      })
    }
    return result
  },

  killGroup: async (processes, groupName) => {
    const result = await window.hydra.killGroup(processes, groupName)
    set((s) => {
      const next = new Set(s.frozenPids)
      for (const r of result.results) {
        if (r.success) next.delete(r.pid)
      }
      return { frozenPids: next }
    })
    return result
  }
}))
