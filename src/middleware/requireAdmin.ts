import type { MiddlewareHandler } from 'hono'
import { ApiError } from '../lib/http.js'
import type { AppEnv } from '../app.js'

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get('session')?.user.role !== 'admin') {
    throw ApiError.forbidden('Hanya admin yang dapat melakukan aksi ini')
  }
  await next()
}
