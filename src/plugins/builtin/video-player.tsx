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

type VideoCodec = 'h264' | 'h265' | 'vp8' | 'vp9' | 'av1' | 'auto'

interface VideoStreamConfig {
  subject: string
  codec?: VideoCodec
  autoPlay: boolean
  lowLatency: boolean
}

interface VideoDecoderConfig {
  codec: VideoCodec
  format: string
}

const CODEC_OPTIONS = [
  { value: 'h264', label: 'H.264 (AVC)' },
  { value: 'h265', label: 'H.265 (HEVC)' },
  { value: 'vp9', label: 'VP9' },
  { value: 'av1', label: 'AV1' },
  { value: 'auto', label: '自动检测' }
]

const CODEC_STRINGS: Record<VideoCodec, string> = {
  h264: 'avc1.42001E',
  h265: 'hev1.1.6.L93.B0',
  vp8: 'vp8',
  vp9: 'vp09.00.10.08',
  av1: 'av01.0.01M.08',
  auto: 'avc1.42001E'
}

type DecoderStatus = 'idle' | 'initializing' | 'ready' | 'decoding' | 'error'

interface CodecSupportInfo {
  codec: VideoCodec
  supported: boolean
  error?: string
}

class SimpleVideoDecoder {
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
  private detectedCodec: VideoCodec | null = null
  private supportInfo: CodecSupportInfo[] = []
  private waitingForKeyframe = true
  private codecString: string | null = null
  private firstFrameProcessed = false

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

  getDetectedCodec(): VideoCodec | null {
    return this.detectedCodec
  }

  getSupportInfo(): CodecSupportInfo[] {
    return this.supportInfo
  }

  async init(canvas: HTMLCanvasElement): Promise<{ success: boolean; error?: string; supportInfo?: CodecSupportInfo[] }> {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d', { 
      alpha: false,
      desynchronized: true
    })

    if (!this.ctx) {
      this.setStatus('error')
      return { success: false, error: 'Canvas 2D 上下文初始化失败' }
    }

    this.setStatus('initializing')

    if (!('VideoDecoder' in window)) {
      this.setStatus('error')
      return { success: false, error: '浏览器不支持 WebCodecs API，请使用最新版 Chrome/Edge' }
    }

    const result = await this.initWebCodecs()
    if (result.success) {
      this.setStatus('ready')
    } else {
      this.setStatus('error')
    }
    return { ...result, supportInfo: this.supportInfo }
  }

  private async initWebCodecs(): Promise<{ success: boolean; error?: string }> {
    const codecsToTry = this.config.codec === 'auto' 
      ? ['h264', 'h265', 'vp9', 'av1'] as VideoCodec[]
      : [this.config.codec] as VideoCodec[]
    
    this.supportInfo = []
    
    for (const codec of codecsToTry) {
      const codecString = CODEC_STRINGS[codec]
      if (!codecString) continue
      
      try {
        const support = await VideoDecoder.isConfigSupported({
          codec: codecString,
          optimizeForLatency: true
        })

        this.supportInfo.push({
          codec,
          supported: support.supported ?? false,
          error: support.supported ? undefined : '不支持'
        })

        if (support.supported) {
          console.log(`Codec ${codec} supported`)
          
          this.codecString = codecString
          this.decoder = new VideoDecoder({
            output: (frame) => this.handleFrame(frame),
            error: (e) => {
              console.error('VideoDecoder error:', e)
              this.handleDecoderError()
            }
          })

          this.decoder.configure({
            codec: codecString,
            optimizeForLatency: true,
            hardwareAcceleration: 'prefer-hardware'
          })

          this.detectedCodec = codec
          return { success: true }
        }
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e)
        this.supportInfo.push({
          codec,
          supported: false,
          error: errorMsg
        })
        console.error(`Codec ${codec} test failed:`, e)
      }
    }
    
    const supportedCodecs = this.supportInfo.filter(i => i.supported)
    if (supportedCodecs.length === 0) {
      const details = this.supportInfo.map(i => `${i.codec}: ${i.error}`).join(', ')
      return { success: false, error: `所有编码格式都不支持 (${details})` }
    }
    
    return { success: false, error: '解码器初始化失败' }
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

  private handleDecoderError(): void {
    if (this.destroyed) return
    
    this.setStatus('error')
    this.waitingForKeyframe = true
    this.decoder = null
  }

  async decode(data: ArrayBuffer | Uint8Array): Promise<{ success: boolean; error?: string }> {
    if (this.destroyed) {
      return { success: false, error: '解码器已销毁' }
    }

    try {
      if (!this.decoder || this.decoder.state === 'closed') {
        if (this.codecString && this.canvas) {
          this.decoder = new VideoDecoder({
            output: (frame) => this.handleFrame(frame),
            error: (e) => {
              console.error('VideoDecoder error:', e)
              this.handleDecoderError()
            }
          })

          this.decoder.configure({
            codec: this.codecString,
            optimizeForLatency: true,
            hardwareAcceleration: 'prefer-hardware'
          })
          
          this.waitingForKeyframe = true
          this.firstFrameProcessed = false
        } else {
          return { success: false, error: '解码器未初始化' }
        }
      }
      
      const chunk = new Uint8Array(data)
      
      let isKeyFrame = this.detectKeyFrame(chunk)
      
      if (this.waitingForKeyframe && !this.firstFrameProcessed) {
        if (!isKeyFrame) {
          console.log('First frame not detected as keyframe, trying as keyframe anyway...')
          isKeyFrame = true
        }
        this.firstFrameProcessed = true
      }
      
      if (this.waitingForKeyframe) {
        if (!isKeyFrame) {
          console.log('Skipping non-keyframe, waiting for keyframe...')
          return { success: false, error: '等待关键帧...' }
        }
        console.log('Received keyframe, starting decode...')
        this.waitingForKeyframe = false
      }
      
      const encodedChunk = new EncodedVideoChunk({
        type: isKeyFrame ? 'key' : 'delta',
        timestamp: performance.now() * 1000,
        data: chunk
      })

      this.decoder.decode(encodedChunk)
      return { success: true }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e)
      console.error('Decode error:', errorMsg)
      return { success: false, error: errorMsg }
    }
  }

  private detectKeyFrame(data: Uint8Array): boolean {
    if (data.length < 5) return false
    
    for (let i = 0; i < Math.min(data.length - 4, 100); i++) {
      if (data[i] === 0 && data[i + 1] === 0) {
        let nalType: number
        let offset: number
        
        if (data[i + 2] === 0 && data[i + 3] === 1) {
          nalType = data[i + 4] & 0x1F
          offset = 4
        } else if (data[i + 2] === 1) {
          nalType = data[i + 3] & 0x1F
          offset = 3
        } else {
          continue
        }
        
        console.log(`NAL unit at ${i}: type=${nalType} (offset=${offset})`)
        
        if (nalType === 5 || nalType === 7 || nalType === 8) {
          console.log(`Key frame detected: NAL type ${nalType}`)
          return true
        }
      }
    }
    
    const header = Array.from(data.slice(0, 20))
      .map(b => b.toString(16).padStart(2, '0'))
      .join(' ')
    console.log(`No key frame detected. Data header: ${header}`)
    
    return false
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
      this.waitingForKeyframe = true
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
  const decoderRef = useRef<SimpleVideoDecoder | null>(null)
  
  const [stats, setStats] = useState({ fps: 0, frameCount: 0, latency: 0 })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!canvasRef.current) return

    const decoder = new SimpleVideoDecoder({
      codec: 'h264',
      format: 'annexb'
    })
    
    decoder.setStatsCallback(setStats)
    
    decoder.init(canvasRef.current).then(result => {
      if (!result.success) {
        setError(result.error || '视频解码器初始化失败')
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
  const decoderRef = useRef<SimpleVideoDecoder | null>(null)
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
      lowLatency: true
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
      message.error('浏览器不支持 WebCodecs API，请使用最新版 Chrome/Edge')
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
    
    const decoder = new SimpleVideoDecoder({
      codec: codec === 'auto' ? 'h264' : codec,
      format: 'annexb'
    })
    
    decoder.setStatsCallback(setStats)
    decoder.setStatusCallback(setDecoderStatus)
    
    const result = await decoder.init(canvasRef.current)
    if (result.success) {
      decoderRef.current = decoder
      const detectedCodec = decoder.getDetectedCodec()
      
      try {
        const subResult = await window.nats.subscribe(subject)
        if (subResult.success && subResult.subscriptionId) {
          subscriptionIdRef.current = subResult.subscriptionId
          setSubscriptionStatus('subscribed')
          if (codec === 'auto' && detectedCodec) {
            message.success(`已订阅 ${subject} (检测到 ${detectedCodec.toUpperCase()})`)
          } else {
            message.success(`已订阅 ${subject}`)
          }
        } else {
          decoder.destroy()
          decoderRef.current = null
          setSubscriptionStatus('error')
          message.error(`订阅失败: ${subResult.error || '未知错误'}`)
        }
      } catch (e) {
        decoder.destroy()
        decoderRef.current = null
        setSubscriptionStatus('error')
        message.error(`订阅异常: ${e}`)
      }
    } else {
      decoder.destroy()
      setSubscriptionStatus('error')
      const supportInfo = result.supportInfo || []
      const errorDetails = supportInfo.map(i => 
        `${i.codec.toUpperCase()}: ${i.supported ? '支持' : i.error}`
      ).join('\n')
      Modal.error({
        title: '解码器初始化失败',
        content: (
          <div>
            <p>{result.error}</p>
            <p style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
              编码格式检测结果：
            </p>
            <pre style={{ fontSize: 11, background: '#f5f5f5', padding: 8, borderRadius: 4 }}>
              {errorDetails || '无检测结果'}
            </pre>
          </div>
        )
      })
    }
  }, [webCodecsSupported, stopStream])

  useEffect(() => {
    const handleMessage = (data: { subscriptionId: string; message: { payload: string; subject: string } }) => {
      if (!subscriptionIdRef.current) return
      if (data.subscriptionId !== subscriptionIdRef.current) return
      if (!decoderRef.current) return

      setReceivedFrames(prev => prev + 1)

      try {
        let frameData: ArrayBuffer
        
        if (typeof data.message.payload === 'string') {
          const binary = atob(data.message.payload)
          frameData = new ArrayBuffer(binary.length)
          new Uint8Array(frameData).set(Array.from(binary, c => c.charCodeAt(0)))
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

    const unsubscribe = window.nats.onMessage(handleMessage)
    return () => {
      unsubscribe?.()
    }
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
                    startStream(stream.subject, stream.codec || 'auto')
                  }
                }}
              >
                <Space>
                  <PlayCircleOutlined style={{ color: activeStream === stream.subject ? '#1890ff' : undefined }} />
                  <Text strong={activeStream === stream.subject}>{stream.subject}</Text>
                  <Tag>{(stream.codec || 'auto').toUpperCase()}</Tag>
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
            {activeStream && decoderRef.current && (
              <Tag color="purple">
                检测: {decoderRef.current.getDetectedCodec()?.toUpperCase() || 'N/A'}
              </Tag>
            )}
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
  version: '2.0.0',
  description: '高性能视频流播放器，使用 WebCodecs API 硬件解码',
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
