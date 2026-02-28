import type { 
  NatsClientPlugin, 
  PluginInstance, 
  PluginInfo,
  PluginContext,
  MessageHandler,
  MessageRendererDefinition,
  MessageRendererProps,
  PublishInterceptor
} from './types'
import type { NatsMessage, PublishOptions } from '../types/nats'
import { message } from 'antd'

interface MessageHandlerEntry {
  pattern: RegExp
  handler: MessageHandler
  pluginId: string
}

interface MessageRendererEntry {
  pattern: RegExp
  definition: MessageRendererDefinition
  pluginId: string
}

interface PublishInterceptorEntry {
  pattern: RegExp
  interceptor: PublishInterceptor
  pluginId: string
}

class PluginManagerImpl {
  private plugins: Map<string, PluginInstance> = new Map()
  private messageHandlers: MessageHandlerEntry[] = []
  private messageRenderers: MessageRendererEntry[] = []
  private publishInterceptors: PublishInterceptorEntry[] = []
  private commandRegistry: Map<string, () => void> = new Map()
  private pluginStorage: Map<string, Map<string, any>> = new Map()

  async registerPlugin(plugin: NatsClientPlugin): Promise<void> {
    if (this.plugins.has(plugin.id)) {
      throw new Error(`Plugin ${plugin.id} is already registered`)
    }

    const info: PluginInfo = {
      id: plugin.id,
      name: plugin.name,
      version: plugin.version,
      description: plugin.description,
      author: plugin.author,
      icon: plugin.icon,
      enabled: true,
      active: false,
      hasError: false
    }

    this.plugins.set(plugin.id, { plugin, info })
    this.pluginStorage.set(plugin.id, new Map())
  }

  async unregisterPlugin(pluginId: string): Promise<void> {
    const instance = this.plugins.get(pluginId)
    if (!instance) return

    if (instance.info.active) {
      await this.deactivatePlugin(pluginId)
    }

    this.plugins.delete(pluginId)
    this.pluginStorage.delete(pluginId)
    
    this.messageHandlers = this.messageHandlers.filter(e => e.pluginId !== pluginId)
    this.messageRenderers = this.messageRenderers.filter(e => e.pluginId !== pluginId)
    this.publishInterceptors = this.publishInterceptors.filter(e => e.pluginId !== pluginId)
  }

  async activatePlugin(pluginId: string): Promise<void> {
    const instance = this.plugins.get(pluginId)
    if (!instance) {
      throw new Error(`Plugin ${pluginId} not found`)
    }

    if (instance.info.active) {
      return
    }

    try {
      const { plugin } = instance
      
      if (plugin.capabilities.messageHandlers) {
        for (const def of plugin.capabilities.messageHandlers) {
          this.messageHandlers.push({
            pattern: this.subjectToRegex(def.subjectPattern),
            handler: def.handler,
            pluginId: plugin.id
          })
        }
      }

      if (plugin.capabilities.messageRenderers) {
        for (const def of plugin.capabilities.messageRenderers) {
          this.messageRenderers.push({
            pattern: this.subjectToRegex(def.subjectPattern),
            definition: def,
            pluginId: plugin.id
          })
        }
        this.messageRenderers.sort((a, b) => 
          (b.definition.priority || 0) - (a.definition.priority || 0)
        )
      }

      if (plugin.capabilities.publishInterceptors) {
        for (const def of plugin.capabilities.publishInterceptors) {
          this.publishInterceptors.push({
            pattern: this.subjectToRegex(def.subjectPattern),
            interceptor: def.interceptor,
            pluginId: plugin.id
          })
        }
      }

      const context = this.createPluginContext(plugin)
      instance.context = context

      if (plugin.activate) {
        await plugin.activate(context)
      }

      instance.info.active = true
      instance.info.hasError = false
      instance.info.errorMessage = undefined
    } catch (error) {
      instance.info.hasError = true
      instance.info.errorMessage = error instanceof Error ? error.message : String(error)
      throw error
    }
  }

  async deactivatePlugin(pluginId: string): Promise<void> {
    const instance = this.plugins.get(pluginId)
    if (!instance || !instance.info.active) return

    try {
      if (instance.plugin.deactivate) {
        await instance.plugin.deactivate()
      }

      this.messageHandlers = this.messageHandlers.filter(e => e.pluginId !== pluginId)
      this.messageRenderers = this.messageRenderers.filter(e => e.pluginId !== pluginId)
      this.publishInterceptors = this.publishInterceptors.filter(e => e.pluginId !== pluginId)

      instance.info.active = false
      instance.context = undefined
    } catch (error) {
      instance.info.hasError = true
      instance.info.errorMessage = error instanceof Error ? error.message : String(error)
      throw error
    }
  }

  getPlugins(): PluginInfo[] {
    return Array.from(this.plugins.values()).map(i => ({ ...i.info }))
  }

  getPlugin(pluginId: string): PluginInstance | undefined {
    return this.plugins.get(pluginId)
  }

  async handleMessage(msg: NatsMessage, subscriptionId: string): Promise<boolean> {
    const context = {
      subscriptionId,
      subject: msg.subject,
      timestamp: new Date(msg.timestamp)
    }

    for (const entry of this.messageHandlers) {
      if (entry.pattern.test(msg.subject)) {
        try {
          const result = await entry.handler(msg, context)
          if (result && 'handled' in result && result.handled) {
            return true
          }
        } catch (error) {
          console.error(`Message handler error in plugin ${entry.pluginId}:`, error)
        }
      }
    }

    return false
  }

  getMessageRenderer(subject: string): React.ComponentType<MessageRendererProps> | null {
    for (const entry of this.messageRenderers) {
      if (entry.pattern.test(subject)) {
        return entry.definition.renderer
      }
    }
    return null
  }

  async interceptPublish(options: PublishOptions): Promise<PublishOptions | null> {
    let result: PublishOptions | null = options

    for (const entry of this.publishInterceptors) {
      if (entry.pattern.test(options.subject) && result !== null) {
        try {
          const context = {
            subject: options.subject,
            timestamp: new Date()
          }
          result = await entry.interceptor(result, context)
          if (result === null) {
            return null
          }
        } catch (error) {
          console.error(`Publish interceptor error in plugin ${entry.pluginId}:`, error)
        }
      }
    }

    return result
  }

  private subjectToRegex(subject: string): RegExp {
    const regexPattern = subject
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '[^.]*')
      .replace(/>/g, '.*')
    return new RegExp(`^${regexPattern}$`)
  }

  private createPluginContext(plugin: NatsClientPlugin): PluginContext {
    const storage = this.pluginStorage.get(plugin.id)!
    
    return {
      plugin,
      
      subscriptions: {
        subscribe: async (subject: string) => {
          return window.nats.subscribe(subject)
        },
        unsubscribe: async (subscriptionId: string) => {
          return window.nats.unsubscribe(subscriptionId)
        },
        getActiveSubscriptions: () => {
          return []
        }
      },
      
      publishing: {
        publish: async (options: PublishOptions) => {
          return window.nats.publish(options)
        }
      },
      
      logger: {
        info: (msg, ...args) => console.log(`[${plugin.name}] ${msg}`, ...args),
        warn: (msg, ...args) => console.warn(`[${plugin.name}] ${msg}`, ...args),
        error: (msg, ...args) => console.error(`[${plugin.name}] ${msg}`, ...args)
      },
      
      storage: {
        get: <T>(key: string) => storage.get(key) as T | undefined,
        set: <T>(key: string, value: T) => storage.set(key, value),
        delete: (key: string) => storage.delete(key),
        clear: () => storage.clear()
      },
      
      notifications: {
        success: (msg) => message.success(msg),
        error: (msg) => message.error(msg),
        info: (msg) => message.info(msg),
        warning: (msg) => message.warning(msg)
      },
      
      commands: {
        register: (id: string, handler: () => void) => {
          this.commandRegistry.set(`${plugin.id}:${id}`, handler)
        },
        execute: (id: string) => {
          const handler = this.commandRegistry.get(id)
          if (handler) handler()
        }
      }
    }
  }
}

export const pluginManager = new PluginManagerImpl()
