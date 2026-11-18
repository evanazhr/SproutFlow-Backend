import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'

// Supabase/Neon butuh TLS. Memakai `url` dengan `sslmode=require` membuat
// pg-connection-string menafsirkannya sebagai verify-full dan menimpa opsi
// rejectUnauthorized, jadi dipecah menjadi field + ssl eksplisit.
const url = new URL(process.env.DATABASE_URL ?? '')
const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    host: url.hostname,
    port: url.port ? Number(url.port) : 5432,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
    ssl: isLocal ? false : { rejectUnauthorized: false },
  },
})
