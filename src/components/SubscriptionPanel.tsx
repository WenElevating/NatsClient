import React, { useState, useCallback, useEffect, useRef } from 'react'
import { Card, Input, Button, Space, List, Tag, Typography, Empty, Select, message, Popconfirm, Tooltip, Modal } from 'antd'
import { 
  PlusOutlined, 
  DeleteOutlined, 
  PauseCircleOutlined, 
  PlayCircleOutlined,
  ClearOutlined,
  SearchOutlined,
  CopyOutlined,
  EyeOutlined
} from '@ant-design/icons'
import { useConnectionStore, useSubscriptionStore, useSettingsStore } from '../stores'
import type { Subscription, NatsMessage } from '../types/nats'
import { formatTimestamp, formatJson } from '../utils/format'

const { Text } = Typography

const SubscriptionPanel: React.FC = () => {
  const [subject, setSubject] = useState('')
  const { connectionState } = useConnectionStore()
  const { 
    subscriptions, 
    pausedSubscriptions, 
    searchFilter,
    addSubscription, 
    removeSubscription, 
    togglePause, 
    clearMessages, 
    setSearchFilter,
    getFilteredMessages,
    savedSubjects,
    saveSubject
  } = useSubscriptionStore()
  const { messageDisplayLength } = useSettingsStore()

  const [activeSubscriptionId, setActiveSubscriptionId] = useState<string | null>(null)
  const messageListRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [detailModalVisible, setDetailModalVisible] = useState(false)
  const [detailMessage, setDetailMessage] = useState<NatsMessage | null>(null)

  const isConnected = connectionState.status === 'connected'

  useEffect(() => {
    const loadSubscriptions = async () => {
      const subs = await window.nats.getSubscriptions()
      subs.forEach(sub => {
        addSubscription(sub)
      })
    }
    if (isConnected) {
      loadSubscriptions()
    }
  }, [isConnected])

  useEffect(() => {
    const resubscribe = async () => {
      if (isConnected && savedSubjects.length > 0 && subscriptions.length === 0) {
        for (const savedSubject of savedSubjects) {
          const result = await window.nats.subscribe(savedSubject)
          if (result.success && result.subscriptionId) {
            const sub: Subscription = {
              id: result.subscriptionId,
              subject: savedSubject,
              active: true,
              messageCount: 0,
              createdAt: new Date()
            }
            addSubscription(sub)
          }
        }
        message.success(`已自动恢复 ${savedSubjects.length} 个订阅`)
      }
    }
    resubscribe()
  }, [isConnected, savedSubjects, subscriptions.length, addSubscription])

  const handleSubscribe = useCallback(async () => {
    if (!subject.trim()) {
      message.error('请输入 Subject')
      return
    }

    if (!isConnected) {
      message.error('未连接到 NATS 服务器')
      return
    }

    const result = await window.nats.subscribe(subject)
    if (result.success && result.subscriptionId) {
      const sub: Subscription = {
        id: result.subscriptionId,
        subject,
        active: true,
        messageCount: 0,
        createdAt: new Date()
      }
      addSubscription(sub)
      saveSubject(subject)
      setActiveSubscriptionId(sub.id)
      setSubject('')
      message.success(`已订阅: ${subject}`)
    } else {
      message.error(`订阅失败: ${result.error}`)
    }
  }, [subject, isConnected, addSubscription, saveSubject])

  const handleUnsubscribe = useCallback(async (id: string) => {
    const result = await window.nats.unsubscribe(id)
    if (result.success) {
      removeSubscription(id)
      if (activeSubscriptionId === id) {
        setActiveSubscriptionId(subscriptions.length > 1 ? subscriptions.find(s => s.id !== id)?.id || null : null)
      }
      message.success('已取消订阅')
    } else {
      message.error(`取消订阅失败: ${result.error}`)
    }
  }, [activeSubscriptionId, removeSubscription, subscriptions])

  const handleCopyMessage = (payload: string) => {
    navigator.clipboard.writeText(payload)
    message.success('已复制到剪贴板')
  }

  const handleViewDetail = (msg: NatsMessage) => {
    setDetailMessage(msg)
    setDetailModalVisible(true)
  }

  const truncatePayload = (payload: string, isJson: boolean): { display: string; truncated: boolean } => {
    const formatted = isJson ? formatJson(payload) : payload
    if (formatted.length <= messageDisplayLength) {
      return { display: formatted, truncated: false }
    }
    return { display: formatted.substring(0, messageDisplayLength) + '...', truncated: true }
  }

  const activeMessages = activeSubscriptionId ? getFilteredMessages(activeSubscriptionId) : []
  const activeSubscription = subscriptions.find(s => s.id === activeSubscriptionId)
  const isPaused = activeSubscriptionId ? pausedSubscriptions.has(activeSubscriptionId) : false

  useEffect(() => {
    if (autoScroll && messageListRef.current && activeMessages.length > 0) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight
    }
  }, [activeMessages, autoScroll])

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement
    const isAtBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 50
    setAutoScroll(isAtBottom)
  }

  const subscriptionOptions = subscriptions.map(sub => ({
    value: sub.id,
    label: (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {sub.subject}
        </span>
        <Tag style={{ marginLeft: 8, flexShrink: 0 }}>{sub.messageCount}</Tag>
      </div>
    )
  }))

  return (
    <div className="subscription-panel">
      <Card 
        title="订阅管理" 
        className="panel-card subscription-card"
        size="small"
        extra={
          <Space>
            <Input
              placeholder="搜索消息..."
              prefix={<SearchOutlined />}
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              style={{ width: 180 }}
              allowClear
            />
          </Space>
        }
      >
        <Space.Compact style={{ width: '100%', marginBottom: 12 }}>
          <Input 
            placeholder="输入 Subject (支持通配符 * 和 >)" 
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            onPressEnter={handleSubscribe}
          />
          <Button 
            type="primary" 
            icon={<PlusOutlined />}
            onClick={handleSubscribe}
            disabled={!isConnected}
          >
            订阅
          </Button>
        </Space.Compact>

        {subscriptions.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <Select
              value={activeSubscriptionId}
              onChange={setActiveSubscriptionId}
              options={subscriptionOptions}
              style={{ width: '100%' }}
              placeholder="选择订阅主题"
              suffixIcon={null}
              className="subscription-select"
            />
          </div>
        )}
      </Card>

      {activeSubscription && (
        <Card 
          className="panel-card messages-card"
          size="small"
          title={
            <Space>
              <Text strong>{activeSubscription.subject}</Text>
              <Tag color={isPaused ? 'orange' : 'green'}>
                {isPaused ? '已暂停' : '接收中'}
              </Tag>
              <Tag>{activeSubscription.messageCount} 条消息</Tag>
            </Space>
          }
          extra={
            <Space>
              {!autoScroll && (
                <Button 
                  size="small"
                  onClick={() => {
                    setAutoScroll(true)
                    if (messageListRef.current) {
                      messageListRef.current.scrollTop = messageListRef.current.scrollHeight
                    }
                  }}
                >
                  跳转最新
                </Button>
              )}
              <Tooltip title={isPaused ? '继续接收' : '暂停接收'}>
                <Button 
                  type="text"
                  icon={isPaused ? <PlayCircleOutlined /> : <PauseCircleOutlined />}
                  onClick={() => togglePause(activeSubscriptionId!)}
                />
              </Tooltip>
              <Popconfirm
                title="确定清空所有消息？"
                onConfirm={() => clearMessages(activeSubscriptionId!)}
                okText="确定"
                cancelText="取消"
              >
                <Tooltip title="清空消息">
                  <Button type="text" icon={<ClearOutlined />} />
                </Tooltip>
              </Popconfirm>
              <Tooltip title="取消订阅">
                <Button 
                  type="text" 
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => handleUnsubscribe(activeSubscriptionId!)}
                />
              </Tooltip>
            </Space>
          }
        >
          <div 
            className="message-list" 
            ref={messageListRef}
            onScroll={handleScroll}
          >
            {activeMessages.length === 0 ? (
              <Empty 
                description="暂无消息" 
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                style={{ marginTop: 40 }}
              />
            ) : (
              <List
                dataSource={activeMessages}
                renderItem={(msg: NatsMessage) => {
                  const { display, truncated } = truncatePayload(msg.payload, msg.isJson)
                  return (
                    <List.Item className="message-item">
                      <div style={{ width: '100%', padding: '0 4px' }}>
                        <div className="message-header">
                          <Space>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              {formatTimestamp(msg.timestamp)}
                            </Text>
                            <Tag color="blue">{msg.subject}</Tag>
                            {msg.replyTo && (
                              <Tag color="purple">Reply: {msg.replyTo}</Tag>
                            )}
                          </Space>
                          <Space size={0}>
                            {truncated && (
                              <Tooltip title="查看详情">
                                <Button 
                                  type="text" 
                                  size="small"
                                  icon={<EyeOutlined />}
                                  onClick={() => handleViewDetail(msg)}
                                />
                              </Tooltip>
                            )}
                            <Tooltip title="复制">
                              <Button 
                                type="text" 
                                size="small"
                                icon={<CopyOutlined />}
                                onClick={() => handleCopyMessage(msg.payload)}
                              />
                            </Tooltip>
                          </Space>
                        </div>
                        <div 
                          className="message-payload"
                          style={{ 
                            marginBottom: 0, 
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-all',
                            padding: '8px 12px',
                            fontSize: 12,
                            fontFamily: "'Monaco', 'Menlo', 'Ubuntu Mono', monospace",
                            background: '#1a1a2e',
                            borderRadius: 4
                          }}
                        >
                          {display}
                        </div>
                      </div>
                    </List.Item>
                  )
                }}
              />
            )}
          </div>
        </Card>
      )}

      {subscriptions.length === 0 && (
        <Card className="panel-card" size="small">
          <Empty 
            description="暂无订阅，请添加订阅主题" 
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            style={{ padding: 40 }}
          />
        </Card>
      )}

      <Modal
        title="消息详情"
        open={detailModalVisible}
        onCancel={() => {
          setDetailModalVisible(false)
          setDetailMessage(null)
        }}
        footer={[
          <Button key="copy" onClick={() => {
            if (detailMessage) {
              handleCopyMessage(detailMessage.payload)
            }
          }}>
            复制内容
          </Button>,
          <Button key="close" onClick={() => {
            setDetailModalVisible(false)
            setDetailMessage(null)
          }}>
            关闭
          </Button>
        ]}
        width={700}
      >
        {detailMessage && (
          <div className="message-detail">
            <div className="message-detail-meta">
              <Space wrap>
                <Text type="secondary">时间: {formatTimestamp(detailMessage.timestamp)}</Text>
                <Tag color="blue">{detailMessage.subject}</Tag>
                {detailMessage.replyTo && (
                  <Tag color="purple">Reply: {detailMessage.replyTo}</Tag>
                )}
              </Space>
            </div>
            <div className="message-detail-content">
              <pre style={{ 
                margin: 0, 
                whiteSpace: 'pre-wrap', 
                wordBreak: 'break-all',
                maxHeight: 400,
                overflow: 'auto'
              }}>
                {detailMessage.isJson ? formatJson(detailMessage.payload) : detailMessage.payload}
              </pre>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default SubscriptionPanel
