import { ElectronAPI } from '@electron-toolkit/preload'
import type { HelmAPI } from './index'

declare global {
  interface Window {
    electron: ElectronAPI
    helm: HelmAPI
    api: unknown
  }
}
