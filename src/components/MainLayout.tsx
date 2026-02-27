import React, { useEffect, useMemo } from 'react'
import { Layout, Tabs, ConfigProvider, theme } from 'antd'
import { 
  SendOutlined, 
  EyeOutlined, 
  MessageOutlined, 
  DatabaseOutlined 
} from '@ant-design/icons'
import { 
  ConnectionList, 
  PublishPanel, 
  SubscriptionPanel, 
  RequestPanel, 
  JetStreamPanel, 
  LogPanel,
  TitleBar
} from '../components'
import { useConnectionStore, useSettingsStore, useLogStore } from '../stores'
import { darkTheme, lightTheme } from '../themes'

const { Sider, Content, Header } = Layout

const MainLayout: React.FC = () => {
  const { connectionState } = useConnectionStore()
  const { loadSettings, theme: currentTheme } = useSettingsStore()
  const { addLog } = useLogStore()

  useEffect(() => {
    loadSettings()
    addLog('info', '应用程序已启动')
  }, [loadSettings, addLog])

  useEffect(() => {
    const statusMessages: Record<string, string> = {
      connected: '已连接到 NATS 服务器',
      disconnected: '已断开连接',
      connecting: '正在连接...',
      reconnecting: '正在重连...',
      error: `连接错误: ${connectionState.error || '未知错误'}`
    }
    addLog(connectionState.status === 'error' ? 'error' : 'info', statusMessages[connectionState.status])
  }, [connectionState.status, connectionState.error, addLog])

  const themeConfig = useMemo(() => {
    const isDark = currentTheme === 'dark'
    const themeToken = isDark ? darkTheme : lightTheme
    
    return {
      algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
      token: {
        colorPrimary: themeToken.colorPrimary,
        colorBgContainer: themeToken.colorBgContainer,
        colorBgElevated: themeToken.colorBgElevated,
        colorBorder: themeToken.colorBorder,
        colorText: themeToken.colorText,
        colorTextSecondary: themeToken.colorTextSecondary,
      },
      components: {
        Layout: {
          siderBg: themeToken.siderBg,
          headerBg: themeToken.headerBg,
          bodyBg: themeToken.bodyBg,
        },
        Card: {
          colorBgContainer: themeToken.colorBgContainer,
        },
        Table: {
          headerBg: themeToken.colorBgElevated,
          rowHoverBg: isDark ? '#252540' : '#f5f5f5',
        },
        Input: {
          colorBgContainer: isDark ? '#252540' : '#ffffff',
        },
        Select: {
          colorBgContainer: isDark ? '#252540' : '#ffffff',
        },
      }
    }
  }, [currentTheme])

  const tabItems = [
    {
      key: 'publish',
      label: (
        <span className="tab-label">
          <SendOutlined />
          <span>发布</span>
        </span>
      ),
      children: <PublishPanel />
    },
    {
      key: 'subscribe',
      label: (
        <span className="tab-label">
          <EyeOutlined />
          <span>订阅</span>
        </span>
      ),
      children: <SubscriptionPanel />
    },
    {
      key: 'request',
      label: (
        <span className="tab-label">
          <MessageOutlined />
          <span>请求</span>
        </span>
      ),
      children: <RequestPanel />
    },
    {
      key: 'jetstream',
      label: (
        <span className="tab-label">
          <DatabaseOutlined />
          <span>JetStream</span>
        </span>
      ),
      children: <JetStreamPanel />
    }
  ]

  return (
    <ConfigProvider theme={themeConfig}>
      <Layout className="main-layout">
        <Header className="app-header">
          <TitleBar />
        </Header>
        <Layout>
          <Sider width={280} className="left-sider">
            <ConnectionList />
          </Sider>
          <Content className="main-content">
            <Tabs 
              defaultActiveKey="subscribe" 
              items={tabItems}
              className="main-tabs"
            />
          </Content>
          <Sider width={320} className="right-sider">
            <LogPanel />
          </Sider>
        </Layout>
      </Layout>
    </ConfigProvider>
  )
}

export default MainLayout
