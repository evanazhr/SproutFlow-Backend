import type { NextFunction, Request, Response } from 'express'
import { ApiError } from '../lib/http.js'
import { type AuthedRequest } from './requireAuth.js'

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  const session = (req as AuthedRequest).session
  if (session?.user.role !== 'admin') {
    return next(ApiError.forbidden('Hanya admin yang dapat melakukan aksi ini'))
  }
  next()
}
