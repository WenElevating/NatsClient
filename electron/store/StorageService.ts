import { app, safeStorage } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import type { ConnectionConfig, AppSettings } from '../../src/types/nats'

const CONNECTIONS_FILE = 'connections.json'
const SETTINGS_FILE = 'settings.json'
const ENCRYPTED_PREFIX = 'enc:'

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

  private encryptValue(value: string): string {
    if (!value) return value
    try {
      if (safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(value)
        return ENCRYPTED_PREFIX + encrypted.toString('base64')
      }
    } catch (error) {
      console.error('Failed to encrypt value:', error)
    }
    return value
  }

  private decryptValue(value: string): string {
    if (!value || !value.startsWith(ENCRYPTED_PREFIX)) return value
    try {
      if (safeStorage.isEncryptionAvailable()) {
        const encrypted = Buffer.from(value.slice(ENCRYPTED_PREFIX.length), 'base64')
        return safeStorage.decryptString(encrypted)
      }
    } catch (error) {
      console.error('Failed to decrypt value:', error)
    }
    return ''
  }

  private encryptConnection(connection: ConnectionConfig): ConnectionConfig {
    const encrypted = { ...connection }
    if (encrypted.password) {
      encrypted.password = this.encryptValue(encrypted.password)
    }
    if (encrypted.token) {
      encrypted.token = this.encryptValue(encrypted.token)
    }
    return encrypted
  }

  private decryptConnection(connection: ConnectionConfig): ConnectionConfig {
    const decrypted = { ...connection }
    if (decrypted.password && decrypted.password.startsWith(ENCRYPTED_PREFIX)) {
      decrypted.password = this.decryptValue(decrypted.password)
    }
    if (decrypted.token && decrypted.token.startsWith(ENCRYPTED_PREFIX)) {
      decrypted.token = this.decryptValue(decrypted.token)
    }
    return decrypted
  }

  loadConnections(): ConnectionConfig[] {
    try {
      if (fs.existsSync(this.connectionsPath)) {
        const data = fs.readFileSync(this.connectionsPath, 'utf-8')
        const connections: ConnectionConfig[] = JSON.parse(data)
        return connections.map(c => this.decryptConnection(c))
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
      const encryptedConnections = connections.map(c => this.encryptConnection(c))
      fs.writeFileSync(this.connectionsPath, JSON.stringify(encryptedConnections, null, 2))
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
