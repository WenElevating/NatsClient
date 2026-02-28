import { useState, useRef, useCallback } from 'react'
import { Card, Form, Input, Button, message, Switch, InputNumber, Space, Tag, List, Popconfirm, Typography } from 'antd'
import { SendOutlined, ClockCircleOutlined, DeleteOutlined, CloseOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useConnectionStore } from '../stores'
import type { PublishOptions } from '../types/nats'

const { TextArea } = Input
const { Text } = Typography

interface ScheduledMessage {
  id: string
  subject: string
  payload: string
  headers?: Record<string, string>
  delaySeconds: number
  remainingSeconds: number
  createdAt: Date
}

const PublishPanel: React.FC = () => {
  const { t } = useTranslation()
  const [form] = Form.useForm()
  const { connectionState } = useConnectionStore()
  const [loading, setLoading] = useState(false)
  const [scheduledEnabled, setScheduledEnabled] = useState(false)
  const [delaySeconds, setDelaySeconds] = useState(10)
  const [scheduledMessages, setScheduledMessages] = useState<ScheduledMessage[]>([])
  const timersRef = useRef<Map<string, NodeJS.Timeout>>(new Map())

  const isConnected = connectionState.status === 'connected'

  const executePublish = useCallback(async (options: PublishOptions) => {
    const result = await window.nats.publish(options)
    if (result.success) {
      message.success(t('publish.publishSuccess'))
    } else {
      message.error(`${t('common.failed')}: ${result.error}`)
    }
    return result
  }, [t])

  const handlePublish = async () => {
    if (!isConnected) {
      message.error(t('publish.notConnected'))
      return
    }

    try {
      const values = await form.validateFields()
      const options: PublishOptions = {
        subject: values.subject,
        payload: values.payload,
        headers: values.headers ? JSON.parse(values.headers) : undefined
      }

      if (scheduledEnabled && delaySeconds > 0) {
        const scheduledId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        const scheduledMsg: ScheduledMessage = {
          id: scheduledId,
          subject: options.subject,
          payload: options.payload,
          headers: options.headers,
          delaySeconds,
          remainingSeconds: delaySeconds,
          createdAt: new Date()
        }
        
        setScheduledMessages(prev => [...prev, scheduledMsg])
        message.success(t('publish.scheduledSuccess', `消息已加入定时发布队列，将在 ${delaySeconds} 秒后发布`))
        form.resetFields(['payload', 'headers'])

        const timer = setTimeout(async () => {
          await executePublish(options)
          setScheduledMessages(prev => prev.filter(m => m.id !== scheduledId))
          timersRef.current.delete(scheduledId)
        }, delaySeconds * 1000)
        
        timersRef.current.set(scheduledId, timer)

        const countdownTimer = setInterval(() => {
          setScheduledMessages(prev => prev.map(m => {
            if (m.id === scheduledId) {
              const newRemaining = m.remainingSeconds - 1
              if (newRemaining <= 0) {
                clearInterval(countdownTimer)
              }
              return { ...m, remainingSeconds: Math.max(0, newRemaining) }
            }
            return m
          }))
        }, 1000)

        setTimeout(() => clearInterval(countdownTimer), delaySeconds * 1000)
      } else {
        setLoading(true)
        const result = await executePublish(options)
        setLoading(false)
        if (result.success) {
          form.resetFields(['payload', 'headers'])
        }
      }
    } catch (error) {
      setLoading(false)
      if (error instanceof Error) {
        message.error(`${t('common.failed')}: ${error.message}`)
      }
    }
  }

  const handleCancelScheduled = (id: string) => {
    const timer = timersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }
    setScheduledMessages(prev => prev.filter(m => m.id !== id))
    message.info(t('publish.scheduledCancelled', '定时发布已取消'))
  }

  const handleCancelAll = () => {
    timersRef.current.forEach(timer => clearTimeout(timer))
    timersRef.current.clear()
    setScheduledMessages([])
    message.info(t('publish.scheduledCancelled', '定时发布已取消'))
  }

  return (
    <Card 
      title={t('publish.title')} 
      className="panel-card"
      extra={
        scheduledMessages.length > 0 && (
          <Popconfirm
            title={t('publish.confirmCancelAll', '确定取消所有定时发布？')}
            onConfirm={handleCancelAll}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
          >
            <Button size="small" danger icon={<DeleteOutlined />}>
              {t('publish.cancelAll', '取消全部')}
            </Button>
          </Popconfirm>
        )
      }
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="subject"
          label={t('publish.subject')}
          rules={[{ required: true, message: t('publish.subjectRequired') }]}
        >
          <Input placeholder="orders.created, events.>" />
        </Form.Item>

        <Form.Item
          name="payload"
          label={t('publish.payload')}
          rules={[{ required: true, message: t('publish.payloadRequired') }]}
        >
          <TextArea rows={4} placeholder={t('publish.payloadPlaceholder', '输入 JSON 或文本消息')} />
        </Form.Item>

        <Form.Item
          name="headers"
          label={t('publish.headers')}
        >
          <TextArea rows={2} placeholder='{"key": "value"}' />
        </Form.Item>

        <Form.Item label={t('publish.scheduled', '定时发布')}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Space>
              <Switch 
                checked={scheduledEnabled} 
                onChange={setScheduledEnabled}
                checkedChildren={t('publish.on', '开')}
                unCheckedChildren={t('publish.off', '关')}
              />
              {scheduledEnabled && (
                <>
                  <InputNumber
                    min={1}
                    max={86400}
                    value={delaySeconds}
                    onChange={(v) => setDelaySeconds(v || 10)}
                    style={{ width: 100 }}
                  />
                  <span>{t('publish.seconds', '秒后发布')}</span>
                </>
              )}
            </Space>
          </Space>
        </Form.Item>

        <Form.Item>
          <Button 
            type="primary" 
            icon={scheduledEnabled ? <ClockCircleOutlined /> : <SendOutlined />}
            onClick={handlePublish}
            loading={loading}
            disabled={!isConnected}
          >
            {scheduledEnabled ? t('publish.schedulePublish', '定时发布') : t('publish.publish')}
          </Button>
        </Form.Item>
      </Form>

      {scheduledMessages.length > 0 && (
        <>
          <div style={{ marginTop: 16, marginBottom: 8 }}>
            <Tag color="blue">{t('publish.scheduledQueue', '定时发布队列')} ({scheduledMessages.length})</Tag>
          </div>
          <List
            size="small"
            dataSource={scheduledMessages}
            renderItem={(item) => (
              <List.Item
                actions={[
                  <Button 
                    key="cancel"
                    type="text" 
                    size="small"
                    danger
                    icon={<CloseOutlined />}
                    onClick={() => handleCancelScheduled(item.id)}
                  >
                    {t('common.cancel')}
                  </Button>
                ]}
              >
                <List.Item.Meta
                  title={
                    <Space>
                      <ClockCircleOutlined />
                      <span>{item.subject}</span>
                      <Tag color="orange">{item.remainingSeconds}s</Tag>
                    </Space>
                  }
                  description={
                    <Text ellipsis style={{ maxWidth: 300 }}>
                      {item.payload.substring(0, 50)}{item.payload.length > 50 ? '...' : ''}
                    </Text>
                  }
                />
              </List.Item>
            )}
          />
        </>
      )}
    </Card>
  )
}

export default PublishPanel
