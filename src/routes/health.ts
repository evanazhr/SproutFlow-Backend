import type { Hono } from 'hono'
import type { AppEnv } from '../app.js'

export function registerHealthRoutes(app: Hono<AppEnv>) {
  app.get('/api/health', (c) => c.json({ data: { status: 'ok' } }))
}
