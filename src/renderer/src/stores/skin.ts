import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type HydraSkinId = 'classic' | 'glass' | 'forge'

export interface HydraSkinOption {
  id: HydraSkinId
  label: string
  blurb: string
  palette: [string, string, string]
}

export const HYDRA_SKINS: HydraSkinOption[] = [
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
  }
]

interface SkinStore {
  activeSkin: HydraSkinId
  setActiveSkin: (skin: HydraSkinId) => void
}

export const useSkinStore = create<SkinStore>()(
  persist(
    (set) => ({
      activeSkin: 'classic',
      setActiveSkin: (skin) => set({ activeSkin: skin })
    }),
    {
      name: 'hydra-shell-skin'
    }
  )
)
