/// <reference types="vite/client" />

import type { HelmAPI } from '../../preload/index'

declare global {
  interface Window {
    helm: HelmAPI
  }
}
