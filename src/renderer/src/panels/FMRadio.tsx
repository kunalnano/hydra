import { useEffect, useRef, useState } from 'react'
import type { RadioHomeLocation } from '../../../shared/types'
import {
  CUSTOM_RADIO_STREAM_ID,
  DEFAULT_RADIO_STATION_ID,
  type LocalAudioFile,
  useRadioStore
} from '../stores/radio'
import * as engine from '../stores/audio-engine'
import { FM_STATIONS, type RadioStation, type StationCategory } from './fm-stations'
import { RadioSignalGlobe } from '../components/RadioSignalGlobe'
import { RadioRippleVisualizer } from '../components/RadioRippleVisualizer'

type PlaylistEntryKind = 'station' | 'local' | 'custom'

interface PlaylistEntry {
  id: string
  kind: PlaylistEntryKind
  label: string
  title: string
  subtitle: string
  badge: string
  searchText: string
  sourceUrl: string
  station?: RadioStation
  localFile?: LocalAudioFile
}

const FILTER_BANDS: Array<{ key: StationCategory | 'all'; short: string; label: string }> = [
  { key: 'all', short: 'ALL', label: 'All' },
  { key: 'jazz', short: 'JAZ', label: 'Jazz' },
  { key: 'eclectic', short: 'ECL', label: 'Eclectic' },
  { key: 'ambient', short: 'AMB', label: 'Ambient' },
  { key: 'soul', short: 'RNB', label: 'Soul / R&B' },
  { key: 'alt', short: 'ALT', label: 'Alternative' },
  { key: 'community', short: 'COM', label: 'Community' },
  { key: 'hacker', short: 'HAX', label: 'Hacker' }
]

function fallbackFileUrl(path: string): string {
  if (path.startsWith('/')) {
    return `file://${encodeURI(path).replace(/#/g, '%23')}`
  }
  return encodeURI(`file://${path}`).replace(/#/g, '%23')
}

function buildStationEntry(station: RadioStation): PlaylistEntry {
  return {
    id: station.id,
    kind: 'station',
    label: station.callSign,
    title: station.name,
    subtitle: `${station.frequency} · ${station.location}`,
    badge: 'LIVE',
    searchText: `${station.callSign} ${station.name} ${station.location} ${station.genre} ${station.tagline}`.toLowerCase(),
    sourceUrl: station.streamUrl,
    station
  }
}

function buildLocalEntry(file: LocalAudioFile): PlaylistEntry {
  return {
    id: file.id,
    kind: 'local',
    label: 'FILE',
    title: file.name,
    subtitle: 'Local library',
    badge: getFileExtension(file.name),
    searchText: `${file.name} ${file.path}`.toLowerCase(),
    sourceUrl: file.sourceUrl ?? fallbackFileUrl(file.path),
    localFile: file
  }
}

function buildCustomEntry(name: string, url: string): PlaylistEntry | null {
  if (!url) return null
  return {
    id: CUSTOM_RADIO_STREAM_ID,
    kind: 'custom',
    label: 'URL',
    title: name || 'Personal relay',
    subtitle: 'Direct stream URL',
    badge: 'URL',
    searchText: `${name} ${url}`.toLowerCase(),
    sourceUrl: url
  }
}

function mediaExtensionHint(value: string): string | null {
  try {
    const parsed = new URL(value)
    const ext = parsed.pathname.split('.').pop()?.toLowerCase() ?? ''
    return ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'flac'].includes(ext) ? ext : null
  } catch {
    const ext = value.split('.').pop()?.toLowerCase() ?? ''
    return ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'flac'].includes(ext) ? ext : null
  }
}

function entryExtensionHint(entry: PlaylistEntry): string | undefined {
  if (entry.kind === 'local') {
    return mediaExtensionHint(entry.localFile?.path ?? entry.sourceUrl) ?? 'mp3'
  }

  const urlExtension = mediaExtensionHint(entry.sourceUrl)
  if (urlExtension) return urlExtension

  if (entry.station) {
    const formatToken = entry.station.format.split(' ')[0]?.toLowerCase()
    if (['mp3', 'm4a', 'aac', 'wav', 'ogg', 'flac'].includes(formatToken)) {
      return formatToken
    }
  }

  return entry.kind === 'custom' ? 'mp3' : undefined
}

function relayCacheKey(entry: PlaylistEntry): string {
  const extensionHint = entryExtensionHint(entry) ?? 'none'
  return entry.kind === 'local' && entry.localFile
    ? `local:${entry.localFile.path}:${extensionHint}`
    : `remote:${entry.sourceUrl}:${extensionHint}`
}

function isValidUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function streamHost(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '')
  } catch {
    return url
  }
}

function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(whole / 60)
  const remainingSeconds = whole % 60
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}

function getFileExtension(name: string): string {
  const parts = name.split('.')
  if (parts.length < 2) return 'FILE'
  return parts[parts.length - 1].toUpperCase()
}

function getBitrateLabel(entry: PlaylistEntry | null): string {
  if (!entry) return '--'
  if (entry.kind === 'local') return 'LOCAL'
  if (entry.kind === 'custom') return 'URL'
  const match = entry.station?.format.match(/(\d+)/)
  return match ? `${match[1]} kbps` : entry.station?.format ?? 'LIVE'
}

function getCodecLabel(entry: PlaylistEntry | null): string {
  if (!entry) return '--'
  if (entry.kind === 'local') return getFileExtension(entry.localFile?.name ?? '')
  if (entry.kind === 'custom') return 'HTTP'
  return entry.station?.format.split(' ')[0] ?? 'STREAM'
}

function getStatusLine(entry: PlaylistEntry | null, status: engine.AudioStatus, error: string | null): string {
  if (error) return error
  if (!entry) return 'Pick a station or press ADD MP3s to load your own files.'
  if (status === 'loading') return `Tuning ${entry.label}...`
  if (status === 'playing') return `${entry.title} is on air.`
  if (status === 'paused') return `${entry.title} is cued.`
  return 'Ready.'
}

function formatCoordinateInput(value: number | undefined): string {
  return Number.isFinite(value) ? String(value) : ''
}

export function FMRadioPanel(): JSX.Element {
  const stationId = useRadioStore((s) => s.selectedStationId)
  const setStationId = useRadioStore((s) => s.setSelectedStationId)
  const volume = useRadioStore((s) => s.volume)
  const setVolume = useRadioStore((s) => s.setVolume)
  const customStationName = useRadioStore((s) => s.customStationName)
  const customStreamUrl = useRadioStore((s) => s.customStreamUrl)
  const setCustomStation = useRadioStore((s) => s.setCustomStation)
  const localFiles = useRadioStore((s) => s.localFiles)
  const addLocalFile = useRadioStore((s) => s.addLocalFile)
  const removeLocalFile = useRadioStore((s) => s.removeLocalFile)

  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<engine.AudioStatus>(engine.getStatus())
  const [error, setError] = useState<string | null>(engine.getError())
  const [nameDraft, setNameDraft] = useState(customStationName)
  const [urlDraft, setUrlDraft] = useState(customStreamUrl)
  const [category, setCategory] = useState<StationCategory | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null)
  const [homeLocation, setHomeLocation] = useState<RadioHomeLocation | null>(null)
  const [homeDialogOpen, setHomeDialogOpen] = useState(false)
  const [homeLabelDraft, setHomeLabelDraft] = useState('')
  const [homeLatitudeDraft, setHomeLatitudeDraft] = useState('')
  const [homeLongitudeDraft, setHomeLongitudeDraft] = useState('')
  const [homeLocationError, setHomeLocationError] = useState<string | null>(null)
  const [homeLocationSaving, setHomeLocationSaving] = useState(false)
  const relayCacheRef = useRef(new Map<string, string>())
  const relayRequestRef = useRef(0)
  const didInitialCueRef = useRef(false)

  const playlistEntries: PlaylistEntry[] = []
  for (const file of localFiles) {
    playlistEntries.push(buildLocalEntry(file))
  }
  const customEntry = buildCustomEntry(customStationName, customStreamUrl)
  if (customEntry) {
    playlistEntries.push(customEntry)
  }
  for (const station of FM_STATIONS) {
    playlistEntries.push(buildStationEntry(station))
  }

  const activeEntry = playlistEntries.find((entry) => entry.id === stationId) ?? null
  const visibleEntries = playlistEntries.filter((entry) => {
    if (entry.kind === 'station' && category && entry.station?.category !== category) {
      return false
    }
    if (!query.trim()) return true
    return entry.searchText.includes(query.trim().toLowerCase())
  })

  const currentTrackIndex = Math.max(
    0,
    playlistEntries.findIndex((entry) => entry.id === stationId)
  )
  const activeStation = activeEntry?.station ?? null
  const activeLocalFile = activeEntry?.localFile ?? null
  const timerLabel =
    activeEntry?.kind === 'local' && durationSeconds !== null
      ? `${formatClock(elapsedSeconds)} / ${formatClock(durationSeconds)}`
      : status === 'playing'
        ? 'LIVE'
        : '--:--'

  useEffect(
    () =>
      engine.onStatusChange((nextStatus, nextError) => {
        setStatus(nextStatus)
        setError(nextError)
      }),
    []
  )

  useEffect(() => {
    setNameDraft(customStationName)
  }, [customStationName])

  useEffect(() => {
    setUrlDraft(customStreamUrl)
  }, [customStreamUrl])

  useEffect(() => {
    engine.setVolume(volume)
  }, [volume])

  useEffect(() => {
    let active = true

    void window.helm
      .getConfig()
      .then((config) => {
        if (!active) return
        const savedLocation = config.radioHomeLocation ?? null
        setHomeLocation(savedLocation)
        setHomeLabelDraft(savedLocation?.label ?? '')
        setHomeLatitudeDraft(formatCoordinateInput(savedLocation?.latitude))
        setHomeLongitudeDraft(formatCoordinateInput(savedLocation?.longitude))
        if (!savedLocation) {
          setHomeDialogOpen(true)
        }
      })
      .catch(() => {
        if (!active) return
        setHomeDialogOpen(true)
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const syncPlaybackClock = (): void => {
      const next = engine.getPlaybackTime()
      setElapsedSeconds(next.currentTime)
      setDurationSeconds(next.duration)
    }

    syncPlaybackClock()
    const timer = window.setInterval(syncPlaybackClock, status === 'playing' ? 500 : 1000)
    return () => window.clearInterval(timer)
  }, [stationId, status])

  async function resolvePlaybackUrl(entry: PlaylistEntry): Promise<string> {
    const cacheKey = relayCacheKey(entry)
    const cached = relayCacheRef.current.get(cacheKey)
    if (cached) return cached
    const extensionHint = entryExtensionHint(entry)

    const relayUrl =
      entry.kind === 'local' && entry.localFile
        ? await window.helm.resolveRadioSource({
            kind: 'local',
            value: entry.localFile.path,
            extensionHint
          })
        : await window.helm.resolveRadioSource({
            kind: 'remote',
            value: entry.sourceUrl,
            extensionHint
          })

    relayCacheRef.current.set(cacheKey, relayUrl)
    return relayUrl
  }

  async function cueEntry(
    entry: PlaylistEntry,
    options: { autoplay?: boolean; forceReload?: boolean } = {}
  ): Promise<void> {
    const { autoplay = true, forceReload = false } = options
    const requestId = ++relayRequestRef.current

    setStationId(entry.id)
    setError(null)

    let playbackUrl: string
    try {
      playbackUrl = await resolvePlaybackUrl(entry)
    } catch (nextError) {
      if (requestId !== relayRequestRef.current) return
      const message = nextError instanceof Error ? nextError.message : 'Unknown relay error.'
      engine.stop()
      setError(`Relay setup failed. ${message}`)
      return
    }

    if (requestId !== relayRequestRef.current) return

    const sameTrack =
      engine.getCurrentTrackId() === entry.id && engine.getCurrentTrackSrc() === playbackUrl

    if (forceReload) {
      if (sameTrack) {
        engine.reload(playbackUrl)
      } else {
        engine.loadTrack(entry.id, playbackUrl)
        if (autoplay) {
          await engine.play()
        }
      }
      return
    }

    if (!sameTrack) {
      engine.loadTrack(entry.id, playbackUrl)
    }

    if (!autoplay) return

    if (sameTrack && engine.getStatus() === 'error') {
      engine.reload(playbackUrl)
      return
    }

    await engine.play()
  }

  useEffect(() => {
    if (!activeEntry) {
      setStationId(DEFAULT_RADIO_STATION_ID)
      return
    }

    if (didInitialCueRef.current) return
    didInitialCueRef.current = true
    void cueEntry(activeEntry, { autoplay: false })
  }, [activeEntry, setStationId])

  function handleSelect(id: string): void {
    const entry = playlistEntries.find((candidate) => candidate.id === id)
    if (!entry) return
    void cueEntry(entry)
  }

  function handleTogglePlayback(): void {
    if (!activeEntry) {
      const fallbackEntry = playlistEntries.find((entry) => entry.id === DEFAULT_RADIO_STATION_ID)
      if (fallbackEntry) void cueEntry(fallbackEntry)
      return
    }

    if (status === 'playing') {
      engine.pause()
      return
    }

    if (engine.getCurrentTrackId() !== activeEntry.id || !engine.getCurrentTrackSrc()) {
      void cueEntry(activeEntry)
      return
    }

    if (status === 'error') {
      void cueEntry(activeEntry, { forceReload: true })
      return
    }

    void engine.play()
  }

  function handleStop(): void {
    engine.stop(true)
  }

  function handleReload(): void {
    if (!activeEntry) return
    void cueEntry(activeEntry, { forceReload: true })
  }

  function stepTrack(direction: -1 | 1): void {
    if (playlistEntries.length === 0) return
    const nextIndex = (currentTrackIndex + direction + playlistEntries.length) % playlistEntries.length
    const nextEntry = playlistEntries[nextIndex]
    if (nextEntry) void cueEntry(nextEntry)
  }

  function handleTuneChange(index: number): void {
    const nextEntry = playlistEntries[index]
    if (!nextEntry) return
    void cueEntry(nextEntry)
  }

  function handleCustomLoad(): void {
    const nextUrl = urlDraft.trim()
    if (!isValidUrl(nextUrl)) {
      setError('Paste a full stream URL starting with http:// or https://.')
      return
    }

    const nextName = nameDraft.trim() || 'Personal relay'
    setCustomStation(nextName, nextUrl)
    const nextEntry = buildCustomEntry(nextName, nextUrl)
    if (nextEntry) {
      void cueEntry(nextEntry, { forceReload: true })
    }
  }

  async function handleAddDisk(): Promise<void> {
    try {
      const files = await window.helm.openAudioFiles()
      for (const file of files) {
        addLocalFile(file.name, file.path, file.sourceUrl)
      }

      if (files.length === 0) return

      const nextLocalFiles = useRadioStore.getState().localFiles
      const newestLocalFile = nextLocalFiles[nextLocalFiles.length - 1]
      if (newestLocalFile) {
        void cueEntry(buildLocalEntry(newestLocalFile))
      }
    } catch {
      setError('Could not open the file picker.')
    }
  }

  function openHomeDialog(): void {
    setHomeLocationError(null)
    setHomeLabelDraft(homeLocation?.label ?? '')
    setHomeLatitudeDraft(formatCoordinateInput(homeLocation?.latitude))
    setHomeLongitudeDraft(formatCoordinateInput(homeLocation?.longitude))
    setHomeDialogOpen(true)
  }

  function closeHomeDialog(): void {
    setHomeLocationError(null)
    setHomeDialogOpen(false)
  }

  async function handleSaveHomeLocation(): Promise<void> {
    const label = homeLabelDraft.trim()
    const latitude = Number(homeLatitudeDraft.trim())
    const longitude = Number(homeLongitudeDraft.trim())

    if (!label) {
      setHomeLocationError('Enter a label for the saved endpoint.')
      return
    }

    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      setHomeLocationError('Latitude must be a number between -90 and 90.')
      return
    }

    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      setHomeLocationError('Longitude must be a number between -180 and 180.')
      return
    }

    const nextHomeLocation: RadioHomeLocation = {
      label,
      latitude,
      longitude
    }

    setHomeLocationSaving(true)
    setHomeLocationError(null)

    try {
      const current = await window.helm.getConfig()
      await window.helm.saveConfig({
        ...current,
        radioHomeLocation: nextHomeLocation
      })
      setHomeLocation(nextHomeLocation)
      setHomeDialogOpen(false)
    } catch {
      setHomeLocationError('Could not save the home endpoint.')
    } finally {
      setHomeLocationSaving(false)
    }
  }

  return (
    <div className="winamp-radio">
      <section className="winamp-window winamp-main-window">
        <div className="winamp-titlebar">
          <span className="winamp-titlebar-label">HydraAmp Classic · FM / MP3 Deck</span>
          <div className="winamp-titlebar-actions" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </div>

        <div className="winamp-main-body">
          <div className="winamp-main-topline">
            <div className="winamp-led-panel">
              <div className="winamp-led-row">
                <span className="winamp-led-token">{activeEntry?.label ?? 'HELM'}</span>
                <span className="winamp-led-token">{getBitrateLabel(activeEntry)}</span>
                <span className="winamp-led-token">{getCodecLabel(activeEntry)}</span>
                <span className="winamp-led-token">{status === 'playing' ? 'STEREO' : 'READY'}</span>
              </div>
              <div className="winamp-led-title">{activeEntry?.title ?? 'Winamp-style stereo relay'}</div>
              <div className="winamp-led-subtitle">
                {activeStation?.frequency ??
                  (activeLocalFile ? 'LOCAL FILE' : activeEntry?.kind === 'custom' ? 'DIRECT URL' : '88.3 FM')}
                {' · '}
                {activeEntry?.subtitle ?? 'FM presets, manual streams, and your own MP3s'}
              </div>
              <div className="winamp-led-status">{getStatusLine(activeEntry, status, error)}</div>
            </div>

            <RadioRippleVisualizer
              status={status}
              volume={volume}
              seed={activeEntry?.id ?? activeEntry?.title ?? null}
            />
          </div>

          <div className="winamp-readout-strip">
            <div className="winamp-readout-cell">
              <span className="winamp-readout-label">Time</span>
              <strong>{timerLabel}</strong>
            </div>
            <div className="winamp-readout-cell">
              <span className="winamp-readout-label">Source</span>
              <strong>{activeEntry ? streamHost(activeEntry.sourceUrl) : '--'}</strong>
            </div>
            <div className="winamp-readout-cell">
              <span className="winamp-readout-label">Library</span>
              <strong>{playlistEntries.length}</strong>
            </div>
          </div>

          <div className="winamp-transport-row">
            <button
              type="button"
              className="winamp-round-button"
              onClick={() => stepTrack(-1)}
              title="Previous"
            >
              ◀◀
            </button>
            <button
              type="button"
              className="winamp-round-button"
              onClick={handleTogglePlayback}
              title={status === 'playing' ? 'Pause' : 'Play'}
            >
              {status === 'playing' ? '❚❚' : '▶'}
            </button>
            <button
              type="button"
              className="winamp-round-button"
              onClick={handleStop}
              title="Stop"
            >
              ■
            </button>
            <button
              type="button"
              className="winamp-round-button"
              onClick={() => stepTrack(1)}
              title="Next"
            >
              ▶▶
            </button>
            <button
              type="button"
              className="winamp-round-button winamp-round-button--accent"
              onClick={handleReload}
              title="Reload"
            >
              ↻
            </button>

            <div className="winamp-transport-spacer" />

            <button type="button" className="winamp-action-button" onClick={() => void handleAddDisk()}>
              Add MP3s
            </button>
          </div>

          <div className="winamp-slider-grid">
            <label className="winamp-slider-row">
              <span className="winamp-slider-label">Volume</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={(event) => setVolume(Number(event.target.value))}
                className="winamp-slider"
              />
              <span className="winamp-slider-value">{Math.round(volume * 100)}%</span>
            </label>

            <label className="winamp-slider-row">
              <span className="winamp-slider-label">Tune</span>
              <input
                type="range"
                min={0}
                max={Math.max(playlistEntries.length - 1, 0)}
                step={1}
                value={currentTrackIndex}
                onChange={(event) => handleTuneChange(Number(event.target.value))}
                className="winamp-slider"
              />
              <span className="winamp-slider-value">{currentTrackIndex + 1}</span>
            </label>
          </div>

          <div className="winamp-manual-strip">
            <input
              type="text"
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              placeholder="Direct stream name"
              className="winamp-textbox"
            />
            <input
              type="url"
              value={urlDraft}
              onChange={(event) => setUrlDraft(event.target.value)}
              placeholder="https://example.com/live.mp3"
              className="winamp-textbox winamp-textbox--wide"
            />
            <button type="button" className="winamp-action-button" onClick={handleCustomLoad}>
              Load URL
            </button>
          </div>
        </div>
      </section>

      <section className="winamp-window winamp-signal-window">
        <div className="winamp-titlebar">
          <span className="winamp-titlebar-label">Signal Globe</span>
          <div className="winamp-signal-titlebar-actions">
            <button type="button" className="winamp-mini-pill winamp-mini-pill--button" onClick={openHomeDialog}>
              {homeLocation ? 'Edit Home' : 'Set Home'}
            </button>
            <div className="winamp-mini-pill">{activeEntry?.label ?? 'IDLE'}</div>
          </div>
        </div>

        <div className="winamp-signal-body">
          <div className="winamp-signal-toolbar">
            <div className="winamp-signal-toolbar-copy">
              <span className="winamp-signal-toolbar-kicker">Home endpoint</span>
              <span className="winamp-signal-toolbar-value">
                {homeLocation
                  ? `${homeLocation.label} · ${homeLocation.latitude.toFixed(4)}, ${homeLocation.longitude.toFixed(4)}`
                  : 'Not configured'}
              </span>
            </div>
            {!homeLocation && (
              <span className="winamp-warning-pill">Route mapping needs a saved home location</span>
            )}
          </div>
          <RadioSignalGlobe
            station={activeStation}
            mode={activeEntry?.kind ?? 'idle'}
            sourceLabel={
              activeEntry?.kind === 'local'
                ? activeLocalFile?.name ?? null
                : activeEntry
                  ? streamHost(activeEntry.sourceUrl)
                  : null
            }
            homeLocation={homeLocation}
          />

          <div className="winamp-filter-strip">
            <span className="winamp-filter-label">Filters</span>
            <div className="winamp-filter-chips">
              {FILTER_BANDS.map((band) => {
                const active = band.key === 'all' ? category === null : category === band.key
                return (
                  <button
                    key={band.key}
                    type="button"
                    className={`winamp-filter-chip ${active ? 'winamp-filter-chip--active' : ''}`}
                    onClick={() => setCategory(band.key === 'all' ? null : band.key)}
                    title={band.label}
                  >
                    {band.short}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="winamp-window winamp-playlist-window">
        <div className="winamp-titlebar">
          <span className="winamp-titlebar-label">Playlist Editor</span>
          <div className="winamp-mini-pill">{visibleEntries.length} Items</div>
        </div>

        <div className="winamp-playlist-toolbar">
          <button type="button" className="winamp-action-button" onClick={() => void handleAddDisk()}>
            Add MP3s
          </button>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search stations or local files"
            className="winamp-textbox winamp-textbox--wide"
          />
        </div>

        <div className="winamp-playlist-screen">
          {localFiles.length === 0 && (
            <button
              type="button"
              className="winamp-library-banner"
              onClick={() => void handleAddDisk()}
            >
              Add MP3s from disk to build your own playlist.
            </button>
          )}

          {visibleEntries.length === 0 && (
            <div className="winamp-empty-state">No stations or files match the current filter.</div>
          )}

          {visibleEntries.map((entry, index) => {
            const active = entry.id === stationId
            const localFile = entry.localFile

            return (
              <div
                key={entry.id}
                className={`winamp-playlist-row ${active ? 'winamp-playlist-row--active' : ''}`}
              >
                <button
                  type="button"
                  onClick={() => handleSelect(entry.id)}
                  className="winamp-playlist-hit"
                >
                  <span className="winamp-playlist-index">{String(index + 1).padStart(2, '0')}.</span>
                  <span className="winamp-playlist-main">
                    <span className="winamp-playlist-title">
                      {entry.label} · {entry.title}
                    </span>
                    <span className="winamp-playlist-detail">{entry.subtitle}</span>
                  </span>
                  <span className="winamp-playlist-badge">{entry.badge}</span>
                </button>
                {entry.kind === 'local' && localFile ? (
                  <button
                    type="button"
                    className="winamp-playlist-remove"
                    onClick={() => removeLocalFile(localFile.id)}
                    title="Remove from local library"
                  >
                    ×
                  </button>
                ) : null}
              </div>
            )
          })}
        </div>

        <div className="winamp-playlist-footer">
          <div className="winamp-footer-copy">
            {activeStation ? activeStation.tagline : 'Stations stream live. Local files stay in your private library.'}
          </div>
          {activeStation ? (
            <div className="winamp-footer-links">
              <a href={activeStation.website} target="_blank" rel="noreferrer" className="winamp-footer-link">
                Site
              </a>
              <a href={activeStation.sourcePage} target="_blank" rel="noreferrer" className="winamp-footer-link">
                Source
              </a>
              {!activeStation.verified ? <span className="winamp-warning-pill">Unverified</span> : null}
            </div>
          ) : null}
        </div>
      </section>

      {homeDialogOpen && (
        <div className="winamp-home-overlay" role="presentation">
          <div
            className="winamp-home-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="radio-home-dialog-title"
          >
            <div className="winamp-titlebar">
              <span id="radio-home-dialog-title" className="winamp-titlebar-label">
                Set Radio Home Endpoint
              </span>
              <div className="winamp-titlebar-actions" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
            </div>

            <div className="winamp-home-dialog-body">
              <p className="winamp-home-dialog-copy">
                Save the receiving location once and HELM will map every station route against it.
              </p>

              <label className="winamp-home-field">
                <span className="winamp-home-field-label">Label</span>
                <input
                  type="text"
                  value={homeLabelDraft}
                  onChange={(event) => setHomeLabelDraft(event.target.value)}
                  placeholder="Home base"
                  className="winamp-textbox"
                />
              </label>

              <div className="winamp-home-field-grid">
                <label className="winamp-home-field">
                  <span className="winamp-home-field-label">Latitude</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={homeLatitudeDraft}
                    onChange={(event) => setHomeLatitudeDraft(event.target.value)}
                    placeholder="35.1234"
                    className="winamp-textbox"
                  />
                </label>

                <label className="winamp-home-field">
                  <span className="winamp-home-field-label">Longitude</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={homeLongitudeDraft}
                    onChange={(event) => setHomeLongitudeDraft(event.target.value)}
                    placeholder="-97.1234"
                    className="winamp-textbox"
                  />
                </label>
              </div>

              {homeLocationError && <div className="winamp-home-error">{homeLocationError}</div>}

              <div className="winamp-home-actions">
                <button type="button" className="winamp-round-button" onClick={closeHomeDialog}>
                  Later
                </button>
                <button
                  type="button"
                  className="winamp-action-button"
                  onClick={() => void handleSaveHomeLocation()}
                  disabled={homeLocationSaving}
                >
                  {homeLocationSaving ? 'Saving…' : 'Save Home'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
