import { create } from 'zustand'

export interface LogEntry {
  id: string
  timestamp: Date
  level: 'debug' | 'info' | 'warn' | 'error'
  message: string
}

interface LogStore {
  logs: LogEntry[]
  maxLogs: number
  addLog: (level: LogEntry['level'], message: string) => void
  clearLogs: () => void
  setMaxLogs: (max: number) => void
}

export const useLogStore = create<LogStore>((set) => ({
  logs: [],
  maxLogs: 500,

  addLog: (level, message) => {
    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      level,
      message
    }
    set((state) => {
      const updated = [...state.logs, entry]
      if (updated.length > state.maxLogs) {
        updated.splice(0, updated.length - state.maxLogs)
      }
      return { logs: updated }
    })
  },

  clearLogs: () => {
    set({ logs: [] })
  },

  setMaxLogs: (max) => {
    set({ maxLogs: max })
  }
}))

window.nats.onLog((data) => {
  useLogStore.getState().addLog(data.level as LogEntry['level'], data.message)
})
