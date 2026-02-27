import { create } from 'zustand'
import type { AppSettings } from '../types/nats'

interface SettingsStore extends AppSettings {
  loadSettings: () => Promise<void>
  updateSettings: (settings: Partial<AppSettings>) => Promise<void>
}

const defaultSettings: AppSettings = {
  maxMessagesPerSubscription: 1000,
  autoFormatJson: true,
  theme: 'dark',
  logLevel: 'info',
  defaultServer: 'localhost',
  defaultPort: 4222,
  defaultTimeout: 5000,
  maxLogs: 500,
  messageDisplayLength: 50
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  ...defaultSettings,

  loadSettings: async () => {
    const settings = await window.nats.loadSettings()
    set({ ...defaultSettings, ...settings })
  },

  updateSettings: async (newSettings) => {
    const updated = { ...get(), ...newSettings }
    await window.nats.saveSettings({
      maxMessagesPerSubscription: updated.maxMessagesPerSubscription,
      autoFormatJson: updated.autoFormatJson,
      theme: updated.theme,
      logLevel: updated.logLevel,
      defaultServer: updated.defaultServer,
      defaultPort: updated.defaultPort,
      defaultTimeout: updated.defaultTimeout,
      maxLogs: updated.maxLogs,
      messageDisplayLength: updated.messageDisplayLength
    })
    set(updated)
  }
}))
