import React, { useEffect } from 'react'
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

const { Sider, Content, Header } = Layout

const MainLayout: React.FC = () => {
  const { connectionState } = useConnectionStore()
  const { loadSettings } = useSettingsStore()
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
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#1890ff',
          colorBgContainer: '#1a1a2e',
          colorBgElevated: '#16213e',
          colorBorder: '#2d2d44',
          colorText: '#e0e0e0',
          colorTextSecondary: '#a0a0a0',
        },
        components: {
          Layout: {
            siderBg: '#16213e',
            headerBg: '#16213e',
            bodyBg: '#0f0f1a',
          },
          Card: {
            colorBgContainer: '#1a1a2e',
          },
          Table: {
            headerBg: '#16213e',
            rowHoverBg: '#252540',
          },
          Input: {
            colorBgContainer: '#252540',
          },
          Select: {
            colorBgContainer: '#252540',
          },
        }
      }}
    >
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
