import React, { useState, useEffect } from 'react'
import { Card, Form, Input, Button, Space, Typography, message, Divider, Statistic, Tabs, Tag, Table, Popconfirm, Tooltip, Modal } from 'antd'
import { SendOutlined, CopyOutlined, PlayCircleOutlined, StopOutlined, EditOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useConnectionStore, useSettingsStore } from '../stores'
import type { RequestOptions, RequestResult } from '../types/nats'
import { formatJson } from '../utils/format'

const { TextArea } = Input
const { Text, Paragraph } = Typography

interface ReplyService {
  id: string
  subject: string
  responsePayload: string
  replyCount: number
  isRunning: boolean
}

const RequestPanel: React.FC = () => {
  const { t } = useTranslation()
  const [requestForm] = Form.useForm()
  const [replyForm] = Form.useForm()
  const [editForm] = Form.useForm()
  const { connectionState } = useConnectionStore()
  const { defaultTimeout } = useSettingsStore()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<RequestResult | null>(null)
  const [replyServices, setReplyServices] = useState<ReplyService[]>([])
  const [editModalVisible, setEditModalVisible] = useState(false)
  const [editingService, setEditingService] = useState<ReplyService | null>(null)

  const isConnected = connectionState.status === 'connected'

  useEffect(() => {
    const unsubscribeSent = window.nats.onReplySent((data) => {
      setReplyServices(prev => prev.map(s => 
        s.id === data.id ? { ...s, replyCount: s.replyCount + 1 } : s
      ))
    })

    const unsubscribeError = window.nats.onReplyError((data) => {
      message.error(`${t('request.replyServiceError', '回复服务错误')}: ${data.error}`)
    })

    return () => {
      unsubscribeSent()
      unsubscribeError()
    }
  }, [])

  const handleRequest = async () => {
    if (!isConnected) {
      message.error(t('request.notConnected', '未连接到 NATS 服务器'))
      return
    }

    try {
      const values = await requestForm.validateFields()
      const options: RequestOptions = {
        subject: values.subject,
        payload: values.payload,
        timeout: values.timeout || 5000,
        headers: values.headers ? JSON.parse(values.headers) : undefined
      }

      setLoading(true)
      const response = await window.nats.request(options)
      setResult(response)
      
      if (response.success) {
        message.success(t('request.requestSuccessTime', `请求成功 (${response.responseTime}ms)`))
      } else {
        message.error(`${t('request.requestFailed')}: ${response.error}`)
      }
    } catch (error) {
      if (error instanceof Error) {
        message.error(`${t('request.requestFailed')}: ${error.message}`)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleCopyResponse = () => {
    if (result?.response) {
      navigator.clipboard.writeText(result.response)
      message.success(t('common.copied'))
    }
  }

  const handleStartReplyService = async () => {
    if (!isConnected) {
      message.error(t('request.notConnected', '未连接到 NATS 服务器'))
      return
    }

    try {
      const values = await replyForm.validateFields()
      const response = await window.nats.startReplyService(values.subject, values.responsePayload)
      
      if (response.success && response.id) {
        const service: ReplyService = {
          id: response.id,
          subject: values.subject,
          responsePayload: values.responsePayload,
          replyCount: 0,
          isRunning: true
        }
        setReplyServices(prev => [...prev, service])
        message.success(t('request.serviceStarted', '回复服务已启动'))
        replyForm.resetFields()
      } else {
        message.error(`${t('request.startFailed', '启动失败')}: ${response.error}`)
      }
    } catch (error) {
      if (error instanceof Error) {
        message.error(`${t('request.startFailed', '启动失败')}: ${error.message}`)
      }
    }
  }

  const handleStopReplyService = async (id: string) => {
    const response = await window.nats.stopReplyService(id)
    if (response.success) {
      setReplyServices(prev => prev.filter(s => s.id !== id))
      message.success(t('request.serviceStopped', '回复服务已停止'))
    } else {
      message.error(`${t('request.stopFailed', '停止失败')}: ${response.error}`)
    }
  }

  const handleEditService = (service: ReplyService) => {
    setEditingService(service)
    editForm.setFieldsValue({
      responsePayload: service.responsePayload
    })
    setEditModalVisible(true)
  }

  const handleSaveEdit = async () => {
    if (!editingService) return
    
    try {
      const values = await editForm.validateFields()
      const response = await window.nats.updateReplyPayload(editingService.id, values.responsePayload)
      
      if (response.success) {
        setReplyServices(prev => prev.map(s => 
          s.id === editingService.id 
            ? { ...s, responsePayload: values.responsePayload }
            : s
        ))
        setEditModalVisible(false)
        setEditingService(null)
        message.success(t('request.responseUpdated', '响应内容已更新'))
      } else {
        message.error(`${t('request.updateFailed', '更新失败')}: ${response.error}`)
      }
    } catch (error) {
      if (error instanceof Error) {
        message.error(`${t('request.updateFailed', '更新失败')}: ${error.message}`)
      }
    }
  }

  const isJsonResponse = (str: string): boolean => {
    try {
      JSON.parse(str)
      return true
    } catch {
      return false
    }
  }

  const replyColumns = [
    {
      title: t('request.subject'),
      dataIndex: 'subject',
      key: 'subject',
      width: 150,
      ellipsis: true
    },
    {
      title: t('request.status'),
      key: 'status',
      width: 80,
      render: (_: unknown, record: ReplyService) => (
        <Tag color={record.isRunning ? 'green' : 'default'}>
          {record.isRunning ? t('request.running') : t('request.stopped')}
        </Tag>
      )
    },
    {
      title: t('request.replyCount'),
      dataIndex: 'replyCount',
      key: 'replyCount',
      width: 80
    },
    {
      title: t('common.edit'),
      key: 'actions',
      width: 120,
      render: (_: unknown, record: ReplyService) => (
        <Space size={0}>
          <Tooltip title={t('request.editResponse')}>
            <Button 
              type="text" 
              icon={<EditOutlined />}
              onClick={() => handleEditService(record)}
            />
          </Tooltip>
          <Popconfirm
            title={t('request.confirmStop', '确定停止此回复服务？')}
            onConfirm={() => handleStopReplyService(record.id)}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
          >
            <Tooltip title={t('request.stopService')}>
              <Button type="text" danger icon={<StopOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      )
    }
  ]

  const tabItems = [
    {
      key: 'request',
      label: t('request.sendRequest'),
      children: (
        <>
          <Form form={requestForm} layout="vertical">
            <Form.Item
              name="subject"
              label={t('request.subject')}
              rules={[{ required: true, message: t('request.subjectRequired', '请输入主题') }]}
            >
              <Input placeholder={t('request.subjectPlaceholder', '例如: service.request')} />
            </Form.Item>

            <Form.Item
              name="payload"
              label={t('request.payload')}
              rules={[{ required: true, message: t('request.payloadRequired', '请输入请求内容') }]}
            >
              <TextArea rows={4} placeholder={t('request.payloadPlaceholder', '输入 JSON 或文本请求')} />
            </Form.Item>

            <Form.Item
              name="headers"
              label={t('request.headers')}
            >
              <TextArea rows={2} placeholder='{"key": "value"}' />
            </Form.Item>

            <Form.Item
              name="timeout"
              label={t('request.timeout')}
              initialValue={defaultTimeout}
            >
              <Input type="number" min={100} max={60000} />
            </Form.Item>

            <Form.Item>
              <Button 
                type="primary" 
                icon={<SendOutlined />}
                onClick={handleRequest}
                loading={loading}
                disabled={!isConnected}
              >
                {t('request.send')}
              </Button>
            </Form.Item>
          </Form>

          {result && (
            <>
              <Divider />
              <div className="response-section">
                <div className="response-header">
                  <Text strong>{t('request.response')}</Text>
                  {result.success && (
                    <Button 
                      type="text" 
                      size="small"
                      icon={<CopyOutlined />}
                      onClick={handleCopyResponse}
                    >
                      {t('common.copy')}
                    </Button>
                  )}
                </div>
                
                {result.success ? (
                  <div className="response-content">
                    <Paragraph
                      style={{
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all',
                        backgroundColor: 'var(--color-bg-container)',
                        padding: 12,
                        borderRadius: 4,
                        marginTop: 8
                      }}
                    >
                      {isJsonResponse(result.response || '') 
                        ? formatJson(result.response || '') 
                        : result.response}
                    </Paragraph>
                  </div>
                ) : (
                  <Paragraph type="danger">
                    {result.error}
                  </Paragraph>
                )}
              </div>
            </>
          )}
        </>
      )
    },
    {
      key: 'reply',
      label: `${t('request.replyService')} ${replyServices.length > 0 ? `(${replyServices.length})` : ''}`,
      children: (
        <>
          <Form form={replyForm} layout="vertical">
            <Form.Item
              name="subject"
              label={t('request.listenSubject')}
              rules={[{ required: true, message: t('request.listenSubjectRequired', '请输入要监听的 Subject') }]}
            >
              <Input placeholder={t('request.subjectPlaceholder', '例如: service.request')} />
            </Form.Item>

            <Form.Item
              name="responsePayload"
              label={t('request.responseContent')}
              rules={[{ required: true, message: t('request.responseRequired', '请输入响应内容') }]}
            >
              <TextArea rows={4} placeholder={t('request.responsePlaceholder', '输入 JSON 或文本响应')} />
            </Form.Item>

            <Form.Item>
              <Button 
                type="primary" 
                icon={<PlayCircleOutlined />}
                onClick={handleStartReplyService}
                disabled={!isConnected}
              >
                {t('request.startService')}
              </Button>
            </Form.Item>
          </Form>

          {replyServices.length > 0 && (
            <>
              <Divider />
              <Text strong>{t('request.runningServices')}</Text>
              <Table 
                dataSource={replyServices} 
                columns={replyColumns}
                rowKey="id"
                pagination={false}
                size="small"
                style={{ marginTop: 12 }}
              />
            </>
          )}
        </>
      )
    }
  ]

  return (
    <>
      <Card 
        title={t('request.title')} 
        className="panel-card"
        extra={
          result && (
            <Space>
              <Statistic 
                title={t('request.responseTime')} 
                value={result.responseTime} 
                suffix="ms"
                valueStyle={{ fontSize: 16 }}
              />
            </Space>
          )
        }
      >
        <Tabs items={tabItems} />
      </Card>

      <Modal
        title={t('request.editResponse')}
        open={editModalVisible}
        onCancel={() => {
          setEditModalVisible(false)
          setEditingService(null)
        }}
        onOk={handleSaveEdit}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        width={500}
      >
        {editingService && (
          <Form form={editForm} layout="vertical">
            <Form.Item label={t('request.subject')}>
              <Input value={editingService.subject} disabled />
            </Form.Item>
            <Form.Item
              name="responsePayload"
              label={t('request.responseContent')}
              rules={[{ required: true, message: t('request.responseRequired', '请输入响应内容') }]}
            >
              <TextArea rows={6} placeholder={t('request.responsePlaceholder', '输入 JSON 或文本响应')} />
            </Form.Item>
          </Form>
        )}
      </Modal>
    </>
  )
}

export default RequestPanel
