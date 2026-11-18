import { and, desc, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { devices, pumpLogs, sensorReadings } from '../db/schema.js'
import { env } from '../env.js'
import { logger } from '../lib/logger.js'
import type {
  DeviceStatusPayload,
  PumpStatusPayload,
  TelemetryPayload,
} from '../schemas/mqtt.js'
import { evaluateAutoPump, rememberSoil } from '../services/autoPump.js'

// Sampling telemetry disimpan di memori (satu proses):
// hanya baris pertama dalam setiap interval yang ditulis ke tabel.
const lastSavedAt = new Map<string, number>()

export async function handleTelemetry(deviceId: string, payload: TelemetryPayload) {
  const recordedAt = new Date(payload.ts * 1000)
  const now = Date.now()
  const intervalMs = env.READING_SAMPLE_INTERVAL_SECONDS * 1000

  // Kendali pompa auto dievaluasi langsung dari payload yang baru masuk
  // (reaktif, tanpa menunggu sampling tabel atau tick loop).
  rememberSoil(deviceId, payload.soil_moisture)
  void evaluateAutoPump(deviceId)

  try {
    await db
      .update(devices)
      .set({ online: true, lastSeenAt: new Date() })
      .where(eq(devices.id, deviceId))

    const last = lastSavedAt.get(deviceId) ?? 0
    if (now - last >= intervalMs) {
      lastSavedAt.set(deviceId, now)
      await db.insert(sensorReadings).values({
        deviceId,
        soilMoisture: payload.soil_moisture,
        temperature: payload.temperature,
        humidity: payload.humidity,
        recordedAt,
      })
    }
  } catch (err) {
    logger.error({ err, deviceId }, 'Gagal memproses telemetry')
  }
}

export async function handlePumpStatus(deviceId: string, payload: PumpStatusPayload) {
  const confirmedAt = new Date(payload.ts * 1000)
  try {
    await db
      .update(devices)
      .set({ pumpStatus: payload.pump_status })
      .where(eq(devices.id, deviceId))

    // Konfirmasi: cocokkan request_id bila ada, jika tidak pakai log 'sent' terbaru
    if (payload.request_id) {
      await db
        .update(pumpLogs)
        .set({ status: 'confirmed', confirmedAt })
        .where(and(eq(pumpLogs.id, payload.request_id), eq(pumpLogs.status, 'sent')))
    } else {
      const [latest] = await db
        .select({ id: pumpLogs.id })
        .from(pumpLogs)
        .where(and(eq(pumpLogs.deviceId, deviceId), eq(pumpLogs.status, 'sent')))
        .orderBy(desc(pumpLogs.createdAt))
        .limit(1)
      if (latest) {
        await db
          .update(pumpLogs)
          .set({ status: 'confirmed', confirmedAt })
          .where(eq(pumpLogs.id, latest.id))
      }
    }
  } catch (err) {
    logger.error({ err, deviceId }, 'Gagal memproses pump/status')
  }
}

export async function handleDeviceStatus(deviceId: string, payload: DeviceStatusPayload) {
  try {
    await db
      .update(devices)
      .set({ online: payload.online })
      .where(eq(devices.id, deviceId))
  } catch (err) {
    logger.error({ err, deviceId }, 'Gagal memproses status perangkat')
  }
}
