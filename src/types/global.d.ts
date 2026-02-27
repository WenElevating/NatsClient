import type { NatsApi } from '../../electron/preload'

declare global {
  interface Window {
    nats: NatsApi
  }
}

export {}
