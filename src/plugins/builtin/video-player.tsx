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
import type { NatsClientPlugin, PluginPanelProps } from '../types'

const { Text } = Typography

type VideoCodec = 'h264' | 'h265' | 'vp8' | 'vp9' | 'av1' | 'auto'

interface VideoStreamConfig {
  subject: string
  codec?: VideoCodec
  autoPlay: boolean
  lowLatency: boolean
}

const CODEC_OPTIONS = [
  { value: 'auto', label: '自动检测' },
  { value: 'h264', label: 'H.264 (AVC)' },
  { value: 'h265', label: 'H.265 (HEVC)' },
  { value: 'vp9', label: 'VP9' },
  { value: 'av1', label: 'AV1' }
]

type DecoderStatus = 'idle' | 'initializing' | 'ready' | 'decoding' | 'error'

class BroadwayDecoder {
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private decoder: any = null
  private frameCount = 0
  private lastFrameTime = 0
  private destroyed = false
  private onStatsUpdate?: (stats: { fps: number; frameCount: number; latency: number }) => void
  private onStatusChange?: (status: DecoderStatus) => void
  private status: DecoderStatus = 'idle'
  private width = 640
  private height = 480

  constructor() {
    this.initBroadway()
  }

  private initBroadway() {
    try {
      const Broadway = require('broadway-player')
      this.decoder = new Broadway({
        useWorker: false,
        webgl: 'auto',
        size: { width: this.width, height: this.height }
      })
      
      this.decoder.on('picture', (picture: any) => {
        this.handlePicture(picture)
      })
      
      this.decoder.on('error', (error: Error) => {
        console.error('Broadway error:', error)
        this.setStatus('error')
      })
    } catch (e) {
      console.error('Failed to init Broadway:', e)
    }
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

  async init(canvas: HTMLCanvasElement): Promise<{ success: boolean; error?: string }> {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d', { 
      alpha: false,
      desynchronized: true
    })

    if (!this.ctx) {
      this.setStatus('error')
      return { success: false, error: 'Canvas 2D 上下文初始化失败' }
    }

    this.setStatus('ready')
    return { success: true }
  }

  private handlePicture(picture: any) {
    if (this.destroyed || !this.ctx || !this.canvas) return

    const { width, height, data } = picture
    
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width
      this.canvas.height = height
    }

    const imageData = new ImageData(new Uint8ClampedArray(data), width, height)
    this.ctx.putImageData(imageData, 0, 0)
    
    this.frameCount++
    this.lastFrameTime = performance.now()
    
    if (this.status !== 'decoding') {
      this.setStatus('decoding')
    }
    
    if (this.onStatsUpdate) {
      this.onStatsUpdate(this.getStats())
    }
  }

  decode(data: ArrayBuffer | Uint8Array): { success: boolean; error?: string } {
    if (this.destroyed) {
      return { success: false, error: '解码器已销毁' }
    }

    if (!this.decoder) {
      return { success: false, error: '解码器未初始化' }
    }

    try {
      const chunk = new Uint8Array(data)
      this.decoder.decode(chunk)
      return { success: true }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e)
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
    this.frameCount = 0
    this.setStatus('ready')
  }

  destroy(): void {
    this.destroyed = true
    this.ctx = null
    this.canvas = null
    if (this.decoder) {
      this.decoder = null
    }
    this.setStatus('idle')
  }
}

const VideoPlayerPanel: React.FC<PluginPanelProps> = ({ settings, onSettingsChange }) => {
  const [streams, setStreams] = useState<VideoStreamConfig[]>(settings.streams || [])
  const [activeStream, setActiveStream] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [newSubject, setNewSubject] = useState('')
  const [newCodec, setNewCodec] = useState<VideoCodec>('auto')
  
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const decoderRef = useRef<BroadwayDecoder | null>(null)
  const subscriptionIdRef = useRef<string | null>(null)
  
  const [stats, setStats] = useState({ fps: 0, frameCount: 0, latency: 0 })
  const [decoderStatus, setDecoderStatus] = useState<DecoderStatus>('idle')
  const [subscriptionStatus, setSubscriptionStatus] = useState<'none' | 'subscribing' | 'subscribed' | 'error'>('none')
  const [receivedFrames, setReceivedFrames] = useState(0)
  const [decodeErrors, setDecodeErrors] = useState<string[]>([])

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

  const startStream = useCallback(async (subject: string) => {
    await stopStream()
    
    setActiveStream(subject)
    setSubscriptionStatus('subscribing')
    setDecodeErrors([])

    if (!canvasRef.current) {
      setSubscriptionStatus('error')
      message.error('Canvas 未初始化')
      return
    }
    
    const decoder = new BroadwayDecoder()
    decoder.setStatsCallback(setStats)
    decoder.setStatusCallback(setDecoderStatus)
    
    const result = await decoder.init(canvasRef.current)
    if (result.success) {
      decoderRef.current = decoder
      
      try {
        const subResult = await window.nats.subscribe(subject)
        if (subResult.success && subResult.subscriptionId) {
          subscriptionIdRef.current = subResult.subscriptionId
          setSubscriptionStatus('subscribed')
          message.success(`已订阅 ${subject}`)
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
      message.error(result.error || '解码器初始化失败')
    }
  }, [stopStream])

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

        const result = decoderRef.current.decode(frameData)
        if (!result.success && result.error) {
          setDecodeErrors(prev => {
            const newErrors = [...prev, result.error!]
            return newErrors.slice(-5)
          })
        }
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
      <Alert 
        type="info" 
        message="使用 Broadway.js 解码器" 
        description="纯 JavaScript H.264 解码器，对视频流格式要求更宽松，无需关键帧即可解码"
        showIcon
      />

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
                    startStream(stream.subject)
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

const videoPlayerPlugin: NatsClientPlugin = {
  id: 'com.natsclient.video-player',
  name: 'Video Player',
  version: '2.1.0',
  description: '视频流播放器，使用 Broadway.js 解码 H.264',
  author: 'NatsClient Team',
  
  capabilities: {
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
