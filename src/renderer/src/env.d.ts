/// <reference types="vite/client" />

import type { HydraAPI } from '../../preload/index'

declare global {
  interface Window {
    hydra: HydraAPI
  }
}
