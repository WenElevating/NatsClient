import { create } from 'zustand'
import type { NatsMessage, Subscription } from '../types/nats'
import { useSettingsStore } from './settingsStore'

interface SubscriptionStore {
  subscriptions: Subscription[]
  messages: Map<string, NatsMessage[]>
  messageCounters: Record<string, number>
  pausedSubscriptions: Set<string>
  searchFilter: string
  savedSubjects: string[]

  addSubscription: (subscription: Subscription) => void
  removeSubscription: (id: string) => void
  updateSubscription: (id: string, updates: Partial<Subscription>) => void
  addMessage: (subscriptionId: string, message: NatsMessage) => void
  clearMessages: (subscriptionId: string) => void
  togglePause: (subscriptionId: string) => void
  setSearchFilter: (filter: string) => void
  saveSubject: (subject: string) => void
  removeSavedSubject: (subject: string) => void
}

const pendingMessages: Map<string, NatsMessage[]> = new Map()
const pendingCounters: Map<string, number> = new Map()
let flushTimeout: ReturnType<typeof setTimeout> | null = null

const flushPendingUpdates = () => {
  if (pendingMessages.size === 0 && pendingCounters.size === 0) return
  
  useSubscriptionStore.setState((state) => {
    const newMessages = new Map(state.messages)
    const newCounters = { ...state.messageCounters }
    
    pendingMessages.forEach((msgs, id) => {
      const existing = newMessages.get(id) || []
      const maxMessages = useSettingsStore.getState().maxMessagesPerSubscription
      const updated = [...existing, ...msgs]
      if (updated.length > maxMessages) {
        updated.splice(0, updated.length - maxMessages)
      }
      newMessages.set(id, updated)
    })
    
    pendingCounters.forEach((count, id) => {
      newCounters[id] = (newCounters[id] || 0) + count
    })
    
    pendingMessages.clear()
    pendingCounters.clear()
    
    return { 
      messages: newMessages,
      messageCounters: newCounters
    }
  })
}

const scheduleFlush = () => {
  if (flushTimeout) return
  flushTimeout = setTimeout(() => {
    flushTimeout = null
    flushPendingUpdates()
  }, 100)
}

export const useSubscriptionStore = create<SubscriptionStore>((set, get) => ({
  subscriptions: [],
  messages: new Map(),
  messageCounters: {},
  pausedSubscriptions: new Set(),
  searchFilter: '',
  savedSubjects: [],

  addSubscription: (subscription) => {
    set((state) => {
      if (state.subscriptions.some(s => s.id === subscription.id)) {
        return state
      }
      const newMessages = new Map(state.messages)
      newMessages.set(subscription.id, [])
      return {
        subscriptions: [...state.subscriptions, subscription],
        messages: newMessages,
        messageCounters: { ...state.messageCounters, [subscription.id]: 0 }
      }
    })
  },

  removeSubscription: (id) => {
    set((state) => {
      const newMessages = new Map(state.messages)
      newMessages.delete(id)
      const newPaused = new Set(state.pausedSubscriptions)
      newPaused.delete(id)
      const { [id]: _, ...newCounters } = state.messageCounters
      return {
        subscriptions: state.subscriptions.filter(s => s.id !== id),
        messages: newMessages,
        messageCounters: newCounters,
        pausedSubscriptions: newPaused
      }
    })
  },

  updateSubscription: (id, updates) => {
    set((state) => ({
      subscriptions: state.subscriptions.map(s => 
        s.id === id ? { ...s, ...updates } : s
      )
    }))
  },

  addMessage: (subscriptionId, message) => {
    const { pausedSubscriptions } = get()
    if (pausedSubscriptions.has(subscriptionId)) return

    const pending = pendingMessages.get(subscriptionId) || []
    pending.push(message)
    pendingMessages.set(subscriptionId, pending)
    
    pendingCounters.set(subscriptionId, (pendingCounters.get(subscriptionId) || 0) + 1)
    
    scheduleFlush()
  },

  clearMessages: (subscriptionId) => {
    flushPendingUpdates()
    set((state) => {
      const newMessages = new Map(state.messages)
      newMessages.set(subscriptionId, [])
      return { 
        messages: newMessages,
        messageCounters: { ...state.messageCounters, [subscriptionId]: 0 }
      }
    })
  },

  togglePause: (subscriptionId) => {
    set((state) => {
      const newPaused = new Set(state.pausedSubscriptions)
      if (newPaused.has(subscriptionId)) {
        newPaused.delete(subscriptionId)
      } else {
        newPaused.add(subscriptionId)
      }
      return { pausedSubscriptions: newPaused }
    })
  },

  setSearchFilter: (filter) => {
    set({ searchFilter: filter })
  },

  saveSubject: (subject) => {
    set((state) => {
      if (state.savedSubjects.includes(subject)) return state
      return { savedSubjects: [...state.savedSubjects, subject] }
    })
  },

  removeSavedSubject: (subject) => {
    set((state) => ({
      savedSubjects: state.savedSubjects.filter(s => s !== subject)
    }))
  }
}))

window.nats.onMessage((data) => {
  useSubscriptionStore.getState().addMessage(data.subscriptionId, data.message)
})
