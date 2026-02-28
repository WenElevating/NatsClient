import { ipcMain } from 'electron'
import { natsService } from '../nats/NatsService'
import type { ConnectionConfig, PublishOptions, RequestOptions } from '../../src/types/nats'

export const IPC_CHANNELS = {
  NATS_CONNECT: 'nats:connect',
  NATS_DISCONNECT: 'nats:disconnect',
  NATS_GET_STATE: 'nats:get-state',
  NATS_IS_CONNECTED: 'nats:is-connected',
  NATS_PUBLISH: 'nats:publish',
  NATS_SUBSCRIBE: 'nats:subscribe',
  NATS_UNSUBSCRIBE: 'nats:unsubscribe',
  NATS_GET_SUBSCRIPTIONS: 'nats:get-subscriptions',
  NATS_REQUEST: 'nats:request',
  NATS_START_REPLY: 'nats:start-reply',
  NATS_STOP_REPLY: 'nats:stop-reply',
  NATS_UPDATE_REPLY: 'nats:update-reply',
  NATS_JS_GET_STREAMS: 'nats:js:get-streams',
  NATS_JS_GET_CONSUMERS: 'nats:js:get-consumers',
  NATS_JS_FETCH_MESSAGE: 'nats:js:fetch-message',
  NATS_JS_ACK: 'nats:js:ack',
  NATS_JS_NAK: 'nats:js:nak',
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
  NATS_REPLY_SENT: 'nats:reply-sent',
  NATS_REPLY_ERROR: 'nats:reply-error',
} as const

export function setupIpcHandlers(mainWindow: Electron.BrowserWindow): void {
  natsService.on('connection-state-changed', (state) => {
    mainWindow.webContents.send(IPC_CHANNELS.NATS_CONNECTION_STATE, state)
  })

  natsService.on('message', (data) => {
    mainWindow.webContents.send(IPC_CHANNELS.NATS_MESSAGE, data)
  })

  natsService.on('publish-success', (data) => {
    mainWindow.webContents.send(IPC_CHANNELS.NATS_PUBLISH_SUCCESS, data)
  })

  natsService.on('publish-error', (data) => {
    mainWindow.webContents.send(IPC_CHANNELS.NATS_PUBLISH_ERROR, data)
  })

  natsService.on('log', (data) => {
    mainWindow.webContents.send(IPC_CHANNELS.NATS_LOG, data)
  })

  natsService.on('reply-sent', (data) => {
    mainWindow.webContents.send(IPC_CHANNELS.NATS_REPLY_SENT, data)
  })

  natsService.on('reply-service-error', (data) => {
    mainWindow.webContents.send(IPC_CHANNELS.NATS_REPLY_ERROR, data)
  })

  ipcMain.handle(IPC_CHANNELS.NATS_CONNECT, async (_event, config: ConnectionConfig) => {
    try {
      await natsService.connect(config)
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.NATS_DISCONNECT, async () => {
    try {
      await natsService.disconnect()
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.NATS_GET_STATE, () => {
    return natsService.getConnectionState()
  })

  ipcMain.handle(IPC_CHANNELS.NATS_IS_CONNECTED, () => {
    return natsService.isConnected()
  })

  ipcMain.handle(IPC_CHANNELS.NATS_PUBLISH, async (_event, options: PublishOptions) => {
    try {
      await natsService.publish(options)
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.NATS_SUBSCRIBE, async (_event, subject: string) => {
    try {
      const subscriptionId = await natsService.subscribe(subject)
      return { success: true, subscriptionId }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.NATS_UNSUBSCRIBE, async (_event, subscriptionId: string) => {
    try {
      await natsService.unsubscribe(subscriptionId)
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.NATS_GET_SUBSCRIPTIONS, () => {
    return natsService.getSubscriptions()
  })

  ipcMain.handle(IPC_CHANNELS.NATS_REQUEST, async (_event, options: RequestOptions) => {
    return await natsService.request(options)
  })

  ipcMain.handle(IPC_CHANNELS.NATS_START_REPLY, async (_event, subject: string, responsePayload: string) => {
    try {
      const id = await natsService.startReplyService(subject, responsePayload)
      return { success: true, id }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.NATS_STOP_REPLY, async (_event, id: string) => {
    try {
      await natsService.stopReplyService(id)
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.NATS_UPDATE_REPLY, async (_event, id: string, responsePayload: string) => {
    try {
      await natsService.updateReplyPayload(id, responsePayload)
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.NATS_JS_GET_STREAMS, async () => {
    try {
      const streams = await natsService.getJetStreamStreams()
      return { success: true, streams }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.NATS_JS_GET_CONSUMERS, async (_event, streamName: string) => {
    try {
      const consumers = await natsService.getJetStreamConsumers(streamName)
      return { success: true, consumers }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.NATS_JS_FETCH_MESSAGE, async (_event, streamName: string, consumerName: string) => {
    try {
      const message = await natsService.fetchMessage(streamName, consumerName)
      return { success: true, message }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.NATS_JS_ACK, async (_event, streamName: string, consumerName: string, sequence: number) => {
    try {
      await natsService.ackMessage(streamName, consumerName, sequence)
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.NATS_JS_NAK, async (_event, streamName: string, consumerName: string, sequence: number) => {
    try {
      await natsService.nakMessage(streamName, consumerName, sequence)
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.NATS_KV_GET_BUCKETS, async () => {
    try {
      const buckets = await natsService.getKvBuckets()
      return { success: true, buckets }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.NATS_KV_GET_KEYS, async (_event, bucketName: string) => {
    try {
      const keys = await natsService.getKvKeys(bucketName)
      return { success: true, keys }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.NATS_KV_GET_ENTRY, async (_event, bucketName: string, key: string) => {
    try {
      const entry = await natsService.getKvEntry(bucketName, key)
      return { success: true, entry }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.NATS_KV_PUT_ENTRY, async (_event, bucketName: string, key: string, value: string) => {
    try {
      const revision = await natsService.putKvEntry(bucketName, key, value)
      return { success: true, revision }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.NATS_KV_DELETE_ENTRY, async (_event, bucketName: string, key: string) => {
    try {
      await natsService.deleteKvEntry(bucketName, key)
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.NATS_KV_GET_HISTORY, async (_event, bucketName: string, key: string) => {
    try {
      const history = await natsService.getKvHistory(bucketName, key)
      return { success: true, history }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.NATS_KV_CREATE_BUCKET, async (_event, bucketName: string, options?: { description?: string; ttl?: number; history?: number }) => {
    try {
      await natsService.createKvBucket(bucketName, options)
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.NATS_KV_DELETE_BUCKET, async (_event, bucketName: string) => {
    try {
      await natsService.deleteKvBucket(bucketName)
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })
}

export function cleanupIpcHandlers(): void {
  natsService.removeAllListeners()
}
