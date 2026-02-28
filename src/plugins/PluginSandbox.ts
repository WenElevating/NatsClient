import type { NatsClientPlugin, PluginContext, PluginPermissions, SandboxOptions } from './types'

const DEFAULT_PERMISSIONS: PluginPermissions = {
  network: false,
  filesystem: false,
  subscriptions: true,
  publishing: true,
  systemCommands: false
}

class PluginSandbox {
  private pluginId: string
  private permissions: PluginPermissions
  private timeout: number
  private rateLimits: Map<string, { count: number; resetTime: number }> = new Map()

  constructor(pluginId: string, options?: Partial<SandboxOptions>) {
    this.pluginId = pluginId
    this.permissions = { ...DEFAULT_PERMISSIONS, ...options?.permissions }
    this.timeout = options?.timeout || 5000
  }

  validatePermission(permission: keyof PluginPermissions): boolean {
    return this.permissions[permission] === true
  }

  checkRateLimit(action: string, maxCalls: number = 100, windowMs: number = 60000): boolean {
    const now = Date.now()
    const limit = this.rateLimits.get(action)
    
    if (!limit || now > limit.resetTime) {
      this.rateLimits.set(action, { count: 1, resetTime: now + windowMs })
      return true
    }
    
    if (limit.count >= maxCalls) {
      console.warn(`[${this.pluginId}] Rate limit exceeded for action: ${action}`)
      return false
    }
    
    limit.count++
    return true
  }

  async executeSandboxed<T>(fn: () => T | Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Plugin ${this.pluginId} execution timed out`))
      }, this.timeout)

      Promise.resolve()
        .then(() => fn())
        .then(result => {
          clearTimeout(timeoutId)
          resolve(result)
        })
        .catch(error => {
          clearTimeout(timeoutId)
          reject(error)
        })
    })
  }

  validatePlugin(plugin: NatsClientPlugin): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    if (!plugin.id || typeof plugin.id !== 'string') {
      errors.push('Plugin id is required and must be a string')
    } else if (!plugin.id.match(/^[\w.-]+$/)) {
      errors.push('Plugin id must contain only alphanumeric characters, dots, and hyphens')
    }

    if (!plugin.name || typeof plugin.name !== 'string') {
      errors.push('Plugin name is required')
    }

    if (!plugin.version || !plugin.version.match(/^\d+\.\d+\.\d+$/)) {
      errors.push('Plugin version must be in semver format (e.g., 1.0.0)')
    }

    if (!plugin.author || typeof plugin.author !== 'string') {
      errors.push('Plugin author is required')
    }

    if (plugin.capabilities) {
      if (plugin.capabilities.messageRenderers) {
        for (const renderer of plugin.capabilities.messageRenderers) {
          if (!renderer.subjectPattern || typeof renderer.subjectPattern !== 'string') {
            errors.push('Message renderer must have a valid subjectPattern')
          }
          if (!renderer.renderer || typeof renderer.renderer !== 'function') {
            errors.push('Message renderer must have a valid renderer function')
          }
        }
      }

      if (plugin.capabilities.messageHandlers) {
        for (const handler of plugin.capabilities.messageHandlers) {
          if (!handler.subjectPattern || typeof handler.subjectPattern !== 'string') {
            errors.push('Message handler must have a valid subjectPattern')
          }
          if (!handler.handler || typeof handler.handler !== 'function') {
            errors.push('Message handler must have a valid handler function')
          }
        }
      }

      if (plugin.capabilities.publishInterceptors) {
        for (const interceptor of plugin.capabilities.publishInterceptors) {
          if (!interceptor.subjectPattern || typeof interceptor.subjectPattern !== 'string') {
            errors.push('Publish interceptor must have a valid subjectPattern')
          }
          if (!interceptor.interceptor || typeof interceptor.interceptor !== 'function') {
            errors.push('Publish interceptor must have a valid interceptor function')
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }

  createSandboxedContext(context: PluginContext): PluginContext {
    const sandboxedContext: PluginContext = {
      ...context,
      
      subscriptions: {
        subscribe: async (subject: string) => {
          if (!this.validatePermission('subscriptions')) {
            throw new Error(`Plugin ${this.pluginId} does not have subscriptions permission`)
          }
          if (!this.checkRateLimit('subscribe', 50)) {
            throw new Error('Rate limit exceeded for subscribe')
          }
          return context.subscriptions.subscribe(subject)
        },
        unsubscribe: async (subscriptionId: string) => {
          if (!this.validatePermission('subscriptions')) {
            throw new Error(`Plugin ${this.pluginId} does not have subscriptions permission`)
          }
          return context.subscriptions.unsubscribe(subscriptionId)
        },
        getActiveSubscriptions: () => {
          return context.subscriptions.getActiveSubscriptions()
        }
      },
      
      publishing: {
        publish: async (options) => {
          if (!this.validatePermission('publishing')) {
            throw new Error(`Plugin ${this.pluginId} does not have publishing permission`)
          }
          if (!this.checkRateLimit('publish', 100)) {
            throw new Error('Rate limit exceeded for publish')
          }
          return context.publishing.publish(options)
        }
      },
      
      logger: {
        info: (msg, ...args) => {
          if (!this.checkRateLimit('log', 500)) return
          context.logger.info(msg, ...args)
        },
        warn: (msg, ...args) => {
          if (!this.checkRateLimit('log', 500)) return
          context.logger.warn(msg, ...args)
        },
        error: (msg, ...args) => {
          context.logger.error(msg, ...args)
        }
      },
      
      storage: {
        get: (key) => {
          this.validateStorageKey(key)
          return context.storage.get(key)
        },
        set: (key, value) => {
          this.validateStorageKey(key)
          if (!this.checkRateLimit('storage', 200)) {
            throw new Error('Rate limit exceeded for storage operations')
          }
          context.storage.set(key, value)
        },
        delete: (key) => {
          this.validateStorageKey(key)
          context.storage.delete(key)
        },
        clear: () => {
          context.storage.clear()
        }
      },
      
      notifications: {
        success: (msg) => {
          if (!this.checkRateLimit('notifications', 20)) return
          context.notifications.success(msg)
        },
        error: (msg) => {
          context.notifications.error(msg)
        },
        info: (msg) => {
          if (!this.checkRateLimit('notifications', 20)) return
          context.notifications.info(msg)
        },
        warning: (msg) => {
          if (!this.checkRateLimit('notifications', 20)) return
          context.notifications.warning(msg)
        }
      },
      
      commands: {
        register: (id, handler) => {
          if (!this.validatePermission('systemCommands')) {
            console.warn(`Plugin ${this.pluginId} tried to register command without permission`)
            return
          }
          context.commands.register(id, handler)
        },
        execute: (id) => {
          context.commands.execute(id)
        }
      }
    }

    return sandboxedContext
  }

  private validateStorageKey(key: string): void {
    if (!key || typeof key !== 'string') {
      throw new Error('Storage key must be a non-empty string')
    }
    if (key.length > 256) {
      throw new Error('Storage key must not exceed 256 characters')
    }
    if (!key.match(/^[\w.-]+$/)) {
      throw new Error('Storage key must contain only alphanumeric characters, dots, and hyphens')
    }
  }
}

export { PluginSandbox, DEFAULT_PERMISSIONS }
export type { SandboxOptions, PluginPermissions }
