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
import { useTranslation } from 'react-i18next'
import { useConnectionStore } from '../stores'
import type { JetStreamInfo, ConsumerInfo, StoredMessage, StreamConfigOptions, ConsumerConfigOptions } from '../types/nats'
import { formatBytes } from '../utils/format'

const { Text, Title } = Typography
const { Option } = Select

const JetStreamPanel: React.FC = () => {
  const { t } = useTranslation()
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
        message.success(t('jetstream.createStream.createSuccess'))
        setCreateStreamModalVisible(false)
        streamForm.resetFields()
        checkJetStreamAndLoad()
      } else {
        message.error(`${t('jetstream.createStream.createFailed')}: ${result.error}`)
      }
    } catch (error) {
      console.error('Form validation failed:', error)
    }
  }

  const handleDeleteStream = async (streamName: string) => {
    const result = await window.nats.deleteStream(streamName)
    if (result.success) {
      message.success(t('jetstream.createStream.deleteSuccess'))
      if (selectedStream === streamName) {
        setSelectedStream(null)
        setConsumers([])
      }
      checkJetStreamAndLoad()
    } else {
      message.error(`${t('jetstream.createStream.deleteFailed')}: ${result.error}`)
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
        message.success(t('jetstream.createConsumer.createSuccess'))
        setCreateConsumerModalVisible(false)
        consumerForm.resetFields()
        loadConsumers(selectedStream)
      } else {
        message.error(`${t('jetstream.createConsumer.createFailed')}: ${result.error}`)
      }
    } catch (error) {
      console.error('Form validation failed:', error)
    }
  }

  const handleDeleteConsumer = async (consumerName: string) => {
    if (!selectedStream) return
    
    const result = await window.nats.deleteConsumer(selectedStream, consumerName)
    if (result.success) {
      message.success(t('jetstream.createConsumer.deleteSuccess'))
      loadConsumers(selectedStream)
    } else {
      message.error(`${t('jetstream.createConsumer.deleteFailed')}: ${result.error}`)
    }
  }

  const getStatusInfo = () => {
    if (!isConnected) {
      return {
        icon: <ApiOutlined style={{ fontSize: 48, color: '#666' }} />,
        title: t('jetstream.notConnected'),
        description: t('jetstream.notConnectedDesc', '请先连接到 NATS 服务器后再使用 JetStream 功能')
      }
    }
    if (jsAvailable === false) {
      return {
        icon: <CloudOutlined style={{ fontSize: 48, color: '#faad14' }} />,
        title: t('jetstream.notAvailable'),
        description: t('jetstream.notAvailableDesc')
      }
    }
    return null
  }

  const statusInfo = getStatusInfo()
  const showOverlay = statusInfo !== null

  const streamColumns = [
    {
      title: t('jetstream.streamName'),
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => (
        <Button type="link" onClick={() => handleStreamSelect(name)} style={{ padding: 0 }}>
          {name}
        </Button>
      )
    },
    {
      title: t('jetstream.subjects'),
      dataIndex: 'subjects',
      key: 'subjects',
      render: (subjects: string[]) => (
        <Space direction="vertical" size="small">
          {subjects.map(s => <Tag key={s}>{s}</Tag>)}
        </Space>
      )
    },
    {
      title: t('jetstream.messageCount'),
      dataIndex: 'messages',
      key: 'messages',
      render: (count: number) => count.toLocaleString()
    },
    {
      title: t('jetstream.size'),
      dataIndex: 'bytes',
      key: 'bytes',
      render: (bytes: number) => formatBytes(bytes)
    },
    {
      title: t('jetstream.retention'),
      dataIndex: 'retention',
      key: 'retention'
    },
    {
      title: t('jetstream.actions'),
      key: 'actions',
      width: 80,
      render: (_: unknown, record: JetStreamInfo) => (
        <Popconfirm
          title={t('jetstream.confirmDeleteStream')}
          onConfirm={() => handleDeleteStream(record.name)}
          okText={t('common.confirm')}
          cancelText={t('common.cancel')}
        >
          <Button type="text" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      )
    }
  ]

  const consumerColumns = [
    {
      title: t('jetstream.consumerName'),
      dataIndex: 'name',
      key: 'name'
    },
    {
      title: t('jetstream.ackPolicy'),
      dataIndex: 'ackPolicy',
      key: 'ackPolicy'
    },
    {
      title: t('jetstream.pending'),
      dataIndex: 'pending',
      key: 'pending',
      render: (pending: number) => pending.toLocaleString()
    },
    {
      title: t('jetstream.actions'),
      key: 'actions',
      render: (_: unknown, record: ConsumerInfo) => (
        <Space>
          <Button 
            size="small" 
            icon={<MessageOutlined />}
            onClick={() => handleFetchMessage(record.name)}
          >
            {t('jetstream.fetchMessage')}
          </Button>
          <Popconfirm
            title={t('jetstream.confirmDeleteConsumer')}
            onConfirm={() => handleDeleteConsumer(record.name)}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
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
        title={t('jetstream.title')} 
        className="panel-card"
        extra={
          <Space>
            <Button 
              icon={<ReloadOutlined />} 
              onClick={checkJetStreamAndLoad}
              loading={loading}
              disabled={!isConnected || jsAvailable === false}
            >
              {t('jetstream.refresh')}
            </Button>
            <Button 
              type="primary" 
              icon={<PlusOutlined />}
              onClick={() => setCreateStreamModalVisible(true)}
              disabled={!isConnected || jsAvailable === false}
            >
              {t('jetstream.newStream')}
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
                  label: `${t('jetstream.streams')} ${streams.length > 0 ? `(${streams.length})` : ''}`,
                  children: (
                    <Table 
                      dataSource={streams} 
                      columns={streamColumns}
                      rowKey="name"
                      loading={loading && !showOverlay}
                      pagination={false}
                      size="small"
                      locale={{ emptyText: t('jetstream.noStreams') }}
                    />
                  )
                },
                {
                  key: 'consumers',
                  label: `${t('jetstream.consumers')} ${selectedStream ? `(${selectedStream})` : ''}`,
                  children: selectedStream ? (
                    <div>
                      <div style={{ marginBottom: 12 }}>
                        <Button 
                          type="primary" 
                          size="small"
                          icon={<PlusOutlined />}
                          onClick={() => setCreateConsumerModalVisible(true)}
                        >
                          {t('jetstream.newConsumer')}
                        </Button>
                      </div>
                      <Table 
                        dataSource={consumers} 
                        columns={consumerColumns}
                        rowKey="name"
                        loading={loading && !showOverlay}
                        pagination={false}
                        size="small"
                        locale={{ emptyText: t('jetstream.noConsumers') }}
                      />
                    </div>
                  ) : (
                    <div className="jetstream-placeholder">
                      <Text type="secondary">{t('jetstream.selectStream')}</Text>
                    </div>
                  )
                }
              ]}
            />
          </div>
        </div>
      </Card>

      <Modal
        title={t('jetstream.createStream.title')}
        open={createStreamModalVisible}
        onCancel={() => {
          setCreateStreamModalVisible(false)
          streamForm.resetFields()
        }}
        onOk={handleCreateStream}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
        width={500}
      >
        <Form form={streamForm} layout="vertical">
          <Form.Item
            name="name"
            label={t('jetstream.createStream.name')}
            rules={[{ required: true, message: t('jetstream.createStream.nameRequired', '请输入 Stream 名称') }]}
          >
            <Input placeholder={t('jetstream.createStream.namePlaceholder')} />
          </Form.Item>
          <Form.Item
            name="subjects"
            label={t('jetstream.createStream.subjectsLabel')}
            rules={[{ required: true, message: t('jetstream.createStream.subjectsRequired', '请输入至少一个 Subject') }]}
          >
            <Input placeholder={t('jetstream.createStream.subjectsPlaceholder')} />
          </Form.Item>
          <Form.Item
            name="retention"
            label={t('jetstream.createStream.retentionPolicy')}
            initialValue="limits"
          >
            <Select>
              <Option value="limits">{t('jetstream.createStream.limits')}</Option>
              <Option value="interest">{t('jetstream.createStream.interest')}</Option>
              <Option value="workqueue">{t('jetstream.createStream.workQueue')}</Option>
            </Select>
          </Form.Item>
          <Form.Item
            name="storage"
            label={t('jetstream.createStream.storageType')}
            initialValue="file"
          >
            <Select>
              <Option value="file">{t('jetstream.createStream.file')}</Option>
              <Option value="memory">{t('jetstream.createStream.memory')}</Option>
            </Select>
          </Form.Item>
          <Form.Item
            name="replicas"
            label={t('jetstream.createStream.replicas')}
            initialValue={1}
          >
            <InputNumber min={1} max={5} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="maxMsgs"
            label={t('jetstream.createStream.maxMessages')}
          >
            <InputNumber min={-1} style={{ width: '100%' }} placeholder={t('jetstream.createStream.unlimited')} />
          </Form.Item>
          <Form.Item
            name="maxBytes"
            label={t('jetstream.createStream.maxBytes')}
          >
            <InputNumber min={-1} style={{ width: '100%' }} placeholder={t('jetstream.createStream.unlimited')} />
          </Form.Item>
          <Form.Item
            name="maxAge"
            label={t('jetstream.createStream.maxAge')}
          >
            <InputNumber min={0} style={{ width: '100%' }} placeholder="0 = unlimited" />
          </Form.Item>
          <Form.Item
            name="description"
            label={t('jetstream.createStream.description')}
          >
            <Input placeholder={t('common.optional', '可选')} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`${t('jetstream.createConsumer.title')} (Stream: ${selectedStream})`}
        open={createConsumerModalVisible}
        onCancel={() => {
          setCreateConsumerModalVisible(false)
          consumerForm.resetFields()
        }}
        onOk={handleCreateConsumer}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
        width={500}
      >
        <Form form={consumerForm} layout="vertical">
          <Form.Item
            name="name"
            label={t('jetstream.createConsumer.name')}
            rules={[{ required: true, message: t('jetstream.createConsumer.nameRequired', '请输入 Consumer 名称') }]}
          >
            <Input placeholder={t('jetstream.createConsumer.namePlaceholder')} />
          </Form.Item>
          <Form.Item
            name="ackPolicy"
            label={t('jetstream.createConsumer.ackPolicy')}
            initialValue="explicit"
          >
            <Select>
              <Option value="none">{t('jetstream.createConsumer.none')}</Option>
              <Option value="all">{t('jetstream.createConsumer.all')}</Option>
              <Option value="explicit">{t('jetstream.createConsumer.explicit')}</Option>
            </Select>
          </Form.Item>
          <Form.Item
            name="deliverPolicy"
            label={t('jetstream.createConsumer.deliverPolicy')}
            initialValue="all"
          >
            <Select>
              <Option value="all">{t('jetstream.createConsumer.all')}</Option>
              <Option value="last">{t('jetstream.createConsumer.last')}</Option>
              <Option value="new">{t('jetstream.createConsumer.new')}</Option>
            </Select>
          </Form.Item>
          <Form.Item
            name="replayPolicy"
            label={t('jetstream.createConsumer.replayPolicy')}
            initialValue="instant"
          >
            <Select>
              <Option value="instant">{t('jetstream.createConsumer.instant')}</Option>
              <Option value="original">{t('jetstream.createConsumer.original')}</Option>
            </Select>
          </Form.Item>
          <Form.Item
            name="filterSubject"
            label={t('jetstream.createConsumer.filterSubject')}
          >
            <Input placeholder={t('jetstream.createConsumer.filterSubjectPlaceholder', '可选，例如: orders.created')} />
          </Form.Item>
          <Form.Item
            name="deliverSubject"
            label={t('jetstream.createConsumer.deliverSubject')}
          >
            <Input placeholder={t('jetstream.createConsumer.deliverSubjectPlaceholder', '可选，填写后为 Push 模式')} />
          </Form.Item>
          <Form.Item
            name="maxDeliver"
            label={t('jetstream.createConsumer.maxDeliver')}
            initialValue={-1}
          >
            <InputNumber min={-1} style={{ width: '100%' }} placeholder={t('jetstream.createStream.unlimited')} />
          </Form.Item>
          <Form.Item
            name="ackWait"
            label={t('jetstream.createConsumer.ackWait')}
          >
            <InputNumber min={0} style={{ width: '100%' }} placeholder="default 30s" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('jetstream.messageDetail')}
        open={messageModalVisible}
        onCancel={() => setMessageModalVisible(false)}
        footer={
          currentMessage && (
            <Space>
              <Popconfirm
                title={t('jetstream.confirmAck')}
                onConfirm={() => handleAck()}
                okText={t('common.confirm')}
                cancelText={t('common.cancel')}
              >
                <Button type="primary" icon={<CheckOutlined />}>
                  {t('jetstream.ack')}
                </Button>
              </Popconfirm>
              <Popconfirm
                title={t('jetstream.confirmNak')}
                onConfirm={() => handleNak()}
                okText={t('common.confirm')}
                cancelText={t('common.cancel')}
              >
                <Button danger icon={<CloseOutlined />}>
                  {t('jetstream.nak')}
                </Button>
              </Popconfirm>
              <Button onClick={() => setMessageModalVisible(false)}>
                {t('common.close')}
              </Button>
            </Space>
          )
        }
        width={600}
      >
        {currentMessage && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label={t('jetstream.subjects')}>
              {currentMessage.subject}
            </Descriptions.Item>
            <Descriptions.Item label={t('jetstream.sequence')}>
              {currentMessage.sequence}
            </Descriptions.Item>
            <Descriptions.Item label={t('jetstream.timestamp')}>
              {currentMessage.timestamp.toLocaleString()}
            </Descriptions.Item>
            <Descriptions.Item label={t('jetstream.payload')}>
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
