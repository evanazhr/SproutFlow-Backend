import { eq } from 'drizzle-orm'
import { Router } from 'express'
import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
import type { z } from 'zod'
import { db } from '../db/index.js'
import { deviceSettings, devices } from '../db/schema.js'
import { requireAuth, type AuthedRequest } from '../middleware/requireAuth.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { ApiError, ok, okWithMeta } from '../lib/http.js'
import {
  deviceParamsSchema,
  pumpCommandSchema,
  pumpLogsQuerySchema,
  readingsQuerySchema,
  settingsSchema,
} from '../schemas/api.js'
import { sendPumpCommand } from '../services/pump.js'
import { evaluateAutoPump } from '../services/autoPump.js'
import {
  getDeviceDetail,
  getPumpLogs,
  getReadings,
  listDevices,
} from '../services/readings.js'

export const devicesRouter = Router()

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

devicesRouter.get('/devices', requireAuth, async (_req, res) => {
  ok(res, await listDevices())
})

devicesRouter.get('/devices/:id', requireAuth, async (req, res) => {
  const { id } = parse(deviceParamsSchema, req.params)
  ok(res, await getDeviceDetail(id))
})

devicesRouter.get('/devices/:id/readings', requireAuth, async (req, res) => {
  const { id } = parse(deviceParamsSchema, req.params)
  const query = parse(readingsQuerySchema, req.query)
  const { data, meta } = await getReadings(id, query)
  okWithMeta(res, data, meta)
})

devicesRouter.get('/devices/:id/pump-logs', requireAuth, async (req, res) => {
  const { id } = parse(deviceParamsSchema, req.params)
  const query = parse(pumpLogsQuerySchema, req.query)
  const { data, meta } = await getPumpLogs(id, query)
  okWithMeta(res, data, meta)
})

// Rate limit: 10 perintah pompa per menit per user
const pumpLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: false,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const userId = (req as AuthedRequest).session?.user?.id
    // ipKeyGenerator menormalkan IPv6 ke /56 agar tidak bisa di-bypass
    return userId ?? (req.ip ? ipKeyGenerator(req.ip) : 'unknown')
  },
  handler: (_req, res) => {
    res
      .status(429)
      .json({ error: { code: 'RATE_LIMITED', message: 'Terlalu banyak perintah pompa. Tunggu sebentar.' } })
  },
})

devicesRouter.post(
  '/devices/:id/pump',
  requireAuth,
  requireAdmin,
  pumpLimiter,
  async (req, res) => {
    const { id } = parse(deviceParamsSchema, req.params)
    const { command } = parse(pumpCommandSchema, req.body)
    const result = await sendPumpCommand(id, command, (req as AuthedRequest).session.user.id)
    ok(res, result, 202)
  },
)

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

devicesRouter.get('/devices/:id/settings', requireAuth, requireAdmin, async (req, res) => {
  const { id } = parse(deviceParamsSchema, req.params)
  ok(res, await getOrCreateSettings(id))
})

devicesRouter.put('/devices/:id/settings', requireAuth, requireAdmin, async (req, res) => {
  const { id } = parse(deviceParamsSchema, req.params)
  const { moisture_threshold, pump_mode } = parse(settingsSchema, req.body)

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
    .onConflictDoUpdate({
      target: deviceSettings.deviceId,
      set,
    })

  const [row] = await db
    .select()
    .from(deviceSettings)
    .where(eq(deviceSettings.deviceId, id))
    .limit(1)

  ok(res, {
    device_id: row!.deviceId,
    moisture_threshold: row!.moistureThreshold,
    pump_mode: row!.pumpMode,
    updated_at: iso(row!.updatedAt),
  })

  // Setpoint/mode baru bisa langsung mengubah keputusan → evaluasi sekarang
  void evaluateAutoPump(id)
})
