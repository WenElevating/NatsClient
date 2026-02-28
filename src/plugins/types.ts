import type { NatsMessage, PublishOptions, Subscription } from '../types/nats'

export interface PluginPermissions {
  network?: boolean
  filesystem?: 'read' | 'write' | 'read-write' | false
  subscriptions?: boolean
  publishing?: boolean
  systemCommands?: boolean
}

export interface SandboxOptions {
  permissions: PluginPermissions
  timeout?: number
}

export interface NatsClientPlugin {
  id: string
  name: string
  version: string
  description: string
  author: string
  icon?: string
  capabilities: PluginCapabilities
  activate?: (context: PluginContext) => void | Promise<void>
  deactivate?: () => void | Promise<void>
}

export interface PluginCapabilities {
  messageHandlers?: MessageHandlerDefinition[]
  messageRenderers?: MessageRendererDefinition[]
  publishInterceptors?: PublishInterceptorDefinition[]
  panels?: PanelDefinition[]
  settings?: SettingsDefinition
}

export interface MessageHandlerDefinition {
  subjectPattern: string
  handler: MessageHandler
}

export type MessageHandler = (
  message: NatsMessage, 
  context: MessageContext
) => void | { handled: true; result?: any } | Promise<void | { handled: true; result?: any }>

export interface MessageContext {
  subscriptionId: string
  subject: string
  timestamp: Date
}

export interface MessageRendererDefinition {
  subjectPattern: string
  priority?: number
  renderer: React.ComponentType<MessageRendererProps>
}

export interface MessageRendererProps {
  message: NatsMessage
  subscriptionId: string
  isPreview: boolean
  onViewDetail?: () => void
}

export interface PublishInterceptorDefinition {
  subjectPattern: string
  interceptor: PublishInterceptor
}

export type PublishInterceptor = (
  options: PublishOptions, 
  context: PublishContext
) => PublishOptions | null | Promise<PublishOptions | null>

export interface PublishContext {
  subject: string
  timestamp: Date
}

export interface PanelDefinition {
  id: string
  title: string
  icon: React.ReactNode
  position: 'tab' | 'sidebar' | 'bottom'
  component: React.ComponentType
}

export interface SettingsDefinition {
  [key: string]: SettingDefinition
}

export interface SettingDefinition {
  type: 'boolean' | 'number' | 'string' | 'select'
  default: any
  title: string
  description?: string
  min?: number
  max?: number
  options?: { label: string; value: any }[]
}

export interface PluginContext {
  plugin: NatsClientPlugin
  
  subscriptions: {
    subscribe: (subject: string) => Promise<{ success: boolean; subscriptionId?: string; error?: string }>
    unsubscribe: (subscriptionId: string) => Promise<{ success: boolean; error?: string }>
    getActiveSubscriptions: () => Subscription[]
  }
  
  publishing: {
    publish: (options: PublishOptions) => Promise<{ success: boolean; error?: string }>
  }
  
  logger: {
    info: (message: string, ...args: any[]) => void
    warn: (message: string, ...args: any[]) => void
    error: (message: string, ...args: any[]) => void
  }
  
  storage: {
    get: <T>(key: string) => T | undefined
    set: <T>(key: string, value: T) => void
    delete: (key: string) => void
    clear: () => void
  }
  
  notifications: {
    success: (message: string) => void
    error: (message: string) => void
    info: (message: string) => void
    warning: (message: string) => void
  }
  
  commands: {
    register: (id: string, handler: () => void) => void
    execute: (id: string) => void
  }
}

export interface PluginInfo {
  id: string
  name: string
  version: string
  description: string
  author: string
  icon?: string
  enabled: boolean
  active: boolean
  hasError: boolean
  errorMessage?: string
}

export interface PluginInstance {
  plugin: NatsClientPlugin
  info: PluginInfo
  context?: PluginContext
}

export type MessageRendererComponent = React.ComponentType<MessageRendererProps>
