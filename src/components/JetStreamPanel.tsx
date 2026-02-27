import React, { useState, useEffect, useCallback } from 'react'
import { Card, Table, Button, Space, Typography, Tabs, Modal, Descriptions, Tag, Popconfirm } from 'antd'
import { 
  ReloadOutlined, 
  CheckOutlined, 
  CloseOutlined,
  MessageOutlined,
  CloudOutlined,
  ApiOutlined
} from '@ant-design/icons'
import { useConnectionStore } from '../stores'
import type { JetStreamInfo, ConsumerInfo, StoredMessage } from '../types/nats'
import { formatBytes } from '../utils/format'

const { Text, Title } = Typography

const JetStreamPanel: React.FC = () => {
  const { connectionState } = useConnectionStore()
  const [streams, setStreams] = useState<JetStreamInfo[]>([])
  const [consumers, setConsumers] = useState<ConsumerInfo[]>([])
  const [selectedStream, setSelectedStream] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [messageModalVisible, setMessageModalVisible] = useState(false)
  const [currentMessage, setCurrentMessage] = useState<StoredMessage | null>(null)
  const [jsAvailable, setJsAvailable] = useState<boolean | null>(null)

  const isConnected = connectionState.status === 'connected'

  const checkJetStreamAndLoad = useCallback(async () => {
    if (!isConnected) {
      setJsAvailable(null)
      setStreams([])
      return
    }
    
    setLoading(true)
    const result = await window.nats.getJetStreamStreams()
    if (result.success && result.streams) {
      setStreams(result.streams)
      setJsAvailable(true)
    } else {
      setJsAvailable(false)
      setStreams([])
    }
    setLoading(false)
  }, [isConnected])

  const loadConsumers = useCallback(async (streamName: string) => {
    if (!isConnected || !jsAvailable) return
    
    setLoading(true)
    const result = await window.nats.getJetStreamConsumers(streamName)
    if (result.success && result.consumers) {
      setConsumers(result.consumers)
    }
    setLoading(false)
  }, [isConnected, jsAvailable])

  useEffect(() => {
    if (isConnected) {
      checkJetStreamAndLoad()
    } else {
      setJsAvailable(null)
      setStreams([])
      setConsumers([])
      setSelectedStream(null)
    }
  }, [isConnected, checkJetStreamAndLoad])

  const handleStreamSelect = (streamName: string) => {
    setSelectedStream(streamName)
    loadConsumers(streamName)
  }

  const handleFetchMessage = async (consumerName: string) => {
    if (!selectedStream) return
    
    const result = await window.nats.fetchMessage(selectedStream, consumerName)
    if (result.success) {
      setCurrentMessage(result.message || null)
      setMessageModalVisible(true)
    }
  }

  const handleAck = async (sequence: number) => {
    if (!selectedStream || !currentMessage) return
    
    const result = await window.nats.ackMessage(selectedStream, consumers[0]?.name || '', sequence)
    if (result.success) {
      setMessageModalVisible(false)
    }
  }

  const handleNak = async (sequence: number) => {
    if (!selectedStream || !currentMessage) return
    
    const result = await window.nats.nakMessage(selectedStream, consumers[0]?.name || '', sequence)
    if (result.success) {
      setMessageModalVisible(false)
    }
  }

  const getStatusInfo = () => {
    if (!isConnected) {
      return {
        icon: <ApiOutlined style={{ fontSize: 48, color: '#666' }} />,
        title: '未连接到 NATS 服务器',
        description: '请先连接到 NATS 服务器后再使用 JetStream 功能'
      }
    }
    if (jsAvailable === false) {
      return {
        icon: <CloudOutlined style={{ fontSize: 48, color: '#faad14' }} />,
        title: 'JetStream 未启用',
        description: '当前 NATS 服务器未启用 JetStream 功能，请在服务器配置中开启 JetStream'
      }
    }
    return null
  }

  const statusInfo = getStatusInfo()
  const showOverlay = statusInfo !== null

  const streamColumns = [
    {
      title: 'Stream 名称',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => (
        <Button type="link" onClick={() => handleStreamSelect(name)} style={{ padding: 0 }}>
          {name}
        </Button>
      )
    },
    {
      title: 'Subjects',
      dataIndex: 'subjects',
      key: 'subjects',
      render: (subjects: string[]) => (
        <Space direction="vertical" size="small">
          {subjects.map(s => <Tag key={s}>{s}</Tag>)}
        </Space>
      )
    },
    {
      title: '消息数',
      dataIndex: 'messages',
      key: 'messages',
      render: (count: number) => count.toLocaleString()
    },
    {
      title: '大小',
      dataIndex: 'bytes',
      key: 'bytes',
      render: (bytes: number) => formatBytes(bytes)
    },
    {
      title: '保留策略',
      dataIndex: 'retention',
      key: 'retention'
    }
  ]

  const consumerColumns = [
    {
      title: 'Consumer 名称',
      dataIndex: 'name',
      key: 'name'
    },
    {
      title: 'ACK 策略',
      dataIndex: 'ackPolicy',
      key: 'ackPolicy'
    },
    {
      title: '待处理',
      dataIndex: 'pending',
      key: 'pending',
      render: (pending: number) => pending.toLocaleString()
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: unknown, record: ConsumerInfo) => (
        <Space>
          <Button 
            size="small" 
            icon={<MessageOutlined />}
            onClick={() => handleFetchMessage(record.name)}
          >
            拉取消息
          </Button>
        </Space>
      )
    }
  ]

  return (
    <div className="jetstream-wrapper">
      <Card 
        title="JetStream 管理" 
        className="panel-card"
        extra={
          <Button 
            icon={<ReloadOutlined />} 
            onClick={checkJetStreamAndLoad}
            loading={loading}
            disabled={!isConnected || jsAvailable === false}
          >
            刷新
          </Button>
        }
      >
        <div className="jetstream-content">
          {showOverlay && (
            <div className="jetstream-overlay">
              <div className="jetstream-overlay-content">
                {statusInfo.icon}
                <Title level={5} style={{ margin: '16px 0 8px', color: '#a0a0a0' }}>
                  {statusInfo.title}
                </Title>
                <Text type="secondary" style={{ textAlign: 'center', maxWidth: 280 }}>
                  {statusInfo.description}
                </Text>
              </div>
            </div>
          )}
          
          <div className={showOverlay ? 'jetstream-disabled' : ''}>
            <Tabs
              items={[
                {
                  key: 'streams',
                  label: `Streams ${streams.length > 0 ? `(${streams.length})` : ''}`,
                  children: (
                    <Table 
                      dataSource={streams} 
                      columns={streamColumns}
                      rowKey="name"
                      loading={loading && !showOverlay}
                      pagination={false}
                      size="small"
                      locale={{ emptyText: '暂无 Stream' }}
                    />
                  )
                },
                {
                  key: 'consumers',
                  label: `Consumers ${selectedStream ? `(${selectedStream})` : ''}`,
                  children: selectedStream ? (
                    <Table 
                      dataSource={consumers} 
                      columns={consumerColumns}
                      rowKey="name"
                      loading={loading && !showOverlay}
                      pagination={false}
                      size="small"
                      locale={{ emptyText: '暂无 Consumer' }}
                    />
                  ) : (
                    <div className="jetstream-placeholder">
                      <Text type="secondary">请先选择一个 Stream 查看其 Consumers</Text>
                    </div>
                  )
                }
              ]}
            />
          </div>
        </div>
      </Card>

      <Modal
        title="消息详情"
        open={messageModalVisible}
        onCancel={() => setMessageModalVisible(false)}
        footer={
          currentMessage && (
            <Space>
              <Popconfirm
                title="确认 ACK 此消息？"
                onConfirm={() => handleAck(currentMessage.sequence)}
                okText="确认"
                cancelText="取消"
              >
                <Button type="primary" icon={<CheckOutlined />}>
                  ACK
                </Button>
              </Popconfirm>
              <Popconfirm
                title="确认 NACK 此消息？"
                onConfirm={() => handleNak(currentMessage.sequence)}
                okText="确认"
                cancelText="取消"
              >
                <Button danger icon={<CloseOutlined />}>
                  NACK
                </Button>
              </Popconfirm>
              <Button onClick={() => setMessageModalVisible(false)}>
                关闭
              </Button>
            </Space>
          )
        }
        width={600}
      >
        {currentMessage && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="Subject">
              {currentMessage.subject}
            </Descriptions.Item>
            <Descriptions.Item label="Sequence">
              {currentMessage.sequence}
            </Descriptions.Item>
            <Descriptions.Item label="时间戳">
              {currentMessage.timestamp.toLocaleString()}
            </Descriptions.Item>
            <Descriptions.Item label="Payload">
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {currentMessage.payload}
              </pre>
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  )
}

export default JetStreamPanel
