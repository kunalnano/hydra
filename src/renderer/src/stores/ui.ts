import { create } from 'zustand'

interface UIStore {
  // Cross-panel selection
  selectedWorkspace: string | null
  expandedWorkspace: string | null
  selectedAgentPid: number | null

  selectWorkspace: (name: string | null) => void
  toggleExpandWorkspace: (name: string) => void
  selectAgent: (pid: number | null, workspaceName?: string) => void
  clearSelection: () => void
}

export const useUIStore = create<UIStore>((set, get) => ({
  selectedWorkspace: null,
  expandedWorkspace: null,
  selectedAgentPid: null,

  selectWorkspace: (name) => {
    const current = get().selectedWorkspace
    set({
      selectedWorkspace: current === name ? null : name,
      selectedAgentPid: null
    })
  },

  toggleExpandWorkspace: (name) => {
    const current = get().expandedWorkspace
    set({ expandedWorkspace: current === name ? null : name })
  },

  selectAgent: (pid, workspaceName) => {
    const current = get().selectedAgentPid
    if (current === pid) {
      set({ selectedAgentPid: null, selectedWorkspace: null, expandedWorkspace: null })
    } else {
      set({
        selectedAgentPid: pid,
        selectedWorkspace: workspaceName || null,
        expandedWorkspace: workspaceName || null
      })
    }
  },

  clearSelection: () => {
    set({ selectedWorkspace: null, expandedWorkspace: null, selectedAgentPid: null })
  }
}))
