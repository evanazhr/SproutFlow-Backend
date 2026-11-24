import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { username } from 'better-auth/plugins'
import { db } from './db/index.js'
import { account, session, user, verification } from './db/schema.js'
import { env, frontendOrigins, isProd } from './env.js'

const authHost = new URL(env.BETTER_AUTH_URL).hostname
const isLocalAuthUrl = authHost === 'localhost' || authHost === '127.0.0.1'
const isEvanazharDomain = authHost === 'evanazhar.my.id' || authHost.endsWith('.evanazhar.my.id')

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: (request) => {
    if (!isProd) {
      const origin = request?.headers.get('origin')
      return origin ? [...new Set([...frontendOrigins, origin])] : frontendOrigins
    }
    return frontendOrigins
  },
  advanced: {
    // Cookie root domain hanya untuk subdomain evanazhar.my.id (produksi).
    // Untuk localhost/LAN IP, jangan set domain supaya cookie bisa tersimpan.
    crossSubDomainCookies: isEvanazharDomain
      ? { enabled: true, domain: 'evanazhar.my.id' }
      : { enabled: false },
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
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      // Selalu tampilkan dialog pilih akun walau sudah login di 1 akun Google.
      prompt: 'select_account',
    },
  },
  plugins: [username()],
  user: {
    additionalFields: {
      // role tidak bisa diubah dari client; diangkat manual lewat SQL
      role: { type: 'string', defaultValue: 'user', input: false },
    },
  },
})
