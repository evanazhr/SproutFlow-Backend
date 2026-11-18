import { and, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { deviceSettings, devices, pumpLogs } from '../db/schema.js'
import { logger } from '../lib/logger.js'
import { sendPumpCommand } from './pump.js'

/**
 * Kendali pompa otomatis (PRD: penyiram otomatis).
 *
 * Untuk setiap perangkat dengan pump_mode = 'auto':
 *   - kelembapan tanah < setpoint  → pompa ON
 *   - kelembapan tanah >= setpoint → pompa OFF
 *
 * Reaktif: evaluasi dipanggil langsung oleh handler telemetry (payload MQTT
 * yang baru masuk), jadi keputusan memakai data segar (≤ interval telemetry
 * ESP32), bukan baris sensor_readings yang hanya di-sample tiap
 * READING_SAMPLE_INTERVAL_SECONDS. Interval `startAutoPump` tetap berjalan
 * sebagai jaring pengaman bila ada pesan yang terlewat atau setpoint berubah.
 */
const AUTO_PUMP_INTERVAL_MS = 5_000

// Kelembapan terakhir yang diterima per perangkat (dari payload telemetry)
const lastSoil = new Map<string, number>()

export function rememberSoil(deviceId: string, soilMoisture: number) {
  lastSoil.set(deviceId, soilMoisture)
}

export async function evaluateAutoPump(deviceId: string) {
  const soilMoisture = lastSoil.get(deviceId)
  if (soilMoisture === undefined) return // belum pernah ada telemetry

  try {
    const [device] = await db
      .select({
        online: devices.online,
        pumpStatus: devices.pumpStatus,
        moistureThreshold: deviceSettings.moistureThreshold,
        pumpMode: deviceSettings.pumpMode,
      })
      .from(devices)
      .leftJoin(deviceSettings, eq(deviceSettings.deviceId, devices.id))
      .where(eq(devices.id, deviceId))
      .limit(1)
    if (!device) return

    // Default = default kolom DB bila baris settings belum ada
    const threshold = device.moistureThreshold ?? 35
    if ((device.pumpMode ?? 'auto') !== 'auto') return
    if (!device.online) return

    // Masih ada perintah yang belum dikonfirmasi → jangan kirim lagi
    const [pending] = await db
      .select({ id: pumpLogs.id })
      .from(pumpLogs)
      .where(and(eq(pumpLogs.deviceId, deviceId), eq(pumpLogs.status, 'sent')))
      .limit(1)
    if (pending) return

    const needWater = soilMoisture < threshold
    const command = needWater
      ? device.pumpStatus === 'OFF'
        ? ('ON' as const)
        : null
      : device.pumpStatus === 'ON'
        ? ('OFF' as const)
        : null
    if (!command) return

    logger.info(
      { deviceId, command, soilMoisture, threshold },
      'Auto pompa: kelembapan di luar setpoint, kirim perintah',
    )
    await sendPumpCommand(deviceId, command, null)
  } catch (err) {
    logger.error({ err, deviceId }, 'Auto pump gagal dievaluasi')
  }
}

export function startAutoPump() {
  const timer = setInterval(() => {
    // Jaring pengaman: evaluasi ulang perangkat yang pernah mengirim telemetry
    for (const deviceId of lastSoil.keys()) void evaluateAutoPump(deviceId)
  }, AUTO_PUMP_INTERVAL_MS)

  return () => clearInterval(timer)
}
