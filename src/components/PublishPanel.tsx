import React, { useState, useCallback } from 'react'
import { Card, Form, Input, Button, InputNumber, Switch, Space, Statistic, Row, Col, message, Typography, Table, Tag, Popconfirm, Tooltip, Modal } from 'antd'
import { DeleteOutlined, PlayCircleOutlined, PauseCircleOutlined, PlusOutlined, EditOutlined } from '@ant-design/icons'
import { useConnectionStore, usePublishStore } from '../stores'
import type { PublishTask } from '../stores/publishStore'
import { formatBytes } from '../utils/format'

const { TextArea } = Input
const { Text } = Typography

const PublishPanel: React.FC = () => {
  const [form] = Form.useForm()
  const [editForm] = Form.useForm()
  const { connectionState } = useConnectionStore()
  const { tasks, addTask, updateTask, removeTask, startTask, stopTask, clearAllTasks, getTaskRate } = usePublishStore()
  
  const [repeatMode, setRepeatMode] = useState(false)
  const [intervalMs, setIntervalMs] = useState(1000)
  const [targetCount, setTargetCount] = useState<number | null>(null)
  const [editModalVisible, setEditModalVisible] = useState(false)
  const [editingTask, setEditingTask] = useState<PublishTask | null>(null)

  const isConnected = connectionState.status === 'connected'

  const handleAddTask = useCallback(async () => {
    if (!isConnected) {
      message.error('未连接到 NATS 服务器')
      return
    }

    try {
      const values = await form.validateFields()
      let headers: Record<string, string> | undefined
      if (values.headers) {
        try {
          headers = JSON.parse(values.headers)
        } catch {
          message.error('Headers 格式错误，请输入有效的 JSON')
          return
        }
      }

      const taskId = addTask({
        subject: values.subject,
        payload: values.payload,
        headers,
        interval: intervalMs,
        targetCount: repeatMode ? targetCount : null
      })

      if (repeatMode) {
        startTask(taskId)
        message.success('已添加定时发送任务')
      } else {
        startTask(taskId)
        setTimeout(() => stopTask(taskId), 100)
        message.success('消息已发送')
      }

      form.resetFields(['payload'])
    } catch (error) {
      if (error instanceof Error) {
        message.error(`操作失败: ${error.message}`)
      }
    }
  }, [isConnected, repeatMode, intervalMs, targetCount, addTask, startTask, stopTask, form])

  const handleStartTask = (id: string) => {
    startTask(id)
    message.success('任务已启动')
  }

  const handleStopTask = (id: string) => {
    stopTask(id)
    message.info('任务已暂停')
  }

  const handleRemoveTask = (id: string) => {
    removeTask(id)
    message.info('任务已删除')
  }

  const handleClearAll = () => {
    clearAllTasks()
    message.info('所有任务已清除')
  }

  const handleEditTask = (task: PublishTask) => {
    setEditingTask(task)
    editForm.setFieldsValue({
      subject: task.subject,
      payload: task.payload,
      headers: task.headers ? JSON.stringify(task.headers, null, 2) : '',
      interval: task.interval,
      targetCount: task.targetCount
    })
    setEditModalVisible(true)
  }

  const handleSaveEdit = async () => {
    if (!editingTask) return
    
    try {
      const values = await editForm.validateFields()
      let headers: Record<string, string> | undefined
      if (values.headers) {
        try {
          headers = JSON.parse(values.headers)
        } catch {
          message.error('Headers 格式错误，请输入有效的 JSON')
          return
        }
      }

      updateTask(editingTask.id, {
        subject: values.subject,
        payload: values.payload,
        headers,
        interval: values.interval,
        targetCount: values.targetCount || null
      })
      
      setEditModalVisible(false)
      setEditingTask(null)
      message.success('任务已更新')
    } catch (error) {
      if (error instanceof Error) {
        message.error(`更新失败: ${error.message}`)
      }
    }
  }

  const columns = [
    {
      title: 'Subject',
      dataIndex: 'subject',
      key: 'subject',
      width: 150,
      ellipsis: true,
      render: (text: string, record: PublishTask) => (
        <Tooltip title={text}>
          <Text style={{ color: record.isRunning ? '#52c41a' : '#fff' }}>{text}</Text>
        </Tooltip>
      )
    },
    {
      title: '状态',
      key: 'status',
      width: 80,
      render: (_: unknown, record: PublishTask) => (
        <Tag color={record.isRunning ? 'green' : 'default'}>
          {record.isRunning ? '运行中' : '已暂停'}
        </Tag>
      )
    },
    {
      title: '成功',
      dataIndex: 'successCount',
      key: 'successCount',
      width: 70,
      render: (count: number) => <Text style={{ color: '#52c41a' }}>{count}</Text>
    },
    {
      title: '失败',
      dataIndex: 'failCount',
      key: 'failCount',
      width: 70,
      render: (count: number) => <Text style={{ color: '#ff4d4f' }}>{count}</Text>
    },
    {
      title: '大小',
      dataIndex: 'totalBytes',
      key: 'totalBytes',
      width: 70,
      render: (bytes: number) => formatBytes(bytes)
    },
    {
      title: '速率',
      key: 'rate',
      width: 90,
      render: (_: unknown, record: PublishTask) => (
        <Text>{getTaskRate(record.id).toFixed(1)} msg/s</Text>
      )
    },
    {
      title: '操作',
      key: 'actions',
      width: 140,
      render: (_: unknown, record: PublishTask) => (
        <Space size={0}>
          {record.isRunning ? (
            <Tooltip title="暂停">
              <Button 
                type="text" 
                icon={<PauseCircleOutlined />}
                onClick={() => handleStopTask(record.id)}
              />
            </Tooltip>
          ) : (
            <Tooltip title="启动">
              <Button 
                type="text" 
                icon={<PlayCircleOutlined />}
                onClick={() => handleStartTask(record.id)}
              />
            </Tooltip>
          )}
          <Tooltip title="编辑">
            <Button 
              type="text" 
              icon={<EditOutlined />}
              onClick={() => handleEditTask(record)}
              disabled={record.isRunning}
            />
          </Tooltip>
          <Popconfirm
            title="确定删除此任务？"
            onConfirm={() => handleRemoveTask(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Tooltip title="删除">
              <Button type="text" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      )
    }
  ]

  const totalSuccess = tasks.reduce((sum, t) => sum + t.successCount, 0)
  const totalFail = tasks.reduce((sum, t) => sum + t.failCount, 0)
  const runningCount = tasks.filter(t => t.isRunning).length

  return (
    <div className="publish-panel">
      <Card 
        title="发布消息" 
        className="panel-card"
        extra={
          <Space>
            <Statistic 
              title="运行中" 
              value={runningCount} 
              valueStyle={{ color: '#52c41a', fontSize: 16 }}
            />
            <Statistic 
              title="总成功" 
              value={totalSuccess} 
              valueStyle={{ color: '#52c41a', fontSize: 16 }}
            />
            <Statistic 
              title="总失败" 
              value={totalFail} 
              valueStyle={{ color: '#ff4d4f', fontSize: 16 }}
            />
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="subject"
                label="Subject"
                rules={[{ required: true, message: '请输入 Subject' }]}
              >
                <Input placeholder="例如: my.subject" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="headers"
                label="Headers (JSON 格式)"
              >
                <TextArea rows={1} placeholder='{"key": "value"}' />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="payload"
            label="消息内容"
            rules={[{ required: true, message: '请输入消息内容' }]}
          >
            <TextArea rows={4} placeholder="输入 JSON 或文本消息" />
          </Form.Item>

          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col>
              <Space>
                <Text>定时发送</Text>
                <Switch 
                  checked={repeatMode} 
                  onChange={setRepeatMode}
                />
              </Space>
            </Col>
            
            {repeatMode && (
              <>
                <Col>
                  <Space>
                    <Text>间隔(ms):</Text>
                    <InputNumber 
                      min={100} 
                      value={intervalMs}
                      onChange={(v) => setIntervalMs(v || 1000)}
                    />
                  </Space>
                </Col>
                <Col>
                  <Space>
                    <Text>次数(可选):</Text>
                    <InputNumber 
                      min={1} 
                      value={targetCount}
                      onChange={(v) => setTargetCount(v)}
                      placeholder="不限"
                    />
                  </Space>
                </Col>
              </>
            )}
          </Row>

          <Form.Item>
            <Space>
              <Button 
                type="primary" 
                icon={<PlusOutlined />}
                onClick={handleAddTask}
                disabled={!isConnected}
              >
                {repeatMode ? '添加任务' : '发送'}
              </Button>
              {tasks.length > 0 && (
                <Popconfirm
                  title="确定清除所有任务？"
                  onConfirm={handleClearAll}
                  okText="确定"
                  cancelText="取消"
                >
                  <Button danger icon={<DeleteOutlined />}>
                    清除全部
                  </Button>
                </Popconfirm>
              )}
            </Space>
          </Form.Item>
        </Form>
      </Card>

      {tasks.length > 0 && (
        <Card 
          title="发送任务列表" 
          className="panel-card"
          style={{ marginTop: 16 }}
        >
          <Table 
            dataSource={tasks} 
            columns={columns}
            rowKey="id"
            pagination={false}
            size="small"
          />
        </Card>
      )}

      <Modal
        title="编辑任务"
        open={editModalVisible}
        onCancel={() => {
          setEditModalVisible(false)
          setEditingTask(null)
        }}
        onOk={handleSaveEdit}
        okText="保存"
        cancelText="取消"
        width={600}
      >
        <Form form={editForm} layout="vertical">
          <Form.Item
            name="subject"
            label="Subject"
            rules={[{ required: true, message: '请输入 Subject' }]}
          >
            <Input placeholder="例如: my.subject" />
          </Form.Item>

          <Form.Item
            name="payload"
            label="消息内容"
            rules={[{ required: true, message: '请输入消息内容' }]}
          >
            <TextArea rows={4} placeholder="输入 JSON 或文本消息" />
          </Form.Item>

          <Form.Item
            name="headers"
            label="Headers (JSON 格式)"
          >
            <TextArea rows={2} placeholder='{"key": "value"}' />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="interval"
                label="发送间隔 (ms)"
                rules={[{ required: true, message: '请输入发送间隔' }]}
              >
                <InputNumber min={100} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="targetCount"
                label="发送次数 (可选)"
              >
                <InputNumber min={1} placeholder="不限" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  )
}

export default PublishPanel
