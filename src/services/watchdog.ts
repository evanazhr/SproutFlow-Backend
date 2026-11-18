import { sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { env } from '../env.js'
import { logger } from '../lib/logger.js'

const WATCHDOG_INTERVAL_MS = 5_000

export function startWatchdog() {
  const timer = setInterval(() => {
    void (async () => {
      try {
        // Tandai perangkat offline bila tidak ada telemetry dalam batas waktu
        await db.execute(sql`
          UPDATE devices
          SET online = false
          WHERE online = true
            AND (last_seen_at IS NULL OR last_seen_at < now() - make_interval(secs => ${env.DEVICE_OFFLINE_AFTER_SECONDS}))
        `)
        // Perintah pompa tanpa konfirmasi dalam batas waktu → timeout
        await db.execute(sql`
          UPDATE pump_logs
          SET status = 'timeout'
          WHERE status = 'sent'
            AND created_at < now() - make_interval(secs => ${env.PUMP_ACK_TIMEOUT_SECONDS})
        `)
      } catch (err) {
        logger.error({ err }, 'Watchdog gagal dijalankan')
      }
    })()
  }, WATCHDOG_INTERVAL_MS)

  return () => clearInterval(timer)
}
