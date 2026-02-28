import { create } from 'zustand'
import type { NatsMessage, Subscription } from '../types/nats'
import { useSettingsStore } from './settingsStore'

interface SubscriptionStore {
  subscriptions: Subscription[]
  messages: Map<string, NatsMessage[]>
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

const messageCounters = new Map<string, number>()

export const useSubscriptionStore = create<SubscriptionStore>((set, get) => ({
  subscriptions: [],
  messages: new Map(),
  pausedSubscriptions: new Set(),
  searchFilter: '',
  savedSubjects: [],

  addSubscription: (subscription) => {
    set((state) => {
      if (state.subscriptions.some(s => s.id === subscription.id)) {
        return state
      }
      messageCounters.set(subscription.id, 0)
      const newMessages = new Map(state.messages)
      newMessages.set(subscription.id, [])
      return {
        subscriptions: [...state.subscriptions, subscription],
        messages: newMessages
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

    const counter = (messageCounters.get(subscriptionId) || 0) + 1
    messageCounters.set(subscriptionId, counter)

    set((state) => {
      const maxMessages = useSettingsStore.getState().maxMessagesPerSubscription
      const newMessages = new Map(state.messages)
      const existing = newMessages.get(subscriptionId) || []
      const updated = [...existing, message]
      if (updated.length > maxMessages) {
        updated.splice(0, updated.length - maxMessages)
      }
      newMessages.set(subscriptionId, updated)
      
      const newSubscriptions = state.subscriptions.map(s => 
        s.id === subscriptionId ? { ...s, messageCount: counter } : s
      )
      
      return { 
        messages: newMessages,
        subscriptions: newSubscriptions
      }
    })
  },

  clearMessages: (subscriptionId) => {
    messageCounters.set(subscriptionId, 0)
    set((state) => {
      const newMessages = new Map(state.messages)
      newMessages.set(subscriptionId, [])
      return { messages: newMessages }
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
