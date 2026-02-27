import React, { useState, useEffect } from 'react'
import { Typography, Tooltip } from 'antd'
import { 
  MinusOutlined, 
  BorderOutlined, 
  CloseOutlined,
  BlockOutlined,
  CloudOutlined,
  SunOutlined,
  MoonOutlined
} from '@ant-design/icons'
import { useConnectionStore, useSettingsStore } from '../stores'

const { Text } = Typography

const TitleBar: React.FC = () => {
  const [isMaximized, setIsMaximized] = useState(false)
  const { connectionState } = useConnectionStore()
  const { theme, updateSettings } = useSettingsStore()

  useEffect(() => {
    const checkMaximized = async () => {
      const maximized = await window.nats.isWindowMaximized()
      setIsMaximized(maximized)
    }
    checkMaximized()
  }, [])

  const handleMinimize = async () => {
    await window.nats.minimizeWindow()
  }

  const handleMaximize = async () => {
    await window.nats.maximizeWindow()
    const maximized = await window.nats.isWindowMaximized()
    setIsMaximized(maximized)
  }

  const handleClose = async () => {
    await window.nats.closeWindow()
  }

  const handleToggleTheme = async () => {
    await updateSettings({ theme: theme === 'dark' ? 'light' : 'dark' })
  }

  const getStatusColor = () => {
    switch (connectionState.status) {
      case 'connected':
        return '#52c41a'
      case 'connecting':
      case 'reconnecting':
        return '#1890ff'
      case 'error':
        return '#ff4d4f'
      default:
        return '#666'
    }
  }

  return (
    <div className="title-bar">
      <div className="title-bar-drag">
        <div className="title-bar-left">
          <div className="app-icon">
            <CloudOutlined style={{ fontSize: 16, color: '#1890ff' }} />
          </div>
          <Text className="app-title">NATS Client</Text>
          <div className="connection-indicator">
            <div 
              className="status-dot" 
              style={{ backgroundColor: getStatusColor() }}
            />
            <Text type="secondary" style={{ fontSize: 11 }}>
              {connectionState.status === 'connected' ? '已连接' : 
               connectionState.status === 'connecting' ? '连接中' :
               connectionState.status === 'reconnecting' ? '重连中' :
               connectionState.status === 'error' ? '错误' : '未连接'}
            </Text>
          </div>
        </div>
      </div>
      
      <div className="title-bar-controls">
        <Tooltip title={theme === 'dark' ? '切换到浅色主题' : '切换到深色主题'}>
          <button className="title-bar-btn theme-toggle" onClick={handleToggleTheme}>
            {theme === 'dark' ? <SunOutlined /> : <MoonOutlined />}
          </button>
        </Tooltip>
        <Tooltip title="最小化">
          <button className="title-bar-btn minimize" onClick={handleMinimize}>
            <MinusOutlined />
          </button>
        </Tooltip>
        <Tooltip title={isMaximized ? '还原' : '最大化'}>
          <button className="title-bar-btn maximize" onClick={handleMaximize}>
            {isMaximized ? <BlockOutlined /> : <BorderOutlined />}
          </button>
        </Tooltip>
        <Tooltip title="关闭">
          <button className="title-bar-btn close" onClick={handleClose}>
            <CloseOutlined />
          </button>
        </Tooltip>
      </div>
    </div>
  )
}

export default TitleBar
