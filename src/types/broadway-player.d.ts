declare module 'broadway-player' {
  interface BroadwayOptions {
    useWorker?: boolean
    webgl?: 'auto' | 'webgl' | 'webgl2' | 'none'
    size?: { width: number; height: number }
  }

  interface BroadwayPicture {
    width: number
    height: number
    data: Uint8Array
  }

  interface Broadway {
    decode(data: Uint8Array): void
    on(event: 'picture', callback: (picture: BroadwayPicture) => void): void
    on(event: 'error', callback: (error: Error) => void): void
  }

  const Broadway: new (options: BroadwayOptions) => Broadway
  export default Broadway
}
