import { useState, useEffect } from 'react'
import { Typography, Tooltip } from 'antd'
import { 
  MinusOutlined, 
  BorderOutlined, 
  CloseOutlined,
  BlockOutlined,
  CloudOutlined,
  SunOutlined,
  MoonOutlined,
  GlobalOutlined
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useConnectionStore, useSettingsStore } from '../stores'

const { Text } = Typography

const TitleBar = () => {
  const [isMaximized, setIsMaximized] = useState(false)
  const { connectionState } = useConnectionStore()
  const { theme, updateSettings } = useSettingsStore()
  const { t, i18n } = useTranslation()

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

  const handleToggleLanguage = async () => {
    const newLang = i18n.language === 'zh-CN' ? 'en-US' : 'zh-CN'
    await i18n.changeLanguage(newLang)
    await updateSettings({ language: newLang })
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

  const getStatusText = () => {
    switch (connectionState.status) {
      case 'connected':
        return t('app.connected')
      case 'connecting':
        return t('app.connecting')
      case 'reconnecting':
        return t('app.reconnecting')
      case 'error':
        return t('app.error')
      default:
        return t('app.disconnected')
    }
  }

  return (
    <div className="title-bar">
      <div className="title-bar-drag">
        <div className="title-bar-left">
          <div className="app-icon">
            <CloudOutlined style={{ fontSize: 16, color: '#1890ff' }} />
          </div>
          <Text className="app-title">{t('app.title')}</Text>
          <div className="connection-indicator">
            <div 
              className="status-dot" 
              style={{ backgroundColor: getStatusColor() }}
            />
            <Text type="secondary" style={{ fontSize: 11 }}>
              {getStatusText()}
            </Text>
          </div>
        </div>
      </div>
      
      <div className="title-bar-controls">
        <Tooltip title={i18n.language === 'zh-CN' ? 'English' : '中文'}>
          <button className="title-bar-btn language-toggle" onClick={handleToggleLanguage}>
            <GlobalOutlined />
          </button>
        </Tooltip>
        <Tooltip title={theme === 'dark' ? t('theme.switchToLight') : t('theme.switchToDark')}>
          <button className="title-bar-btn theme-toggle" onClick={handleToggleTheme}>
            {theme === 'dark' ? <SunOutlined /> : <MoonOutlined />}
          </button>
        </Tooltip>
        <Tooltip title={t('common.cancel')}>
          <button className="title-bar-btn minimize" onClick={handleMinimize}>
            <MinusOutlined />
          </button>
        </Tooltip>
        <Tooltip title={isMaximized ? t('common.restore', '还原') : t('common.maximize', '最大化')}>
          <button className="title-bar-btn maximize" onClick={handleMaximize}>
            {isMaximized ? <BlockOutlined /> : <BorderOutlined />}
          </button>
        </Tooltip>
        <Tooltip title={t('common.close')}>
          <button className="title-bar-btn close" onClick={handleClose}>
            <CloseOutlined />
          </button>
        </Tooltip>
      </div>
    </div>
  )
}

export default TitleBar
