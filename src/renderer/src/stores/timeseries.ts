import { create } from 'zustand'

const MAX_HISTORY = 60

interface TimeSeriesStore {
  cpuHistory: number[]
  memHistory: number[]
  netInHistory: number[]
  netOutHistory: number[]
  push: (cpu: number, mem: number, netIn: number, netOut: number) => void
}

export const useTimeSeriesStore = create<TimeSeriesStore>((set) => ({
  cpuHistory: [],
  memHistory: [],
  netInHistory: [],
  netOutHistory: [],

  push: (cpu, mem, netIn, netOut) => {
    set((state) => ({
      cpuHistory: [...state.cpuHistory, cpu].slice(-MAX_HISTORY),
      memHistory: [...state.memHistory, mem].slice(-MAX_HISTORY),
      netInHistory: [...state.netInHistory, netIn].slice(-MAX_HISTORY),
      netOutHistory: [...state.netOutHistory, netOut].slice(-MAX_HISTORY)
    }))
  }
}))
