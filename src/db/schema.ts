import {
  bigserial,
  boolean,
  index,
  integer,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

// ============================================================
// Tabel Better Auth (dibuat via `npx @better-auth/cli generate`)
// ============================================================

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  // Field tambahan aplikasi: role dikelola manual di database (default 'user')
  role: text('role').notNull().default('user'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
})

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
})

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', {
    withTimezone: true,
    mode: 'date',
  }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', {
    withTimezone: true,
    mode: 'date',
  }),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
})

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
})

// ============================================================
// Tabel aplikasi
// ============================================================

export const devices = pgTable('devices', {
  id: text('id').primaryKey(), // sama dengan device_id di MQTT, mis. 'plant-001'
  name: text('name').notNull(),
  online: boolean('online').notNull().default(false),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true, mode: 'date' }),
  pumpStatus: text('pump_status', { enum: ['ON', 'OFF'] })
    .notNull()
    .default('OFF'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
})

export const sensorReadings = pgTable(
  'sensor_readings',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    deviceId: text('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'cascade' }),
    soilMoisture: real('soil_moisture').notNull(),
    temperature: real('temperature').notNull(),
    humidity: real('humidity').notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (t) => [index('sensor_readings_device_recorded_idx').on(t.deviceId, t.recordedAt)],
)

export const pumpLogs = pgTable(
  'pump_logs',
  {
    id: uuid('id').primaryKey(), // = request_id pada pump/set
    deviceId: text('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'cascade' }),
    command: text('command', { enum: ['ON', 'OFF'] }).notNull(),
    status: text('status', { enum: ['sent', 'confirmed', 'timeout'] })
      .notNull()
      .default('sent'),
    triggeredByUserId: text('triggered_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }), // null = auto
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => [index('pump_logs_device_created_idx').on(t.deviceId, t.createdAt)],
)

export const deviceSettings = pgTable('device_settings', {
  deviceId: text('device_id')
    .primaryKey()
    .references(() => devices.id, { onDelete: 'cascade' }),
  moistureThreshold: integer('moisture_threshold').notNull().default(35),
  // auto = pompa dikendalikan backend sesuai setpoint; manual = lewat tombol dashboard
  pumpMode: text('pump_mode', { enum: ['auto', 'manual'] })
    .notNull()
    .default('auto'),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
})
