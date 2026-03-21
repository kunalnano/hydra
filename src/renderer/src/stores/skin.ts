import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type HelmSkinId = 'classic' | 'glass' | 'forge' | 'phantom'

export interface HelmSkinOption {
  id: HelmSkinId
  label: string
  blurb: string
  palette: [string, string, string]
}

export const HELM_SKINS: HelmSkinOption[] = [
  {
    id: 'classic',
    label: 'Deck',
    blurb: 'Dark gunmetal chrome, cool cyan accent',
    palette: ['#1a2233', '#00e5ff', '#2a3a52']
  },
  {
    id: 'glass',
    label: 'Orbiter',
    blurb: 'Warmer chrome with teal-green accent',
    palette: ['#0a1628', '#b7fff0', '#15314d']
  },
  {
    id: 'forge',
    label: 'Forge',
    blurb: 'Reactor gold on black. Machine warmth.',
    palette: ['#000000', '#ffd280', '#1a1408']
  },
  {
    id: 'phantom',
    label: 'Phantom',
    blurb: 'Deep violet neon on obsidian. Night ops.',
    palette: ['#0c0818', '#bf7aff', '#1a1030']
  }
]

interface SkinStore {
  activeSkin: HelmSkinId
  setActiveSkin: (skin: HelmSkinId) => void
}

export const useSkinStore = create<SkinStore>()(
  persist(
    (set) => ({
      activeSkin: 'classic',
      setActiveSkin: (skin) => set({ activeSkin: skin })
    }),
    {
      name: 'helm-shell-skin'
    }
  )
)
