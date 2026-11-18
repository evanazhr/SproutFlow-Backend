import { z } from 'zod'

// Payload MQTT divalidasi dengan Zod; pesan tidak valid dicatat lalu diabaikan.

export const telemetrySchema = z.object({
  soil_moisture: z.number().min(0).max(100),
  temperature: z.number().min(-50).max(80),
  humidity: z.number().min(0).max(100),
  ts: z.number().int().positive(), // unix detik
})

export const pumpStatusSchema = z.object({
  pump_status: z.enum(['ON', 'OFF']),
  ts: z.number().int().positive(),
  request_id: z.string().uuid().optional(),
})

export const deviceStatusSchema = z.object({
  online: z.boolean(),
})

export type TelemetryPayload = z.infer<typeof telemetrySchema>
export type PumpStatusPayload = z.infer<typeof pumpStatusSchema>
export type DeviceStatusPayload = z.infer<typeof deviceStatusSchema>
