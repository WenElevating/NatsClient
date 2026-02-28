import React from 'react'
import { Card, Switch, Space, Typography, Tag, message } from 'antd'
import { useTranslation } from 'react-i18next'
import { usePluginStore } from '../stores/pluginStore'

const { Text } = Typography

const PluginSettings: React.FC = () => {
  const { t } = useTranslation()
  const { plugins, activatePlugin, deactivatePlugin } = usePluginStore()

  return (
    <div className="plugin-settings">
      <Card title={t('plugin.settings.title', '插件设置')} className="panel-card">
        {plugins.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Text type="secondary">{t('plugin.settings.noPlugins', '暂无插件')}</Text>
          </div>
        ) : (
          plugins.map(plugin => (
            <div key={plugin.id} style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                {plugin.icon && (
                  <img 
                    src={plugin.icon} 
                    alt={plugin.name}
                    style={{ width: 32, height: 32, marginRight: 12, borderRadius: 4 }}
                  />
                )}
                <div style={{ flex: 1 }}>
                  <Text strong style={{ fontSize: 16 }}>{plugin.name}</Text>
                  <div><Text type="secondary" style={{ fontSize: 12 }}>{plugin.description}</Text></div>
                  <Space>
                    <Tag color={plugin.active ? 'green' : 'default'}>
                      {plugin.active ? t('plugin.settings.enabled', '已启用') : t('plugin.settings.disabled', '已禁用')}
                    </Tag>
                    {plugin.hasError && (
                      <Tag color="error">{t('plugin.settings.error', '错误')}</Tag>
                    )}
                  </Space>
                </div>
                <Switch 
                  checked={plugin.active}
                  onChange={(checked) => {
                    if (checked) {
                      activatePlugin(plugin.id).catch(err => {
                        message.error(`${t('plugin.settings.activateFailed', '激活失败')}: ${err.message}`)
                      })
                    } else {
                      deactivatePlugin(plugin.id).catch(err => {
                        message.error(`${t('plugin.settings.deactivateFailed', '停用失败')}: ${err.message}`)
                      })
                    }
                  }}
                />
              </div>

              {plugin.errorMessage && (
                <div style={{ padding: 12, background: 'var(--color-error-bg)', borderRadius: 4, marginBottom: 12 }}>
                  <Text type="danger">{plugin.errorMessage}</Text>
                </div>
              )}
            </div>
          ))
        )}
      </Card>
    </div>
  )
}

export default PluginSettings
