import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const CUSTOM_RADIO_STREAM_ID = 'custom-stream'
export const DEFAULT_RADIO_STATION_ID = 'wbgo-jazz'

interface RadioStore {
  selectedStationId: string
  volume: number
  customStationName: string
  customStreamUrl: string
  setSelectedStationId: (stationId: string) => void
  setVolume: (volume: number) => void
  setCustomStation: (name: string, url: string) => void
}

function clampVolume(volume: number): number {
  if (Number.isNaN(volume)) return 0.72
  return Math.min(1, Math.max(0, volume))
}

export const useRadioStore = create<RadioStore>()(
  persist(
    (set) => ({
      selectedStationId: DEFAULT_RADIO_STATION_ID,
      volume: 0.72,
      customStationName: '',
      customStreamUrl: '',
      setSelectedStationId: (stationId) => set({ selectedStationId: stationId }),
      setVolume: (volume) => set({ volume: clampVolume(volume) }),
      setCustomStation: (name, url) =>
        set({
          customStationName: name,
          customStreamUrl: url,
          selectedStationId: CUSTOM_RADIO_STREAM_ID
        })
    }),
    {
      name: 'hydra-fm-radio'
    }
  )
)
