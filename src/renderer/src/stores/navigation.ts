import { create } from 'zustand'

export type HelmPageId =
  | 'bridge'
  | 'fleet'
  | 'swarm'
  | 'grid'
  | 'ai'
  | 'radio'
  | 'logs'

interface NavigationStore {
  currentPage: HelmPageId
  setCurrentPage: (page: HelmPageId) => void
}

export const useNavigationStore = create<NavigationStore>((set) => ({
  currentPage: 'bridge',
  setCurrentPage: (page) => set({ currentPage: page })
}))
