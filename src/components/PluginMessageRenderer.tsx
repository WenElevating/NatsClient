import React, { useMemo, memo } from 'react'
import { Tag, Typography, Button, Space } from 'antd'
import { EyeOutlined, CopyOutlined } from '@ant-design/icons'
import { pluginManager } from '../plugins/PluginManager'
import type { NatsMessage } from '../types/nats'
import { formatTimestamp, formatJson } from '../utils/format'

const { Text } = Typography

interface PluginMessageRendererProps {
  message: NatsMessage
  subscriptionId: string
  isPreview: boolean
  messageDisplayLength: number
  onViewDetail: () => void
  onCopy: () => void
}

const DefaultRenderer: React.FC<{
  message: NatsMessage
  isPreview: boolean
  messageDisplayLength: number
}> = ({ message, isPreview, messageDisplayLength }) => {
  const display = useMemo(() => {
    const formatted = message.isJson ? formatJson(message.payload) : message.payload
    if (isPreview && formatted.length > messageDisplayLength) {
      return formatted.substring(0, messageDisplayLength) + '...'
    }
    return formatted
  }, [message.payload, message.isJson, isPreview, messageDisplayLength])

  return (
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
  )
}

const PluginMessageRenderer: React.FC<PluginMessageRendererProps> = memo(({
  message,
  subscriptionId,
  isPreview,
  messageDisplayLength,
  onViewDetail,
  onCopy
}) => {
  const Renderer = useMemo(() => {
    return pluginManager.getMessageRenderer(message.subject)
  }, [message.subject])

  const truncated = !isPreview && message.payload.length > messageDisplayLength

  if (Renderer) {
    return (
      <div className="message-item" style={{ padding: '8px 4px', borderBottom: '1px solid var(--color-border)' }}>
        <div className="message-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <Space size={4}>
            <Text type="secondary" style={{ fontSize: 11 }}>
              {formatTimestamp(message.timestamp)}
            </Text>
            <Tag color="blue" style={{ fontSize: 11, padding: '0 4px', margin: 0 }}>{message.subject}</Tag>
            <Tag color="purple" style={{ fontSize: 10, padding: '0 4px', margin: 0 }}>插件</Tag>
          </Space>
          <Space size={0}>
            <Button 
              type="text" 
              size="small"
              icon={<EyeOutlined style={{ fontSize: 12 }} />}
              onClick={onViewDetail}
              style={{ padding: '0 4px' }}
            />
            <Button 
              type="text" 
              size="small"
              icon={<CopyOutlined style={{ fontSize: 12 }} />}
              onClick={onCopy}
              style={{ padding: '0 4px' }}
            />
          </Space>
        </div>
        <Renderer 
          message={message}
          subscriptionId={subscriptionId}
          isPreview={isPreview}
          onViewDetail={onViewDetail}
        />
      </div>
    )
  }

  return (
    <div className="message-item" style={{ padding: '8px 4px', borderBottom: '1px solid var(--color-border)' }}>
      <div className="message-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <Space size={4}>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {formatTimestamp(message.timestamp)}
          </Text>
          <Tag color="blue" style={{ fontSize: 11, padding: '0 4px', margin: 0 }}>{message.subject}</Tag>
        </Space>
        <Space size={0}>
          {truncated && (
            <Button 
              type="text" 
              size="small"
              icon={<EyeOutlined style={{ fontSize: 12 }} />}
              onClick={onViewDetail}
              style={{ padding: '0 4px' }}
            />
          )}
          <Button 
            type="text" 
            size="small"
            icon={<CopyOutlined style={{ fontSize: 12 }} />}
            onClick={onCopy}
            style={{ padding: '0 4px' }}
          />
        </Space>
      </div>
      <DefaultRenderer 
        message={message}
        isPreview={isPreview}
        messageDisplayLength={messageDisplayLength}
      />
    </div>
  )
})

export default PluginMessageRenderer
