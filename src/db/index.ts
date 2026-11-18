import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { env } from '../env.js'
import * as schema from './schema.js'

// TLS otomatis untuk semua host selain localhost/127.0.0.1 — mencakup Neon
// maupun Supabase (pooler/direct). pg >=8.16 menafsirkan `sslmode=require`
// sebagai verify-full dan menimpa `rejectUnauthorized: false`, sehingga
// koneksi ke pooler Supabase gagal dengan SELF_SIGNED_CERT_IN_CHAIN. Karena itu
// parameter sslmode dilepas dari connection string; TLS tetap diatur lewat ssl.
const parsedUrl = new URL(env.DATABASE_URL)
const isLocal = parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1'
const sslDisabled = parsedUrl.searchParams.get('sslmode') === 'disable'
const useSsl = !isLocal && !sslDisabled
parsedUrl.searchParams.delete('sslmode')

export const pool = new Pool({
  connectionString: parsedUrl.toString(),
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  max: 5,
})

export const db = drizzle(pool, { schema })
