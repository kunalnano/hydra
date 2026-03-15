import { create } from 'zustand'

export type HydraPageId = 'overview' | 'workspaces' | 'agents' | 'systems' | 'ai' | 'activity'

interface NavigationStore {
  currentPage: HydraPageId
  setCurrentPage: (page: HydraPageId) => void
}

export const useNavigationStore = create<NavigationStore>((set) => ({
  currentPage: 'overview',
  setCurrentPage: (page) => set({ currentPage: page })
}))
