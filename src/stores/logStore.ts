import { create } from 'zustand'
import { useSettingsStore } from './settingsStore'
import i18n from '../i18n'

export interface LogEntry {
  id: string
  timestamp: Date
  level: 'debug' | 'info' | 'warn' | 'error'
  message: string
}

interface LogStore {
  logs: LogEntry[]
  addLog: (level: LogEntry['level'], message: string) => void
  clearLogs: () => void
}

const translateLogMessage = (message: string): string => {
  if (message === 'JetStream not available') {
    return i18n.t('logs.jetStreamNotAvailable')
  }
  
  if (message.startsWith('Status monitor error:')) {
    const detail = message.replace('Status monitor error:', '').trim()
    return `${i18n.t('logs.statusMonitorError')}: ${detail}`
  }
  
  if (message.startsWith('Connection update:')) {
    const detail = message.replace('Connection update:', '').trim()
    return `${i18n.t('logs.connectionUpdate')}: ${detail}`
  }
  
  if (message.startsWith('Failed to unsubscribe')) {
    const detail = message.replace(/Failed to unsubscribe[^:]*:/, '').trim()
    return `${i18n.t('logs.unsubscribeFailed')}: ${detail}`
  }
  
  if (message.startsWith('Error during disconnect:')) {
    const detail = message.replace('Error during disconnect:', '').trim()
    return `${i18n.t('logs.disconnectError')}: ${detail}`
  }
  
  if (message === 'Unknown error') {
    return i18n.t('logs.unknownError')
  }
  
  return message
}

export const useLogStore = create<LogStore>((set) => ({
  logs: [],

  addLog: (level, message) => {
    const translatedMessage = translateLogMessage(message)
    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      level,
      message: translatedMessage
    }
    set((state) => {
      const maxLogs = useSettingsStore.getState().maxLogs
      const updated = [...state.logs, entry]
      if (updated.length > maxLogs) {
        updated.splice(0, updated.length - maxLogs)
      }
      return { logs: updated }
    })
  },

  clearLogs: () => {
    set({ logs: [] })
  }
}))

window.nats.onLog((data) => {
  useLogStore.getState().addLog(data.level as LogEntry['level'], data.message)
})
