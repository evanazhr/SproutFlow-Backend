import { pino } from 'pino'
import { env, isProd } from '../env.js'

export const logger = pino({
  level: env.LOG_LEVEL,
  base: undefined,
  ...(isProd
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss' },
        },
      }),
})
