import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { env } from '../env.js'
import * as schema from './schema.js'

// Hyperdrive (Cloudflare) sudah menangani TLS ke Postgres, jadi koneksinya
// memakai connection string lokal tanpa ssl. Di luar Workers, TLS diaktifkan
// otomatis untuk host non-localhost (Supabase/Neon).
const hyperdrive = process.env.HYPERDRIVE_CONNECTION_STRING
const raw = hyperdrive || env.DATABASE_URL
const parsedUrl = new URL(raw)
const isLocal = parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1'
const sslDisabled = parsedUrl.searchParams.get('sslmode') === 'disable'
const useSsl = !hyperdrive && !isLocal && !sslDisabled
parsedUrl.searchParams.delete('sslmode')

export const pool = new Pool({
  connectionString: parsedUrl.toString(),
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  max: 5,
})

export const db = drizzle(pool, { schema })
