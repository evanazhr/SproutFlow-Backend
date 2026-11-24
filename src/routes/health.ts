import type { Hono } from 'hono'
import type { AppEnv } from '../app.js'
import { isMqttConnected } from '../mqtt/client.js'

export function registerHealthRoutes(app: Hono<AppEnv>) {
  app.get('/api/health', (c) =>
    c.json({
      data: {
        status: 'ok',
        // Worker stateless tidak punya subscriber MQTT → selalu false di sana.
        mqtt: isMqttConnected() ? 'connected' : 'disconnected',
      },
    }),
  )
}
