# NatsClient 插件系统架构设计

## 1. 概述

NatsClient 插件系统允许第三方开发者扩展客户端功能，例如：
- 自定义消息渲染器（视频播放、图片显示、图表等）
- 消息处理器（数据转换、过滤、聚合）
- 发布拦截器（消息加密、压缩、签名）
- UI 扩展面板

## 2. 核心概念

### 2.1 插件定义

```typescript
interface NatsClientPlugin {
  // 插件元数据
  id: string                    // 唯一标识符，如 "com.example.video-player"
  name: string                  // 显示名称
  version: string               // 版本号，如 "1.0.0"
  description: string           // 描述
  author: string                // 作者
  icon?: string                 // 图标（可选）
  
  // 能力声明
  capabilities: PluginCapabilities
  
  // 生命周期钩子
  activate?: (context: PluginContext) => void | Promise<void>
  deactivate?: () => void | Promise<void>
}

interface PluginCapabilities {
  // 消息处理器：处理特定主题的消息
  messageHandlers?: MessageHandlerDefinition[]
  
  // 消息渲染器：自定义消息的显示方式
  messageRenderers?: MessageRendererDefinition[]
  
  // 发布拦截器：拦截发布操作
  publishInterceptors?: PublishInterceptorDefinition[]
  
  // UI 扩展面板
  panels?: PanelDefinition[]
  
  // 设置页面
  settings?: SettingsDefinition
}
```

### 2.2 消息处理器

```typescript
interface MessageHandlerDefinition {
  // 匹配的主题模式（支持通配符）
  subjectPattern: string
  
  // 处理器
  handler: MessageHandler
}

type MessageHandler = (message: NatsMessage, context: MessageContext) => 
  | void 
  | { handled: true; result?: any }
  | Promise<void | { handled: true; result?: any }>

interface MessageContext {
  subscriptionId: string
  subject: string
  timestamp: Date
}
```

### 2.3 消息渲染器

```typescript
interface MessageRendererDefinition {
  // 匹配的主题模式
  subjectPattern: string
  
  // 优先级（数字越大优先级越高）
  priority?: number
  
  // 渲染器组件
  renderer: MessageRendererComponent
}

type MessageRendererComponent = React.FC<MessageRendererProps>

interface MessageRendererProps {
  message: NatsMessage
  subscriptionId: string
  // 是否为预览模式（在消息列表中）
  isPreview: boolean
  // 点击查看详情
  onViewDetail?: () => void
}
```

### 2.4 发布拦截器

```typescript
interface PublishInterceptorDefinition {
  // 匹配的主题模式
  subjectPattern: string
  
  // 拦截器
  interceptor: PublishInterceptor
}

type PublishInterceptor = (options: PublishOptions, context: PublishContext) => 
  | PublishOptions 
  | null  // 返回 null 取消发布
  | Promise<PublishOptions | null>

interface PublishContext {
  subject: string
  timestamp: Date
}
```

### 2.5 UI 扩展面板

```typescript
interface PanelDefinition {
  id: string
  title: string
  icon: React.ReactNode
  
  // 面板位置
  position: 'tab' | 'sidebar' | 'bottom'
  
  // 面板组件
  component: React.FC
}
```

### 2.6 插件上下文

```typescript
interface PluginContext {
  // 插件信息
  plugin: NatsClientPlugin
  
  // 订阅操作
  subscriptions: {
    subscribe: (subject: string) => Promise<SubscribeResult>
    unsubscribe: (subscriptionId: string) => Promise<void>
    getActiveSubscriptions: () => Subscription[]
  }
  
  // 发布操作
  publishing: {
    publish: (options: PublishOptions) => Promise<PublishResult>
  }
  
  // 日志
  logger: {
    info: (message: string, ...args: any[]) => void
    warn: (message: string, ...args: any[]) => void
    error: (message: string, ...args: any[]) => void
  }
  
  // 配置存储
  storage: {
    get: <T>(key: string) => T | undefined
    set: <T>(key: string, value: T) => void
    delete: (key: string) => void
    clear: () => void
  }
  
  // 显示通知
  notifications: {
    success: (message: string) => void
    error: (message: string) => void
    info: (message: string) => void
    warning: (message: string) => void
  }
  
  // 注册命令
  commands: {
    register: (id: string, handler: () => void) => void
    execute: (id: string) => void
  }
}
```

## 3. 插件目录结构

```
plugins/
├── video-player/
│   ├── manifest.json        # 插件清单
│   ├── index.js             # 插件入口（编译后）
│   ├── src/                 # 源代码
│   │   ├── index.ts
│   │   ├── VideoRenderer.tsx
│   │   └── ...
│   ├── package.json
│   └── README.md
├── image-viewer/
│   └── ...
└── charts/
    └── ...
```

### manifest.json 示例

```json
{
  "id": "com.natsclient.video-player",
  "name": "Video Player",
  "version": "1.0.0",
  "description": "播放视频流消息",
  "author": "NatsClient Team",
  "main": "index.js",
  "icon": "icon.png",
  "capabilities": {
    "messageRenderers": [
      {
        "subjectPattern": "video.*",
        "priority": 100
      }
    ]
  },
  "settings": {
    "autoPlay": {
      "type": "boolean",
      "default": false,
      "title": "自动播放"
    },
    "volume": {
      "type": "number",
      "default": 0.5,
      "title": "默认音量",
      "min": 0,
      "max": 1
    }
  }
}
```

## 4. 插件管理器

```typescript
class PluginManager {
  private plugins: Map<string, PluginInstance>
  private messageHandlers: Map<string, MessageHandlerEntry[]>
  private messageRenderers: MessageRendererEntry[]
  private publishInterceptors: PublishInterceptorEntry[]
  
  // 加载插件
  async loadPlugin(pluginPath: string): Promise<void>
  
  // 卸载插件
  async unloadPlugin(pluginId: string): Promise<void>
  
  // 激活插件
  async activatePlugin(pluginId: string): Promise<void>
  
  // 停用插件
  async deactivatePlugin(pluginId: string): Promise<void>
  
  // 获取所有插件
  getPlugins(): PluginInfo[]
  
  // 处理消息
  handleMessage(message: NatsMessage, context: MessageContext): Promise<boolean>
  
  // 获取消息渲染器
  getMessageRenderer(subject: string): MessageRendererComponent | null
  
  // 执行发布拦截
  interceptPublish(options: PublishOptions): Promise<PublishOptions | null>
}
```

## 5. 使用示例

### 5.1 视频播放器插件

```typescript
// plugins/video-player/src/index.ts
import type { NatsClientPlugin, PluginContext } from '@natsclient/plugin-api'
import { VideoRenderer } from './VideoRenderer'

const plugin: NatsClientPlugin = {
  id: 'com.natsclient.video-player',
  name: 'Video Player',
  version: '1.0.0',
  description: '播放视频流消息',
  author: 'NatsClient Team',
  
  capabilities: {
    messageRenderers: [
      {
        subjectPattern: 'video.*',
        priority: 100,
        renderer: VideoRenderer
      }
    ]
  },
  
  activate: (context: PluginContext) => {
    context.logger.info('Video Player plugin activated')
    
    // 注册命令
    context.commands.register('video-player.toggle-mute', () => {
      // 切换静音
    })
  },
  
  deactivate: () => {
    console.log('Video Player plugin deactivated')
  }
}

export default plugin
```

### 5.2 视频渲染器组件

```typescript
// plugins/video-player/src/VideoRenderer.tsx
import React, { useRef, useEffect } from 'react'
import type { MessageRendererProps } from '@natsclient/plugin-api'

export const VideoRenderer: React.FC<MessageRendererProps> = ({ 
  message, 
  isPreview 
}) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  
  useEffect(() => {
    if (videoRef.current && message.payload) {
      // 处理视频数据
      const blob = new Blob([message.payload], { type: 'video/mp4' })
      videoRef.current.src = URL.createObjectURL(blob)
    }
  }, [message.payload])
  
  if (isPreview) {
    return (
      <div className="video-preview">
        <span>🎬 视频消息</span>
      </div>
    )
  }
  
  return (
    <div className="video-container">
      <video 
        ref={videoRef} 
        controls 
        autoPlay={false}
        style={{ maxWidth: '100%' }}
      />
    </div>
  )
}
```

## 6. 安全考虑

### 6.1 插件沙箱

- 插件运行在隔离的 JavaScript 上下文中
- 插件只能通过 API 访问主程序功能
- 插件不能直接访问文件系统（需要通过 API）

### 6.2 权限系统

```typescript
interface PluginPermissions {
  // 网络访问
  network?: boolean
  
  // 文件系统访问
  filesystem?: 'read' | 'write' | 'read-write'
  
  // 订阅操作
  subscriptions?: boolean
  
  // 发布操作
  publishing?: boolean
  
  // 系统命令
  systemCommands?: boolean
}
```

### 6.3 插件签名

- 官方插件需要签名验证
- 第三方插件需要用户确认

## 7. 实现计划

### Phase 1: 核心框架
- [ ] 插件接口定义
- [ ] 插件管理器
- [ ] 插件上下文 API
- [ ] 消息渲染器机制

### Phase 2: UI 集成
- [ ] 插件设置页面
- [ ] 插件市场 UI
- [ ] 消息渲染器集成到订阅面板

### Phase 3: 开发者支持
- [ ] 插件开发文档
- [ ] 插件脚手架工具
- [ ] 插件 API 类型定义包

### Phase 4: 生态建设
- [ ] 官方插件：视频播放器
- [ ] 官方插件：图片查看器
- [ ] 官方插件：JSON 格式化器
- [ ] 官方插件：图表渲染器

## 8. 文件结构

```
src/
├── plugins/
│   ├── types.ts              # 插件类型定义
│   ├── PluginManager.ts      # 插件管理器
│   ├── PluginContext.ts      # 插件上下文实现
│   ├── PluginSandbox.ts      # 插件沙箱
│   ├── PluginLoader.ts       # 插件加载器
│   └── builtin/              # 内置插件
│       ├── json-formatter/
│       └── image-viewer/
├── components/
│   ├── PluginSettings.tsx    # 插件设置页面
│   ├── PluginMarket.tsx      # 插件市场
│   └── MessageRenderer.tsx   # 消息渲染器容器
└── stores/
    └── pluginStore.ts        # 插件状态管理
```
