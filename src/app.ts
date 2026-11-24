import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { auth } from './auth.js'
import { frontendOrigins, isProd } from './env.js'
import { ApiError } from './lib/http.js'
import type { AuthedSession } from './middleware/requireAuth.js'
import { registerDeviceRoutes } from './routes/devices.js'
import { registerHealthRoutes } from './routes/health.js'

export type AppEnv = {
  Variables: { session: AuthedSession }
}

export const app = new Hono<AppEnv>()

// Header keamanan ringan (pengganti helmet di Express).
app.use('*', async (c, next) => {
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('X-Frame-Options', 'DENY')
  c.header('Referrer-Policy', 'no-referrer')
  await next()
})

app.use(
  '/api/*',
  cors({
    origin: (origin) => {
      if (!origin) return frontendOrigins[0] ?? null
      if (frontendOrigins.includes(origin)) return origin
      // Dev LAN: izinkan origin http/https apa pun agar HP di jaringan sama bisa akses
      if (!isProd) return origin
      return null
    },
    credentials: true,
  }),
)

// Better Auth sudah web-standard: terima Request, balas Response.
app.all('/api/auth/*', (c) => auth.handler(c.req.raw))

registerHealthRoutes(app)
registerDeviceRoutes(app)

app.onError((err, c) => {
  if (err instanceof ApiError) {
    return c.json(
      { error: { code: err.code, message: err.message } },
      err.status as ContentfulStatusCode,
    )
  }
  console.error('[error]', err)
  return c.json(
    { error: { code: 'INTERNAL', message: 'Kesalahan server' } },
    500,
  )
})

app.notFound((c) =>
  c.json(
    { error: { code: 'NOT_FOUND', message: 'Endpoint tidak ditemukan' } },
    404,
  ),
)
