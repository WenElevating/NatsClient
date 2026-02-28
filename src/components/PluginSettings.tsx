import React from 'react'
import { Card, Switch, InputNumber, Select, Form, Space, Typography, Divider, Tag, Button, message } from 'antd'
import { useTranslation } from 'react-i18next'
import { usePluginStore } from '../stores/pluginStore'
import type { SettingDefinition } from '../plugins/types'

const { Text } = Typography

const PluginSettings: React.FC = () => {
  const { t } = useTranslation()
  const { plugins } = usePluginStore()

  const renderSettingInput = (key: string, setting: SettingDefinition, value: any, onChange: (value: any) => void) => {
    switch (setting.type) {
      case 'boolean':
        return (
          <Switch 
            checked={value as boolean} 
            onChange={onChange}
          />
        )
      case 'number':
        return (
          <InputNumber
            value={value as number}
            onChange={onChange}
            min={setting.min}
            max={setting.max}
            style={{ width: 150 }}
          />
        )
      case 'string':
        return (
          <Input 
            value={value as string}
            onChange={(e) => onChange(e.target.value)}
            style={{ width: 200 }}
          />
        )
      case 'select':
        return (
          <Select
            value={value as string}
            onChange={onChange}
            options={setting.options}
            style={{ width: 200 }}
          />
        )
      default:
        return null
    }
  }

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
                  <Text type="secondary" style={{ fontSize: 12 }}>{plugin.description}</Text>
                  <Space>
                    <Tag color={plugin.enabled ? 'green' : 'default'}>
                      {plugin.enabled ? t('plugin.settings.enabled', '已启用') : t('plugin.settings.disabled', '已禁用')}
                    </Tag>
                    {plugin.hasError && (
                      <Tag color="error">{t('plugin.settings.error', '错误')}</Tag>
                    )}
                  </Space>
                </div>
                <Switch 
                  checked={plugin.enabled}
                  onChange={(checked) => {
                    if (checked) {
                      usePluginStore.getState().activatePlugin(plugin.id).catch(err => {
                        message.error(`${t('plugin.settings.activateFailed', '激活失败')}: ${err.message}`)
                      })
                    } else {
                      usePluginStore.getState().deactivatePlugin(plugin.id).catch(err => {
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

              {plugin.enabled && plugin.info?.capabilities.settings && (
                <>
                  <Divider />
                  <Form layout="vertical">
                    {Object.entries(plugin.info.capabilities.settings).map(([key, setting]) => (
                      <Form.Item 
                        key={key}
                        label={setting.title}
                        tooltip={setting.description}
                      >
                        {renderSettingInput(key, setting, plugin.info?.capabilities.settings?.[key], (value) => {
                          // TODO: 保存设置到插件存储
                          console.log(`Setting ${key} changed to:`, value)
                        })}
                      </Form.Item>
                    ))}
                  </Form>
                </>
              )}
            </div>
          ))
        )}
      </Card>
    </div>
  )
}

export default PluginSettings
