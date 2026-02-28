import React, { useState, useEffect, useCallback } from 'react'
import { Card, Table, Button, Space, Typography, Tabs, Modal, Descriptions, Tag, Popconfirm, Form, Input, Select, InputNumber, message } from 'antd'
import { 
  ReloadOutlined, 
  CheckOutlined, 
  CloseOutlined,
  MessageOutlined,
  CloudOutlined,
  ApiOutlined,
  PlusOutlined,
  DeleteOutlined
} from '@ant-design/icons'
import { useConnectionStore } from '../stores'
import type { JetStreamInfo, ConsumerInfo, StoredMessage, StreamConfigOptions, ConsumerConfigOptions } from '../types/nats'
import { formatBytes } from '../utils/format'

const { Text, Title } = Typography
const { Option } = Select

const JetStreamPanel: React.FC = () => {
  const { connectionState } = useConnectionStore()
  const [streams, setStreams] = useState<JetStreamInfo[]>([])
  const [consumers, setConsumers] = useState<ConsumerInfo[]>([])
  const [selectedStream, setSelectedStream] = useState<string | null>(null)
  const [selectedConsumer, setSelectedConsumer] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [messageModalVisible, setMessageModalVisible] = useState(false)
  const [currentMessage, setCurrentMessage] = useState<StoredMessage | null>(null)
  const [jsAvailable, setJsAvailable] = useState<boolean | null>(null)
  const [createStreamModalVisible, setCreateStreamModalVisible] = useState(false)
  const [createConsumerModalVisible, setCreateConsumerModalVisible] = useState(false)
  const [streamForm] = Form.useForm()
  const [consumerForm] = Form.useForm()

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
      setSelectedConsumer(consumerName)
      setCurrentMessage(result.message || null)
      setMessageModalVisible(true)
    }
  }

  const handleAck = async () => {
    if (!selectedStream || !selectedConsumer || !currentMessage) return
    
    const result = await window.nats.ackMessage(selectedStream, selectedConsumer, currentMessage.sequence)
    if (result.success) {
      setMessageModalVisible(false)
    }
  }

  const handleNak = async () => {
    if (!selectedStream || !selectedConsumer || !currentMessage) return
    
    const result = await window.nats.nakMessage(selectedStream, selectedConsumer, currentMessage.sequence)
    if (result.success) {
      setMessageModalVisible(false)
    }
  }

  const handleCreateStream = async () => {
    try {
      const values = await streamForm.validateFields()
      const options: StreamConfigOptions = {
        name: values.name,
        subjects: values.subjects.split(',').map((s: string) => s.trim()).filter(Boolean),
        retention: values.retention,
        maxMsgs: values.maxMsgs,
        maxBytes: values.maxBytes,
        maxAge: values.maxAge,
        replicas: values.replicas,
        storage: values.storage,
        description: values.description
      }
      
      const result = await window.nats.createStream(options)
      if (result.success) {
        message.success('Stream 创建成功')
        setCreateStreamModalVisible(false)
        streamForm.resetFields()
        checkJetStreamAndLoad()
      } else {
        message.error(`创建失败: ${result.error}`)
      }
    } catch (error) {
      console.error('Form validation failed:', error)
    }
  }

  const handleDeleteStream = async (streamName: string) => {
    const result = await window.nats.deleteStream(streamName)
    if (result.success) {
      message.success('Stream 已删除')
      if (selectedStream === streamName) {
        setSelectedStream(null)
        setConsumers([])
      }
      checkJetStreamAndLoad()
    } else {
      message.error(`删除失败: ${result.error}`)
    }
  }

  const handleCreateConsumer = async () => {
    if (!selectedStream) return
    
    try {
      const values = await consumerForm.validateFields()
      const options: ConsumerConfigOptions = {
        name: values.name,
        streamName: selectedStream,
        ackPolicy: values.ackPolicy,
        maxDeliver: values.maxDeliver,
        ackWait: values.ackWait,
        deliverSubject: values.deliverSubject,
        filterSubject: values.filterSubject,
        replayPolicy: values.replayPolicy
      }
      
      const result = await window.nats.createConsumer(options)
      if (result.success) {
        message.success('Consumer 创建成功')
        setCreateConsumerModalVisible(false)
        consumerForm.resetFields()
        loadConsumers(selectedStream)
      } else {
        message.error(`创建失败: ${result.error}`)
      }
    } catch (error) {
      console.error('Form validation failed:', error)
    }
  }

  const handleDeleteConsumer = async (consumerName: string) => {
    if (!selectedStream) return
    
    const result = await window.nats.deleteConsumer(selectedStream, consumerName)
    if (result.success) {
      message.success('Consumer 已删除')
      loadConsumers(selectedStream)
    } else {
      message.error(`删除失败: ${result.error}`)
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
    },
    {
      title: '操作',
      key: 'actions',
      width: 80,
      render: (_: unknown, record: JetStreamInfo) => (
        <Popconfirm
          title="确定删除此 Stream？"
          onConfirm={() => handleDeleteStream(record.name)}
          okText="确定"
          cancelText="取消"
        >
          <Button type="text" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      )
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
            拉取
          </Button>
          <Popconfirm
            title="确定删除此 Consumer？"
            onConfirm={() => handleDeleteConsumer(record.name)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
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
          <Space>
            <Button 
              icon={<ReloadOutlined />} 
              onClick={checkJetStreamAndLoad}
              loading={loading}
              disabled={!isConnected || jsAvailable === false}
            >
              刷新
            </Button>
            <Button 
              type="primary" 
              icon={<PlusOutlined />}
              onClick={() => setCreateStreamModalVisible(true)}
              disabled={!isConnected || jsAvailable === false}
            >
              新建 Stream
            </Button>
          </Space>
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
                    <div>
                      <div style={{ marginBottom: 12 }}>
                        <Button 
                          type="primary" 
                          size="small"
                          icon={<PlusOutlined />}
                          onClick={() => setCreateConsumerModalVisible(true)}
                        >
                          新建 Consumer
                        </Button>
                      </div>
                      <Table 
                        dataSource={consumers} 
                        columns={consumerColumns}
                        rowKey="name"
                        loading={loading && !showOverlay}
                        pagination={false}
                        size="small"
                        locale={{ emptyText: '暂无 Consumer' }}
                      />
                    </div>
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
        title="新建 Stream"
        open={createStreamModalVisible}
        onCancel={() => {
          setCreateStreamModalVisible(false)
          streamForm.resetFields()
        }}
        onOk={handleCreateStream}
        okText="创建"
        cancelText="取消"
        width={500}
      >
        <Form form={streamForm} layout="vertical">
          <Form.Item
            name="name"
            label="Stream 名称"
            rules={[{ required: true, message: '请输入 Stream 名称' }]}
          >
            <Input placeholder="例如: MY_STREAM" />
          </Form.Item>
          <Form.Item
            name="subjects"
            label="Subjects (逗号分隔)"
            rules={[{ required: true, message: '请输入至少一个 Subject' }]}
          >
            <Input placeholder="例如: orders.*, events.>" />
          </Form.Item>
          <Form.Item
            name="retention"
            label="保留策略"
            initialValue="limits"
          >
            <Select>
              <Option value="limits">Limits</Option>
              <Option value="interest">Interest</Option>
              <Option value="workqueue">Work Queue</Option>
            </Select>
          </Form.Item>
          <Form.Item
            name="storage"
            label="存储类型"
            initialValue="file"
          >
            <Select>
              <Option value="file">File</Option>
              <Option value="memory">Memory</Option>
            </Select>
          </Form.Item>
          <Form.Item
            name="replicas"
            label="副本数"
            initialValue={1}
          >
            <InputNumber min={1} max={5} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="maxMsgs"
            label="最大消息数"
          >
            <InputNumber min={-1} style={{ width: '100%' }} placeholder="-1 表示无限制" />
          </Form.Item>
          <Form.Item
            name="maxBytes"
            label="最大字节数"
          >
            <InputNumber min={-1} style={{ width: '100%' }} placeholder="-1 表示无限制" />
          </Form.Item>
          <Form.Item
            name="maxAge"
            label="最大保留时间 (纳秒)"
          >
            <InputNumber min={0} style={{ width: '100%' }} placeholder="0 表示无限制" />
          </Form.Item>
          <Form.Item
            name="description"
            label="描述"
          >
            <Input placeholder="可选" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`新建 Consumer (Stream: ${selectedStream})`}
        open={createConsumerModalVisible}
        onCancel={() => {
          setCreateConsumerModalVisible(false)
          consumerForm.resetFields()
        }}
        onOk={handleCreateConsumer}
        okText="创建"
        cancelText="取消"
        width={500}
      >
        <Form form={consumerForm} layout="vertical">
          <Form.Item
            name="name"
            label="Consumer 名称"
            rules={[{ required: true, message: '请输入 Consumer 名称' }]}
          >
            <Input placeholder="例如: my_consumer" />
          </Form.Item>
          <Form.Item
            name="ackPolicy"
            label="ACK 策略"
            initialValue="explicit"
          >
            <Select>
              <Option value="none">None</Option>
              <Option value="all">All</Option>
              <Option value="explicit">Explicit</Option>
            </Select>
          </Form.Item>
          <Form.Item
            name="deliverPolicy"
            label="投递策略"
            initialValue="all"
          >
            <Select>
              <Option value="all">All</Option>
              <Option value="last">Last</Option>
              <Option value="new">New</Option>
            </Select>
          </Form.Item>
          <Form.Item
            name="replayPolicy"
            label="重放策略"
            initialValue="instant"
          >
            <Select>
              <Option value="instant">Instant</Option>
              <Option value="original">Original</Option>
            </Select>
          </Form.Item>
          <Form.Item
            name="filterSubject"
            label="过滤 Subject"
          >
            <Input placeholder="可选，例如: orders.created" />
          </Form.Item>
          <Form.Item
            name="deliverSubject"
            label="投递 Subject (Push 模式)"
          >
            <Input placeholder="可选，填写后为 Push 模式" />
          </Form.Item>
          <Form.Item
            name="maxDeliver"
            label="最大投递次数"
            initialValue={-1}
          >
            <InputNumber min={-1} style={{ width: '100%' }} placeholder="-1 表示无限制" />
          </Form.Item>
          <Form.Item
            name="ackWait"
            label="ACK 等待时间 (纳秒)"
          >
            <InputNumber min={0} style={{ width: '100%' }} placeholder="默认 30 秒" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="消息详情"
        open={messageModalVisible}
        onCancel={() => setMessageModalVisible(false)}
        footer={
          currentMessage && (
            <Space>
              <Popconfirm
                title="确认 ACK 此消息？"
                onConfirm={() => handleAck()}
                okText="确认"
                cancelText="取消"
              >
                <Button type="primary" icon={<CheckOutlined />}>
                  ACK
                </Button>
              </Popconfirm>
              <Popconfirm
                title="确认 NACK 此消息？"
                onConfirm={() => handleNak()}
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
