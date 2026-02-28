import { useState, useRef, useCallback } from 'react'
import { Card, Form, Input, Button, message, InputNumber, Space, Tag, List, Typography, Popconfirm } from 'antd'
import { SendOutlined, ClockCircleOutlined, DeleteOutlined, PlayCircleOutlined, PauseCircleOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useConnectionStore } from '../stores'
import type { PublishOptions } from '../types/nats'

const { TextArea } = Input
const { Text } = Typography

interface ScheduledTask {
  id: string
  subject: string
  payload: string
  headers?: Record<string, string>
  intervalSeconds: number
  count: number
  isRunning: boolean
  createdAt: Date
}

const PublishPanel: React.FC = () => {
  const { t } = useTranslation()
  const [form] = Form.useForm()
  const { connectionState } = useConnectionStore()
  const [loading, setLoading] = useState(false)
  const [intervalSeconds, setIntervalSeconds] = useState(1)
  const [scheduledTasks, setScheduledTasks] = useState<ScheduledTask[]>([])
  const timersRef = useRef<Map<string, NodeJS.Timeout>>(new Map())

  const isConnected = connectionState.status === 'connected'

  const executePublish = useCallback(async (options: PublishOptions) => {
    const result = await window.nats.publish(options)
    return result
  }, [])

  const handlePublish = async (scheduled: boolean = false) => {
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

      if (scheduled && intervalSeconds > 0) {
        const taskId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        const task: ScheduledTask = {
          id: taskId,
          subject: options.subject,
          payload: options.payload,
          headers: options.headers,
          intervalSeconds,
          count: 0,
          isRunning: true,
          createdAt: new Date()
        }
        
        setScheduledTasks(prev => [...prev, task])
        message.success(t('publish.taskStarted', '定时发布任务已启动'))
        form.resetFields(['payload', 'headers'])

        const timer = setInterval(async () => {
          await executePublish(options)
          setScheduledTasks(prev => prev.map(t => {
            if (t.id === taskId) {
              return { ...t, count: t.count + 1 }
            }
            return t
          }))
        }, intervalSeconds * 1000)
        
        timersRef.current.set(taskId, timer)
      } else {
        setLoading(true)
        const result = await executePublish(options)
        setLoading(false)
        if (result.success) {
          message.success(t('publish.publishSuccess'))
          form.resetFields(['payload', 'headers'])
        } else {
          message.error(`${t('common.failed')}: ${result.error}`)
        }
      }
    } catch (error) {
      setLoading(false)
      if (error instanceof Error) {
        message.error(`${t('common.failed')}: ${error.message}`)
      }
    }
  }

  const handleToggleTask = (id: string) => {
    const task = scheduledTasks.find(t => t.id === id)
    if (!task) return

    if (task.isRunning) {
      const timer = timersRef.current.get(id)
      if (timer) {
        clearInterval(timer)
        timersRef.current.delete(id)
      }
      setScheduledTasks(prev => prev.map(t => {
        if (t.id === id) {
          return { ...t, isRunning: false }
        }
        return t
      }))
      message.info(t('publish.taskPaused', '任务已暂停'))
    } else {
      const options: PublishOptions = {
        subject: task.subject,
        payload: task.payload,
        headers: task.headers
      }
      
      const timer = setInterval(async () => {
        await executePublish(options)
        setScheduledTasks(prev => prev.map(t => {
          if (t.id === id) {
            return { ...t, count: t.count + 1 }
          }
          return t
        }))
      }, task.intervalSeconds * 1000)
      
      timersRef.current.set(id, timer)
      setScheduledTasks(prev => prev.map(t => {
        if (t.id === id) {
          return { ...t, isRunning: true }
        }
        return t
      }))
      message.success(t('publish.taskResumed', '任务已恢复'))
    }
  }

  const handleDeleteTask = (id: string) => {
    const timer = timersRef.current.get(id)
    if (timer) {
      clearInterval(timer)
      timersRef.current.delete(id)
    }
    setScheduledTasks(prev => prev.filter(t => t.id !== id))
    message.info(t('publish.taskDeleted', '任务已删除'))
  }

  const handleStopAll = () => {
    timersRef.current.forEach(timer => clearInterval(timer))
    timersRef.current.clear()
    setScheduledTasks(prev => prev.map(t => ({ ...t, isRunning: false })))
    message.info(t('publish.allTasksStopped', '所有任务已停止'))
  }

  return (
    <>
      <Card title={t('publish.title')} className="panel-card">
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

          <Form.Item>
            <Space>
              <Button 
                type="primary" 
                icon={<SendOutlined />}
                onClick={() => handlePublish(false)}
                loading={loading}
                disabled={!isConnected}
              >
                {t('publish.publish')}
              </Button>
              <Button 
                icon={<ClockCircleOutlined />}
                onClick={() => handlePublish(true)}
                disabled={!isConnected}
              >
                {t('publish.scheduled', '定时发布')}
              </Button>
              <span>{t('publish.every', '每隔')}</span>
              <InputNumber
                min={1}
                max={86400}
                value={intervalSeconds}
                onChange={(v) => setIntervalSeconds(v || 1)}
                style={{ width: 80 }}
              />
              <span>{t('publish.seconds', '秒')}</span>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      {scheduledTasks.length > 0 && (
        <Card 
          className="panel-card" 
          style={{ marginTop: 16 }}
          title={
            <Space>
              <ClockCircleOutlined />
              <span>{t('publish.taskList', '定时任务列表')}</span>
              <Tag color="blue">{scheduledTasks.length}</Tag>
            </Space>
          }
          extra={
            scheduledTasks.some(t => t.isRunning) && (
              <Popconfirm
                title={t('publish.confirmStopAll', '确定停止所有定时任务？')}
                onConfirm={handleStopAll}
                okText={t('common.confirm')}
                cancelText={t('common.cancel')}
              >
                <Button size="small" danger icon={<PauseCircleOutlined />}>
                  {t('publish.stopAll', '停止全部')}
                </Button>
              </Popconfirm>
            )
          }
        >
          <List
            size="small"
            dataSource={scheduledTasks}
            renderItem={(item) => (
              <List.Item
                actions={[
                  <Button 
                    key="toggle"
                    type="text" 
                    size="small"
                    icon={item.isRunning ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                    onClick={() => handleToggleTask(item.id)}
                    style={{ color: item.isRunning ? undefined : '#52c41a' }}
                  >
                    {item.isRunning ? t('publish.pause', '暂停') : t('publish.resume', '恢复')}
                  </Button>,
                  <Popconfirm
                    key="delete"
                    title={t('publish.confirmDelete', '确定删除此任务？')}
                    onConfirm={() => handleDeleteTask(item.id)}
                    okText={t('common.confirm')}
                    cancelText={t('common.cancel')}
                  >
                    <Button 
                      type="text" 
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                    >
                      {t('common.delete')}
                    </Button>
                  </Popconfirm>
                ]}
              >
                <List.Item.Meta
                  title={
                    <Space>
                      <ClockCircleOutlined style={{ color: item.isRunning ? '#52c41a' : '#999' }} />
                      <span>{item.subject}</span>
                      <Tag color={item.isRunning ? 'green' : 'default'}>
                        {t('publish.every', '每隔')}{item.intervalSeconds}s
                      </Tag>
                      <Tag color="blue">{t('publish.sent', '已发送')}: {item.count}</Tag>
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
        </Card>
      )}
    </>
  )
}

export default PublishPanel
