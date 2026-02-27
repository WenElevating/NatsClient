import { create } from 'zustand'
import type { ConnectionConfig, ConnectionState } from '../types/nats'

interface ConnectionStore {
  connections: ConnectionConfig[]
  activeConnection: ConnectionConfig | null
  connectionState: ConnectionState
  loadConnections: () => Promise<void>
  addConnection: (connection: ConnectionConfig) => Promise<void>
  deleteConnection: (id: string) => Promise<void>
  setActiveConnection: (connection: ConnectionConfig | null) => void
  setConnectionState: (state: ConnectionState) => void
  connect: (config: ConnectionConfig) => Promise<boolean>
  disconnect: () => Promise<void>
}

export const useConnectionStore = create<ConnectionStore>((set, get) => ({
  connections: [],
  activeConnection: null,
  connectionState: { status: 'disconnected' },

  loadConnections: async () => {
    const connections = await window.nats.loadConnections()
    set({ connections })
  },

  addConnection: async (connection) => {
    const connections = await window.nats.addConnection(connection)
    set({ connections })
  },

  deleteConnection: async (id) => {
    const connections = await window.nats.deleteConnection(id)
    const { activeConnection } = get()
    if (activeConnection?.id === id) {
      await get().disconnect()
    }
    set({ connections })
  },

  setActiveConnection: (connection) => {
    set({ activeConnection: connection })
  },

  setConnectionState: (state) => {
    set({ connectionState: state })
  },

  connect: async (config) => {
    set({ connectionState: { status: 'connecting' } })
    const result = await window.nats.connect(config)
    if (result.success) {
      set({ 
        activeConnection: config,
        connectionState: { status: 'connected', lastConnected: new Date() }
      })
      return true
    } else {
      set({ 
        connectionState: { status: 'error', error: result.error } 
      })
      return false
    }
  },

  disconnect: async () => {
    await window.nats.disconnect()
    set({ 
      connectionState: { status: 'disconnected' },
      activeConnection: null
    })
  }
}))

window.nats.onConnectionState((state) => {
  useConnectionStore.getState().setConnectionState(state)
})
