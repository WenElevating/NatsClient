import { useState } from 'react'
import { Card, Form, Input, Button, Space, Typography, message } from 'antd'
import { SendOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useConnectionStore } from '../stores'
import type { PublishOptions } from '../types/nats'

const { TextArea } = Input
const { Text } = Typography

const PublishPanel: React.FC = () => {
  const { t } = useTranslation()
  const [form] = Form.useForm()
  const { connectionState } = useConnectionStore()
  const [loading, setLoading] = useState(false)

  const isConnected = connectionState.status === 'connected'

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

      setLoading(true)
      const result = await window.nats.publish(options)
      setLoading(false)
      
      if (result.success) {
        message.success(t('publish.publishSuccess'))
        form.resetFields(['payload', 'headers'])
      } else {
        message.error(`${t('common.failed')}: ${result.error}`)
      }
    } catch (error) {
      setLoading(false)
      if (error instanceof Error) {
        message.error(`${t('common.failed')}: ${error.message}`)
      }
    }
  }

  return (
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
          <Button 
            type="primary" 
            icon={<SendOutlined />}
            onClick={handlePublish}
            loading={loading}
            disabled={!isConnected}
          >
            {t('publish.publish')}
          </Button>
        </Form.Item>
      </Form>
    </Card>
  )
}

export default PublishPanel
