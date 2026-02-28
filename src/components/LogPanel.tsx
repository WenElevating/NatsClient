import { useEffect, useRef } from 'react'
import { Card, List, Button, Space, Tag, Typography, Empty } from 'antd'
import { ClearOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useLogStore } from '../stores'
import type { LogEntry } from '../stores/logStore'
import { formatTimestamp } from '../utils/format'

const { Text, Paragraph } = Typography

const levelColors: Record<LogEntry['level'], string> = {
  debug: 'default',
  info: 'blue',
  warn: 'orange',
  error: 'red'
}

const LogPanel: React.FC = () => {
  const { t } = useTranslation()
  const { logs, clearLogs } = useLogStore()
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [logs])

  return (
    <Card 
      title={t('logs.title')} 
      className="panel-card log-panel"
      size="small"
      extra={
        <Button 
          type="text" 
          icon={<ClearOutlined />} 
          onClick={clearLogs}
          size="small"
        >
          {t('logs.clear')}
        </Button>
      }
    >
      <div className="log-list" ref={listRef}>
        {logs.length === 0 ? (
          <Empty 
            description={t('logs.noLogs')} 
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            style={{ marginTop: 40 }}
          />
        ) : (
          <List
            dataSource={logs}
            renderItem={(log: LogEntry) => (
              <List.Item className="log-item">
                <div className="log-entry">
                  <Space size={8}>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {formatTimestamp(log.timestamp)}
                    </Text>
                    <Tag color={levelColors[log.level]} style={{ margin: 0 }}>
                      {log.level.toUpperCase()}
                    </Tag>
                  </Space>
                  <Paragraph 
                    style={{ 
                      margin: '4px 0 0 0', 
                      fontSize: 12,
                      wordBreak: 'break-all'
                    }}
                  >
                    {log.message}
                  </Paragraph>
                </div>
              </List.Item>
            )}
          />
        )}
      </div>
    </Card>
  )
}

export default LogPanel
