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
  logLevel: 'info'
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
      logLevel: updated.logLevel
    })
    set(updated)
  }
}))
