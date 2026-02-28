import { useEffect, useMemo } from 'react'
import { Layout, Tabs, ConfigProvider, theme, message } from 'antd'
import { 
  SendOutlined, 
  EyeOutlined, 
  MessageOutlined, 
  DatabaseOutlined,
  KeyOutlined,
  AppstoreOutlined
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { 
  ConnectionList, 
  PublishPanel, 
  SubscriptionPanel, 
  RequestPanel, 
  JetStreamPanel, 
  LogPanel,
  TitleBar,
  KvStorePanel
} from '../components'
import PluginMarket from './PluginMarket'
import PluginSettings from './PluginSettings'
import { useConnectionStore, useSettingsStore, useLogStore, usePluginStore } from '../stores'
import { darkTheme, lightTheme } from '../themes'
import { pluginManager } from '../plugins'
import jsonFormatterPlugin from '../plugins/builtin/json-formatter'

const { Header, Sider, Content } = Layout

message.config({
  duration: 3,
  maxCount: 3
})

const MainLayout: React.FC = () => {
  const { t } = useTranslation()
  const { connectionState } = useConnectionStore()
  const { loadSettings, theme: currentTheme } = useSettingsStore()
  const { addLog } = useLogStore()
  const { loadPlugins, registerPlugin, activatePlugin } = usePluginStore()

  useEffect(() => {
    loadSettings()
    addLog('info', t('app.started', '应用程序已启动'))
  }, [loadSettings, addLog, t])

  useEffect(() => {
    const initPlugins = async () => {
      try {
        await registerPlugin(jsonFormatterPlugin)
        await activatePlugin(jsonFormatterPlugin.id)
        await loadPlugins()
      } catch (error) {
        console.error('Failed to initialize plugins:', error)
      }
    }
    initPlugins()
  }, [])

  useEffect(() => {
    const statusMessages: Record<string, string> = {
      connected: t('app.connectedLog', '已连接到 NATS 服务器'),
      disconnected: t('app.disconnectedLog', '已断开连接'),
      connecting: t('app.connectingLog', '正在连接...'),
      reconnecting: t('app.reconnectingLog', '正在重连...'),
      error: `${t('app.error')}: ${connectionState.error || t('app.unknownError', '未知错误')}`
    }
    addLog(connectionState.status === 'error' ? 'error' : 'info', statusMessages[connectionState.status])
  }, [connectionState.status, connectionState.error, addLog, t])

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
          <span>{t('publish.title')}</span>
        </span>
      ),
      children: <PublishPanel />
    },
    {
      key: 'subscribe',
      label: (
        <span className="tab-label">
          <EyeOutlined />
          <span>{t('subscribe.title')}</span>
        </span>
      ),
      children: <SubscriptionPanel />
    },
    {
      key: 'request',
      label: (
        <span className="tab-label">
          <MessageOutlined />
          <span>{t('request.title')}</span>
        </span>
      ),
      children: <RequestPanel />
    },
    {
      key: 'jetstream',
      label: (
        <span className="tab-label">
          <DatabaseOutlined />
          <span>{t('jetstream.title')}</span>
        </span>
      ),
      children: <JetStreamPanel />
    },
    {
      key: 'kvstore',
      label: (
        <span className="tab-label">
          <KeyOutlined />
          <span>{t('kvstore.title')}</span>
        </span>
      ),
      children: <KvStorePanel />
    },
    {
      key: 'plugins',
      label: (
        <span className="tab-label">
          <AppstoreOutlined />
          <span>{t('plugin.title')}</span>
        </span>
      ),
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <PluginMarket />
          <PluginSettings />
        </div>
      )
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
