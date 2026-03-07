import { create } from 'zustand'

interface UIStore {
  // Cross-panel selection
  selectedWorkspace: string | null
  expandedWorkspace: string | null
  selectedAgentId: string | null

  selectWorkspace: (name: string | null) => void
  toggleExpandWorkspace: (name: string) => void
  selectAgent: (agentId: string | null, workspaceName?: string) => void
  clearSelection: () => void
}

export const useUIStore = create<UIStore>((set, get) => ({
  selectedWorkspace: null,
  expandedWorkspace: null,
  selectedAgentId: null,

  selectWorkspace: (name) => {
    const current = get().selectedWorkspace
    set({
      selectedWorkspace: current === name ? null : name,
      selectedAgentId: null
    })
  },

  toggleExpandWorkspace: (name) => {
    const current = get().expandedWorkspace
    set({ expandedWorkspace: current === name ? null : name })
  },

  selectAgent: (agentId, workspaceName) => {
    const current = get().selectedAgentId
    if (current === agentId) {
      set({ selectedAgentId: null, selectedWorkspace: null, expandedWorkspace: null })
    } else {
      set({
        selectedAgentId: agentId,
        selectedWorkspace: workspaceName || null,
        expandedWorkspace: workspaceName || null
      })
    }
  },

  clearSelection: () => {
    set({ selectedWorkspace: null, expandedWorkspace: null, selectedAgentId: null })
  }
}))
