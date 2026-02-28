import React, { useState, useCallback, useEffect, useRef, useMemo, memo } from 'react'
import { Card, Input, Button, Space, Tag, Typography, Empty, Select, message, Popconfirm, Tooltip, Modal } from 'antd'
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
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'
import { useConnectionStore, useSubscriptionStore, useSettingsStore } from '../stores'
import type { Subscription, NatsMessage } from '../types/nats'
import { formatTimestamp, formatJson } from '../utils/format'

const { Text } = Typography

const VISIBLE_COUNT = 50

interface MessageRowProps {
  msg: NatsMessage
  messageDisplayLength: number
  onViewDetail: (msg: NatsMessage) => void
  onCopy: (payload: string) => void
}

const MessageRow = memo(({ msg, messageDisplayLength, onViewDetail, onCopy }: MessageRowProps) => {
  const display = useMemo(() => {
    const formatted = msg.isJson ? formatJson(msg.payload) : msg.payload
    if (formatted.length <= messageDisplayLength) {
      return formatted
    }
    return formatted.substring(0, messageDisplayLength) + '...'
  }, [msg.payload, msg.isJson, messageDisplayLength])

  const truncated = msg.payload.length > messageDisplayLength

  return (
    <div 
      className="message-item"
      style={{ 
        padding: '8px 4px',
        borderBottom: '1px solid var(--color-border)'
      }}
    >
      <div className="message-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <Space size={4}>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {formatTimestamp(msg.timestamp)}
          </Text>
          <Tag color="blue" style={{ fontSize: 11, padding: '0 4px', margin: 0 }}>{msg.subject}</Tag>
        </Space>
        <Space size={0}>
          {truncated && (
            <Button 
              type="text" 
              size="small"
              icon={<EyeOutlined style={{ fontSize: 12 }} />}
              onClick={() => onViewDetail(msg)}
              style={{ padding: '0 4px' }}
            />
          )}
          <Button 
            type="text" 
            size="small"
            icon={<CopyOutlined style={{ fontSize: 12 }} />}
            onClick={() => onCopy(msg.payload)}
            style={{ padding: '0 4px' }}
          />
        </Space>
      </div>
      <div 
        style={{ 
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          padding: '4px 8px',
          fontSize: 11,
          fontFamily: "'Monaco', 'Menlo', 'Ubuntu Mono', monospace",
          background: 'var(--color-bg-container)',
          borderRadius: 4
        }}
      >
        {display}
      </div>
    </div>
  )
})

interface MessageListProps {
  subscriptionId: string
  searchFilter: string
  messageDisplayLength: number
  autoScroll: boolean
  onAutoScrollChange: (autoScroll: boolean) => void
  onViewDetail: (msg: NatsMessage) => void
  onCopy: (payload: string) => void
}

const MessageList = memo(({ 
  subscriptionId, 
  searchFilter, 
  messageDisplayLength, 
  autoScroll,
  onAutoScrollChange,
  onViewDetail,
  onCopy
}: MessageListProps) => {
  const listRef = useRef<HTMLDivElement>(null)
  const prevCountRef = useRef(0)
  
  const messages = useSubscriptionStore(useShallow(state => {
    const msgs = state.messages.get(subscriptionId) || []
    if (!searchFilter) return msgs.slice(-VISIBLE_COUNT)
    const lowerFilter = searchFilter.toLowerCase()
    return msgs.filter(m => 
      m.subject.toLowerCase().includes(lowerFilter) ||
      m.payload.toLowerCase().includes(lowerFilter)
    ).slice(-VISIBLE_COUNT)
  }))

  useEffect(() => {
    if (autoScroll && listRef.current && messages.length > 0 && messages.length !== prevCountRef.current) {
      prevCountRef.current = messages.length
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages.length, autoScroll])

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement
    const isAtBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 100
    onAutoScrollChange(isAtBottom)
  }, [onAutoScrollChange])

  return (
    <div 
      className="message-list" 
      ref={listRef}
      onScroll={handleScroll}
    >
      {messages.length === 0 ? (
        <Empty 
          description="暂无消息" 
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          style={{ marginTop: 40 }}
        />
      ) : (
        messages.map((msg) => (
          <MessageRow 
            key={msg.id}
            msg={msg}
            messageDisplayLength={messageDisplayLength}
            onViewDetail={onViewDetail}
            onCopy={onCopy}
          />
        ))
      )}
    </div>
  )
})

const SubscriptionPanel: React.FC = () => {
  const { t } = useTranslation()
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
    savedSubjects,
    saveSubject,
    removeSavedSubject
  } = useSubscriptionStore()
  const { messageDisplayLength } = useSettingsStore()

  const [activeSubscriptionId, setActiveSubscriptionId] = useState<string | null>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [detailModalVisible, setDetailModalVisible] = useState(false)
  const [detailMessage, setDetailMessage] = useState<NatsMessage | null>(null)

  const isConnected = connectionState.status === 'connected'

  useEffect(() => {
    const loadSubscriptions = async () => {
      const result = await window.nats.getSubscriptions()
      if (result) {
        result.forEach((sub: Subscription) => {
          if (!subscriptions.find(s => s.id === sub.id)) {
            addSubscription(sub)
          }
        })
      }
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
        message.success(t('subscribe.autoRestore', `已自动恢复 ${savedSubjects.length} 个订阅`))
      }
    }
    resubscribe()
  }, [isConnected, savedSubjects, subscriptions.length, addSubscription, t])

  const handleSubscribe = useCallback(async () => {
    if (!subject.trim()) {
      message.error(t('subscribe.subjectRequired'))
      return
    }

    if (!isConnected) {
      message.error(t('subscribe.notConnected', '未连接到 NATS 服务器'))
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
      message.success(t('subscribe.subscribeSuccess'))
    } else {
      message.error(`${t('subscribe.subscribeFailed')}: ${result.error}`)
    }
  }, [subject, isConnected, addSubscription, saveSubject, t])

  const handleUnsubscribe = useCallback(async (id: string) => {
    const sub = subscriptions.find(s => s.id === id)
    const result = await window.nats.unsubscribe(id)
    if (result.success) {
      removeSubscription(id)
      if (sub) {
        removeSavedSubject(sub.subject)
      }
      if (activeSubscriptionId === id) {
        setActiveSubscriptionId(subscriptions.length > 1 ? subscriptions.find(s => s.id !== id)?.id || null : null)
      }
      message.success(t('subscribe.unsubscribeSuccess', '已取消订阅'))
    } else {
      message.error(`${t('subscribe.unsubscribeFailed', '取消订阅失败')}: ${result.error}`)
    }
  }, [activeSubscriptionId, removeSubscription, removeSavedSubject, subscriptions, t])

  const handleCopyMessage = (payload: string) => {
    navigator.clipboard.writeText(payload)
    message.success(t('common.copied'))
  }

  const handleViewDetail = (msg: NatsMessage) => {
    setDetailMessage(msg)
    setDetailModalVisible(true)
  }

  const handleScrollStateChange = useCallback((isAtBottom: boolean) => {
    setAutoScroll(isAtBottom)
  }, [])
  
  const activeSubscription = subscriptions.find(s => s.id === activeSubscriptionId)
  const isPaused = activeSubscriptionId ? pausedSubscriptions.has(activeSubscriptionId) : false

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
        title={t('subscribe.title')} 
        className="panel-card subscription-card"
        size="small"
        extra={
          <Space>
            <Input
              placeholder={t('subscribe.search')}
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
            placeholder={t('subscribe.subjectPlaceholder', '输入 Subject (支持通配符 * 和 >)')} 
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
            {t('subscribe.subscribe')}
          </Button>
        </Space.Compact>

        {subscriptions.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <Select
              value={activeSubscriptionId}
              onChange={setActiveSubscriptionId}
              options={subscriptionOptions}
              style={{ width: '100%' }}
              placeholder={t('subscribe.selectSubscription', '选择订阅主题')}
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
                {isPaused ? t('subscribe.paused', '已暂停') : t('subscribe.receiving', '接收中')}
              </Tag>
              <Tag>{activeSubscription.messageCount} {t('subscribe.messagesCount', '条消息')}</Tag>
            </Space>
          }
          extra={
            <Space>
              {!autoScroll && (
                <Button 
                  size="small"
                  onClick={() => setAutoScroll(true)}
                >
                  {t('subscribe.scrollToLatest', '跳转最新')}
                </Button>
              )}
              <Tooltip title={isPaused ? t('subscribe.resume') : t('subscribe.pause')}>
                <Button 
                  type="text"
                  icon={isPaused ? <PlayCircleOutlined /> : <PauseCircleOutlined />}
                  onClick={() => togglePause(activeSubscriptionId!)}
                />
              </Tooltip>
              <Popconfirm
                title={t('subscribe.confirmClear', '确定清空所有消息？')}
                onConfirm={() => clearMessages(activeSubscriptionId!)}
                okText={t('common.confirm')}
                cancelText={t('common.cancel')}
              >
                <Tooltip title={t('subscribe.clear')}>
                  <Button type="text" icon={<ClearOutlined />} />
                </Tooltip>
              </Popconfirm>
              <Tooltip title={t('subscribe.unsubscribe')}>
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
          <MessageList 
            subscriptionId={activeSubscriptionId!}
            searchFilter={searchFilter}
            messageDisplayLength={messageDisplayLength}
            autoScroll={autoScroll}
            onAutoScrollChange={handleScrollStateChange}
            onViewDetail={handleViewDetail}
            onCopy={handleCopyMessage}
          />
        </Card>
      )}

      {subscriptions.length === 0 && (
        <Card className="panel-card" size="small">
          <Empty 
            description={t('subscribe.noSubscriptions')} 
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            style={{ padding: 40 }}
          />
        </Card>
      )}

      <Modal
        title={t('subscribe.messageDetail', '消息详情')}
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
            {t('subscribe.copyContent', '复制内容')}
          </Button>,
          <Button key="close" onClick={() => {
            setDetailModalVisible(false)
            setDetailMessage(null)
          }}>
            {t('common.close')}
          </Button>
        ]}
        width={700}
      >
        {detailMessage && (
          <div className="message-detail">
            <div className="message-detail-meta">
              <Space wrap>
                <Text type="secondary">{t('subscribe.timestamp', '时间')}: {formatTimestamp(detailMessage.timestamp)}</Text>
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
