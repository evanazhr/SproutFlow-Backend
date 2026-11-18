import { z } from 'zod'

export const deviceParamsSchema = z.object({
  id: z.string().min(1),
})

export const pumpCommandSchema = z.object({
  command: z.enum(['ON', 'OFF']),
})

export const settingsSchema = z
  .object({
    moisture_threshold: z.number().int().min(0).max(100).optional(),
    pump_mode: z.enum(['auto', 'manual']).optional(),
  })
  .refine((v) => v.moisture_threshold !== undefined || v.pump_mode !== undefined, {
    message: 'Tidak ada perubahan yang dikirim',
  })

export const readingsQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  interval: z.enum(['raw', '5m', '1h']).default('raw'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

export const pumpLogsQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})
