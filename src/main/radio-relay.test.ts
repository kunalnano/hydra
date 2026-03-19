import { describe, expect, it } from 'vitest'
import { __radioRelayInternals } from './radio-relay'

describe('radio relay helpers', () => {
  it('round-trips encoded relay values', () => {
    const original = 'https://example.com/live stream.mp3?token=abc#frag'
    const encoded = __radioRelayInternals.encodeRelayValue(original)
    expect(__radioRelayInternals.decodeRelayValue(encoded)).toBe(original)
  })

  it('allows only http and https relay targets', () => {
    expect(__radioRelayInternals.isAllowedRemoteUrl('https://example.com/live.mp3')).toBe(true)
    expect(__radioRelayInternals.isAllowedRemoteUrl('http://example.com/live.mp3')).toBe(true)
    expect(__radioRelayInternals.isAllowedRemoteUrl('file:///tmp/test.mp3')).toBe(false)
    expect(__radioRelayInternals.isAllowedRemoteUrl('javascript:alert(1)')).toBe(false)
  })

  it('maps common file extensions to audio mime types', () => {
    expect(__radioRelayInternals.mimeTypeForPath('/tmp/song.mp3')).toBe('audio/mpeg')
    expect(__radioRelayInternals.mimeTypeForPath('/tmp/song.m4a')).toBe('audio/mp4')
    expect(__radioRelayInternals.mimeTypeForPath('/tmp/song.flac')).toBe('audio/flac')
    expect(__radioRelayInternals.mimeTypeForPath('/tmp/song.bin')).toBe('application/octet-stream')
  })

  it('normalizes extension hints and relay file suffixes', () => {
    expect(__radioRelayInternals.normalizeExtensionHint('.MP3')).toBe('mp3')
    expect(
      __radioRelayInternals.relayFileExtension({
        kind: 'remote',
        value: 'https://example.com/live',
        extensionHint: 'AAC'
      })
    ).toBe('aac')
    expect(
      __radioRelayInternals.relayFileExtension({
        kind: 'remote',
        value: 'https://example.com/live.mp3'
      })
    ).toBe('mp3')
    expect(__radioRelayInternals.stripRelayExtension('YWJjMTIz.mp3')).toBe('YWJjMTIz')
  })

  it('parses closed and open byte ranges', () => {
    expect(__radioRelayInternals.parseRangeHeader('bytes=0-99', 200)).toEqual({
      start: 0,
      end: 99
    })
    expect(__radioRelayInternals.parseRangeHeader('bytes=150-', 200)).toEqual({
      start: 150,
      end: 199
    })
    expect(__radioRelayInternals.parseRangeHeader('bytes=-25', 200)).toEqual({
      start: 175,
      end: 199
    })
  })

  it('rejects invalid byte ranges', () => {
    expect(__radioRelayInternals.parseRangeHeader(undefined, 200)).toBeNull()
    expect(__radioRelayInternals.parseRangeHeader('items=0-10', 200)).toBeNull()
    expect(__radioRelayInternals.parseRangeHeader('bytes=250-300', 200)).toBeNull()
    expect(__radioRelayInternals.parseRangeHeader('bytes=50-20', 200)).toBeNull()
  })
})
