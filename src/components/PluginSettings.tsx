import React from 'react'
import { Card, Switch, Space, Typography, Tag, message, Divider, Alert } from 'antd'
import { VideoCameraOutlined, CodeOutlined, EyeOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { usePluginStore } from '../stores/pluginStore'

const { Text, Title } = Typography

const getPluginIcon = (pluginId: string) => {
  if (pluginId.includes('video')) return <VideoCameraOutlined style={{ fontSize: 24, color: '#1890ff' }} />
  if (pluginId.includes('json')) return <CodeOutlined style={{ fontSize: 24, color: '#52c41a' }} />
  return <EyeOutlined style={{ fontSize: 24, color: '#722ed1' }} />
}

const getPluginUsage = (pluginId: string): { subjects: string[]; description: string } => {
  if (pluginId.includes('video')) {
    return {
      subjects: ['video.*', 'stream.video.*', 'media.video.*'],
      description: '订阅以上主题后，视频消息会自动使用视频播放器渲染'
    }
  }
  if (pluginId.includes('json')) {
    return {
      subjects: ['*'],
      description: '自动检测 JSON 格式的消息并格式化显示'
    }
  }
  return {
    subjects: [],
    description: ''
  }
}

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
          plugins.map(plugin => {
            const usage = getPluginUsage(plugin.id)
            return (
              <div key={plugin.id} style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div style={{ 
                    width: 48, 
                    height: 48, 
                    borderRadius: 8, 
                    background: 'var(--color-bg-container)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 12
                  }}>
                    {getPluginIcon(plugin.id)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Text strong style={{ fontSize: 16 }}>{plugin.name}</Text>
                      <Tag>v{plugin.version}</Tag>
                      <Tag color={plugin.active ? 'green' : 'default'}>
                        {plugin.active ? t('plugin.settings.enabled', '已启用') : t('plugin.settings.disabled', '已禁用')}
                      </Tag>
                      {plugin.hasError && (
                        <Tag color="error">{t('plugin.settings.error', '错误')}</Tag>
                      )}
                    </div>
                    <Text type="secondary" style={{ fontSize: 12 }}>{plugin.description}</Text>
                    <div><Text type="secondary" style={{ fontSize: 11 }}>作者: {plugin.author}</Text></div>
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
                  <Alert 
                    type="error" 
                    message={plugin.errorMessage} 
                    style={{ marginBottom: 12 }}
                  />
                )}

                {plugin.active && usage.subjects.length > 0 && (
                  <div style={{ 
                    background: 'var(--color-bg-container)', 
                    borderRadius: 8, 
                    padding: 12,
                    marginTop: 8
                  }}>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                      使用方式：
                    </Text>
                    <div style={{ marginBottom: 8 }}>
                      <Text style={{ fontSize: 12 }}>{usage.description}</Text>
                    </div>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                      支持的主题模式：
                    </Text>
                    <Space wrap>
                      {usage.subjects.map(subject => (
                        <Tag 
                          key={subject} 
                          color="blue"
                          style={{ cursor: 'pointer' }}
                          onClick={() => {
                            navigator.clipboard.writeText(subject)
                            message.success('已复制到剪贴板')
                          }}
                        >
                          {subject}
                        </Tag>
                      ))}
                    </Space>
                  </div>
                )}

                <Divider style={{ margin: '12px 0' }} />
              </div>
            )
          })
        )}
      </Card>
    </div>
  )
}

export default PluginSettings
