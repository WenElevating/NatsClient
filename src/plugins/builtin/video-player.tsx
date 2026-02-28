import React, { useRef, useEffect, useCallback, useState } from 'react'
import { Button, Space, Select, Typography, Tag, Input, Form, Card, message, Modal, Tooltip, Alert } from 'antd'
import { 
  PlayCircleOutlined, 
  ReloadOutlined,
  PlusOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined
} from '@ant-design/icons'
import type { NatsClientPlugin, MessageRendererProps, PluginPanelProps } from '../types'

const { Text } = Typography

type VideoCodec = 'h264' | 'h265' | 'vp8' | 'vp9' | 'av1'

interface VideoStreamConfig {
  subject: string
  codec: VideoCodec
  autoPlay: boolean
  lowLatency: boolean
  bufferSize: number
}

interface VideoDecoderConfig {
  codec: VideoCodec
  format: string
  width?: number
  height?: number
  framerate?: number
}

const CODEC_OPTIONS = [
  { value: 'h264', label: 'H.264 (AVC)' },
  { value: 'h265', label: 'H.265 (HEVC)' },
  { value: 'vp9', label: 'VP9' },
  { value: 'av1', label: 'AV1' }
]

const CODEC_SUPPORT: Record<VideoCodec, string[]> = {
  h264: ['avc1.42001E', 'avc1.4D001E', 'avc1.64001E'],
  h265: ['hev1.1.6.L93.B0', 'hev1.2.4.L93.B0'],
  vp8: ['vp8'],
  vp9: ['vp09.00.10.08', 'vp09.01.10.08'],
  av1: ['av01.0.01M.08', 'av01.0.04M.08']
}

type DecoderStatus = 'idle' | 'initializing' | 'ready' | 'decoding' | 'error'

class VideoDecoderManager {
  private decoder: VideoDecoder | null = null
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private config: VideoDecoderConfig
  private frameCount = 0
  private lastFrameTime = 0
  private destroyed = false
  private onStatsUpdate?: (stats: { fps: number; frameCount: number; latency: number }) => void
  private onStatusChange?: (status: DecoderStatus) => void
  private status: DecoderStatus = 'idle'

  constructor(config: VideoDecoderConfig) {
    this.config = config
  }

  setStatsCallback(callback: (stats: { fps: number; frameCount: number; latency: number }) => void) {
    this.onStatsUpdate = callback
  }

  setStatusCallback(callback: (status: DecoderStatus) => void) {
    this.onStatusChange = callback
  }

  private setStatus(status: DecoderStatus) {
    this.status = status
    this.onStatusChange?.(status)
  }

  getStatus(): DecoderStatus {
    return this.status
  }

  async init(canvas: HTMLCanvasElement): Promise<boolean> {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d', { 
      alpha: false,
      desynchronized: true
    })

    if (!this.ctx) {
      console.error('Failed to get 2D context')
      this.setStatus('error')
      return false
    }

    this.setStatus('initializing')

    if ('VideoDecoder' in window) {
      const success = await this.initWebCodecs()
      if (success) {
        this.setStatus('ready')
      } else {
        this.setStatus('error')
      }
      return success
    }

    console.warn('WebCodecs not supported')
    this.setStatus('error')
    return false
  }

  private async initWebCodecs(): Promise<boolean> {
    const codecString = CODEC_SUPPORT[this.config.codec]?.[0]
    if (!codecString) return false
    
    try {
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
        error: (e) => {
          console.error('VideoDecoder error:', e)
          this.setStatus('error')
        }
      })

      this.decoder.configure({
        codec: codecString,
        optimizeForLatency: true,
        hardwareAcceleration: 'prefer-hardware'
      })

      return true
    } catch (e) {
      console.error('initWebCodecs error:', e)
      return false
    }
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
    
    if (this.status !== 'decoding') {
      this.setStatus('decoding')
    }
    
    if (this.onStatsUpdate) {
      this.onStatsUpdate(this.getStats())
    }
    
    frame.close()
  }

  async decode(data: ArrayBuffer | Uint8Array): Promise<{ success: boolean; error?: string }> {
    if (!this.decoder) {
      return { success: false, error: '解码器未初始化' }
    }
    
    if (this.destroyed) {
      return { success: false, error: '解码器已销毁' }
    }

    try {
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
      return { success: true }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e)
      console.error('Decode error:', errorMsg)
      return { success: false, error: errorMsg }
    }
  }

  getStats(): { fps: number; frameCount: number; latency: number } {
    const now = performance.now()
    const elapsed = (now - this.lastFrameTime) / 1000
    return {
      fps: elapsed > 0 && elapsed < 1 ? Math.round(1 / elapsed) : 0,
      frameCount: this.frameCount,
      latency: Math.round(elapsed * 1000)
    }
  }

  reset(): void {
    if (this.decoder) {
      this.decoder.reset()
      this.frameCount = 0
      this.setStatus('ready')
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
    this.setStatus('idle')
  }
}

const VideoPlayer: React.FC<MessageRendererProps> = ({ message, isPreview }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const decoderRef = useRef<VideoDecoderManager | null>(null)
  
  const [stats, setStats] = useState({ fps: 0, frameCount: 0, latency: 0 })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!canvasRef.current) return

    const decoder = new VideoDecoderManager({
      codec: 'h264',
      format: 'annexb'
    })
    
    decoder.setStatsCallback(setStats)
    
    decoder.init(canvasRef.current).then(success => {
      if (!success) {
        setError('视频解码器初始化失败')
      }
    })
    
    decoderRef.current = decoder

    return () => {
      decoder.destroy()
    }
  }, [])

  useEffect(() => {
    if (!decoderRef.current || !message.payload) return

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
    } catch (e) {
      console.error('Decode error:', e)
    }
  }, [message])

  if (isPreview) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', background: 'var(--color-bg-container)', borderRadius: 4 }}>
        <PlayCircleOutlined style={{ fontSize: 16, color: '#1890ff' }} />
        <Text type="secondary">视频帧 #{stats.frameCount}</Text>
        <Tag color="blue">{stats.fps} FPS</Tag>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', background: '#000', borderRadius: 8, overflow: 'hidden' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: 'auto', minHeight: 200, display: 'block' }} />
      {error && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: '#ff4d4f' }}>
          <Text type="danger">{error}</Text>
        </div>
      )}
      <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 8 }}>
        <Tag color="green">{stats.fps} FPS</Tag>
        <Tag color="blue">{stats.latency}ms</Tag>
      </div>
    </div>
  )
}

const VideoPlayerPanel: React.FC<PluginPanelProps> = ({ settings, onSettingsChange }) => {
  const [streams, setStreams] = useState<VideoStreamConfig[]>(settings.streams || [])
  const [activeStream, setActiveStream] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [newSubject, setNewSubject] = useState('')
  const [newCodec, setNewCodec] = useState<VideoCodec>('h264')
  
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const decoderRef = useRef<VideoDecoderManager | null>(null)
  const subscriptionIdRef = useRef<string | null>(null)
  
  const [stats, setStats] = useState({ fps: 0, frameCount: 0, latency: 0 })
  const [decoderStatus, setDecoderStatus] = useState<DecoderStatus>('idle')
  const [subscriptionStatus, setSubscriptionStatus] = useState<'none' | 'subscribing' | 'subscribed' | 'error'>('none')
  const [receivedFrames, setReceivedFrames] = useState(0)
  const [decodeErrors, setDecodeErrors] = useState<string[]>([])
  const [webCodecsSupported, setWebCodecsSupported] = useState<boolean | null>(null)

  useEffect(() => {
    setWebCodecsSupported('VideoDecoder' in window)
  }, [])

  useEffect(() => {
    onSettingsChange({ ...settings, streams })
  }, [streams])

  const addStream = useCallback(() => {
    if (!newSubject.trim()) {
      message.error('请输入主题')
      return
    }
    
    const newStream: VideoStreamConfig = {
      subject: newSubject.trim(),
      codec: newCodec,
      autoPlay: true,
      lowLatency: true,
      bufferSize: 5
    }
    
    setStreams(prev => [...prev, newStream])
    setNewSubject('')
    setShowAddModal(false)
    message.success('已添加视频流')
  }, [newSubject, newCodec])

  const removeStream = useCallback(async (subject: string) => {
    if (activeStream === subject) {
      await stopStream()
    }
    setStreams(prev => prev.filter(s => s.subject !== subject))
  }, [activeStream])

  const stopStream = useCallback(async () => {
    if (subscriptionIdRef.current) {
      try {
        await window.nats.unsubscribe(subscriptionIdRef.current)
      } catch (e) {
        console.error('Unsubscribe error:', e)
      }
      subscriptionIdRef.current = null
    }
    
    if (decoderRef.current) {
      decoderRef.current.destroy()
      decoderRef.current = null
    }
    
    setActiveStream(null)
    setSubscriptionStatus('none')
    setDecoderStatus('idle')
    setReceivedFrames(0)
    setDecodeErrors([])
  }, [])

  const startStream = useCallback(async (subject: string, codec: VideoCodec) => {
    if (!webCodecsSupported) {
      message.error('浏览器不支持 WebCodecs API')
      return
    }

    await stopStream()
    
    setActiveStream(subject)
    setSubscriptionStatus('subscribing')
    setDecodeErrors([])

    if (!canvasRef.current) {
      setSubscriptionStatus('error')
      message.error('Canvas 未初始化')
      return
    }
    
    const decoder = new VideoDecoderManager({
      codec,
      format: 'annexb'
    })
    
    decoder.setStatsCallback(setStats)
    decoder.setStatusCallback(setDecoderStatus)
    
    const success = await decoder.init(canvasRef.current)
    if (!success) {
      message.error('解码器初始化失败')
      setSubscriptionStatus('error')
      return
    }
    
    decoderRef.current = decoder

    try {
      const result = await window.nats.subscribe(subject)
      if (result.success && result.subscriptionId) {
        subscriptionIdRef.current = result.subscriptionId
        setSubscriptionStatus('subscribed')
        message.success(`已订阅 ${subject}`)
      } else {
        setSubscriptionStatus('error')
        message.error(`订阅失败: ${result.error}`)
      }
    } catch (e) {
      setSubscriptionStatus('error')
      message.error(`订阅异常: ${e}`)
    }
  }, [webCodecsSupported, stopStream])

  useEffect(() => {
    const handleMessage = (data: { subscriptionId: string; message: { payload: string; subject: string } }) => {
      if (data.subscriptionId !== subscriptionIdRef.current) return
      if (!decoderRef.current) return

      setReceivedFrames(prev => prev + 1)

      try {
        let frameData: ArrayBuffer
        
        if (typeof data.message.payload === 'string') {
          try {
            const binary = atob(data.message.payload)
            frameData = new ArrayBuffer(binary.length)
            new Uint8Array(frameData).set(Array.from(binary, c => c.charCodeAt(0)))
          } catch {
            frameData = new TextEncoder().encode(data.message.payload).buffer
          }
        } else {
          frameData = new TextEncoder().encode(String(data.message.payload)).buffer
        }

        decoderRef.current.decode(frameData).then(result => {
          if (!result.success && result.error) {
            setDecodeErrors(prev => {
              const newErrors = [...prev, result.error!]
              return newErrors.slice(-5)
            })
          }
        })
      } catch (e) {
        console.error('Frame handling error:', e)
      }
    }

    window.nats.onMessage(handleMessage)
  }, [])

  const handleReset = useCallback(() => {
    decoderRef.current?.reset()
    setStats({ fps: 0, frameCount: 0, latency: 0 })
    setReceivedFrames(0)
    setDecodeErrors([])
  }, [])

  const getStatusTag = () => {
    switch (decoderStatus) {
      case 'idle':
        return <Tag>空闲</Tag>
      case 'initializing':
        return <Tag color="processing" icon={<LoadingOutlined />}>初始化中</Tag>
      case 'ready':
        return <Tag color="warning">等待数据</Tag>
      case 'decoding':
        return <Tag color="success" icon={<CheckCircleOutlined />}>解码中</Tag>
      case 'error':
        return <Tag color="error" icon={<CloseCircleOutlined />}>错误</Tag>
      default:
        return <Tag>未知</Tag>
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {webCodecsSupported === false && (
        <Alert 
          type="error" 
          message="浏览器不支持 WebCodecs API" 
          description="请使用最新版本的 Chrome/Edge 浏览器"
          showIcon
        />
      )}

      <Card 
        title="视频流列表" 
        size="small"
        extra={
          <Button 
            type="primary" 
            icon={<PlusOutlined />} 
            size="small"
            onClick={() => setShowAddModal(true)}
          >
            添加视频流
          </Button>
        }
      >
        {streams.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 20 }}>
            <Text type="secondary">暂无视频流，点击上方按钮添加</Text>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {streams.map(stream => (
              <div 
                key={stream.subject}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  background: activeStream === stream.subject ? 'var(--color-primary-bg)' : 'var(--color-bg-container)',
                  borderRadius: 6,
                  cursor: 'pointer',
                  border: activeStream === stream.subject ? '1px solid var(--color-primary)' : '1px solid transparent'
                }}
                onClick={() => {
                  if (activeStream === stream.subject) {
                    stopStream()
                  } else {
                    startStream(stream.subject, stream.codec)
                  }
                }}
              >
                <Space>
                  <PlayCircleOutlined style={{ color: activeStream === stream.subject ? '#1890ff' : undefined }} />
                  <Text strong={activeStream === stream.subject}>{stream.subject}</Text>
                  <Tag>{stream.codec.toUpperCase()}</Tag>
                </Space>
                <Space>
                  {activeStream === stream.subject && subscriptionStatus === 'subscribed' && (
                    <Tag color="green">播放中</Tag>
                  )}
                  <Button 
                    type="text" 
                    danger 
                    size="small"
                    icon={<DeleteOutlined />}
                    onClick={(e) => {
                      e.stopPropagation()
                      removeStream(stream.subject)
                    }}
                  />
                </Space>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card 
        title={
          <Space>
            <Text>播放器</Text>
            {activeStream && <Tag color="blue">{activeStream}</Tag>}
          </Space>
        }
        size="small"
        extra={
          <Space>
            {getStatusTag()}
            <Tag color="cyan">接收: {receivedFrames}</Tag>
            <Tag color="green">{stats.fps} FPS</Tag>
            <Tag color="blue">{stats.latency}ms</Tag>
            <Tooltip title="重置">
              <Button type="text" icon={<ReloadOutlined />} onClick={handleReset} />
            </Tooltip>
          </Space>
        }
      >
        <div style={{ position: 'relative', background: '#000', borderRadius: 8, overflow: 'hidden', minHeight: 300 }}>
          <canvas 
            ref={canvasRef} 
            style={{ width: '100%', height: 300, display: 'block' }} 
          />
          {decoderStatus !== 'decoding' && (
            <div style={{ 
              position: 'absolute', 
              top: '50%', 
              left: '50%', 
              transform: 'translate(-50%, -50%)',
              textAlign: 'center'
            }}>
              <PlayCircleOutlined style={{ fontSize: 48, color: '#fff', opacity: 0.5 }} />
              <div>
                <Text style={{ color: '#fff', opacity: 0.5 }}>
                  {decoderStatus === 'idle' && '选择视频流开始播放'}
                  {decoderStatus === 'initializing' && '初始化解码器...'}
                  {decoderStatus === 'ready' && '等待视频数据...'}
                  {decoderStatus === 'error' && '解码器错误'}
                  {!webCodecsSupported && 'WebCodecs 不支持'}
                </Text>
              </div>
            </div>
          )}
        </div>

        {decodeErrors.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <Text type="danger" style={{ fontSize: 12 }}>
              最近解码错误: {decodeErrors[decodeErrors.length - 1]}
            </Text>
          </div>
        )}
      </Card>

      <Modal
        title="添加视频流"
        open={showAddModal}
        onOk={addStream}
        onCancel={() => setShowAddModal(false)}
        okText="添加"
        cancelText="取消"
      >
        <Form layout="vertical">
          <Form.Item label="主题 (Subject)" required>
            <Input 
              placeholder="例如: camera.front.door" 
              value={newSubject}
              onChange={(e) => setNewSubject(e.target.value)}
            />
          </Form.Item>
          <Form.Item label="编码格式">
            <Select 
              value={newCodec} 
              onChange={setNewCodec}
              options={CODEC_OPTIONS}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

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
      }
    ],
    panels: [
      {
        id: 'video-player-main',
        title: '视频播放器',
        icon: <PlayCircleOutlined />,
        position: 'tab',
        component: VideoPlayerPanel,
        showInPluginList: true
      }
    ]
  },

  activate: (context) => {
    context.logger.info('Video Player plugin activated')
  }
}

export default videoPlayerPlugin
