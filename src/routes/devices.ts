import { eq } from 'drizzle-orm'
import type { Hono } from 'hono'
import type { z } from 'zod'
import type { AppEnv } from '../app.js'
import { db } from '../db/index.js'
import { deviceSettings, devices } from '../db/schema.js'
import { ApiError } from '../lib/http.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { requireAuth } from '../middleware/requireAuth.js'
import {
  deviceParamsSchema,
  pumpCommandSchema,
  pumpLogsQuerySchema,
  readingsQuerySchema,
  settingsSchema,
} from '../schemas/api.js'
import { evaluateAutoPump } from '../services/autoPump.js'
import { sendPumpCommand } from '../services/pump.js'
import {
  getDeviceDetail,
  getPumpLogs,
  getReadings,
  listDevices,
} from '../services/readings.js'

function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    throw ApiError.validation(result.error.issues[0]?.message ?? 'Input tidak valid')
  }
  return result.data
}

function iso(value: Date): string {
  return value.toISOString()
}

// Rate limit 10 perintah pompa / menit / user. State per isolate; Worker bisa
// berpindah instance, tapi ini cukup sebagai perlindungan dasar.
const pumpHits = new Map<string, { count: number; resetAt: number }>()

async function getOrCreateSettings(deviceId: string) {
  const [device] = await db
    .select({ id: devices.id })
    .from(devices)
    .where(eq(devices.id, deviceId))
    .limit(1)
  if (!device) throw ApiError.notFound('Perangkat tidak ditemukan')

  await db
    .insert(deviceSettings)
    .values({ deviceId })
    .onConflictDoNothing({ target: deviceSettings.deviceId })

  const [row] = await db
    .select()
    .from(deviceSettings)
    .where(eq(deviceSettings.deviceId, deviceId))
    .limit(1)

  return {
    device_id: row!.deviceId,
    moisture_threshold: row!.moistureThreshold,
    pump_mode: row!.pumpMode,
    updated_at: iso(row!.updatedAt),
  }
}

export function registerDeviceRoutes(app: Hono<AppEnv>) {
  app.get('/api/devices', requireAuth, async (c) => {
    return c.json({ data: await listDevices() })
  })

  app.get('/api/devices/:id', requireAuth, async (c) => {
    const { id } = parse(deviceParamsSchema, c.req.param())
    return c.json({ data: await getDeviceDetail(id) })
  })

  app.get('/api/devices/:id/readings', requireAuth, async (c) => {
    const { id } = parse(deviceParamsSchema, c.req.param())
    const query = parse(readingsQuerySchema, c.req.query())
    const { data, meta } = await getReadings(id, query)
    return c.json({ data, meta })
  })

  app.get('/api/devices/:id/pump-logs', requireAuth, async (c) => {
    const { id } = parse(deviceParamsSchema, c.req.param())
    const query = parse(pumpLogsQuerySchema, c.req.query())
    const { data, meta } = await getPumpLogs(id, query)
    return c.json({ data, meta })
  })

  app.post(
    '/api/devices/:id/pump',
    requireAuth,
    requireAdmin,
    async (c, next) => {
      const key = c.get('session')?.user.id ?? 'unknown'
      const now = Date.now()
      const cur = pumpHits.get(key)
      if (!cur || now > cur.resetAt) {
        pumpHits.set(key, { count: 1, resetAt: now + 60_000 })
      } else if (cur.count >= 10) {
        throw ApiError.rateLimited('Terlalu banyak perintah pompa. Tunggu sebentar.')
      } else {
        cur.count++
      }
      await next()
    },
    async (c) => {
      const { id } = parse(deviceParamsSchema, c.req.param())
      const { command } = parse(pumpCommandSchema, await c.req.json())
      const result = await sendPumpCommand(
        id,
        command,
        c.get('session')!.user.id,
      )
      return c.json({ data: result }, 202)
    },
  )

  app.get('/api/devices/:id/settings', requireAuth, requireAdmin, async (c) => {
    const { id } = parse(deviceParamsSchema, c.req.param())
    return c.json({ data: await getOrCreateSettings(id) })
  })

  app.put('/api/devices/:id/settings', requireAuth, requireAdmin, async (c) => {
    const { id } = parse(deviceParamsSchema, c.req.param())
    const { moisture_threshold, pump_mode } = parse(settingsSchema, await c.req.json())

    const [device] = await db
      .select({ id: devices.id })
      .from(devices)
      .where(eq(devices.id, id))
      .limit(1)
    if (!device) throw ApiError.notFound('Perangkat tidak ditemukan')

    const set: Partial<typeof deviceSettings.$inferInsert> = { updatedAt: new Date() }
    if (moisture_threshold !== undefined) set.moistureThreshold = moisture_threshold
    if (pump_mode !== undefined) set.pumpMode = pump_mode

    await db
      .insert(deviceSettings)
      .values({ deviceId: id, ...set })
      .onConflictDoUpdate({ target: deviceSettings.deviceId, set })

    const [row] = await db
      .select()
      .from(deviceSettings)
      .where(eq(deviceSettings.deviceId, id))
      .limit(1)

    void evaluateAutoPump(id)
    return c.json({
      data: {
        device_id: row!.deviceId,
        moisture_threshold: row!.moistureThreshold,
        pump_mode: row!.pumpMode,
        updated_at: iso(row!.updatedAt),
      },
    })
  })
}
