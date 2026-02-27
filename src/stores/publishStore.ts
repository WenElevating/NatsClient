import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'

export interface PublishTask {
  id: string
  subject: string
  payload: string
  headers?: Record<string, string>
  interval: number
  targetCount: number | null
  currentCount: number
  successCount: number
  failCount: number
  totalBytes: number
  isRunning: boolean
  startTime: Date | null
  intervalId: NodeJS.Timeout | null
}

interface PublishStore {
  tasks: PublishTask[]
  addTask: (config: Omit<PublishTask, 'id' | 'currentCount' | 'successCount' | 'failCount' | 'totalBytes' | 'isRunning' | 'startTime' | 'intervalId'>) => string
  updateTask: (id: string, config: Partial<Pick<PublishTask, 'subject' | 'payload' | 'headers' | 'interval' | 'targetCount'>>) => void
  removeTask: (id: string) => void
  startTask: (id: string) => void
  stopTask: (id: string) => void
  updateTaskStats: (id: string, success: boolean, bytes?: number) => void
  clearAllTasks: () => void
  getTaskRate: (id: string) => number
}

export const usePublishStore = create<PublishStore>((set, get) => ({
  tasks: [],

  addTask: (config) => {
    const id = uuidv4()
    const task: PublishTask = {
      id,
      ...config,
      currentCount: 0,
      successCount: 0,
      failCount: 0,
      totalBytes: 0,
      isRunning: false,
      startTime: null,
      intervalId: null
    }
    set((state) => ({
      tasks: [...state.tasks, task]
    }))
    return id
  },

  updateTask: (id, config) => {
    set((state) => ({
      tasks: state.tasks.map(t => 
        t.id === id 
          ? { ...t, ...config }
          : t
      )
    }))
  },

  removeTask: (id) => {
    const task = get().tasks.find(t => t.id === id)
    if (task?.intervalId) {
      clearInterval(task.intervalId)
    }
    set((state) => ({
      tasks: state.tasks.filter(t => t.id !== id)
    }))
  },

  startTask: (id) => {
    const task = get().tasks.find(t => t.id === id)
    if (!task || task.isRunning) return

    const doPublish = async () => {
      const currentTask = get().tasks.find(t => t.id === id)
      if (!currentTask) return

      if (currentTask.targetCount && currentTask.currentCount >= currentTask.targetCount) {
        get().stopTask(id)
        return
      }

      try {
        await window.nats.publish({
          subject: currentTask.subject,
          payload: currentTask.payload,
          headers: currentTask.headers
        })
        set((state) => ({
          tasks: state.tasks.map(t => 
            t.id === id 
              ? { 
                  ...t, 
                  currentCount: t.currentCount + 1,
                  successCount: t.successCount + 1,
                  totalBytes: t.totalBytes + new TextEncoder().encode(currentTask.payload).length
                }
              : t
          )
        }))
      } catch {
        set((state) => ({
          tasks: state.tasks.map(t => 
            t.id === id 
              ? { ...t, failCount: t.failCount + 1 }
              : t
          )
        }))
      }
    }

    doPublish()
    
    const intervalId = setInterval(doPublish, task.interval)
    
    set((state) => ({
      tasks: state.tasks.map(t => 
        t.id === id 
          ? { ...t, isRunning: true, startTime: new Date(), intervalId }
          : t
      )
    }))
  },

  stopTask: (id) => {
    const task = get().tasks.find(t => t.id === id)
    if (task?.intervalId) {
      clearInterval(task.intervalId)
    }
    set((state) => ({
      tasks: state.tasks.map(t => 
        t.id === id 
          ? { ...t, isRunning: false, intervalId: null }
          : t
      )
    }))
  },

  updateTaskStats: (id, success, bytes = 0) => {
    set((state) => ({
      tasks: state.tasks.map(t => {
        if (t.id !== id) return t
        return {
          ...t,
          successCount: success ? t.successCount + 1 : t.successCount,
          failCount: success ? t.failCount : t.failCount + 1,
          totalBytes: success ? t.totalBytes + bytes : t.totalBytes
        }
      })
    }))
  },

  clearAllTasks: () => {
    const { tasks } = get()
    tasks.forEach(task => {
      if (task.intervalId) {
        clearInterval(task.intervalId)
      }
    })
    set({ tasks: [] })
  },

  getTaskRate: (id) => {
    const task = get().tasks.find(t => t.id === id)
    if (!task || !task.startTime || task.successCount === 0) return 0
    const elapsed = (Date.now() - task.startTime.getTime()) / 1000
    return elapsed > 0 ? task.successCount / elapsed : 0
  }
}))
