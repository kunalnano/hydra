import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const CUSTOM_RADIO_STREAM_ID = 'custom-stream'
export const LOCAL_FILE_PREFIX = 'local-file-'
export const DEFAULT_RADIO_STATION_ID = 'wbgo-jazz'

export interface LocalAudioFile {
  id: string
  name: string
  path: string
  sourceUrl?: string
}

interface RadioStore {
  selectedStationId: string
  volume: number
  customStationName: string
  customStreamUrl: string
  localFiles: LocalAudioFile[]
  setSelectedStationId: (stationId: string) => void
  setVolume: (volume: number) => void
  setCustomStation: (name: string, url: string) => void
  addLocalFile: (name: string, path: string, sourceUrl?: string) => void
  removeLocalFile: (id: string) => void
}

function clampVolume(volume: number): number {
  if (Number.isNaN(volume)) return 0.72
  return Math.min(1, Math.max(0, volume))
}

export const useRadioStore = create<RadioStore>()(
  persist(
    (set, get) => ({
      selectedStationId: DEFAULT_RADIO_STATION_ID,
      volume: 0.72,
      customStationName: '',
      customStreamUrl: '',
      localFiles: [],
      setSelectedStationId: (stationId) => set({ selectedStationId: stationId }),
      setVolume: (volume) => set({ volume: clampVolume(volume) }),
      setCustomStation: (name, url) =>
        set({
          customStationName: name,
          customStreamUrl: url,
          selectedStationId: CUSTOM_RADIO_STREAM_ID
        }),
      addLocalFile: (name, path, sourceUrl) => {
        const id = `${LOCAL_FILE_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        const existing = get().localFiles
        if (existing.some((f) => f.path === path)) return
        set({ localFiles: [...existing, { id, name, path, sourceUrl }] })
      },
      removeLocalFile: (id) => {
        const state = get()
        set({
          localFiles: state.localFiles.filter((f) => f.id !== id),
          selectedStationId:
            state.selectedStationId === id ? DEFAULT_RADIO_STATION_ID : state.selectedStationId
        })
      }
    }),
    {
      name: 'helm-fm-radio'
    }
  )
)
