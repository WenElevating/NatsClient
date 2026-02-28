import { useEffect } from 'react'
import { Modal, Form, Input, InputNumber, Switch } from 'antd'
import { useTranslation } from 'react-i18next'
import type { ConnectionConfig } from '../types/nats'
import { useConnectionStore, useSettingsStore } from '../stores'

interface ConnectionFormProps {
  visible: boolean
  connection: ConnectionConfig | null
  onClose: () => void
}

const ConnectionForm: React.FC<ConnectionFormProps> = ({ visible, connection, onClose }) => {
  const [form] = Form.useForm()
  const { addConnection } = useConnectionStore()
  const { defaultServer, defaultPort } = useSettingsStore()
  const { t } = useTranslation()

  useEffect(() => {
    if (visible) {
      if (connection) {
        form.setFieldsValue(connection)
      } else {
        form.resetFields()
        form.setFieldsValue({
          servers: defaultServer,
          port: defaultPort,
          tls: false,
          autoReconnect: true,
          maxReconnectAttempts: 10,
          reconnectTimeWait: 2000
        })
      }
    }
  }, [visible, connection, form, defaultServer, defaultPort])

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      const config: ConnectionConfig = {
        id: connection?.id || `conn-${Date.now()}`,
        ...values
      }
      await addConnection(config)
      onClose()
    } catch (error) {
      console.error('Form validation failed:', error)
    }
  }

  return (
    <Modal
      title={connection ? t('connection.editConnection') : t('connection.newConnection')}
      open={visible}
      onCancel={onClose}
      onOk={handleSubmit}
      okText={t('connection.save')}
      cancelText={t('connection.cancel')}
      width={500}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        name="connection-form"
      >
        <Form.Item
          name="name"
          label={t('connection.connectionName')}
          rules={[{ required: true, message: t('connection.connectionName') }]}
        >
          <Input placeholder={t('connection.exampleName')} />
        </Form.Item>

        <Form.Item
          name="servers"
          label={t('connection.server')}
          rules={[{ required: true, message: t('connection.server') }]}
        >
          <Input placeholder={t('connection.exampleServer')} />
        </Form.Item>

        <Form.Item
          name="port"
          label={t('connection.port')}
          rules={[{ required: true, message: t('connection.port') }]}
        >
          <InputNumber min={1} max={65535} style={{ width: '100%' }} />
        </Form.Item>

        <Form.Item
          name="username"
          label={t('connection.username')}
        >
          <Input placeholder={t('connection.optional')} />
        </Form.Item>

        <Form.Item
          name="password"
          label={t('connection.password')}
        >
          <Input.Password placeholder={t('connection.optional')} />
        </Form.Item>

        <Form.Item
          name="token"
          label={t('connection.token')}
        >
          <Input.Password placeholder={t('connection.optional')} />
        </Form.Item>

        <Form.Item
          name="tls"
          label={t('connection.enableTls')}
          valuePropName="checked"
        >
          <Switch />
        </Form.Item>

        <Form.Item
          name="autoReconnect"
          label={t('connection.autoReconnect')}
          valuePropName="checked"
        >
          <Switch />
        </Form.Item>

        <Form.Item
          noStyle
          shouldUpdate={(prev, curr) => prev.autoReconnect !== curr.autoReconnect}
        >
          {({ getFieldValue }) => 
            getFieldValue('autoReconnect') && (
              <>
                <Form.Item
                  name="maxReconnectAttempts"
                  label={t('connection.maxReconnectAttempts')}
                >
                  <InputNumber min={-1} style={{ width: '100%' }} />
                </Form.Item>

                <Form.Item
                  name="reconnectTimeWait"
                  label={t('connection.reconnectInterval')}
                >
                  <InputNumber min={100} style={{ width: '100%' }} />
                </Form.Item>
              </>
            )
          }
        </Form.Item>
      </Form>
    </Modal>
  )
}

export default ConnectionForm
