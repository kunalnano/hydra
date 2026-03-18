import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type HydraSkinId = 'classic' | 'glass'

export interface HydraSkinOption {
  id: HydraSkinId
  label: string
  blurb: string
}

export const HYDRA_SKINS: HydraSkinOption[] = [
  {
    id: 'classic',
    label: 'Deck',
    blurb: 'Dark titanium bridge chrome'
  },
  {
    id: 'glass',
    label: 'Orbiter',
    blurb: 'Aqua-metal shell with softer 90s control-room energy'
  }
]

interface SkinStore {
  activeSkin: HydraSkinId
  setActiveSkin: (skin: HydraSkinId) => void
}

export const useSkinStore = create<SkinStore>()(
  persist(
    (set) => ({
      activeSkin: 'glass',
      setActiveSkin: (skin) => set({ activeSkin: skin })
    }),
    {
      name: 'hydra-shell-skin'
    }
  )
)
