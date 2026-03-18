import { useEffect, useRef, useState } from 'react'
import { CUSTOM_RADIO_STREAM_ID, DEFAULT_RADIO_STATION_ID, useRadioStore } from '../stores/radio'

type RadioStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error'

interface RadioStation {
  id: string
  callSign: string
  frequency: string
  name: string
  location: string
  genre: string
  tagline: string
  streamUrl: string
  format: string
  website: string
  sourcePage: string
}

const FM_STATIONS: RadioStation[] = [
  {
    id: 'wbgo-jazz',
    callSign: 'WBGO',
    frequency: '88.3 FM',
    name: 'Jazz 88.3',
    location: 'Newark / New York City',
    genre: 'Jazz',
    tagline: 'Straight-ahead jazz, soul, and host-driven sets.',
    streamUrl: 'https://ais-sa8.cdnstream1.com/3629_128.mp3',
    format: 'MP3 128',
    website: 'https://www.wbgo.org',
    sourcePage: 'https://www.wbgo.org/how-to-listen-online'
  },
  {
    id: 'kexp',
    callSign: 'KEXP',
    frequency: '90.3 FM',
    name: 'Seattle',
    location: 'Seattle',
    genre: 'Eclectic',
    tagline: 'Curated indie, post-punk, electronic, and left-field rotation.',
    streamUrl: 'https://kexp.streamguys1.com/kexp160.aac',
    format: 'AAC 160',
    website: 'https://www.kexp.org',
    sourcePage: 'https://www.kexp.org/mobile/kexp-livestreams/'
  },
  {
    id: 'kutx',
    callSign: 'KUTX',
    frequency: '98.9 FM',
    name: 'Austin Music',
    location: 'Austin',
    genre: 'Alternative',
    tagline: 'Austin AAA and local scene staples with a warmer daytime flow.',
    streamUrl: 'https://streams.kut.org/4428_192.mp3?aw_0_1st.playerid=kutx-free',
    format: 'MP3 192',
    website: 'https://kutx.org',
    sourcePage: 'https://kutx.org/streams/'
  },
  {
    id: 'wwoz',
    callSign: 'WWOZ',
    frequency: '90.7 FM',
    name: 'New Orleans',
    location: 'New Orleans',
    genre: 'Community',
    tagline: 'New Orleans jazz, brass, funk, and neighborhood energy.',
    streamUrl: 'https://wwoz-sc.streamguys1.com/wwoz-hi.mp3',
    format: 'MP3',
    website: 'https://www.wwoz.org',
    sourcePage: 'https://www.wwoz.org/listen/player/'
  },
  {
    id: 'kcrw',
    callSign: 'KCRW',
    frequency: '89.9 FM',
    name: 'Simulcast',
    location: 'Santa Monica / Los Angeles',
    genre: 'Eclectic',
    tagline: 'Public-radio eclecticism with music blocks and magazine energy.',
    streamUrl: 'https://streams.kcrw.com/kcrw_mp3',
    format: 'MP3',
    website: 'https://www.kcrw.com',
    sourcePage: 'https://media.kcrw.com/pls/kcrwsimulcast.pls'
  }
]

function resolveActiveStation(
  selectedStationId: string,
  customStationName: string,
  customStreamUrl: string
): RadioStation | null {
  if (selectedStationId === CUSTOM_RADIO_STREAM_ID && customStreamUrl) {
    return {
      id: CUSTOM_RADIO_STREAM_ID,
      callSign: 'Custom',
      frequency: 'Direct URL',
      name: customStationName || 'Personal relay',
      location: 'Manual load',
      genre: 'Imported',
      tagline: 'User-supplied station or stream endpoint.',
      streamUrl: customStreamUrl,
      format: 'Custom',
      website: customStreamUrl,
      sourcePage: customStreamUrl
    }
  }

  return FM_STATIONS.find((station) => station.id === selectedStationId) || null
}

function isDirectStreamUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function getStatusCopy(status: RadioStatus, error: string | null, stationName: string): string {
  if (error) return error

  switch (status) {
    case 'loading':
      return `Tuning ${stationName}...`
    case 'playing':
      return `${stationName} is live.`
    case 'paused':
      return `${stationName} is loaded and ready.`
    case 'error':
      return `${stationName} would not open.`
    default:
      return `Select a station and press play.`
  }
}

function getStreamHost(streamUrl: string): string {
  try {
    return new URL(streamUrl).host.replace(/^www\./, '')
  } catch {
    return streamUrl
  }
}

export function FMRadioPanel(): JSX.Element {
  const audioRef = useRef<HTMLAudioElement>(null)
  const currentStationRef = useRef<RadioStation | null>(null)
  const lastLoadedStationId = useRef<string | null>(null)
  const autoplayAfterSelection = useRef(false)

  const selectedStationId = useRadioStore((s) => s.selectedStationId)
  const setSelectedStationId = useRadioStore((s) => s.setSelectedStationId)
  const volume = useRadioStore((s) => s.volume)
  const setVolume = useRadioStore((s) => s.setVolume)
  const customStationName = useRadioStore((s) => s.customStationName)
  const customStreamUrl = useRadioStore((s) => s.customStreamUrl)
  const setCustomStation = useRadioStore((s) => s.setCustomStation)

  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<RadioStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [customNameDraft, setCustomNameDraft] = useState(customStationName)
  const [customUrlDraft, setCustomUrlDraft] = useState(customStreamUrl)

  const activeStation = resolveActiveStation(selectedStationId, customStationName, customStreamUrl)
  const statusCopy = getStatusCopy(status, error, activeStation?.callSign ?? 'Hydra FM')
  const visibleStations = FM_STATIONS.filter((station) => {
    const search =
      `${station.callSign} ${station.name} ${station.location} ${station.genre} ${station.tagline}`.toLowerCase()
    return search.includes(query.trim().toLowerCase())
  })

  useEffect(() => {
    currentStationRef.current = activeStation
  }, [activeStation])

  useEffect(() => {
    setCustomNameDraft(customStationName)
  }, [customStationName])

  useEffect(() => {
    setCustomUrlDraft(customStreamUrl)
  }, [customStreamUrl])

  useEffect(() => {
    if (!activeStation) {
      setSelectedStationId(DEFAULT_RADIO_STATION_ID)
    }
  }, [activeStation, setSelectedStationId])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    audio.volume = volume
  }, [volume])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onLoadStart = (): void => {
      setStatus('loading')
      setError(null)
    }

    const onWaiting = (): void => {
      setStatus('loading')
    }

    const onPlaying = (): void => {
      setStatus('playing')
      setError(null)
    }

    const onPause = (): void => {
      setStatus((current) => (current === 'error' ? current : 'paused'))
    }

    const onError = (): void => {
      const station = currentStationRef.current
      setStatus('error')
      setError(
        `Hydra could not decode ${station?.callSign ?? 'that stream'}. Try another preset or paste a direct MP3, AAC, or HLS URL.`
      )
    }

    audio.addEventListener('loadstart', onLoadStart)
    audio.addEventListener('waiting', onWaiting)
    audio.addEventListener('playing', onPlaying)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('error', onError)

    return () => {
      audio.removeEventListener('loadstart', onLoadStart)
      audio.removeEventListener('waiting', onWaiting)
      audio.removeEventListener('playing', onPlaying)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('error', onError)
    }
  }, [])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !activeStation) return

    if (lastLoadedStationId.current !== activeStation.id) {
      lastLoadedStationId.current = activeStation.id
      setError(null)
      setStatus('idle')
      audio.pause()
      audio.src = activeStation.streamUrl
      audio.load()
    }

    if (autoplayAfterSelection.current) {
      autoplayAfterSelection.current = false
      setError(null)
      setStatus('loading')
      void audio.play().catch(() => {
        setStatus('error')
        setError(
          `Playback did not start for ${activeStation.callSign}. Press play again if the stream host blocked the first attempt.`
        )
      })
    }
  }, [activeStation])

  const startPlayback = async (): Promise<void> => {
    const audio = audioRef.current
    if (!audio || !activeStation) return

    setError(null)
    setStatus('loading')

    try {
      await audio.play()
    } catch {
      setStatus('error')
      setError(
        `Playback did not start for ${activeStation.callSign}. Press play again or swap to another preset.`
      )
    }
  }

  const handleSelectStation = (stationId: string): void => {
    if (stationId === selectedStationId && lastLoadedStationId.current === stationId) {
      void startPlayback()
      return
    }

    autoplayAfterSelection.current = true
    setSelectedStationId(stationId)
  }

  const handleTogglePlayback = (): void => {
    const audio = audioRef.current

    if (!audio) return

    if (!activeStation) {
      handleSelectStation(DEFAULT_RADIO_STATION_ID)
      return
    }

    if (!audio.paused) {
      audio.pause()
      return
    }

    void startPlayback()
  }

  const handleReload = (): void => {
    const audio = audioRef.current

    if (!audio || !activeStation) return

    setError(null)
    setStatus('loading')
    audio.pause()
    audio.src = activeStation.streamUrl
    audio.load()
    void startPlayback()
  }

  const handleCustomLoad = (): void => {
    const trimmedUrl = customUrlDraft.trim()
    const trimmedName = customNameDraft.trim()

    if (!isDirectStreamUrl(trimmedUrl)) {
      setStatus('error')
      setError('Paste a full direct stream URL starting with http:// or https://.')
      return
    }

    autoplayAfterSelection.current = true
    setCustomStation(trimmedName || 'Personal relay', trimmedUrl)
    setError(null)
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(340px,0.8fr)]">
      <section className="shell-radio-pane">
        <audio ref={audioRef} preload="none" />

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] shell-page-kicker">
              Stereo relay
            </div>
            <h3 className="mt-2 text-3xl font-semibold text-white">
              {activeStation?.callSign ?? 'Hydra FM'}
            </h3>
            <p className="mt-2 max-w-xl text-sm shell-muted">
              {activeStation
                ? `${activeStation.name} · ${activeStation.location} · ${activeStation.genre}`
                : 'A free-streaming FM relay deck with presets and direct URL loading.'}
            </p>
          </div>

          <div className="shell-chip rounded-full px-4 py-1.5 text-[11px] uppercase tracking-[0.2em]">
            {status === 'playing' ? 'On air' : status === 'loading' ? 'Buffering' : 'Standby'}
          </div>
        </div>

        <div className="shell-radio-display mt-5">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="min-w-[220px]">
              <div className="text-[10px] uppercase tracking-[0.26em] shell-subtle">Now tuned</div>
              <div className="mt-3 text-4xl font-semibold tracking-tight text-white">
                {activeStation?.frequency ?? '88.3 FM'}
              </div>
              <div className="mt-2 text-base font-medium text-white/90">
                {activeStation?.name ?? 'Choose a station'}
              </div>
              <div className="mt-2 text-sm leading-relaxed shell-muted">
                {activeStation?.tagline ??
                  'Pick a preset on the right or load a direct stream URL below.'}
              </div>
            </div>

            <div
              className={`shell-radio-bars ${status === 'playing' ? 'shell-radio-bars--playing' : ''}`}
              aria-hidden="true"
            >
              {Array.from({ length: 12 }, (_, index) => (
                <span
                  key={index}
                  className="shell-radio-bar"
                  style={{
                    animationDelay: `${index * 90}ms`,
                    height: `${22 + (index % 5) * 9}px`
                  }}
                />
              ))}
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleTogglePlayback}
              className="shell-control-button min-w-[132px] px-4 py-2 text-sm font-semibold text-white"
            >
              {status === 'playing' ? 'Pause stream' : 'Play stream'}
            </button>
            <button
              type="button"
              onClick={handleReload}
              className="shell-control-button px-4 py-2 text-sm"
            >
              Reload tuner
            </button>
            <div className="flex items-center gap-3 rounded-full border border-white/10 px-3 py-2">
              <span className="text-[11px] uppercase tracking-[0.22em] shell-subtle">Volume</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={(event) => setVolume(Number(event.target.value))}
                className="shell-slider w-32"
              />
              <span className="min-w-[3ch] text-right text-xs font-medium shell-muted">
                {Math.round(volume * 100)}%
              </span>
            </div>
          </div>

          <div className="mt-4 rounded-[1.2rem] border border-white/10 bg-black/10 px-4 py-3 text-sm shell-muted">
            {statusCopy}
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="shell-radio-stat">
            <span className="text-[10px] uppercase tracking-[0.24em] shell-subtle">Transport</span>
            <div className="mt-2 text-lg font-semibold text-white">
              {activeStation?.format ?? 'MP3 / AAC'}
            </div>
            <div className="mt-1 text-xs shell-muted">Direct stream, no account required.</div>
          </div>

          <div className="shell-radio-stat">
            <span className="text-[10px] uppercase tracking-[0.24em] shell-subtle">
              Source host
            </span>
            <div className="mt-2 text-lg font-semibold text-white">
              {activeStation ? getStreamHost(activeStation.streamUrl) : 'stream host'}
            </div>
            <div className="mt-1 text-xs shell-muted">
              Hydra sends the URL straight to the audio deck.
            </div>
          </div>

          <div className="shell-radio-stat">
            <span className="text-[10px] uppercase tracking-[0.24em] shell-subtle">Library</span>
            <div className="mt-2 text-lg font-semibold text-white">
              {FM_STATIONS.length} presets
            </div>
            <div className="mt-1 text-xs shell-muted">
              Curated from official station-owned stream pages.
            </div>
          </div>
        </div>

        <div className="shell-radio-form mt-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.24em] shell-page-kicker">
                Manual tune
              </div>
              <p className="mt-2 max-w-xl text-sm shell-muted">
                Load any direct MP3, AAC, or HLS stream. Hydra will remember the last custom relay
                and your volume.
              </p>
            </div>

            {selectedStationId === CUSTOM_RADIO_STREAM_ID && (
              <div className="shell-chip rounded-full px-4 py-1.5 text-[11px] uppercase tracking-[0.2em]">
                Custom selected
              </div>
            )}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,0.42fr)_minmax(0,1fr)_auto]">
            <input
              type="text"
              value={customNameDraft}
              onChange={(event) => setCustomNameDraft(event.target.value)}
              placeholder="Station name (optional)"
              className="shell-input"
            />
            <input
              type="url"
              value={customUrlDraft}
              onChange={(event) => setCustomUrlDraft(event.target.value)}
              placeholder="https://example.com/live.mp3"
              className="shell-input"
            />
            <button
              type="button"
              onClick={handleCustomLoad}
              className="shell-control-button px-4 py-2 text-sm font-medium"
            >
              Load custom
            </button>
          </div>

          {activeStation && (
            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs shell-muted">
              <a
                href={activeStation.website}
                target="_blank"
                rel="noreferrer"
                className="shell-link"
              >
                Station site
              </a>
              <a
                href={activeStation.sourcePage}
                target="_blank"
                rel="noreferrer"
                className="shell-link"
              >
                Stream source
              </a>
            </div>
          )}
        </div>
      </section>

      <section className="shell-radio-pane shell-radio-browser">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.24em] shell-page-kicker">
              Station browser
            </div>
            <p className="mt-2 text-sm shell-muted">Search by call sign, city, or format.</p>
          </div>
          <div className="shell-chip rounded-full px-3 py-1 text-[11px]">
            {visibleStations.length} visible
          </div>
        </div>

        <div className="shell-radio-form mt-4">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search stations..."
            className="shell-input"
          />
        </div>

        <div className="mt-4 space-y-3 overflow-y-auto pr-1">
          {visibleStations.length === 0 && (
            <div className="rounded-[1.25rem] border border-white/10 bg-black/10 px-4 py-4 text-sm shell-muted">
              No presets match that search.
            </div>
          )}

          {visibleStations.map((station) => {
            const isActive = station.id === selectedStationId

            return (
              <button
                key={station.id}
                type="button"
                onClick={() => handleSelectStation(station.id)}
                className={`shell-radio-station ${isActive ? 'shell-radio-station--active' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.24em] shell-subtle">
                      {station.frequency}
                    </div>
                    <div className="mt-1 text-lg font-semibold text-white">{station.callSign}</div>
                  </div>
                  <span className="shell-chip rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.18em]">
                    {station.genre}
                  </span>
                </div>

                <div className="mt-3 text-sm font-medium text-white/90">{station.name}</div>
                <p className="mt-2 text-sm leading-relaxed shell-muted">{station.tagline}</p>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs shell-subtle">
                  <span>{station.location}</span>
                  <span>{station.format}</span>
                </div>
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}
