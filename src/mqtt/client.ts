import mqtt, { type MqttClient } from 'mqtt'
import { env } from '../env.js'
import { logger } from '../lib/logger.js'
import {
  deviceStatusSchema,
  pumpStatusSchema,
  telemetrySchema,
} from '../schemas/mqtt.js'
import { handleDeviceStatus, handlePumpStatus, handleTelemetry } from './handlers.js'

let client: MqttClient | null = null

export function getMqttClient(): MqttClient {
  if (client) return client

  client = mqtt.connect(env.MQTT_URL, {
    username: env.MQTT_USERNAME || undefined,
    password: env.MQTT_PASSWORD || undefined,
    reconnectPeriod: 3000,
    connectTimeout: 10_000,
    keepalive: 30,
    clientId: `sproutflow-backend-${Math.random().toString(16).slice(2, 10)}`,
  })

  client.on('connect', () => {
    logger.info('Terhubung ke broker MQTT')
    client?.subscribe(
      [
        `${env.MQTT_TOPIC_PREFIX}/+/telemetry`,
        `${env.MQTT_TOPIC_PREFIX}/+/pump/status`,
        `${env.MQTT_TOPIC_PREFIX}/+/status`,
      ],
      { qos: 1 },
    )
  })

  client.on('reconnect', () => logger.warn('Menyambung ulang ke broker MQTT...'))
  client.on('error', (err) => logger.error({ err: err.message }, 'Kesalahan MQTT'))

  client.on('message', (topic, payload) => {
    const parts = topic.split('/')
    const [prefix, deviceId, kind, sub] = parts
    if (prefix !== env.MQTT_TOPIC_PREFIX || !deviceId || !kind) return

    let json: unknown
    try {
      json = JSON.parse(payload.toString())
    } catch {
      logger.warn({ topic }, 'Payload MQTT bukan JSON valid, diabaikan')
      return
    }

    if (kind === 'telemetry') {
      const parsed = telemetrySchema.safeParse(json)
      if (!parsed.success) {
        logger.warn({ topic, issues: parsed.error.issues }, 'Telemetry tidak valid, diabaikan')
        return
      }
      void handleTelemetry(deviceId, parsed.data)
    } else if (kind === 'pump' && sub === 'status') {
      const parsed = pumpStatusSchema.safeParse(json)
      if (!parsed.success) {
        logger.warn({ topic, issues: parsed.error.issues }, 'pump/status tidak valid, diabaikan')
        return
      }
      void handlePumpStatus(deviceId, parsed.data)
    } else if (kind === 'status') {
      const parsed = deviceStatusSchema.safeParse(json)
      if (!parsed.success) {
        logger.warn({ topic, issues: parsed.error.issues }, 'status tidak valid, diabaikan')
        return
      }
      void handleDeviceStatus(deviceId, parsed.data)
    }
  })

  return client
}

export function publishPumpSet(deviceId: string, command: string, requestId: string) {
  const c = getMqttClient()
  const topic = `${env.MQTT_TOPIC_PREFIX}/${deviceId}/pump/set`
  const payload = JSON.stringify({ command, request_id: requestId })
  c.publish(topic, payload, { qos: 1 }, (err) => {
    if (err) logger.error({ err: err.message, requestId }, 'Gagal publish pump/set')
  })
}

export function closeMqtt() {
  return new Promise<void>((resolve) => {
    if (!client) return resolve()
    const c = client
    client = null
    c.end(false, () => resolve())
  })
}
