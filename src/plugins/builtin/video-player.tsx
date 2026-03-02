import React, { useRef, useEffect, useCallback, useState } from 'react'
import { Button, Space, Typography, Tag, Input, Form, Card, message, Modal, Tooltip, Alert } from 'antd'
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

interface VideoStreamConfig {
  subject: string
}

type DecoderStatus = 'idle' | 'initializing' | 'ready' | 'decoding' | 'error'

const VideoPlayerPanel: React.FC<PluginPanelProps> = ({ settings, onSettingsChange }) => {
  const [streams, setStreams] = useState<VideoStreamConfig[]>(settings.streams || [])
  const [activeStream, setActiveStream] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [newSubject, setNewSubject] = useState('')
  
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const subscriptionIdRef = useRef<string | null>(null)
  
  const [stats, setStats] = useState({ fps: 0, frameCount: 0, latency: 0 })
  const [decoderStatus, setDecoderStatus] = useState<DecoderStatus>('idle')
  const [subscriptionStatus, setSubscriptionStatus] = useState<'none' | 'subscribing' | 'subscribed' | 'error'>('none')
  const [receivedFrames, setReceivedFrames] = useState(0)
  const [ffmpegAvailable, setFfmpegAvailable] = useState<boolean | null>(null)
  const [lastFrameTime, setLastFrameTime] = useState(0)
  const [videoDimensions, setVideoDimensions] = useState<{ width: number; height: number } | null>(null)

  useEffect(() => {
    onSettingsChange({ ...settings, streams })
  }, [streams])

  const addStream = useCallback(() => {
    if (!newSubject.trim()) {
      message.error('请输入主题')
      return
    }
    
    const newStream: VideoStreamConfig = {
      subject: newSubject.trim()
    }
    
    setStreams(prev => [...prev, newStream])
    setNewSubject('')
    setShowAddModal(false)
    message.success('已添加视频流')
  }, [newSubject])

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
    
    if (activeStream) {
      try {
        await window.nats.stopVideoStream(activeStream)
      } catch (e) {
        console.error('Stop video stream error:', e)
      }
    }
    
    setActiveStream(null)
    setSubscriptionStatus('none')
    setDecoderStatus('idle')
    setReceivedFrames(0)
  }, [activeStream])

  const startStream = useCallback(async (subject: string) => {
    await stopStream()
    
    setActiveStream(subject)
    setSubscriptionStatus('subscribing')
    setDecoderStatus('initializing')
    setVideoDimensions(null)

    try {
      const videoResult = await window.nats.startVideoStream(subject)
      
      if (!videoResult.success) {
        setFfmpegAvailable(false)
        setSubscriptionStatus('error')
        setDecoderStatus('error')
        message.error(videoResult.error || 'FFmpeg 不可用')
        return
      }
      
      setFfmpegAvailable(true)
      
      const subResult = await window.nats.subscribe(subject)
      if (subResult.success && subResult.subscriptionId) {
        subscriptionIdRef.current = subResult.subscriptionId
        setSubscriptionStatus('subscribed')
        setDecoderStatus('ready')
        message.success(`已订阅 ${subject}`)
      } else {
        await window.nats.stopVideoStream(subject)
        setSubscriptionStatus('error')
        setDecoderStatus('error')
        message.error(`订阅失败: ${subResult.error || '未知错误'}`)
      }
    } catch (e) {
      setSubscriptionStatus('error')
      setDecoderStatus('error')
      message.error(`启动失败: ${e}`)
    }
  }, [stopStream])

  useEffect(() => {
    const handleMessage = (data: { subscriptionId: string; message: { payload: string; subject: string } }) => {
      if (!subscriptionIdRef.current) return
      if (data.subscriptionId !== subscriptionIdRef.current) return
      
      window.nats.feedVideoData(data.message.subject, data.message.payload)
    }

    const unsubscribe = window.nats.onMessage(handleMessage)
    return () => {
      unsubscribe?.()
    }
  }, [])

  useEffect(() => {
    const handleFrame = (data: { subject: string; data: string; width: number; height: number; timestamp: number }) => {
      if (data.subject !== activeStream) return
      if (!canvasRef.current) return

      const ctx = canvasRef.current.getContext('2d')
      if (!ctx) return

      setReceivedFrames(prev => prev + 1)
      
      if (!videoDimensions || videoDimensions.width !== data.width || videoDimensions.height !== data.height) {
        setVideoDimensions({ width: data.width, height: data.height })
      }
      
      const now = performance.now()
      const elapsed = now - lastFrameTime
      setLastFrameTime(now)
      
      if (elapsed > 0 && elapsed < 1000) {
        setStats(prev => ({
          fps: Math.round(1000 / elapsed),
          frameCount: prev.frameCount + 1,
          latency: Math.round(elapsed)
        }))
      }

      if (canvasRef.current.width !== data.width || canvasRef.current.height !== data.height) {
        canvasRef.current.width = data.width
        canvasRef.current.height = data.height
      }

      try {
        const binary = atob(data.data)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i)
        }

        const expectedSize = data.width * data.height * 4
        if (bytes.length !== expectedSize) {
          console.warn(`Frame size mismatch: expected ${expectedSize}, got ${bytes.length}`)
          return
        }

        const imageData = new ImageData(new Uint8ClampedArray(bytes), data.width, data.height)
        ctx.putImageData(imageData, 0, 0)
        
        if (decoderStatus !== 'decoding') {
          setDecoderStatus('decoding')
        }
      } catch (e) {
        console.error('Frame render error:', e)
      }
    }

    const unsubscribe = window.nats.onVideoFrame(handleFrame)
    return () => {
      unsubscribe?.()
    }
  }, [activeStream, lastFrameTime, decoderStatus, videoDimensions])

  const handleReset = useCallback(() => {
    setStats({ fps: 0, frameCount: 0, latency: 0 })
    setReceivedFrames(0)
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
      {ffmpegAvailable === false && (
        <Alert 
          type="error" 
          message="FFmpeg 不可用" 
          description="请确保已安装 FFmpeg 或 @ffmpeg-installer/ffmpeg 包"
          showIcon
        />
      )}

      <Alert 
        type="info" 
        message="使用 FFmpeg 解码" 
        description="在 Electron 主进程中使用 FFmpeg 解码 H.264 视频流，支持任意格式的视频流"
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
            {videoDimensions && <Tag color="purple">{videoDimensions.width}x{videoDimensions.height}</Tag>}
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
        <div style={{ 
          position: 'relative', 
          background: '#000', 
          borderRadius: 8, 
          overflow: 'hidden',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: videoDimensions ? 'auto' : 300,
          maxHeight: 500
        }}>
          <canvas 
            ref={canvasRef} 
            style={{ 
              maxWidth: '100%',
              maxHeight: 500,
              height: 'auto',
              display: 'block'
            }} 
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
                  {decoderStatus === 'initializing' && '初始化 FFmpeg...'}
                  {decoderStatus === 'ready' && '等待视频数据...'}
                  {decoderStatus === 'error' && '解码器错误'}
                </Text>
              </div>
            </div>
          )}
        </div>
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
        </Form>
      </Modal>
    </div>
  )
}

const videoPlayerPlugin: NatsClientPlugin = {
  id: 'com.natsclient.video-player',
  name: 'Video Player',
  version: '3.0.0',
  description: '视频流播放器，使用 FFmpeg 解码 H.264',
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
