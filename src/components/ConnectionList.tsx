import React, { useState, useEffect } from 'react'
import { Button, Badge, Tooltip, Popconfirm, Typography, Empty, Space } from 'antd'
import { 
  PlusOutlined, 
  DeleteOutlined, 
  LinkOutlined, 
  DisconnectOutlined,
  EditOutlined
} from '@ant-design/icons'
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

const statusText: Record<ConnectionStatus, string> = {
  connected: '已连接',
  connecting: '连接中',
  disconnected: '已断开',
  reconnecting: '重连中',
  error: '错误'
}

const ConnectionList: React.FC = () => {
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
        <Text strong style={{ color: '#fff' }}>连接管理</Text>
        <Button 
          type="primary" 
          icon={<PlusOutlined />} 
          size="small"
          onClick={() => setFormVisible(true)}
        >
          新建
        </Button>
      </div>
      
      <div className="connection-list-content">
        {connections.length === 0 ? (
          <Empty 
            description="暂无连接配置" 
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
                        style={{ color: isActive ? '#1890ff' : '#fff' }}
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
                            {statusText[status]}
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
                        <Tooltip title="断开连接">
                          <Button 
                            type="text" 
                            danger 
                            size="small"
                            icon={<DisconnectOutlined />}
                            onClick={handleDisconnect}
                          />
                        </Tooltip>
                      ) : (
                        <Tooltip title="连接">
                          <Button 
                            type="text" 
                            size="small"
                            icon={<LinkOutlined />}
                            onClick={() => handleConnect(item)}
                          />
                        </Tooltip>
                      )}
                      <Tooltip title="编辑">
                        <Button 
                          type="text" 
                          size="small"
                          icon={<EditOutlined />}
                          onClick={() => handleEdit(item)}
                        />
                      </Tooltip>
                      <Popconfirm
                        title="确定删除此连接配置？"
                        onConfirm={() => handleDelete(item.id)}
                        okText="确定"
                        cancelText="取消"
                      >
                        <Tooltip title="删除">
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
