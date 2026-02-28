export interface ConnectionConfig {
  id: string
  name: string
  servers: string
  port: number
  username?: string
  password?: string
  token?: string
  tls: boolean
  autoReconnect: boolean
  maxReconnectAttempts?: number
  reconnectTimeWait?: number
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error'

export interface ConnectionState {
  status: ConnectionStatus
  error?: string
  lastConnected?: Date
}

export interface NatsMessage {
  id: string
  subject: string
  payload: string
  timestamp: Date
  replyTo?: string
  headers?: Record<string, string>
  isJson: boolean
}

export interface Subscription {
  id: string
  subject: string
  active: boolean
  messageCount: number
  createdAt: Date
}

export interface PublishStats {
  successCount: number
  failCount: number
  totalBytes: number
  startTime?: Date
  lastPublishTime?: Date
}

export interface PublishOptions {
  subject: string
  payload: string
  headers?: Record<string, string>
  repeat?: boolean
  interval?: number
  count?: number
}

export interface RequestOptions {
  subject: string
  payload: string
  timeout?: number
  headers?: Record<string, string>
}

export interface RequestResult {
  success: boolean
  response?: string
  responseTime: number
  error?: string
}

export interface JetStreamInfo {
  name: string
  subjects: string[]
  retention: string
  maxConsumers: number
  maxMsgs: number
  maxBytes: number
  maxAge: number
  messages: number
  bytes: number
}

export interface ConsumerInfo {
  name: string
  streamName: string
  ackPolicy: string
  deliverSubject?: string
  maxDeliver: number
  ackWait: number
  pending: number
}

export interface StoredMessage {
  subject: string
  sequence: number
  timestamp: Date
  payload: string
}

export interface AppSettings {
  maxMessagesPerSubscription: number
  autoFormatJson: boolean
  theme: 'dark' | 'light'
  logLevel: 'debug' | 'info' | 'warn' | 'error'
  defaultServer: string
  defaultPort: number
  defaultTimeout: number
  maxLogs: number
  messageDisplayLength: number
}

export interface KvBucketInfo {
  bucket: string
  description?: string
  values: number
  history: number
  ttl: number
  backingStore: string
}

export interface KvEntry {
  key: string
  value: string
  revision: number
  created: Date
  delta?: number
  operation?: 'PUT' | 'DEL' | 'PURGE'
}

export interface KvWatchOptions {
  bucket: string
  key?: string
}
