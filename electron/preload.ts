import { ipcRenderer, contextBridge } from 'electron'
import type { ConnectionConfig, ConnectionState, PublishOptions, RequestOptions, NatsMessage, Subscription, JetStreamInfo, ConsumerInfo, StoredMessage, AppSettings, KvBucketInfo, KvEntry, StreamConfigOptions, ConsumerConfigOptions } from '../src/types/nats'

const IPC_CHANNELS = {
  NATS_CONNECT: 'nats:connect',
  NATS_DISCONNECT: 'nats:disconnect',
  NATS_GET_STATE: 'nats:get-state',
  NATS_IS_CONNECTED: 'nats:is-connected',
  NATS_PUBLISH: 'nats:publish',
  NATS_SUBSCRIBE: 'nats:subscribe',
  NATS_UNSUBSCRIBE: 'nats:unsubscribe',
  NATS_GET_SUBSCRIPTIONS: 'nats:get-subscriptions',
  NATS_REQUEST: 'nats:request',
  NATS_JS_GET_STREAMS: 'nats:js:get-streams',
  NATS_JS_GET_CONSUMERS: 'nats:js:get-consumers',
  NATS_JS_FETCH_MESSAGE: 'nats:js:fetch-message',
  NATS_JS_ACK: 'nats:js:ack',
  NATS_JS_NAK: 'nats:js:nak',
  NATS_JS_CREATE_STREAM: 'nats:js:create-stream',
  NATS_JS_DELETE_STREAM: 'nats:js:delete-stream',
  NATS_JS_CREATE_CONSUMER: 'nats:js:create-consumer',
  NATS_JS_DELETE_CONSUMER: 'nats:js:delete-consumer',
  NATS_KV_GET_BUCKETS: 'nats:kv:get-buckets',
  NATS_KV_GET_KEYS: 'nats:kv:get-keys',
  NATS_KV_GET_ENTRY: 'nats:kv:get-entry',
  NATS_KV_PUT_ENTRY: 'nats:kv:put-entry',
  NATS_KV_DELETE_ENTRY: 'nats:kv:delete-entry',
  NATS_KV_GET_HISTORY: 'nats:kv:get-history',
  NATS_KV_CREATE_BUCKET: 'nats:kv:create-bucket',
  NATS_KV_DELETE_BUCKET: 'nats:kv:delete-bucket',
  NATS_MESSAGE: 'nats:message',
  NATS_CONNECTION_STATE: 'nats:connection-state',
  NATS_PUBLISH_SUCCESS: 'nats:publish-success',
  NATS_PUBLISH_ERROR: 'nats:publish-error',
  NATS_LOG: 'nats:log',
  NATS_START_REPLY: 'nats:start-reply',
  NATS_STOP_REPLY: 'nats:stop-reply',
  NATS_UPDATE_REPLY: 'nats:update-reply',
  NATS_REPLY_SENT: 'nats:reply-sent',
  NATS_REPLY_ERROR: 'nats:reply-error',
  CONNECTIONS_LOAD: 'storage:connections:load',
  CONNECTIONS_SAVE: 'storage:connections:save',
  CONNECTIONS_ADD: 'storage:connections:add',
  CONNECTIONS_DELETE: 'storage:connections:delete',
  SETTINGS_LOAD: 'storage:settings:load',
  SETTINGS_SAVE: 'storage:settings:save',
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',
  WINDOW_IS_MAXIMIZED: 'window:isMaximized',
} as const

export interface NatsApi {
  connect: (config: ConnectionConfig) => Promise<{ success: boolean; error?: string }>
  disconnect: () => Promise<{ success: boolean; error?: string }>
  getState: () => Promise<ConnectionState>
  isConnected: () => Promise<boolean>
  publish: (options: PublishOptions) => Promise<{ success: boolean; error?: string }>
  subscribe: (subject: string) => Promise<{ success: boolean; subscriptionId?: string; error?: string }>
  unsubscribe: (subscriptionId: string) => Promise<{ success: boolean; error?: string }>
  getSubscriptions: () => Promise<Subscription[]>
  request: (options: RequestOptions) => Promise<{ success: boolean; response?: string; responseTime: number; error?: string }>
  startReplyService: (subject: string, responsePayload: string) => Promise<{ success: boolean; id?: string; error?: string }>
  stopReplyService: (id: string) => Promise<{ success: boolean; error?: string }>
  updateReplyPayload: (id: string, responsePayload: string) => Promise<{ success: boolean; error?: string }>
  getJetStreamStreams: () => Promise<{ success: boolean; streams?: JetStreamInfo[]; error?: string }>
  getJetStreamConsumers: (streamName: string) => Promise<{ success: boolean; consumers?: ConsumerInfo[]; error?: string }>
  fetchMessage: (streamName: string, consumerName: string) => Promise<{ success: boolean; message?: StoredMessage | null; error?: string }>
  ackMessage: (streamName: string, consumerName: string, sequence: number) => Promise<{ success: boolean; error?: string }>
  nakMessage: (streamName: string, consumerName: string, sequence: number) => Promise<{ success: boolean; error?: string }>
  getKvBuckets: () => Promise<{ success: boolean; buckets?: KvBucketInfo[]; error?: string }>
  getKvKeys: (bucketName: string) => Promise<{ success: boolean; keys?: string[]; error?: string }>
  getKvEntry: (bucketName: string, key: string) => Promise<{ success: boolean; entry?: KvEntry | null; error?: string }>
  putKvEntry: (bucketName: string, key: string, value: string) => Promise<{ success: boolean; revision?: number; error?: string }>
  deleteKvEntry: (bucketName: string, key: string) => Promise<{ success: boolean; error?: string }>
  getKvHistory: (bucketName: string, key: string) => Promise<{ success: boolean; history?: KvEntry[]; error?: string }>
  createKvBucket: (bucketName: string, options?: { description?: string; ttl?: number; history?: number }) => Promise<{ success: boolean; error?: string }>
  deleteKvBucket: (bucketName: string) => Promise<{ success: boolean; error?: string }>
  createStream: (options: StreamConfigOptions) => Promise<{ success: boolean; stream?: JetStreamInfo; error?: string }>
  deleteStream: (streamName: string) => Promise<{ success: boolean; error?: string }>
  createConsumer: (options: ConsumerConfigOptions) => Promise<{ success: boolean; consumer?: ConsumerInfo; error?: string }>
  deleteConsumer: (streamName: string, consumerName: string) => Promise<{ success: boolean; error?: string }>
  onMessage: (callback: (data: { subscriptionId: string; message: NatsMessage }) => void) => () => void
  onConnectionState: (callback: (state: ConnectionState) => void) => () => void
  onPublishSuccess: (callback: (data: { subject: string; size: number }) => void) => () => void
  onPublishError: (callback: (data: { subject: string; error: string }) => void) => () => void
  onLog: (callback: (data: { level: string; message: string }) => void) => () => void
  onReplySent: (callback: (data: { id: string; subject: string; replyTo: string }) => void) => () => void
  onReplyError: (callback: (data: { id: string; error: string }) => void) => () => void
  loadConnections: () => Promise<ConnectionConfig[]>
  saveConnections: (connections: ConnectionConfig[]) => Promise<{ success: boolean }>
  addConnection: (connection: ConnectionConfig) => Promise<ConnectionConfig[]>
  deleteConnection: (id: string) => Promise<ConnectionConfig[]>
  loadSettings: () => Promise<AppSettings>
  saveSettings: (settings: AppSettings) => Promise<{ success: boolean }>
  minimizeWindow: () => Promise<void>
  maximizeWindow: () => Promise<void>
  closeWindow: () => Promise<void>
  isWindowMaximized: () => Promise<boolean>
}

const natsApi: NatsApi = {
  connect: (config) => ipcRenderer.invoke(IPC_CHANNELS.NATS_CONNECT, config),
  disconnect: () => ipcRenderer.invoke(IPC_CHANNELS.NATS_DISCONNECT),
  getState: () => ipcRenderer.invoke(IPC_CHANNELS.NATS_GET_STATE),
  isConnected: () => ipcRenderer.invoke(IPC_CHANNELS.NATS_IS_CONNECTED),
  publish: (options) => ipcRenderer.invoke(IPC_CHANNELS.NATS_PUBLISH, options),
  subscribe: (subject) => ipcRenderer.invoke(IPC_CHANNELS.NATS_SUBSCRIBE, subject),
  unsubscribe: (subscriptionId) => ipcRenderer.invoke(IPC_CHANNELS.NATS_UNSUBSCRIBE, subscriptionId),
  getSubscriptions: () => ipcRenderer.invoke(IPC_CHANNELS.NATS_GET_SUBSCRIPTIONS),
  request: (options) => ipcRenderer.invoke(IPC_CHANNELS.NATS_REQUEST, options),
  startReplyService: (subject, responsePayload) => ipcRenderer.invoke(IPC_CHANNELS.NATS_START_REPLY, subject, responsePayload),
  stopReplyService: (id) => ipcRenderer.invoke(IPC_CHANNELS.NATS_STOP_REPLY, id),
  updateReplyPayload: (id, responsePayload) => ipcRenderer.invoke(IPC_CHANNELS.NATS_UPDATE_REPLY, id, responsePayload),
  getJetStreamStreams: () => ipcRenderer.invoke(IPC_CHANNELS.NATS_JS_GET_STREAMS),
  getJetStreamConsumers: (streamName) => ipcRenderer.invoke(IPC_CHANNELS.NATS_JS_GET_CONSUMERS, streamName),
  fetchMessage: (streamName, consumerName) => ipcRenderer.invoke(IPC_CHANNELS.NATS_JS_FETCH_MESSAGE, streamName, consumerName),
  ackMessage: (streamName, consumerName, sequence) => ipcRenderer.invoke(IPC_CHANNELS.NATS_JS_ACK, streamName, consumerName, sequence),
  nakMessage: (streamName, consumerName, sequence) => ipcRenderer.invoke(IPC_CHANNELS.NATS_JS_NAK, streamName, consumerName, sequence),
  getKvBuckets: () => ipcRenderer.invoke(IPC_CHANNELS.NATS_KV_GET_BUCKETS),
  getKvKeys: (bucketName) => ipcRenderer.invoke(IPC_CHANNELS.NATS_KV_GET_KEYS, bucketName),
  getKvEntry: (bucketName, key) => ipcRenderer.invoke(IPC_CHANNELS.NATS_KV_GET_ENTRY, bucketName, key),
  putKvEntry: (bucketName, key, value) => ipcRenderer.invoke(IPC_CHANNELS.NATS_KV_PUT_ENTRY, bucketName, key, value),
  deleteKvEntry: (bucketName, key) => ipcRenderer.invoke(IPC_CHANNELS.NATS_KV_DELETE_ENTRY, bucketName, key),
  getKvHistory: (bucketName, key) => ipcRenderer.invoke(IPC_CHANNELS.NATS_KV_GET_HISTORY, bucketName, key),
  createKvBucket: (bucketName, options) => ipcRenderer.invoke(IPC_CHANNELS.NATS_KV_CREATE_BUCKET, bucketName, options),
  deleteKvBucket: (bucketName) => ipcRenderer.invoke(IPC_CHANNELS.NATS_KV_DELETE_BUCKET, bucketName),
  createStream: (options) => ipcRenderer.invoke(IPC_CHANNELS.NATS_JS_CREATE_STREAM, options),
  deleteStream: (streamName) => ipcRenderer.invoke(IPC_CHANNELS.NATS_JS_DELETE_STREAM, streamName),
  createConsumer: (options) => ipcRenderer.invoke(IPC_CHANNELS.NATS_JS_CREATE_CONSUMER, options),
  deleteConsumer: (streamName, consumerName) => ipcRenderer.invoke(IPC_CHANNELS.NATS_JS_DELETE_CONSUMER, streamName, consumerName),
  
  onMessage: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { subscriptionId: string; message: NatsMessage }) => callback(data)
    ipcRenderer.on(IPC_CHANNELS.NATS_MESSAGE, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.NATS_MESSAGE, handler)
  },
  
  onConnectionState: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, state: ConnectionState) => callback(state)
    ipcRenderer.on(IPC_CHANNELS.NATS_CONNECTION_STATE, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.NATS_CONNECTION_STATE, handler)
  },
  
  onPublishSuccess: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { subject: string; size: number }) => callback(data)
    ipcRenderer.on(IPC_CHANNELS.NATS_PUBLISH_SUCCESS, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.NATS_PUBLISH_SUCCESS, handler)
  },
  
  onPublishError: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { subject: string; error: string }) => callback(data)
    ipcRenderer.on(IPC_CHANNELS.NATS_PUBLISH_ERROR, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.NATS_PUBLISH_ERROR, handler)
  },
  
  onLog: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { level: string; message: string }) => callback(data)
    ipcRenderer.on(IPC_CHANNELS.NATS_LOG, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.NATS_LOG, handler)
  },
  
  onReplySent: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { id: string; subject: string; replyTo: string }) => callback(data)
    ipcRenderer.on(IPC_CHANNELS.NATS_REPLY_SENT, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.NATS_REPLY_SENT, handler)
  },
  
  onReplyError: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { id: string; error: string }) => callback(data)
    ipcRenderer.on(IPC_CHANNELS.NATS_REPLY_ERROR, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.NATS_REPLY_ERROR, handler)
  },
  
  loadConnections: () => ipcRenderer.invoke(IPC_CHANNELS.CONNECTIONS_LOAD),
  saveConnections: (connections) => ipcRenderer.invoke(IPC_CHANNELS.CONNECTIONS_SAVE, connections),
  addConnection: (connection) => ipcRenderer.invoke(IPC_CHANNELS.CONNECTIONS_ADD, connection),
  deleteConnection: (id) => ipcRenderer.invoke(IPC_CHANNELS.CONNECTIONS_DELETE, id),
  loadSettings: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_LOAD),
  saveSettings: (settings) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SAVE, settings),
  minimizeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MINIMIZE),
  maximizeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MAXIMIZE),
  closeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_CLOSE),
  isWindowMaximized: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_IS_MAXIMIZED),
}

contextBridge.exposeInMainWorld('nats', natsApi)
