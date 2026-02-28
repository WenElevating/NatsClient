import React, { useRef, useEffect, useCallback, useState, memo } from 'react'
import { Button, Space, Select, Typography, Tag } from 'antd'
import { 
  PlayCircleOutlined, 
  PauseCircleOutlined, 
  FullscreenOutlined,
  ReloadOutlined
} from '@ant-design/icons'
import type { NatsClientPlugin, MessageRendererProps } from '../types'

const { Text } = Typography

type VideoCodec = 'h264' | 'h265' | 'vp8' | 'vp9' | 'av1'
type VideoFormat = 'raw' | 'annexb' | 'avcc'

interface VideoDecoderConfig {
  codec: VideoCodec
  format: VideoFormat
  width?: number
  height?: number
  framerate?: number
}

interface VideoPlayerProps extends MessageRendererProps {
  codec?: VideoCodec
  autoPlay?: boolean
  lowLatency?: boolean
}

const DEFAULT_CODEC_CONFIG: VideoDecoderConfig = {
  codec: 'h264',
  format: 'annexb',
  width: 1280,
  height: 720,
  framerate: 30
}

const CODEC_SUPPORT: Record<VideoCodec, string[]> = {
  h264: ['avc1.42001E', 'avc1.4D001E', 'avc1.64001E', 'avc1.42002A', 'avc1.4D002A', 'avc1.64002A'],
  h265: ['hev1.1.6.L93.B0', 'hev1.2.4.L93.B0', 'hev1.1.6.L120.B0'],
  vp8: ['vp8'],
  vp9: ['vp09.00.10.08', 'vp09.01.10.08', 'vp09.02.10.08'],
  av1: ['av01.0.01M.08', 'av01.0.04M.08', 'av01.0.08M.08']
}

class VideoDecoderManager {
  private decoder: VideoDecoder | null = null
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private config: VideoDecoderConfig
  private frameCount = 0
  private lastFrameTime = 0
  private destroyed = false

  constructor(config: VideoDecoderConfig = DEFAULT_CODEC_CONFIG) {
    this.config = config
  }

  async init(canvas: HTMLCanvasElement): Promise<boolean> {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d', { 
      alpha: false,
      desynchronized: true
    })

    if (!this.ctx) {
      console.error('Failed to get 2D context')
      return false
    }

    if ('VideoDecoder' in window) {
      return this.initWebCodecs()
    }

    console.warn('WebCodecs not supported, falling back to MSE')
    return false
  }

  private async initWebCodecs(): Promise<boolean> {
    const codecString = this.getCodecString()
    
    const support = await VideoDecoder.isConfigSupported({
      codec: codecString,
      optimizeForLatency: true
    })

    if (!support.supported) {
      console.error(`Codec ${codecString} not supported`)
      return false
    }

    this.decoder = new VideoDecoder({
      output: (frame) => this.handleFrame(frame),
      error: (e) => console.error('VideoDecoder error:', e)
    })

    this.decoder.configure({
      codec: codecString,
      optimizeForLatency: true,
      hardwareAcceleration: 'prefer-hardware'
    })

    return true
  }

  private getCodecString(): string {
    const profiles = CODEC_SUPPORT[this.config.codec]
    return profiles[0]
  }

  private handleFrame(frame: VideoFrame): void {
    if (this.destroyed || !this.ctx || !this.canvas) {
      frame.close()
      return
    }

    const canvas = this.canvas
    const width = frame.displayWidth
    const height = frame.displayHeight

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }

    this.ctx.drawImage(frame, 0, 0, width, height)
    
    this.frameCount++
    this.lastFrameTime = performance.now()
    
    frame.close()
  }

  async decode(data: ArrayBuffer | Uint8Array): Promise<void> {
    if (!this.decoder || this.destroyed) return

    const chunk = new Uint8Array(data)
    
    const encodedChunk = new EncodedVideoChunk({
      type: 'delta',
      timestamp: performance.now() * 1000,
      data: chunk
    })

    if (this.decoder.decodeQueueSize > 5) {
      this.decoder.flush()
    }

    this.decoder.decode(encodedChunk)
  }

  decodeRawFrame(data: ArrayBuffer): void {
    if (!this.ctx || !this.canvas || this.destroyed) return

    const view = new DataView(data)
    const width = view.getUint16(0, true)
    const height = view.getUint16(2, true)
    const format = view.getUint8(4)
    
    const pixelData = new Uint8Array(data, 5)
    
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width
      this.canvas.height = height
    }

    const imageData = this.ctx.createImageData(width, height)
    
    if (format === 0) {
      imageData.data.set(pixelData)
    } else if (format === 1) {
      this.yuvToRgba(pixelData, imageData.data, width, height)
    }

    this.ctx.putImageData(imageData, 0, 0)
    this.frameCount++
    this.lastFrameTime = performance.now()
  }

  private yuvToRgba(yuv: Uint8Array, rgba: Uint8ClampedArray, width: number, height: number): void {
    const ySize = width * height
    const uvSize = ySize >> 2
    const yPlane = yuv.subarray(0, ySize)
    const uPlane = yuv.subarray(ySize, ySize + uvSize)
    const vPlane = yuv.subarray(ySize + uvSize)

    let rgbaIdx = 0
    let yIdx = 0
    let uvIdx = 0

    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const y = yPlane[yIdx]
        const u = uPlane[uvIdx] - 128
        const v = vPlane[uvIdx] - 128

        rgba[rgbaIdx] = Math.max(0, Math.min(255, y + 1.402 * v))
        rgba[rgbaIdx + 1] = Math.max(0, Math.min(255, y - 0.344 * u - 0.714 * v))
        rgba[rgbaIdx + 2] = Math.max(0, Math.min(255, y + 1.772 * u))
        rgba[rgbaIdx + 3] = 255

        rgbaIdx += 4
        yIdx++
        if (col % 2 === 1 && row % 2 === 0) {
          uvIdx++
        }
      }
    }
  }

  getStats(): { fps: number; frameCount: number; latency: number } {
    const now = performance.now()
    const elapsed = (now - this.lastFrameTime) / 1000
    return {
      fps: elapsed > 0 ? Math.round(1 / elapsed) : 0,
      frameCount: this.frameCount,
      latency: Math.round(elapsed * 1000)
    }
  }

  flush(): void {
    if (this.decoder) {
      this.decoder.flush()
    }
  }

  reset(): void {
    if (this.decoder) {
      this.decoder.reset()
      this.frameCount = 0
    }
  }

  destroy(): void {
    this.destroyed = true
    if (this.decoder) {
      this.decoder.close()
      this.decoder = null
    }
    this.ctx = null
    this.canvas = null
  }
}

const VideoPlayer: React.FC<VideoPlayerProps> = memo(({
  message,
  isPreview,
  codec = 'h264',
  autoPlay = true
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const decoderRef = useRef<VideoDecoderManager | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  
  const [isPlaying, setIsPlaying] = useState(autoPlay)
  const [stats, setStats] = useState({ fps: 0, frameCount: 0, latency: 0 })
  const [selectedCodec, setSelectedCodec] = useState<VideoCodec>(codec)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!canvasRef.current) return

    const decoder = new VideoDecoderManager({
      codec: selectedCodec,
      format: 'annexb'
    })
    
    decoder.init(canvasRef.current).then(success => {
      if (!success) {
        setError('视频解码器初始化失败')
      }
    })
    
    decoderRef.current = decoder

    return () => {
      decoder.destroy()
    }
  }, [selectedCodec])

  useEffect(() => {
    if (!isPlaying || !decoderRef.current || !message.payload) return

    try {
      let data: ArrayBuffer
      
      if (typeof message.payload === 'string') {
        const binary = atob(message.payload)
        data = new ArrayBuffer(binary.length)
        new Uint8Array(data).set(Array.from(binary, c => c.charCodeAt(0)))
      } else {
        data = new TextEncoder().encode(String(message.payload)).buffer
      }

      decoderRef.current.decode(data)
      
      if (stats.frameCount % 10 === 0) {
        setStats(decoderRef.current.getStats())
      }
    } catch (e) {
      console.error('Decode error:', e)
    }
  }, [message, isPlaying, stats.frameCount])

  const togglePlay = useCallback(() => {
    setIsPlaying(prev => !prev)
  }, [])

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return

    if (!isFullscreen) {
      containerRef.current.requestFullscreen()
    } else {
      document.exitFullscreen()
    }
    setIsFullscreen(!isFullscreen)
  }, [isFullscreen])

  const handleReset = useCallback(() => {
    decoderRef.current?.reset()
    setStats({ fps: 0, frameCount: 0, latency: 0 })
  }, [])

  if (isPreview) {
    return (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: 8,
        padding: '4px 8px',
        background: 'var(--color-bg-container)',
        borderRadius: 4
      }}>
        <PlayCircleOutlined style={{ fontSize: 16, color: '#1890ff' }} />
        <Text type="secondary">视频帧 #{stats.frameCount}</Text>
        <Tag color="blue">{stats.fps} FPS</Tag>
      </div>
    )
  }

  return (
    <div 
      ref={containerRef}
      style={{ 
        position: 'relative',
        background: '#000',
        borderRadius: 8,
        overflow: 'hidden'
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ 
          width: '100%',
          height: 'auto',
          minHeight: 200,
          display: 'block'
        }}
      />

      {error && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: '#ff4d4f',
          textAlign: 'center'
        }}>
          <Text type="danger">{error}</Text>
        </div>
      )}

      <div style={{
        position: 'absolute',
        top: 8,
        right: 8,
        display: 'flex',
        gap: 8
      }}>
        <Tag color="green">{stats.fps} FPS</Tag>
        <Tag color="blue">{stats.latency}ms</Tag>
        <Tag color="purple">{selectedCodec.toUpperCase()}</Tag>
      </div>

      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: '8px 12px',
        background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <Space>
          <Button 
            type="text" 
            icon={isPlaying ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
            onClick={togglePlay}
            style={{ color: '#fff' }}
          />
          <Button 
            type="text" 
            icon={<ReloadOutlined />}
            onClick={handleReset}
            style={{ color: '#fff' }}
          />
        </Space>

        <Space>
          <Select
            value={selectedCodec}
            onChange={setSelectedCodec}
            size="small"
            style={{ width: 100 }}
            options={[
              { value: 'h264', label: 'H.264' },
              { value: 'h265', label: 'H.265' },
              { value: 'vp9', label: 'VP9' },
              { value: 'av1', label: 'AV1' }
            ]}
          />
          <Button 
            type="text" 
            icon={<FullscreenOutlined />}
            onClick={toggleFullscreen}
            style={{ color: '#fff' }}
          />
        </Space>
      </div>
    </div>
  )
})

const isVideoData = (payload: string): boolean => {
  if (!payload || payload.length < 10) return false
  
  const lower = payload.toLowerCase()
  return lower.startsWith('video:') || 
         lower.includes('codec:') ||
         lower.includes('frame:') ||
         /^[A-Za-z0-9+/]{20,}=*$/.test(payload)
}

const VideoRenderer: React.FC<MessageRendererProps> = (props) => {
  if (isVideoData(props.message.payload)) {
    return <VideoPlayer {...props} />
  }
  return null
}

const videoPlayerPlugin: NatsClientPlugin = {
  id: 'com.natsclient.video-player',
  name: 'Video Player',
  version: '1.0.0',
  description: '高性能视频流播放器，支持 H.264/H.265/VP9/AV1 硬件解码',
  author: 'NatsClient Team',
  
  capabilities: {
    messageRenderers: [
      {
        subjectPattern: 'video.*',
        priority: 100,
        renderer: VideoRenderer
      },
      {
        subjectPattern: 'stream.video.*',
        priority: 100,
        renderer: VideoRenderer
      },
      {
        subjectPattern: 'media.video.*',
        priority: 100,
        renderer: VideoRenderer
      }
    ]
  },

  activate: (context) => {
    context.logger.info('Video Player plugin activated')
    
    context.storage.set('defaultCodec', 'h264')
    context.storage.set('lowLatency', true)
    context.storage.set('bufferSize', 5)
  },

  deactivate: () => {
    console.log('Video Player plugin deactivated')
  }
}

export default videoPlayerPlugin
