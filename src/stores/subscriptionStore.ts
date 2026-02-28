import { create } from 'zustand'
import type { NatsMessage, Subscription } from '../types/nats'
import { useSettingsStore } from './settingsStore'

interface SubscriptionStore {
  subscriptions: Subscription[]
  messages: Map<string, NatsMessage[]>
  messageVersion: number
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
  getFilteredMessages: (subscriptionId: string) => NatsMessage[]
  saveSubject: (subject: string) => void
  removeSavedSubject: (subject: string) => void
  getSavedSubjects: () => string[]
}

const messageCounters = new Map<string, number>()

export const useSubscriptionStore = create<SubscriptionStore>((set, get) => ({
  subscriptions: [],
  messages: new Map(),
  messageVersion: 0,
  pausedSubscriptions: new Set(),
  searchFilter: '',
  savedSubjects: [],

  addSubscription: (subscription) => {
    set((state) => {
      if (state.subscriptions.some(s => s.id === subscription.id)) {
        return state
      }
      messageCounters.set(subscription.id, 0)
      return {
        subscriptions: [...state.subscriptions, subscription],
        messages: new Map(state.messages).set(subscription.id, [])
      }
    })
  },

  removeSubscription: (id) => {
    messageCounters.delete(id)
    set((state) => {
      const newMessages = new Map(state.messages)
      newMessages.delete(id)
      const newPaused = new Set(state.pausedSubscriptions)
      newPaused.delete(id)
      return {
        subscriptions: state.subscriptions.filter(s => s.id !== id),
        messages: newMessages,
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

    const counter = messageCounters.get(subscriptionId) || 0
    messageCounters.set(subscriptionId, counter + 1)

    set((state) => {
      const maxMessages = useSettingsStore.getState().maxMessagesPerSubscription
      const newMessages = new Map(state.messages)
      const existing = newMessages.get(subscriptionId) || []
      const updated = [...existing, message]
      if (updated.length > maxMessages) {
        updated.splice(0, updated.length - maxMessages)
      }
      newMessages.set(subscriptionId, updated)
      return { 
        messages: newMessages,
        messageVersion: state.messageVersion + 1
      }
    })
  },

  clearMessages: (subscriptionId) => {
    messageCounters.set(subscriptionId, 0)
    set((state) => {
      const newMessages = new Map(state.messages)
      newMessages.set(subscriptionId, [])
      return { 
        messages: newMessages,
        messageVersion: state.messageVersion + 1
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

  getFilteredMessages: (subscriptionId) => {
    const { messages, searchFilter } = get()
    const msgs = messages.get(subscriptionId) || []
    if (!searchFilter) return msgs
    const lowerFilter = searchFilter.toLowerCase()
    return msgs.filter(m => 
      m.subject.toLowerCase().includes(lowerFilter) ||
      m.payload.toLowerCase().includes(lowerFilter)
    )
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
  },

  getSavedSubjects: () => get().savedSubjects
}))

window.nats.onMessage((data) => {
  const store = useSubscriptionStore.getState()
  store.addMessage(data.subscriptionId, data.message)
  
  const counter = messageCounters.get(data.subscriptionId) || 0
  store.updateSubscription(data.subscriptionId, {
    messageCount: counter
  })
})
