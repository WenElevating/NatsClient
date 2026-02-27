import React, { useEffect } from 'react'
import { Modal, Form, Input, InputNumber, Switch } from 'antd'
import type { ConnectionConfig } from '../types/nats'
import { useConnectionStore } from '../stores'

interface ConnectionFormProps {
  visible: boolean
  connection: ConnectionConfig | null
  onClose: () => void
}

const ConnectionForm: React.FC<ConnectionFormProps> = ({ visible, connection, onClose }) => {
  const [form] = Form.useForm()
  const { addConnection } = useConnectionStore()

  useEffect(() => {
    if (visible) {
      if (connection) {
        form.setFieldsValue(connection)
      } else {
        form.resetFields()
        form.setFieldsValue({
          servers: 'localhost',
          port: 4222,
          tls: false,
          autoReconnect: true,
          maxReconnectAttempts: 10,
          reconnectTimeWait: 2000
        })
      }
    }
  }, [visible, connection, form])

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
      title={connection ? '编辑连接' : '新建连接'}
      open={visible}
      onCancel={onClose}
      onOk={handleSubmit}
      okText="保存"
      cancelText="取消"
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
          label="连接名称"
          rules={[{ required: true, message: '请输入连接名称' }]}
        >
          <Input placeholder="例如: 本地开发服务器" />
        </Form.Item>

        <Form.Item
          name="servers"
          label="服务器地址"
          rules={[{ required: true, message: '请输入服务器地址' }]}
        >
          <Input placeholder="例如: localhost 或 nats.example.com" />
        </Form.Item>

        <Form.Item
          name="port"
          label="端口"
          rules={[{ required: true, message: '请输入端口号' }]}
        >
          <InputNumber min={1} max={65535} style={{ width: '100%' }} />
        </Form.Item>

        <Form.Item
          name="username"
          label="用户名"
        >
          <Input placeholder="可选" />
        </Form.Item>

        <Form.Item
          name="password"
          label="密码"
        >
          <Input.Password placeholder="可选" />
        </Form.Item>

        <Form.Item
          name="token"
          label="Token"
        >
          <Input.Password placeholder="可选" />
        </Form.Item>

        <Form.Item
          name="tls"
          label="启用 TLS"
          valuePropName="checked"
        >
          <Switch />
        </Form.Item>

        <Form.Item
          name="autoReconnect"
          label="自动重连"
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
                  label="最大重连次数 (-1 为无限)"
                >
                  <InputNumber min={-1} style={{ width: '100%' }} />
                </Form.Item>

                <Form.Item
                  name="reconnectTimeWait"
                  label="重连间隔 (毫秒)"
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
