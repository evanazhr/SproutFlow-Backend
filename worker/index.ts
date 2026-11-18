interface HyperdriveBinding {
  connectionString: string
}

interface Env {
  DATABASE_URL: string
  BETTER_AUTH_SECRET: string
  BETTER_AUTH_URL: string
  FRONTEND_URL: string
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  MQTT_URL: string
  MQTT_USERNAME: string
  MQTT_PASSWORD: string
  MQTT_TOPIC_PREFIX: string
  READING_SAMPLE_INTERVAL_SECONDS: string
  PUMP_ACK_TIMEOUT_SECONDS: string
  DEVICE_OFFLINE_AFTER_SECONDS: string
  LOG_LEVEL: string
  HYPERDRIVE?: HyperdriveBinding
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // src/env.ts membaca process.env; di Workers nilai berasal dari binding.
    // Assign dulu, baru import app secara dinamis agar modul membaca nilai ini.
    Object.assign(process.env, env)
    process.env.IS_WORKER = '1'
    if (env.HYPERDRIVE) {
      process.env.HYPERDRIVE_CONNECTION_STRING = env.HYPERDRIVE.connectionString
    }

    const { app } = await import('../src/app.js')
    return app.fetch(request, env, ctx)
  },
}
