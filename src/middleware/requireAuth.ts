import type { NextFunction, Request, Response } from 'express'
import { fromNodeHeaders } from 'better-auth/node'
import { auth } from '../auth.js'
import { ApiError } from '../lib/http.js'

export type AuthedSession = NonNullable<
  Awaited<ReturnType<typeof auth.api.getSession>>
>

export type AuthedRequest = Request & { session: AuthedSession }

export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) })
  if (!session?.user) return next(ApiError.unauthorized())
  ;(req as AuthedRequest).session = session
  next()
}
