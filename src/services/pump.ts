import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { devices, pumpLogs } from '../db/schema.js'
import { ApiError } from '../lib/http.js'
import { logger } from '../lib/logger.js'
import { publishPumpSet } from '../mqtt/client.js'

export async function sendPumpCommand(
  deviceId: string,
  command: 'ON' | 'OFF',
  userId: string | null, // null = perintah otomatis (auto)
) {
  const [device] = await db
    .select({ id: devices.id, online: devices.online })
    .from(devices)
    .where(eq(devices.id, deviceId))
    .limit(1)
  if (!device) throw ApiError.notFound('Perangkat tidak ditemukan')

  // Default per PRD: tetap kirim walau offline, log 'sent' akan berakhir 'timeout'
  if (!device.online) {
    logger.warn({ deviceId }, 'Perintah pompa dikirim ke perangkat yang terdeteksi offline')
  }

  const requestId = randomUUID()
  await db.insert(pumpLogs).values({
    id: requestId,
    deviceId,
    command,
    status: 'sent',
    triggeredByUserId: userId,
  })

  publishPumpSet(deviceId, command, requestId)
  logger.info({ requestId, deviceId, command, userId }, 'Perintah pompa dipublish')

  return { request_id: requestId, command, status: 'sent' as const }
}
