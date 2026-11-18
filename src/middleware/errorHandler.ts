import type { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'
import { ApiError } from '../lib/http.js'
import { logger } from '../lib/logger.js'

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message } })
  }

  // Body JSON rusak → anggap input tidak valid
  if (err instanceof SyntaxError && 'body' in err) {
    return res
      .status(422)
      .json({ error: { code: 'VALIDATION_ERROR', message: 'Body JSON tidak valid' } })
  }

  if (err instanceof ZodError) {
    return res.status(422).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: err.issues[0]?.message ?? 'Input tidak valid',
      },
    })
  }

  logger.error({ err, path: req.path }, 'Kesalahan tidak terduga')
  return res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan internal' },
  })
}
