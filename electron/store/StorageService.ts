import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import type { ConnectionConfig, AppSettings } from '../../src/types/nats'

const CONNECTIONS_FILE = 'connections.json'
const SETTINGS_FILE = 'settings.json'

function getStoragePath(): string {
  const userDataPath = app.getPath('userData')
  return userDataPath
}

export class StorageService {
  private connectionsPath: string
  private settingsPath: string

  constructor() {
    const storagePath = getStoragePath()
    this.connectionsPath = path.join(storagePath, CONNECTIONS_FILE)
    this.settingsPath = path.join(storagePath, SETTINGS_FILE)
  }

  loadConnections(): ConnectionConfig[] {
    try {
      if (fs.existsSync(this.connectionsPath)) {
        const data = fs.readFileSync(this.connectionsPath, 'utf-8')
        return JSON.parse(data)
      }
    } catch (error) {
      console.error('Failed to load connections:', error)
    }
    return []
  }

  saveConnections(connections: ConnectionConfig[]): void {
    try {
      const storagePath = getStoragePath()
      if (!fs.existsSync(storagePath)) {
        fs.mkdirSync(storagePath, { recursive: true })
      }
      fs.writeFileSync(this.connectionsPath, JSON.stringify(connections, null, 2))
    } catch (error) {
      console.error('Failed to save connections:', error)
    }
  }

  addConnection(connection: ConnectionConfig): ConnectionConfig[] {
    const connections = this.loadConnections()
    const existingIndex = connections.findIndex(c => c.id === connection.id)
    if (existingIndex >= 0) {
      connections[existingIndex] = connection
    } else {
      connections.push(connection)
    }
    this.saveConnections(connections)
    return connections
  }

  deleteConnection(id: string): ConnectionConfig[] {
    const connections = this.loadConnections()
    const filtered = connections.filter(c => c.id !== id)
    this.saveConnections(filtered)
    return filtered
  }

  loadSettings(): AppSettings {
    try {
      if (fs.existsSync(this.settingsPath)) {
        const data = fs.readFileSync(this.settingsPath, 'utf-8')
        return JSON.parse(data)
      }
    } catch (error) {
      console.error('Failed to load settings:', error)
    }
    return {
      maxMessagesPerSubscription: 1000,
      autoFormatJson: true,
      theme: 'dark',
      logLevel: 'info'
    }
  }

  saveSettings(settings: AppSettings): void {
    try {
      const storagePath = getStoragePath()
      if (!fs.existsSync(storagePath)) {
        fs.mkdirSync(storagePath, { recursive: true })
      }
      fs.writeFileSync(this.settingsPath, JSON.stringify(settings, null, 2))
    } catch (error) {
      console.error('Failed to save settings:', error)
    }
  }
}

export const storageService = new StorageService()
