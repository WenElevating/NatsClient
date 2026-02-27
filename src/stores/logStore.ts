import { create } from 'zustand'
import { useSettingsStore } from './settingsStore'

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

export const useLogStore = create<LogStore>((set) => ({
  logs: [],

  addLog: (level, message) => {
    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      level,
      message
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
