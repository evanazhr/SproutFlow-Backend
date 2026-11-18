import { and, desc, eq, gte, lte, sql } from 'drizzle-orm'
import type { z } from 'zod'
import { db } from '../db/index.js'
import { devices, pumpLogs, sensorReadings, user } from '../db/schema.js'
import { ApiError } from '../lib/http.js'
import { type pumpLogsQuerySchema, type readingsQuerySchema } from '../schemas/api.js'

type ReadingsQuery = z.infer<typeof readingsQuerySchema>
type PumpLogsQuery = z.infer<typeof pumpLogsQuerySchema>

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null
}

export async function listDevices() {
  const rows = await db.select().from(devices).orderBy(devices.createdAt)
  return rows.map((d) => ({
    id: d.id,
    name: d.name,
    online: d.online,
    last_seen_at: iso(d.lastSeenAt),
    pump_status: d.pumpStatus,
  }))
}

export async function getDeviceDetail(deviceId: string) {
  const [device] = await db
    .select()
    .from(devices)
    .where(eq(devices.id, deviceId))
    .limit(1)
  if (!device) throw ApiError.notFound('Perangkat tidak ditemukan')

  const [latest] = await db
    .select({
      soilMoisture: sensorReadings.soilMoisture,
      temperature: sensorReadings.temperature,
      humidity: sensorReadings.humidity,
      recordedAt: sensorReadings.recordedAt,
    })
    .from(sensorReadings)
    .where(eq(sensorReadings.deviceId, deviceId))
    .orderBy(desc(sensorReadings.recordedAt))
    .limit(1)

  return {
    id: device.id,
    name: device.name,
    online: device.online,
    pump_status: device.pumpStatus,
    latest: latest
      ? {
          soil_moisture: latest.soilMoisture,
          temperature: latest.temperature,
          humidity: latest.humidity,
          recorded_at: iso(latest.recordedAt),
        }
      : null,
  }
}

function readingsWhere(deviceId: string, q: { from?: Date; to?: Date }) {
  const conditions = [eq(sensorReadings.deviceId, deviceId)]
  if (q.from) conditions.push(gte(sensorReadings.recordedAt, q.from))
  if (q.to) conditions.push(lte(sensorReadings.recordedAt, q.to))
  return and(...conditions)
}

export async function getReadings(deviceId: string, q: ReadingsQuery) {
  const offset = (q.page - 1) * q.limit

  if (q.interval === 'raw') {
    const where = readingsWhere(deviceId, q)
    const [rows, countRows] = await Promise.all([
      db
        .select({
          soil_moisture: sensorReadings.soilMoisture,
          temperature: sensorReadings.temperature,
          humidity: sensorReadings.humidity,
          recorded_at: sensorReadings.recordedAt,
        })
        .from(sensorReadings)
        .where(where)
        .orderBy(desc(sensorReadings.recordedAt))
        .limit(q.limit)
        .offset(offset),
      db
        .select({ total: sql<number>`count(*)::int` })
        .from(sensorReadings)
        .where(where),
    ])
    return {
      data: rows.map((r) => ({ ...r, recorded_at: iso(r.recorded_at) })),
      meta: { page: q.page, limit: q.limit, total: countRows[0]?.total ?? 0 },
    }
  }

  // Agregasi bucket waktu (5 menit / 1 jam)
  const bucketSeconds = q.interval === '5m' ? 300 : 3600
  const conditions = [sql`device_id = ${deviceId}`]
  if (q.from) conditions.push(sql`recorded_at >= ${q.from.toISOString()}`)
  if (q.to) conditions.push(sql`recorded_at <= ${q.to.toISOString()}`)
  const whereSql = sql.join(conditions, sql` AND `)

  const [result, countResult] = await Promise.all([
    db.execute(sql`
      SELECT
        avg(soil_moisture)::real AS soil_moisture,
        avg(temperature)::real AS temperature,
        avg(humidity)::real AS humidity,
        to_timestamp(
          floor(extract(epoch from recorded_at) / ${bucketSeconds}) * ${bucketSeconds}
        ) AS recorded_at
      FROM sensor_readings
      WHERE ${whereSql}
      GROUP BY 4
      ORDER BY 4 DESC
      LIMIT ${q.limit} OFFSET ${offset}
    `),
    db.execute(sql`
      SELECT count(*)::int AS total
      FROM (
        SELECT 1 FROM sensor_readings WHERE ${whereSql} GROUP BY 1
      ) AS buckets
    `),
  ])

  const rows = (result.rows ?? []) as Array<{
    soil_moisture: number
    temperature: number
    humidity: number
    recorded_at: Date
  }>
  const total = (countResult.rows?.[0] as { total: number } | undefined)?.total ?? 0

  return {
    data: rows.map((r) => ({ ...r, recorded_at: iso(r.recorded_at) })),
    meta: { page: q.page, limit: q.limit, total },
  }
}

export async function getPumpLogs(deviceId: string, q: PumpLogsQuery) {
  const conditions = [eq(pumpLogs.deviceId, deviceId)]
  if (q.from) conditions.push(gte(pumpLogs.createdAt, q.from))
  if (q.to) conditions.push(lte(pumpLogs.createdAt, q.to))
  const where = and(...conditions)

  const [rows, countRows] = await Promise.all([
    db
      .select({
        id: pumpLogs.id,
        command: pumpLogs.command,
        status: pumpLogs.status,
        triggeredByUserId: pumpLogs.triggeredByUserId,
        createdAt: pumpLogs.createdAt,
        confirmedAt: pumpLogs.confirmedAt,
        userName: user.name,
      })
      .from(pumpLogs)
      .leftJoin(user, eq(pumpLogs.triggeredByUserId, user.id))
      .where(where)
      .orderBy(desc(pumpLogs.createdAt))
      .limit(q.limit)
      .offset((q.page - 1) * q.limit),
    db.select({ total: sql<number>`count(*)::int` }).from(pumpLogs).where(where),
  ])

  return {
    data: rows.map((r) => ({
      id: r.id,
      command: r.command,
      status: r.status,
      triggered_by: r.triggeredByUserId
        ? { type: 'user' as const, id: r.triggeredByUserId, name: r.userName }
        : ({ type: 'auto' as const } as const),
      created_at: iso(r.createdAt),
      confirmed_at: iso(r.confirmedAt),
    })),
    meta: { page: q.page, limit: q.limit, total: countRows[0]?.total ?? 0 },
  }
}
