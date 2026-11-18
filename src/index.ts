import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import { toNodeHandler } from 'better-auth/node'
import { auth } from './auth.js'
import { pool } from './db/index.js'
import { env } from './env.js'
import { logger } from './lib/logger.js'
import { errorHandler } from './middleware/errorHandler.js'
import { getMqttClient, closeMqtt } from './mqtt/client.js'
import { devicesRouter } from './routes/devices.js'
import { healthRouter } from './routes/health.js'
import { startAutoPump } from './services/autoPump.js'
import { startWatchdog } from './services/watchdog.js'

const app = express()
app.disable('x-powered-by')

app.use(helmet())
app.use(cors({ origin: env.FRONTEND_URL, credentials: true }))

// Handler Better Auth harus terpasang SEBELUM express.json
// (ia mem-parse body-nya sendiri).
app.all('/api/auth/*splat', toNodeHandler(auth))

app.use(express.json())

// Request log ringan (tanpa data sensitif: hanya method, path, status, durasi)
app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    if (req.url === '/api/health') return
    logger.info(
      { method: req.method, url: req.url, status: res.statusCode, ms: Date.now() - start },
      'http',
    )
  })
  next()
})

app.use('/api', healthRouter)
app.use('/api', devicesRouter)

app.use((_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Endpoint tidak ditemukan' } })
})

app.use(errorHandler)

const server = app.listen(env.PORT, () => {
  logger.info(`SproutFlow backend berjalan di port ${env.PORT}`)
  getMqttClient()
  const stopWatchdog = startWatchdog()
  const stopAutoPump = startAutoPump()

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Mematikan server...')
    server.close()
    const forceExit = setTimeout(() => process.exit(1), 8_000)
    forceExit.unref()
    try {
      stopWatchdog()
      stopAutoPump()
      await closeMqtt()
      await pool.end()
      stopWatchdog()
      logger.info('Semua koneksi ditutup, sampai jumpa 👋')
      process.exit(0)
    } catch (err) {
      logger.error({ err }, 'Gagal mematikan dengan bersih')
      process.exit(1)
    }
  }

  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
})
