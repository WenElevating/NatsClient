import { create } from 'zustand'
import type { NatsMessage, Subscription } from '../types/nats'

interface SubscriptionStore {
  subscriptions: Subscription[]
  messages: Map<string, NatsMessage[]>
  maxMessages: number
  pausedSubscriptions: Set<string>
  searchFilter: string

  addSubscription: (subscription: Subscription) => void
  removeSubscription: (id: string) => void
  updateSubscription: (id: string, updates: Partial<Subscription>) => void
  addMessage: (subscriptionId: string, message: NatsMessage) => void
  clearMessages: (subscriptionId: string) => void
  togglePause: (subscriptionId: string) => void
  setSearchFilter: (filter: string) => void
  setMaxMessages: (max: number) => void
  getFilteredMessages: (subscriptionId: string) => NatsMessage[]
}

export const useSubscriptionStore = create<SubscriptionStore>((set, get) => ({
  subscriptions: [],
  messages: new Map(),
  maxMessages: 1000,
  pausedSubscriptions: new Set(),
  searchFilter: '',

  addSubscription: (subscription) => {
    set((state) => {
      if (state.subscriptions.some(s => s.id === subscription.id)) {
        return state
      }
      return {
        subscriptions: [...state.subscriptions, subscription],
        messages: new Map(state.messages).set(subscription.id, [])
      }
    })
  },

  removeSubscription: (id) => {
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
    const { maxMessages, pausedSubscriptions } = get()
    if (pausedSubscriptions.has(subscriptionId)) return

    set((state) => {
      const newMessages = new Map(state.messages)
      const existing = newMessages.get(subscriptionId) || []
      const updated = [...existing, message]
      if (updated.length > maxMessages) {
        updated.splice(0, updated.length - maxMessages)
      }
      newMessages.set(subscriptionId, updated)
      return { messages: newMessages }
    })
  },

  clearMessages: (subscriptionId) => {
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

  setMaxMessages: (max) => {
    set({ maxMessages: max })
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
  }
}))

window.nats.onMessage((data) => {
  useSubscriptionStore.getState().addMessage(data.subscriptionId, data.message)
  useSubscriptionStore.getState().updateSubscription(data.subscriptionId, {
    messageCount: (useSubscriptionStore.getState().subscriptions.find(s => s.id === data.subscriptionId)?.messageCount || 0) + 1
  })
})
