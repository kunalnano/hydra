/**
 * AudioEngine — singleton that holds the HTMLAudioElement and persists across page navigation.
 * FMRadio.tsx controls it, but the element lives outside any React component lifecycle.
 */

export type AudioStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error'

type StatusListener = (status: AudioStatus, errorMsg: string | null) => void

let audioElement: HTMLAudioElement | null = null
let currentStatus: AudioStatus = 'idle'
let currentError: string | null = null
let currentTrackId: string | null = null
let currentTrackSrc: string | null = null
const listeners = new Set<StatusListener>()

function mediaErrorMessage(mediaError: MediaError | null): string {
  if (!mediaError) return 'Playback failed for an unknown reason.'

  switch (mediaError.code) {
    case MediaError.MEDIA_ERR_ABORTED:
      return 'Playback was interrupted before the stream started.'
    case MediaError.MEDIA_ERR_NETWORK:
      return 'The relay connected, but the audio stream stalled in transit.'
    case MediaError.MEDIA_ERR_DECODE:
      return 'The stream connected, but the audio data could not be decoded.'
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return 'This source format is not supported by the player.'
    default:
      return 'Playback failed while the stream was loading.'
  }
}

function notify(): void {
  for (const fn of listeners) fn(currentStatus, currentError)
}

function setStatus(s: AudioStatus, err: string | null = null): void {
  currentStatus = s
  currentError = err
  notify()
}

export function getAudioElement(): HTMLAudioElement {
  if (audioElement) return audioElement
  audioElement = new Audio()
  audioElement.preload = 'metadata'

  audioElement.addEventListener('loadstart', () => setStatus('loading'))
  audioElement.addEventListener('waiting', () => setStatus('loading'))
  audioElement.addEventListener('playing', () => setStatus('playing'))
  audioElement.addEventListener('pause', () => {
    if (currentStatus !== 'error') setStatus('paused')
  })
  audioElement.addEventListener('ended', () => setStatus('paused'))
  audioElement.addEventListener('error', () => {
    setStatus('error', mediaErrorMessage(audioElement?.error ?? null))
  })

  return audioElement
}

export function loadTrack(trackId: string, src: string): void {
  const el = getAudioElement()
  if (currentTrackId === trackId && currentTrackSrc === src) return
  currentTrackId = trackId
  currentTrackSrc = src
  setStatus('idle')
  el.pause()
  el.src = src
  el.load()
}

export async function play(): Promise<void> {
  const el = getAudioElement()
  setStatus('loading')
  try {
    await el.play()
  } catch (error) {
    const reason =
      error instanceof DOMException
        ? `${error.name}: ${error.message}`
        : error instanceof Error
          ? error.message
          : 'Unknown playback error.'
    setStatus('error', `Playback did not start. ${reason}`)
  }
}

export function pause(): void {
  getAudioElement().pause()
}

export function stop(resetPosition = false): void {
  const el = getAudioElement()
  el.pause()
  if (resetPosition && Number.isFinite(el.duration)) {
    el.currentTime = 0
  }
  setStatus('paused')
}

export function reload(src: string): void {
  const el = getAudioElement()
  currentTrackSrc = src
  setStatus('loading')
  el.pause()
  el.src = src
  el.load()
  void play()
}

export function setVolume(v: number): void {
  getAudioElement().volume = Math.max(0, Math.min(1, v))
}

export function getStatus(): AudioStatus {
  return currentStatus
}

export function getError(): string | null {
  return currentError
}

export function getCurrentTrackId(): string | null {
  return currentTrackId
}

export function getCurrentTrackSrc(): string | null {
  return currentTrackSrc
}

export function getPlaybackTime(): { currentTime: number; duration: number | null } {
  const el = getAudioElement()
  return {
    currentTime: el.currentTime || 0,
    duration: Number.isFinite(el.duration) ? el.duration : null
  }
}

export function onStatusChange(fn: StatusListener): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

export function isPaused(): boolean {
  return getAudioElement().paused
}
