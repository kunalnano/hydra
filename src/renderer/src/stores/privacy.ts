import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface PrivacyStore {
  privacyMode: boolean
  setPrivacyMode: (enabled: boolean) => void
  togglePrivacyMode: () => void
}

const HTTP_URL_RE = /\bhttps?:\/\/[^\s)]+/gi
const FILE_URL_RE = /\bfile:\/\/[^\s)]+/gi
const HOME_DIR_RE = /\/Users\/[^/\s]+/g
const WINDOWS_HOME_RE = /[A-Za-z]:\\Users\\[^\\\s]+/g
const IPV4_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g
const LOOPBACK_HOST_RE = /\b(?:localhost|127\.0\.0\.1|0\.0\.0\.0)\b/gi
const LOCAL_NODE_RE = /\b[a-z0-9-]+\.local\b/gi

export function maskEndpoint(value: string): string {
  if (!value) return 'secure://endpoint-redacted'

  if (value.startsWith('file://')) {
    return 'file://private-library/hidden-track'
  }

  try {
    const parsed = new URL(value)
    if (parsed.protocol === 'file:') {
      return 'file://private-library/hidden-track'
    }

    const pathHint = parsed.pathname && parsed.pathname !== '/' ? '/…' : ''
    const isLoopback =
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '0.0.0.0'

    return isLoopback
      ? `${parsed.protocol}//secure-core.local${pathHint}`
      : `${parsed.protocol}//private-gateway.redacted${pathHint}`
  } catch {
    return value
      .replace(FILE_URL_RE, 'file://private-library/hidden-track')
      .replace(HOME_DIR_RE, '/Users/operator')
      .replace(WINDOWS_HOME_RE, 'C:\\Users\\operator')
      .replace(IPV4_RE, 'xx.xx.xx.xx')
      .replace(LOOPBACK_HOST_RE, 'secure-core.local')
      .replace(LOCAL_NODE_RE, 'private-node.local')
  }
}

export function redactSensitiveText(value: string): string {
  return value
    .replace(FILE_URL_RE, 'file://private-library/hidden-track')
    .replace(HTTP_URL_RE, (match) => maskEndpoint(match))
    .replace(HOME_DIR_RE, '/Users/operator')
    .replace(WINDOWS_HOME_RE, 'C:\\Users\\operator')
    .replace(IPV4_RE, 'xx.xx.xx.xx')
    .replace(LOOPBACK_HOST_RE, 'secure-core.local')
    .replace(LOCAL_NODE_RE, 'private-node.local')
}

export const usePrivacyStore = create<PrivacyStore>()(
  persist(
    (set) => ({
      privacyMode: true,
      setPrivacyMode: (privacyMode) => set({ privacyMode }),
      togglePrivacyMode: () => set((state) => ({ privacyMode: !state.privacyMode }))
    }),
    {
      name: 'helm-privacy-mode'
    }
  )
)
