import { ipcMain } from 'electron'
import { storageService } from '../store/StorageService'
import type { ConnectionConfig, AppSettings } from '../../src/types/nats'

export const STORAGE_CHANNELS = {
  CONNECTIONS_LOAD: 'storage:connections:load',
  CONNECTIONS_SAVE: 'storage:connections:save',
  CONNECTIONS_ADD: 'storage:connections:add',
  CONNECTIONS_DELETE: 'storage:connections:delete',
  SETTINGS_LOAD: 'storage:settings:load',
  SETTINGS_SAVE: 'storage:settings:save',
} as const

export function setupStorageIpcHandlers(): void {
  ipcMain.handle(STORAGE_CHANNELS.CONNECTIONS_LOAD, () => {
    return storageService.loadConnections()
  })

  ipcMain.handle(STORAGE_CHANNELS.CONNECTIONS_SAVE, (_event, connections: ConnectionConfig[]) => {
    storageService.saveConnections(connections)
    return { success: true }
  })

  ipcMain.handle(STORAGE_CHANNELS.CONNECTIONS_ADD, (_event, connection: ConnectionConfig) => {
    const connections = storageService.addConnection(connection)
    return connections
  })

  ipcMain.handle(STORAGE_CHANNELS.CONNECTIONS_DELETE, (_event, id: string) => {
    const connections = storageService.deleteConnection(id)
    return connections
  })

  ipcMain.handle(STORAGE_CHANNELS.SETTINGS_LOAD, () => {
    return storageService.loadSettings()
  })

  ipcMain.handle(STORAGE_CHANNELS.SETTINGS_SAVE, (_event, settings: AppSettings) => {
    storageService.saveSettings(settings)
    return { success: true }
  })
}
