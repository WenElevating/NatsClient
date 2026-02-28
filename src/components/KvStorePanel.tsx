import React, { useState, useEffect, useCallback } from 'react'
import { Card, Table, Button, Space, Tag, Typography, Empty, message, Popconfirm, Tooltip, Modal, Form, Input, InputNumber, Popover } from 'antd'
import { 
  DatabaseOutlined, 
  ReloadOutlined, 
  PlusOutlined, 
  DeleteOutlined, 
  HistoryOutlined,
  KeyOutlined,
  CopyOutlined,
  ApiOutlined
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useConnectionStore } from '../stores'
import type { KvBucketInfo, KvEntry } from '../types/nats'
import { formatTimestamp, formatJson } from '../utils/format'

const { Text, Title } = Typography

const KvStorePanel: React.FC = () => {
  const { t } = useTranslation()
  const { connectionState } = useConnectionStore()
  const [buckets, setBuckets] = useState<KvBucketInfo[]>([])
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null)
  const [keys, setKeys] = useState<string[]>([])
  const [entries, setEntries] = useState<Map<string, KvEntry>>(new Map())
  const [loading, setLoading] = useState(false)
  const [jsAvailable, setJsAvailable] = useState<boolean | null>(null)
  const [createBucketModalVisible, setCreateBucketModalVisible] = useState(false)
  const [addKeyModalVisible, setAddKeyModalVisible] = useState(false)
  const [historyModalVisible, setHistoryModalVisible] = useState(false)
  const [history, setHistory] = useState<KvEntry[]>([])
  const [createForm] = Form.useForm()
  const [addForm] = Form.useForm()

  const isConnected = connectionState.status === 'connected'

  const checkJetStreamAndLoad = useCallback(async () => {
    if (!isConnected) {
      setJsAvailable(null)
      setBuckets([])
      return
    }
    
    setLoading(true)
    const result = await window.nats.getKvBuckets()
    if (result.success && result.buckets !== undefined) {
      setBuckets(result.buckets)
      setJsAvailable(true)
    } else if (result.error?.includes('JetStream not available')) {
      setJsAvailable(false)
      setBuckets([])
    } else {
      setJsAvailable(false)
      setBuckets([])
    }
    setLoading(false)
  }, [isConnected])

  useEffect(() => {
    if (isConnected) {
      checkJetStreamAndLoad()
    } else {
      setJsAvailable(null)
      setBuckets([])
      setSelectedBucket(null)
    }
  }, [isConnected, checkJetStreamAndLoad])

  const loadKeys = async (bucketName: string) => {
    const result = await window.nats.getKvKeys(bucketName)
    if (result.success && result.keys) {
      setKeys(result.keys)
      
      const entriesMap = new Map<string, KvEntry>()
      for (const key of result.keys) {
        const entryResult = await window.nats.getKvEntry(bucketName, key)
        if (entryResult.success && entryResult.entry) {
          entriesMap.set(key, entryResult.entry)
        }
      }
      setEntries(entriesMap)
    } else {
      message.error(`${t('kvstore.loadKeysFailed', '加载 Keys 失败')}: ${result.error}`)
    }
  }

  useEffect(() => {
    if (selectedBucket) {
      loadKeys(selectedBucket)
    }
  }, [selectedBucket])

  const handleCreateBucket = async () => {
    try {
      const values = await createForm.validateFields()
      const result = await window.nats.createKvBucket(values.name, {
        description: values.description,
        ttl: values.ttl,
        history: values.history
      })
      
      if (result.success) {
        message.success(t('kvstore.createBucket.createSuccess'))
        setCreateBucketModalVisible(false)
        createForm.resetFields()
        checkJetStreamAndLoad()
      } else {
        message.error(`${t('kvstore.createBucket.createFailed')}: ${result.error}`)
      }
    } catch (error) {
      console.error('Form validation failed:', error)
    }
  }

  const handleDeleteBucket = async (bucketName: string) => {
    const result = await window.nats.deleteKvBucket(bucketName)
    if (result.success) {
      message.success(t('kvstore.createBucket.deleteSuccess'))
      if (selectedBucket === bucketName) {
        setSelectedBucket(null)
        setKeys([])
        setEntries(new Map())
      }
      checkJetStreamAndLoad()
    } else {
      message.error(`${t('kvstore.createBucket.deleteFailed')}: ${result.error}`)
    }
  }

  const handleAddKey = async () => {
    if (!selectedBucket) return
    
    try {
      const values = await addForm.validateFields()
      const result = await window.nats.putKvEntry(selectedBucket, values.key, values.value)
      
      if (result.success) {
        message.success(t('kvstore.addKey.addSuccess'))
        setAddKeyModalVisible(false)
        addForm.resetFields()
        loadKeys(selectedBucket)
      } else {
        message.error(`${t('kvstore.addKey.addFailed')}: ${result.error}`)
      }
    } catch (error) {
      console.error('Form validation failed:', error)
    }
  }

  const handleDeleteKey = async (key: string) => {
    if (!selectedBucket) return
    
    const result = await window.nats.deleteKvEntry(selectedBucket, key)
    if (result.success) {
      message.success(t('kvstore.addKey.deleteSuccess'))
      loadKeys(selectedBucket)
    } else {
      message.error(`${t('kvstore.addKey.deleteFailed')}: ${result.error}`)
    }
  }

  const handleViewHistory = async (key: string) => {
    if (!selectedBucket) return
    
    const result = await window.nats.getKvHistory(selectedBucket, key)
    if (result.success && result.history) {
      setHistory(result.history)
      setHistoryModalVisible(true)
    } else {
      message.error(`${t('kvstore.loadHistoryFailed', '获取历史失败')}: ${result.error}`)
    }
  }

  const handleCopyValue = (value: string) => {
    navigator.clipboard.writeText(value)
    message.success(t('common.copied'))
  }

  const truncateValue = (value: string): string => {
    if (value.length <= 50) return value
    return value.substring(0, 50) + '...'
  }

  const getStatusInfo = () => {
    if (!isConnected) {
      return {
        icon: <ApiOutlined style={{ fontSize: 48, color: '#666' }} />,
        title: t('kvstore.notConnected', '未连接到 NATS 服务器'),
        description: t('kvstore.notConnectedDesc', '请先连接到 NATS 服务器后再使用 KV Store 功能')
      }
    }
    if (jsAvailable === false) {
      return {
        icon: <DatabaseOutlined style={{ fontSize: 48, color: '#faad14' }} />,
        title: t('jetstream.notAvailable'),
        description: t('kvstore.jsRequired', 'KV Store 需要 JetStream 支持。请在 NATS 服务器配置中开启 JetStream')
      }
    }
    return null
  }

  const statusInfo = getStatusInfo()
  const showOverlay = statusInfo !== null

  const bucketColumns = [
    {
      title: t('kvstore.bucket'),
      dataIndex: 'bucket',
      key: 'bucket',
      render: (name: string) => (
        <Button type="link" onClick={() => setSelectedBucket(name)}>
          {name}
        </Button>
      )
    },
    {
      title: t('kvstore.values'),
      dataIndex: 'values',
      key: 'values',
      width: 80
    },
    {
      title: t('kvstore.history'),
      dataIndex: 'history',
      key: 'history',
      width: 80
    },
    {
      title: t('kvstore.ttl'),
      dataIndex: 'ttl',
      key: 'ttl',
      width: 100,
      render: (ttl: number) => ttl > 0 ? `${Math.floor(ttl / 1000000000)}s` : '∞'
    },
    {
      title: t('kvstore.storage'),
      dataIndex: 'backingStore',
      key: 'backingStore',
      width: 80
    },
    {
      title: t('jetstream.actions'),
      key: 'actions',
      width: 80,
      render: (_: unknown, record: KvBucketInfo) => (
        <Popconfirm
          title={t('kvstore.confirmDeleteBucket')}
          onConfirm={() => handleDeleteBucket(record.bucket)}
          okText={t('common.confirm')}
          cancelText={t('common.cancel')}
        >
          <Button type="text" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      )
    }
  ]

  const keyColumns = [
    {
      title: t('kvstore.key'),
      dataIndex: 'key',
      key: 'key',
      width: 200,
      ellipsis: true
    },
    {
      title: t('kvstore.value'),
      key: 'value',
      render: (_: unknown, key: string) => {
        const entry = entries.get(key)
        if (!entry) return '-'
        const value = entry.value
        const truncated = truncateValue(value)
        return (
          <Popover 
            content={
              <pre style={{ maxWidth: 400, maxHeight: 300, overflow: 'auto' }}>
                {formatJson(value) || value}
              </pre>
            }
            title={t('kvstore.fullContent')}
          >
            <Text code style={{ cursor: 'pointer' }}>{truncated}</Text>
          </Popover>
        )
      }
    },
    {
      title: t('kvstore.revision'),
      key: 'revision',
      width: 80,
      render: (_: unknown, key: string) => entries.get(key)?.revision || '-'
    },
    {
      title: t('jetstream.actions'),
      key: 'actions',
      width: 120,
      render: (_: unknown, key: string) => (
        <Space size={0}>
          <Tooltip title={t('kvstore.viewHistory')}>
            <Button 
              type="text" 
              size="small"
              icon={<HistoryOutlined />}
              onClick={() => handleViewHistory(key)}
            />
          </Tooltip>
          <Tooltip title={t('kvstore.copyValue')}>
            <Button 
              type="text" 
              size="small"
              icon={<CopyOutlined />}
              onClick={() => handleCopyValue(entries.get(key)?.value || '')}
            />
          </Tooltip>
          <Popconfirm
            title={t('kvstore.confirmDeleteKey')}
            onConfirm={() => handleDeleteKey(key)}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
          >
            <Tooltip title={t('common.delete')}>
              <Button type="text" size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      )
    }
  ]

  const historyColumns = [
    {
      title: t('kvstore.revision'),
      dataIndex: 'revision',
      key: 'revision',
      width: 80
    },
    {
      title: t('kvstore.operation'),
      dataIndex: 'operation',
      key: 'operation',
      width: 80,
      render: (op: string) => (
        <Tag color={op === 'PUT' ? 'green' : op === 'DEL' ? 'red' : 'orange'}>
          {op}
        </Tag>
      )
    },
    {
      title: t('kvstore.value'),
      dataIndex: 'value',
      key: 'value',
      render: (value: string) => (
        <pre style={{ margin: 0, maxWidth: 300, overflow: 'auto' }}>
          {formatJson(value) || value}
        </pre>
      )
    },
    {
      title: t('kvstore.created'),
      dataIndex: 'created',
      key: 'created',
      width: 150,
      render: (date: Date) => formatTimestamp(date)
    }
  ]

  return (
    <Card 
      title={
        <Space>
          <DatabaseOutlined />
          <span>{t('kvstore.title')}</span>
        </Space>
      }
      className="panel-card"
      extra={
        <Space>
          <Button 
            icon={<ReloadOutlined />} 
            onClick={checkJetStreamAndLoad}
            loading={loading}
            disabled={!isConnected || jsAvailable === false}
          >
            {t('kvstore.refresh')}
          </Button>
          <Button 
            type="primary" 
            icon={<PlusOutlined />}
            onClick={() => setCreateBucketModalVisible(true)}
            disabled={!isConnected || jsAvailable === false}
          >
            {t('kvstore.newBucket')}
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
          {buckets.length === 0 && !showOverlay ? (
            <Empty description={t('kvstore.noBuckets')} />
          ) : (
            <>
              <Table 
                dataSource={buckets} 
                columns={bucketColumns}
                rowKey="bucket"
                pagination={false}
                size="small"
                loading={loading && !showOverlay}
                onRow={(record) => ({
                  onClick: () => setSelectedBucket(record.bucket),
                  style: { cursor: 'pointer', backgroundColor: selectedBucket === record.bucket ? 'rgba(24, 144, 255, 0.1)' : undefined }
                })}
              />

              {selectedBucket && (
                <Card 
                  size="small" 
                  title={
                    <Space>
                      <KeyOutlined />
                      <span>{t('kvstore.keys')} in {selectedBucket}</span>
                      <Tag>{keys.length}</Tag>
                    </Space>
                  }
                  extra={
                    <Button 
                      type="primary" 
                      size="small"
                      icon={<PlusOutlined />}
                      onClick={() => setAddKeyModalVisible(true)}
                    >
                      {t('kvstore.newKey')}
                    </Button>
                  }
                  style={{ marginTop: 16 }}
                >
                  {keys.length === 0 ? (
                    <Empty description={t('kvstore.noKeys')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  ) : (
                    <Table 
                      dataSource={keys} 
                      columns={keyColumns}
                      rowKey={(key) => key}
                      pagination={false}
                      size="small"
                    />
                  )}
                </Card>
              )}
            </>
          )}
        </div>
      </div>

      <Modal
        title={t('kvstore.createBucket.title')}
        open={createBucketModalVisible}
        onCancel={() => {
          setCreateBucketModalVisible(false)
          createForm.resetFields()
        }}
        onOk={handleCreateBucket}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
      >
        <Form form={createForm} layout="vertical">
          <Form.Item
            name="name"
            label={t('kvstore.createBucket.name')}
            rules={[{ required: true, message: t('kvstore.createBucket.nameRequired', '请输入 Bucket 名称') }]}
          >
            <Input placeholder={t('kvstore.createBucket.namePlaceholder')} />
          </Form.Item>
          <Form.Item
            name="description"
            label={t('kvstore.createBucket.description')}
          >
            <Input placeholder={t('common.optional', '可选')} />
          </Form.Item>
          <Form.Item
            name="history"
            label={t('kvstore.createBucket.historyCount')}
            initialValue={10}
          >
            <InputNumber min={1} max={100} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="ttl"
            label={t('kvstore.createBucket.ttlSeconds')}
            initialValue={0}
          >
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('kvstore.addKey.title')}
        open={addKeyModalVisible}
        onCancel={() => {
          setAddKeyModalVisible(false)
          addForm.resetFields()
        }}
        onOk={handleAddKey}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
      >
        <Form form={addForm} layout="vertical">
          <Form.Item
            name="key"
            label={t('kvstore.key')}
            rules={[{ required: true, message: t('kvstore.addKey.keyRequired', '请输入 Key') }]}
          >
            <Input placeholder={t('kvstore.addKey.keyPlaceholder')} />
          </Form.Item>
          <Form.Item
            name="value"
            label={t('kvstore.value')}
            rules={[{ required: true, message: t('kvstore.addKey.valueRequired', '请输入 Value') }]}
          >
            <Input.TextArea rows={4} placeholder={t('kvstore.addKey.valuePlaceholder')} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('kvstore.historyTitle')}
        open={historyModalVisible}
        onCancel={() => {
          setHistoryModalVisible(false)
          setHistory([])
        }}
        footer={null}
        width={700}
      >
        <Table 
          dataSource={history} 
          columns={historyColumns}
          rowKey={(record) => `${record.revision}-${record.key}`}
          pagination={false}
          size="small"
        />
      </Modal>
    </Card>
  )
}

export default KvStorePanel
