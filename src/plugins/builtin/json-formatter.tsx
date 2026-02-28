import React, { useMemo } from 'react'
import type { NatsClientPlugin, MessageRendererProps } from '../types'
import { formatJson } from '../../utils/format'

const JsonRenderer: React.FC<MessageRendererProps> = ({ message, isPreview, onViewDetail }) => {
  const display = useMemo(() => {
    try {
      const parsed = typeof message.payload === 'string' 
        ? JSON.parse(message.payload) 
        : message.payload
      const formatted = JSON.stringify(parsed, null, 2)
      return isPreview ? formatted.substring(0, 200) + (formatted.length > 200 ? '...' : '') : formatted
    } catch {
      return message.payload
    }
  }, [message.payload, isPreview])

  if (isPreview) {
    return (
      <div 
        style={{ 
          fontFamily: "'Monaco', 'Menlo', monospace",
          fontSize: 11,
          cursor: 'pointer'
        }}
        onClick={onViewDetail}
      >
        {display}
      </div>
    )
  }

  return (
    <pre style={{ 
      margin: 0, 
      whiteSpace: 'pre-wrap', 
      wordBreak: 'break-all',
      fontSize: 12,
      fontFamily: "'Monaco', 'Menlo', monospace"
    }}>
      {display}
    </pre>
  )
}

const isJsonMessage = (message: { payload: string; isJson?: boolean }): boolean => {
  if (message.isJson) return true
  try {
    JSON.parse(message.payload)
    return true
  } catch {
    return false
  }
}

const jsonFormatterPlugin: NatsClientPlugin = {
  id: 'com.natsclient.builtin.json-formatter',
  name: 'JSON Formatter',
  version: '1.0.0',
  description: '格式化 JSON 消息显示',
  author: 'NatsClient Team',
  
  capabilities: {
    messageRenderers: [
      {
        subjectPattern: '*',
        priority: 1,
        renderer: (props: MessageRendererProps) => {
          if (isJsonMessage(props.message)) {
            return <JsonRenderer {...props} />
          }
          return null
        }
      }
    ]
  },

  activate: (context) => {
    context.logger.info('JSON Formatter plugin activated')
  }
}

export default jsonFormatterPlugin
