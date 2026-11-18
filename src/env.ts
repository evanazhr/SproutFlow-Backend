import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL wajib diisi (.env)'),

  BETTER_AUTH_SECRET: z.string().min(16, 'BETTER_AUTH_SECRET minimal 16 karakter'),
  BETTER_AUTH_URL: z.string().default('http://localhost:4000'),
  FRONTEND_URL: z.string().default('http://localhost:3000'),

  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),

  MQTT_URL: z.string().default('mqtt://localhost:1883'),
  MQTT_USERNAME: z.string().default(''),
  MQTT_PASSWORD: z.string().default(''),
  MQTT_TOPIC_PREFIX: z.string().min(1).default('plant'),

  READING_SAMPLE_INTERVAL_SECONDS: z.coerce.number().int().positive().default(60),
  PUMP_ACK_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(10),
  DEVICE_OFFLINE_AFTER_SECONDS: z.coerce.number().int().positive().default(30),

  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
})

const parsed = envSchema.safeParse(process.env)
if (!parsed.success) {
  console.error('❌ Konfigurasi .env tidak valid:')
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`)
  }
  process.exit(1)
}

export const env = parsed.data
export const isProd = env.NODE_ENV === 'production'
