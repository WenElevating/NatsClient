import { EventEmitter } from 'events'
import * as nats from 'nats'
import type { NatsConnection, Subscription as NatsSubscription, JetStreamManager } from 'nats'
import type { ConnectionConfig, ConnectionState, NatsMessage, Subscription, PublishOptions, RequestOptions, RequestResult, JetStreamInfo, ConsumerInfo, StoredMessage } from '../../src/types/nats'
import { v4 as uuidv4 } from 'uuid'

export class NatsService extends EventEmitter {
  private nc: NatsConnection | null = null
  private subscriptions: Map<string, NatsSubscription> = new Map()
  private subscriptionInfo: Map<string, Subscription> = new Map()
  private connectionState: ConnectionState = { status: 'disconnected' }
  private jsManager: JetStreamManager | null = null
  private replyServices: Map<string, NatsSubscription> = new Map()
  private replyPayloads: Map<string, string> = new Map()

  async connect(config: ConnectionConfig): Promise<void> {
    if (this.nc) {
      await this.disconnect()
    }

    this.connectionState = { status: 'connecting' }
    this.emit('connection-state-changed', this.connectionState)

    try {
      const options: nats.ConnectionOptions = {
        servers: `${config.servers}:${config.port}`,
        user: config.username,
        pass: config.password,
        token: config.token,
        tls: config.tls ? {} : undefined,
        reconnect: config.autoReconnect,
        maxReconnectAttempts: config.maxReconnectAttempts || -1,
        reconnectTimeWait: config.reconnectTimeWait || 2000,
        name: `nats-client-${config.id}`,
      }

      this.nc = await nats.connect(options)

      this.nc.closed().then(() => {
        this.connectionState = { status: 'disconnected' }
        this.emit('connection-state-changed', this.connectionState)
      })

      ;(async () => {
        try {
          for await (const s of this.nc!.status()) {
            this.handleStatusUpdate(s)
          }
        } catch (error) {
          this.emit('log', { level: 'error', message: `Status monitor error: ${error instanceof Error ? error.message : 'Unknown error'}` })
        }
      })()

      try {
        this.jsManager = await this.nc.jetstreamManager()
      } catch (error) {
        this.emit('log', { level: 'warn', message: 'JetStream not available' })
        this.jsManager = null
      }

      this.connectionState = {
        status: 'connected',
        lastConnected: new Date()
      }
      this.emit('connection-state-changed', this.connectionState)

    } catch (error) {
      this.connectionState = {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
      this.emit('connection-state-changed', this.connectionState)
      throw error
    }
  }

  private handleStatusUpdate(status: nats.Status): void {
    switch (status.type) {
      case 'disconnect':
        this.connectionState = { status: 'reconnecting' }
        this.emit('connection-state-changed', this.connectionState)
        break
      case 'reconnect':
        this.connectionState = {
          status: 'connected',
          lastConnected: new Date()
        }
        this.emit('connection-state-changed', this.connectionState)
        break
      case 'update':
        this.emit('log', { level: 'info', message: `Connection update: ${JSON.stringify(status.data)}` })
        break
      case 'error':
        this.connectionState = {
          status: 'error',
          error: (status as any).error?.message || 'Connection error'
        }
        this.emit('connection-state-changed', this.connectionState)
        break
    }
  }

  async disconnect(): Promise<void> {
    for (const [id, sub] of this.subscriptions) {
      try {
        sub.unsubscribe()
      } catch (error) {
        this.emit('log', { level: 'warn', message: `Failed to unsubscribe ${id}: ${error instanceof Error ? error.message : 'Unknown error'}` })
      }
      this.subscriptions.delete(id)
      this.subscriptionInfo.delete(id)
    }

    if (this.nc) {
      try {
        await this.nc.drain()
        await this.nc.close()
      } catch (error) {
        this.emit('log', { level: 'warn', message: `Error during disconnect: ${error instanceof Error ? error.message : 'Unknown error'}` })
      }
      this.nc = null
      this.jsManager = null
    }

    this.connectionState = { status: 'disconnected' }
    this.emit('connection-state-changed', this.connectionState)
  }

  getConnectionState(): ConnectionState {
    return this.connectionState
  }

  isConnected(): boolean {
    return this.connectionState.status === 'connected' && this.nc !== null
  }

  async publish(options: PublishOptions): Promise<void> {
    if (!this.nc) {
      throw new Error('Not connected to NATS server')
    }

    try {
      const payload = this.encodePayload(options.payload)
      const headers = options.headers ? this.createHeaders(options.headers) : undefined

      this.nc.publish(options.subject, payload, { headers })
      this.emit('publish-success', { subject: options.subject, size: payload.length })
    } catch (error) {
      this.emit('publish-error', { subject: options.subject, error: error instanceof Error ? error.message : 'Unknown error' })
      throw error
    }
  }

  async subscribe(subject: string): Promise<string> {
    if (!this.nc) {
      throw new Error('Not connected to NATS server')
    }

    const id = uuidv4()
    const sub = this.nc.subscribe(subject, {
      callback: (err, msg) => {
        if (err) {
          this.emit('subscription-error', { id, error: err.message })
          return
        }

        const info = this.subscriptionInfo.get(id)
        if (info) {
          info.messageCount++
        }

        const natsMsg: NatsMessage = {
          id: uuidv4(),
          subject: msg.subject,
          payload: this.decodePayload(msg.data),
          timestamp: new Date(),
          replyTo: msg.reply,
          headers: this.extractHeaders(msg.headers),
          isJson: this.isJsonPayload(msg.data)
        }

        this.emit('message', { subscriptionId: id, message: natsMsg })
      }
    })

    this.subscriptions.set(id, sub)
    this.subscriptionInfo.set(id, {
      id,
      subject,
      active: true,
      messageCount: 0,
      createdAt: new Date()
    })

    return id
  }

  async unsubscribe(subscriptionId: string): Promise<void> {
    const sub = this.subscriptions.get(subscriptionId)
    if (sub) {
      sub.unsubscribe()
      this.subscriptions.delete(subscriptionId)
      this.subscriptionInfo.delete(subscriptionId)
    }
  }

  getSubscriptions(): Subscription[] {
    return Array.from(this.subscriptionInfo.values())
  }

  async request(options: RequestOptions): Promise<RequestResult> {
    if (!this.nc) {
      throw new Error('Not connected to NATS server')
    }

    const startTime = Date.now()
    try {
      const payload = this.encodePayload(options.payload)
      const headers = options.headers ? this.createHeaders(options.headers) : undefined
      const timeout = options.timeout || 5000

      const response = await this.nc.request(options.subject, payload, {
        timeout,
        headers
      })

      return {
        success: true,
        response: this.decodePayload(response.data),
        responseTime: Date.now() - startTime
      }
    } catch (error) {
      return {
        success: false,
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  async startReplyService(subject: string, responsePayload: string): Promise<string> {
    if (!this.nc) {
      throw new Error('Not connected to NATS server')
    }

    const id = uuidv4()
    this.replyPayloads.set(id, responsePayload)
    
    const sub = this.nc.subscribe(subject, {
      callback: (err, msg) => {
        if (err) {
          this.emit('reply-service-error', { id, error: err.message })
          return
        }

        if (msg.reply) {
          try {
            const currentPayload = this.replyPayloads.get(id) || responsePayload
            const payload = this.encodePayload(currentPayload)
            msg.respond(payload)
            this.emit('reply-sent', { id, subject, replyTo: msg.reply })
          } catch (respondErr) {
            this.emit('reply-service-error', { id, error: respondErr instanceof Error ? respondErr.message : 'Failed to respond' })
          }
        }
      }
    })

    this.replyServices.set(id, sub)
    return id
  }

  async stopReplyService(id: string): Promise<void> {
    const sub = this.replyServices.get(id)
    if (sub) {
      sub.unsubscribe()
      this.replyServices.delete(id)
      this.replyPayloads.delete(id)
    }
  }

  async updateReplyPayload(id: string, responsePayload: string): Promise<void> {
    if (this.replyServices.has(id)) {
      this.replyPayloads.set(id, responsePayload)
    }
  }

  async getJetStreamStreams(): Promise<JetStreamInfo[]> {
    if (!this.jsManager) {
      throw new Error('JetStream not available')
    }

    const streams = await this.jsManager.streams.list()
    const result: JetStreamInfo[] = []

    for await (const stream of streams) {
      result.push({
        name: stream.config.name,
        subjects: stream.config.subjects,
        retention: stream.config.retention,
        maxConsumers: stream.config.max_consumers,
        maxMsgs: stream.config.max_msgs,
        maxBytes: stream.config.max_bytes,
        maxAge: stream.config.max_age,
        messages: stream.state.messages,
        bytes: stream.state.bytes
      })
    }

    return result
  }

  async getJetStreamConsumers(streamName: string): Promise<ConsumerInfo[]> {
    if (!this.jsManager) {
      throw new Error('JetStream not available')
    }

    const consumers = await this.jsManager.consumers.list(streamName)
    const result: ConsumerInfo[] = []

    for await (const consumer of consumers) {
      result.push({
        name: consumer.name,
        streamName: streamName,
        ackPolicy: consumer.config.ack_policy,
        deliverSubject: consumer.config.deliver_subject,
        maxDeliver: consumer.config.max_deliver || 1,
        ackWait: consumer.config.ack_wait || 0,
        pending: consumer.num_pending
      })
    }

    return result
  }

  async fetchMessage(streamName: string, consumerName: string): Promise<StoredMessage | null> {
    if (!this.nc) {
      throw new Error('Not connected to NATS server')
    }

    try {
      const js = this.nc.jetstream()
      const consumer = await js.consumers.get(streamName, consumerName)
      const msg = await consumer.fetch({ max_messages: 1, expires: 5000 })

      for await (const m of msg) {
        return {
          subject: m.subject,
          sequence: m.seq,
          timestamp: new Date(Number(m.info.timestampNanos) / 1000000),
          payload: this.decodePayload(m.data)
        }
      }

      return null
    } catch (error) {
      throw new Error(`Failed to fetch message: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  async ackMessage(streamName: string, consumerName: string, sequence: number): Promise<void> {
    if (!this.nc) {
      throw new Error('Not connected to NATS server')
    }

    try {
      const js = this.nc.jetstream()
      const consumer = await js.consumers.get(streamName, consumerName)
      const msgs = await consumer.fetch({ max_messages: 1, expires: 5000 })

      for await (const msg of msgs) {
        if (msg.seq === sequence) {
          msg.ack()
          return
        }
      }
    } catch (error) {
      throw new Error(`Failed to ack message: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  async nakMessage(streamName: string, consumerName: string, sequence: number): Promise<void> {
    if (!this.nc) {
      throw new Error('Not connected to NATS server')
    }

    try {
      const js = this.nc.jetstream()
      const consumer = await js.consumers.get(streamName, consumerName)
      const msgs = await consumer.fetch({ max_messages: 1, expires: 5000 })

      for await (const msg of msgs) {
        if (msg.seq === sequence) {
          msg.nak()
          return
        }
      }
    } catch (error) {
      throw new Error(`Failed to nak message: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private encodePayload(payload: string): Uint8Array {
    return new TextEncoder().encode(payload)
  }

  private decodePayload(data: Uint8Array): string {
    return new TextDecoder().decode(data)
  }

  private isJsonPayload(data: Uint8Array): boolean {
    try {
      const str = this.decodePayload(data)
      JSON.parse(str)
      return true
    } catch {
      return false
    }
  }

  private createHeaders(headers: Record<string, string>): nats.MsgHdrs {
    const h = nats.headers()
    for (const [key, value] of Object.entries(headers)) {
      h.set(key, value)
    }
    return h
  }

  private extractHeaders(headers: nats.MsgHdrs | undefined): Record<string, string> | undefined {
    if (!headers) return undefined
    const result: Record<string, string> = {}
    for (const key of headers.keys()) {
      const value = headers.get(key)
      if (value) {
        result[key] = value
      }
    }
    return Object.keys(result).length > 0 ? result : undefined
  }
}

export const natsService = new NatsService()
