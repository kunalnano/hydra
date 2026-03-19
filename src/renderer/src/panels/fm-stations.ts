/*
 * FM Radio station presets and types.
 *
 * Stream URL verification notes (2026-03):
 * - SomaFM URLs are stable public Icecast endpoints, historically reliable.
 * - Public radio stations (WBGO, KEXP, KUTX, WWOZ, KCRW) use CDN-backed
 *   streams that change occasionally. URLs sourced from official listen pages.
 * - WFMU, NTS, BBC 6 Music, KCSM, WBLS, KBLX streams are best-effort.
 *   Some may require periodic re-verification.
 * - SomaFM does not have a "Soul GLP" channel as of 2026-03.
 * - Oprah/OWN audio is not publicly streamable.
 */

export type StationCategory =
  | 'jazz'
  | 'eclectic'
  | 'soul'
  | 'ambient'
  | 'community'
  | 'alt'
  | 'hacker'
  | 'classical'

export interface RadioStation {
  id: string
  callSign: string
  frequency: string
  name: string
  location: string
  genre: string
  category: StationCategory
  tagline: string
  streamUrl: string
  format: string
  website: string
  sourcePage: string
  verified: boolean
}

export const ALL_CATEGORIES: { key: StationCategory; label: string }[] = [
  { key: 'jazz', label: 'Jazz' },
  { key: 'eclectic', label: 'Eclectic' },
  { key: 'soul', label: 'Soul / R&B' },
  { key: 'ambient', label: 'Ambient' },
  { key: 'community', label: 'Community' },
  { key: 'alt', label: 'Alt' },
  { key: 'hacker', label: 'Hacker' },
  { key: 'classical', label: 'Classical' }
]

export const FM_STATIONS: RadioStation[] = [
  // ── Jazz ──
  {
    id: 'wbgo-jazz',
    callSign: 'WBGO',
    frequency: '88.3 FM',
    name: 'Jazz 88.3',
    location: 'Newark / New York City',
    genre: 'Jazz',
    category: 'jazz',
    tagline: 'Straight-ahead jazz, soul, and host-driven sets.',
    streamUrl: 'https://ais-sa8.cdnstream1.com/3629_128.mp3',
    format: 'MP3 128',
    website: 'https://www.wbgo.org',
    sourcePage: 'https://www.wbgo.org/how-to-listen-online',
    verified: true
  },
  {
    id: 'wwoz',
    callSign: 'WWOZ',
    frequency: '90.7 FM',
    name: 'New Orleans',
    location: 'New Orleans',
    genre: 'Jazz / Funk / Community',
    category: 'community',
    tagline: 'New Orleans jazz, brass, funk, and neighborhood energy.',
    streamUrl: 'https://wwoz-sc.streamguys1.com/wwoz-hi.mp3',
    format: 'MP3',
    website: 'https://www.wwoz.org',
    sourcePage: 'https://www.wwoz.org/listen/player/',
    verified: true
  },
  {
    id: 'kcsm',
    callSign: 'KCSM',
    frequency: '91.1 FM',
    name: 'Jazz 91',
    location: 'San Mateo / Bay Area',
    genre: 'Jazz',
    category: 'jazz',
    tagline: 'Bay Area jazz institution, deep catalog and local feel.',
    streamUrl: 'https://ice7.securenetsystems.net/KCSM2',
    format: 'MP3',
    website: 'https://www.kcsm.org',
    sourcePage: 'https://www.kcsm.org/listen-live/',
    verified: false
  },

  // ── Eclectic ──
  {
    id: 'kexp',
    callSign: 'KEXP',
    frequency: '90.3 FM',
    name: 'Seattle',
    location: 'Seattle',
    genre: 'Eclectic',
    category: 'eclectic',
    tagline: 'Curated indie, post-punk, electronic, and left-field rotation.',
    streamUrl: 'https://kexp.streamguys1.com/kexp160.aac',
    format: 'AAC 160',
    website: 'https://www.kexp.org',
    sourcePage: 'https://www.kexp.org/mobile/kexp-livestreams/',
    verified: true
  },
  {
    id: 'kcrw',
    callSign: 'KCRW',
    frequency: '89.9 FM',
    name: 'Simulcast',
    location: 'Santa Monica / Los Angeles',
    genre: 'Eclectic',
    category: 'eclectic',
    tagline: 'Public-radio eclecticism with music blocks and magazine energy.',
    streamUrl: 'https://streams.kcrw.com/kcrw_mp3',
    format: 'MP3',
    website: 'https://www.kcrw.com',
    sourcePage: 'https://media.kcrw.com/pls/kcrwsimulcast.pls',
    verified: true
  },
  {
    id: 'nts-1',
    callSign: 'NTS',
    frequency: 'Online',
    name: 'NTS 1',
    location: 'London',
    genre: 'Eclectic',
    category: 'eclectic',
    tagline: 'London freeform with global DJ residencies and deep crates.',
    streamUrl: 'https://stream-relay-geo.ntslive.net/stream',
    format: 'MP3',
    website: 'https://www.nts.live',
    sourcePage: 'https://www.nts.live/listen',
    verified: false
  },

  // ── Alternative ──
  {
    id: 'kutx',
    callSign: 'KUTX',
    frequency: '98.9 FM',
    name: 'Austin Music',
    location: 'Austin',
    genre: 'Alternative',
    category: 'alt',
    tagline: 'Austin AAA and local scene staples with a warmer daytime flow.',
    streamUrl: 'https://streams.kut.org/4428_192.mp3?aw_0_1st.playerid=kutx-free',
    format: 'MP3 192',
    website: 'https://kutx.org',
    sourcePage: 'https://kutx.org/streams/',
    verified: true
  },

  // ── Community / Freeform ──
  {
    id: 'wfmu',
    callSign: 'WFMU',
    frequency: '91.1 FM',
    name: 'Freeform',
    location: 'Jersey City',
    genre: 'Freeform',
    category: 'community',
    tagline: 'Longest-running freeform radio in the US. Expect anything.',
    streamUrl: 'https://stream0.wfmu.org/freeform-128k',
    format: 'MP3 128',
    website: 'https://wfmu.org',
    sourcePage: 'https://wfmu.org/listen/',
    verified: false
  },

  // ── Ambient (SomaFM) ──
  {
    id: 'somafm-groovesalad',
    callSign: 'SomaFM',
    frequency: 'Groove Salad',
    name: 'Groove Salad',
    location: 'San Francisco',
    genre: 'Ambient / Downtempo',
    category: 'ambient',
    tagline: 'A nicely chilled plate of ambient and downtempo beats.',
    streamUrl: 'http://ice1.somafm.com/groovesalad-256-mp3',
    format: 'MP3 256',
    website: 'https://somafm.com/groovesalad/',
    sourcePage: 'https://somafm.com/groovesalad/',
    verified: true
  },
  {
    id: 'somafm-dronezone',
    callSign: 'SomaFM',
    frequency: 'Drone Zone',
    name: 'Drone Zone',
    location: 'San Francisco',
    genre: 'Ambient / Drone',
    category: 'ambient',
    tagline: 'Atmospheric textures with minimal beats. Headphone music.',
    streamUrl: 'http://ice1.somafm.com/dronezone-256-mp3',
    format: 'MP3 256',
    website: 'https://somafm.com/dronezone/',
    sourcePage: 'https://somafm.com/dronezone/',
    verified: true
  },
  {
    id: 'somafm-lush',
    callSign: 'SomaFM',
    frequency: 'Lush',
    name: 'Lush',
    location: 'San Francisco',
    genre: 'Sensual Downtempo',
    category: 'ambient',
    tagline: 'Sensual, mellow downtempo vocals and instrumentals.',
    streamUrl: 'http://ice1.somafm.com/lush-128-mp3',
    format: 'MP3 128',
    website: 'https://somafm.com/lush/',
    sourcePage: 'https://somafm.com/lush/',
    verified: true
  },

  // ── Soul / R&B (SomaFM channels) ──
  {
    id: 'somafm-gsclassic',
    callSign: 'SomaFM',
    frequency: 'GS Classic',
    name: 'Groove Salad Classic',
    location: 'San Francisco',
    genre: 'Soul / Downtempo',
    category: 'soul',
    tagline: 'The classic Groove Salad flavor. Ambient soul downtempo.',
    streamUrl: 'http://ice1.somafm.com/gsclassic-128-mp3',
    format: 'MP3 128',
    website: 'https://somafm.com/gsclassic/',
    sourcePage: 'https://somafm.com/gsclassic/',
    verified: true
  },
  {
    id: 'somafm-illstreet',
    callSign: 'SomaFM',
    frequency: 'IL Street',
    name: 'Illinois Street Lounge',
    location: 'San Francisco',
    genre: 'Lounge / Exotica / Soul',
    category: 'soul',
    tagline: 'Classic lounge, exotica, and vintage soul cocktail vibes.',
    streamUrl: 'http://ice1.somafm.com/illstreet-128-mp3',
    format: 'MP3 128',
    website: 'https://somafm.com/illstreet/',
    sourcePage: 'https://somafm.com/illstreet/',
    verified: true
  },

  // ── Hacker ──
  {
    id: 'somafm-defcon',
    callSign: 'SomaFM',
    frequency: 'DEF CON',
    name: 'DEF CON Radio',
    location: 'San Francisco',
    genre: 'Hacker / Electronic',
    category: 'hacker',
    tagline: 'Music for hacking. DEF CON conference radio.',
    streamUrl: 'http://ice1.somafm.com/defcon-256-mp3',
    format: 'MP3 256',
    website: 'https://somafm.com/defcon/',
    sourcePage: 'https://somafm.com/defcon/',
    verified: true
  },

  // ── Hacker (additional) ──
  {
    id: 'somafm-cliqhop',
    callSign: 'SomaFM',
    frequency: 'Cliqhop',
    name: 'Cliqhop IDM',
    location: 'San Francisco',
    genre: 'IDM / Electronic',
    category: 'hacker',
    tagline: 'Blips, clicks, and glitchy beats. Intelligent dance music.',
    streamUrl: 'http://ice1.somafm.com/cliqhop-256-mp3',
    format: 'MP3 256',
    website: 'https://somafm.com/cliqhop/',
    sourcePage: 'https://somafm.com/cliqhop/',
    verified: true
  },

  // ── Soul / R&B ──
  // Oprah Radio (SiriusXM Ch 51) — no public stream available. SiriusXM requires paid subscription.
  {
    id: 'wbls',
    callSign: 'WBLS',
    frequency: '107.5 FM',
    name: 'WBLS',
    location: 'New York City',
    genre: 'R&B / Soul',
    category: 'soul',
    tagline: 'Classic and contemporary R&B, soul, and hip-hop from NYC.',
    streamUrl: 'https://stream.revma.ihrhls.com/zc2121',
    format: 'AAC',
    website: 'https://www.wbls.com',
    sourcePage: 'https://www.wbls.com/listen-live/',
    verified: false
  },
  {
    id: 'kblx',
    callSign: 'KBLX',
    frequency: '102.9 FM',
    name: 'KBLX',
    location: 'Bay Area',
    genre: 'R&B / Soul',
    category: 'soul',
    tagline: 'Bay Area smooth R&B, soul, and adult contemporary.',
    streamUrl: 'https://stream.revma.ihrhls.com/zc2493',
    format: 'AAC',
    website: 'https://www.kblx.com',
    sourcePage: 'https://www.kblx.com/listen-live/',
    verified: false
  },

  // ── BBC (may be geo-restricted outside UK) ──
  {
    id: 'bbc-6music',
    callSign: 'BBC',
    frequency: '6 Music',
    name: 'BBC Radio 6 Music',
    location: 'London',
    genre: 'Eclectic / Alternative',
    category: 'eclectic',
    tagline: 'Alternative music from the BBC. May be geo-restricted outside UK.',
    streamUrl: 'http://as-hls-ww-live.akamaized.net/pool_01/live/ww/bbc_6music/bbc_6music.isml/bbc_6music-audio%3d320000.norewind.m3u8',
    format: 'HLS 320',
    website: 'https://www.bbc.co.uk/6music',
    sourcePage: 'https://www.bbc.co.uk/sounds/play/live:bbc_6music',
    verified: false
  }
]
