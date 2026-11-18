import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { db } from './db/index.js'
import { account, session, user, verification } from './db/schema.js'
import { env } from './env.js'

const authHost = new URL(env.BETTER_AUTH_URL).hostname
const isLocalAuthUrl = authHost === 'localhost' || authHost === '127.0.0.1'

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.FRONTEND_URL],
  advanced: {
    // Saat BETTER_AUTH_URL=https://api-iot.evanazhar.my.id, frontend & backend
    // beda subdomain → cookie pakai root domain supaya state ikut terkirim ke
    // callback. Mode local (localhost) TIDAK boleh pakai domain ini (browser
    // akan menolak cookie), jadi dinonaktifkan.
    crossSubDomainCookies: isLocalAuthUrl
      ? { enabled: false }
      : { enabled: true, domain: 'evanazhar.my.id' },
    // Default cookie state hanya 5 menit; perhatian dialog Google bisa lewat
    // dari itu dan memicu "State not persisted correctly". Samakan dengan
    // masa berlaku verification di DB (10 menit).
    cookies: {
      state: { attributes: { maxAge: 600 } },
    },
  },
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: { user, account, session, verification },
  }),
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      // Selalu tampilkan dialog pilih akun walau sudah login di 1 akun Google.
      prompt: 'select_account',
    },
  },
  user: {
    additionalFields: {
      // role tidak bisa diubah dari client; diangkat manual lewat SQL
      role: { type: 'string', defaultValue: 'user', input: false },
    },
  },
})
