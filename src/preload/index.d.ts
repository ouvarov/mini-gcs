import type { GcsApi } from '@shared/ipc'

declare global {
  interface Window {
    gcs: GcsApi
  }
}

export {}
