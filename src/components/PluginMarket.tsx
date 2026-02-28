import React, { useState } from 'react'
import { Card, List, Button, Tag, Space, Typography, Input, Empty, Spin, message, Modal } from 'antd'
import { DownloadOutlined, DeleteOutlined, CheckCircleOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { usePluginStore } from '../stores'
import type { PluginInfo } from '../plugins/types'

const { Text } = Typography
const { Search } = Input

interface MarketPlugin extends PluginInfo {
  description: string
  downloads?: number
  rating?: number
  category?: string
}

const mockMarketPlugins: MarketPlugin[] = []

const PluginMarket: React.FC = () => {
  const { t } = useTranslation()
  const { plugins: installedPlugins, activatePlugin, deactivatePlugin } = usePluginStore()
  const [loading, setLoading] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [marketPlugins] = useState<MarketPlugin[]>(mockMarketPlugins)

  const filteredPlugins = marketPlugins.filter(plugin => 
    plugin.name.toLowerCase().includes(searchText.toLowerCase()) ||
    plugin.description.toLowerCase().includes(searchText.toLowerCase())
  )

  const handleInstall = async (plugin: MarketPlugin) => {
    setLoading(true)
    try {
      // 模拟安装过程
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // 实际安装时需要从服务器下载插件代码
      message.success(t('plugin.market.installSuccess', `${plugin.name} 安装成功`))
    } catch (error) {
      message.error(t('plugin.market.installFailed', '安装失败'))
    } finally {
      setLoading(false)
    }
  }

  const handleUninstall = async (plugin: MarketPlugin) => {
    Modal.confirm({
      title: t('plugin.market.confirmUninstall', '确认卸载'),
      content: t('plugin.market.confirmUninstallDesc', `确定要卸载 ${plugin.name} 吗？`),
      onOk: async () => {
        try {
          await usePluginStore.getState().unregisterPlugin(plugin.id)
          message.success(t('plugin.market.uninstallSuccess', '卸载成功'))
        } catch (error) {
          message.error(t('plugin.market.uninstallFailed', '卸载失败'))
        }
      }
    })
  }

  const handleToggle = async (plugin: PluginInfo) => {
    try {
      if (plugin.active) {
        await deactivatePlugin(plugin.id)
      } else {
        await activatePlugin(plugin.id)
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : '操作失败')
    }
  }

  return (
    <div className="plugin-market">
      <Card 
        title={
          <Space>
            <span>{t('plugin.market.title', '插件市场')}</span>
            <Tag color="blue">{marketPlugins.length} {t('plugin.market.available', '个可用')}</Tag>
          </Space>
        }
        extra={
          <Search
            placeholder={t('plugin.market.searchPlaceholder', '搜索插件...')}
            allowClear
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 250 }}
          />
        }
        className="panel-card"
      >
        <Spin spinning={loading}>
          {filteredPlugins.length === 0 ? (
            <Empty 
              description={t('plugin.market.noResults', '未找到匹配的插件')}
              style={{ padding: 40 }}
            />
          ) : (
            <List
              itemLayout="horizontal"
              dataSource={filteredPlugins}
              renderItem={(plugin) => {
                const installed = installedPlugins.find(p => p.id === plugin.id)
                const isInstalled = !!installed
                
                return (
                  <List.Item
                    actions={[
                      isInstalled ? (
                        <Space key="actions">
                          <Button
                            size="small"
                            type={installed?.active ? 'default' : 'primary'}
                            onClick={() => handleToggle(installed!)}
                          >
                            {installed?.active ? t('plugin.market.disable', '禁用') : t('plugin.market.enable', '启用')}
                          </Button>
                          <Button
                            size="small"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() => handleUninstall(plugin)}
                          >
                            {t('plugin.market.uninstall', '卸载')}
                          </Button>
                        </Space>
                      ) : (
                        <Button
                          key="install"
                          type="primary"
                          icon={<DownloadOutlined />}
                          onClick={() => handleInstall(plugin)}
                        >
                          {t('plugin.market.install', '安装')}
                        </Button>
                      )
                    ]}
                  >
                    <List.Item.Meta
                      title={
                        <Space>
                          <Text strong>{plugin.name}</Text>
                          <Tag>{plugin.version}</Tag>
                          {isInstalled && (
                            <Tag color="green" icon={<CheckCircleOutlined />}>
                              {t('plugin.market.installed', '已安装')}
                            </Tag>
                          )}
                          {plugin.category && (
                            <Tag color="blue">{plugin.category}</Tag>
                          )}
                        </Space>
                      }
                      description={
                        <div>
                          <Text type="secondary">{plugin.description}</Text>
                          <div style={{ marginTop: 4 }}>
                            <Space size="large">
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                {t('plugin.market.author', '作者')}: {plugin.author}
                              </Text>
                              {plugin.downloads && (
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                  {t('plugin.market.downloads', '下载')}: {plugin.downloads.toLocaleString()}
                                </Text>
                              )}
                              {plugin.rating && (
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                  {t('plugin.market.rating', '评分')}: {plugin.rating}
                                </Text>
                              )}
                            </Space>
                          </div>
                        </div>
                      }
                    />
                  </List.Item>
                )
              }}
            />
          )}
        </Spin>
      </Card>
    </div>
  )
}

export default PluginMarket
