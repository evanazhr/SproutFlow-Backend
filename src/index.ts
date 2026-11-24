import 'dotenv/config'
import dns from 'node:dns'
import net from 'node:net'
import { serve } from '@hono/node-server'
import { app } from './app.js'
import { pool } from './db/index.js'
import { env } from './env.js'
import { logger } from './lib/logger.js'
import { closeMqtt, getMqttClient } from './mqtt/client.js'
import { startAutoPump } from './services/autoPump.js'
import { startWatchdog } from './services/watchdog.js'

// IPv6 tidak punya rute keluar di jaringan ini: fetch() Node memilih AAAA
// oauth2.googleapis.com dan ETIMEDOUT saat tukar kode OAuth.
dns.setDefaultResultOrder('ipv4first')
net.setDefaultAutoSelectFamily(false)

const server = serve({ fetch: app.fetch, port: env.PORT, hostname: '0.0.0.0' }, () => {
  logger.info(`SproutFlow backend (Hono) berjalan di 0.0.0.0:${env.PORT}`)
  getMqttClient()
  const stopWatchdog = startWatchdog()
  const stopAutoPump = startAutoPump()

  const shutdown = async (signal: string) => {
    logger.info(`Menerima ${signal}, mematikan server...`)
    server.close()
    const forceExit = setTimeout(() => process.exit(1), 8_000)
    forceExit.unref()
    try {
      stopWatchdog()
      stopAutoPump()
      await closeMqtt()
      await pool.end()
      logger.info('Semua koneksi ditutup, sampai jumpa 👋')
      process.exit(0)
    } catch (err) {
      logger.error({ err }, 'Gagal mematikan dengan benar')
      process.exit(1)
    }
  }

  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
})
