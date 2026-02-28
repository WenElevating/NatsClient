import { useState, useEffect } from 'react'
import { Button, Badge, Tooltip, Popconfirm, Typography, Empty, Space } from 'antd'
import { 
  PlusOutlined, 
  DeleteOutlined, 
  LinkOutlined, 
  DisconnectOutlined,
  EditOutlined
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import type { ConnectionConfig, ConnectionStatus } from '../types/nats'
import { useConnectionStore } from '../stores'
import ConnectionForm from './ConnectionForm'

const { Text } = Typography

const statusColors: Record<ConnectionStatus, string> = {
  connected: 'green',
  connecting: 'blue',
  disconnected: 'default',
  reconnecting: 'orange',
  error: 'red'
}

const ConnectionList: React.FC = () => {
  const { t } = useTranslation()
  const { 
    connections, 
    activeConnection, 
    connectionState, 
    loadConnections, 
    deleteConnection, 
    connect, 
    disconnect,
    setActiveConnection 
  } = useConnectionStore()
  
  const [formVisible, setFormVisible] = useState(false)
  const [editingConnection, setEditingConnection] = useState<ConnectionConfig | null>(null)

  useEffect(() => {
    loadConnections()
  }, [loadConnections])

  const getStatusText = (status: ConnectionStatus) => {
    const statusMap: Record<ConnectionStatus, string> = {
      connected: t('app.connected'),
      connecting: t('app.connecting'),
      disconnected: t('app.disconnected'),
      reconnecting: t('app.reconnecting'),
      error: t('app.error')
    }
    return statusMap[status]
  }

  const handleConnect = async (connection: ConnectionConfig) => {
    setActiveConnection(connection)
    await connect(connection)
  }

  const handleDisconnect = async () => {
    await disconnect()
  }

  const handleEdit = (connection: ConnectionConfig) => {
    setEditingConnection(connection)
    setFormVisible(true)
  }

  const handleDelete = async (id: string) => {
    await deleteConnection(id)
  }

  const handleFormClose = () => {
    setFormVisible(false)
    setEditingConnection(null)
  }

  return (
    <div className="connection-list">
      <div className="connection-list-header">
        <Text strong>{t('connection.title')}</Text>
        <Button 
          type="primary" 
          icon={<PlusOutlined />} 
          size="small"
          onClick={() => setFormVisible(true)}
        >
          {t('connection.newConnection')}
        </Button>
      </div>
      
      <div className="connection-list-content">
        {connections.length === 0 ? (
          <Empty 
            description={t('connection.noConnections', '暂无连接配置')}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            style={{ marginTop: 40 }}
          />
        ) : (
          <div className="connection-items">
            {connections.map((item) => {
              const isActive = activeConnection?.id === item.id
              const status = isActive ? connectionState.status : 'disconnected'
              
              return (
                <div 
                  key={item.id}
                  className={`connection-item ${isActive ? 'active' : ''}`}
                >
                  <div className="connection-item-main">
                    <div className="connection-item-info">
                      <Text 
                        ellipsis 
                        className="connection-name"
                        style={{ color: isActive ? '#1890ff' : undefined }}
                      >
                        {item.name}
                      </Text>
                      <Badge 
                        color={statusColors[status]} 
                        text={
                          <span style={{ 
                            fontSize: 12, 
                            whiteSpace: 'nowrap',
                            display: 'inline-flex',
                            alignItems: 'center',
                            height: '16px',
                            color: '#a0a0a0',
                          }}>
                            {getStatusText(status)}
                          </span>
                        }
                        style={{ display: 'flex', alignItems: 'center', marginTop: 22, }}
                      />
                    </div>
                    <Text type="secondary" style={{ fontSize: 12 }} ellipsis className="connection-address">
                      {item.servers}:{item.port}
                    </Text>
                  </div>
                  
                  <div className="connection-item-actions">
                    <Space size={0}>
                      {isActive && status === 'connected' ? (
                        <Tooltip title={t('connection.disconnect')}>
                          <Button 
                            type="text" 
                            danger 
                            size="small"
                            icon={<DisconnectOutlined />}
                            onClick={handleDisconnect}
                          />
                        </Tooltip>
                      ) : (
                        <Tooltip title={t('connection.connect')}>
                          <Button 
                            type="text" 
                            size="small"
                            icon={<LinkOutlined />}
                            onClick={() => handleConnect(item)}
                          />
                        </Tooltip>
                      )}
                      <Tooltip title={t('connection.edit')}>
                        <Button 
                          type="text" 
                          size="small"
                          icon={<EditOutlined />}
                          onClick={() => handleEdit(item)}
                        />
                      </Tooltip>
                      <Popconfirm
                        title={t('connection.confirmDelete')}
                        onConfirm={() => handleDelete(item.id)}
                        okText={t('common.confirm')}
                        cancelText={t('common.cancel')}
                      >
                        <Tooltip title={t('connection.delete')}>
                          <Button 
                            type="text" 
                            danger 
                            size="small"
                            icon={<DeleteOutlined />}
                          />
                        </Tooltip>
                      </Popconfirm>
                    </Space>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <ConnectionForm 
        visible={formVisible}
        connection={editingConnection}
        onClose={handleFormClose}
      />
    </div>
  )
}

export default ConnectionList
