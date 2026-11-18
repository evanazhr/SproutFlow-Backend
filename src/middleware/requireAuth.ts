import type { MiddlewareHandler } from 'hono'
import { auth } from '../auth.js'
import { ApiError } from '../lib/http.js'
import type { AppEnv } from '../app.js'

export type AuthedSession = NonNullable<
  Awaited<ReturnType<typeof auth.api.getSession>>
>

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session?.user) throw ApiError.unauthorized()
  c.set('session', session as AuthedSession)
  await next()
}
