import { create } from 'zustand'
import { pluginManager } from '../plugins/PluginManager'
import type { PluginInfo, NatsClientPlugin } from '../plugins/types'

interface PluginStore {
  plugins: PluginInfo[]
  loading: boolean
  
  loadPlugins: () => Promise<void>
  activatePlugin: (pluginId: string) => Promise<void>
  deactivatePlugin: (pluginId: string) => Promise<void>
  registerPlugin: (plugin: NatsClientPlugin) => Promise<void>
  unregisterPlugin: (pluginId: string) => Promise<void>
}

export const usePluginStore = create<PluginStore>((set, get) => ({
  plugins: [],
  loading: false,

  loadPlugins: async () => {
    set({ loading: true })
    try {
      const plugins = pluginManager.getPlugins()
      set({ plugins, loading: false })
    } catch (error) {
      console.error('Failed to load plugins:', error)
      set({ loading: false })
    }
  },

  activatePlugin: async (pluginId: string) => {
    try {
      await pluginManager.activatePlugin(pluginId)
      const plugins = pluginManager.getPlugins()
      set({ plugins })
    } catch (error) {
      console.error(`Failed to activate plugin ${pluginId}:`, error)
      throw error
    }
  },

  deactivatePlugin: async (pluginId: string) => {
    try {
      await pluginManager.deactivatePlugin(pluginId)
      const plugins = pluginManager.getPlugins()
      set({ plugins })
    } catch (error) {
      console.error(`Failed to deactivate plugin ${pluginId}:`, error)
      throw error
    }
  },

  registerPlugin: async (plugin: NatsClientPlugin) => {
    try {
      await pluginManager.registerPlugin(plugin)
      const plugins = pluginManager.getPlugins()
      set({ plugins })
    } catch (error) {
      console.error(`Failed to register plugin ${plugin.id}:`, error)
      throw error
    }
  },

  unregisterPlugin: async (pluginId: string) => {
    try {
      await pluginManager.unregisterPlugin(pluginId)
      const plugins = pluginManager.getPlugins()
      set({ plugins })
    } catch (error) {
      console.error(`Failed to unregister plugin ${pluginId}:`, error)
      throw error
    }
  }
}))
