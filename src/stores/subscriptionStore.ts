import { create } from 'zustand'
import type { NatsMessage, Subscription } from '../types/nats'
import { useSettingsStore } from './settingsStore'

interface SubscriptionStore {
  subscriptions: Subscription[]
  messages: Map<string, NatsMessage[]>
  messageCounters: Map<string, number>
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

export const useSubscriptionStore = create<SubscriptionStore>((set, get) => ({
  subscriptions: [],
  messages: new Map(),
  messageCounters: new Map(),
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
      const newCounters = new Map(state.messageCounters)
      newCounters.set(subscription.id, 0)
      return {
        subscriptions: [...state.subscriptions, subscription],
        messages: newMessages,
        messageCounters: newCounters
      }
    })
  },

  removeSubscription: (id) => {
    set((state) => {
      const newMessages = new Map(state.messages)
      newMessages.delete(id)
      const newCounters = new Map(state.messageCounters)
      newCounters.delete(id)
      const newPaused = new Set(state.pausedSubscriptions)
      newPaused.delete(id)
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
    const { pausedSubscriptions, messageCounters } = get()
    if (pausedSubscriptions.has(subscriptionId)) return

    const counter = (messageCounters.get(subscriptionId) || 0) + 1

    set((state) => {
      const maxMessages = useSettingsStore.getState().maxMessagesPerSubscription
      const newMessages = new Map(state.messages)
      const existing = newMessages.get(subscriptionId) || []
      const updated = [...existing, message]
      if (updated.length > maxMessages) {
        updated.splice(0, updated.length - maxMessages)
      }
      newMessages.set(subscriptionId, updated)
      
      const newCounters = new Map(state.messageCounters)
      newCounters.set(subscriptionId, counter)
      
      return { 
        messages: newMessages,
        messageCounters: newCounters
      }
    })
  },

  clearMessages: (subscriptionId) => {
    set((state) => {
      const newMessages = new Map(state.messages)
      newMessages.set(subscriptionId, [])
      const newCounters = new Map(state.messageCounters)
      newCounters.set(subscriptionId, 0)
      return { 
        messages: newMessages,
        messageCounters: newCounters
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
