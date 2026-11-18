# SproutFlow Backend

API Express.js untuk Smart Plant Watering (lihat `PRD-backend.md`).

## Setup

```bash
pnpm install
pnpm env:local              # atau pnpm env:online (Supabase + HiveMQ Cloud); lalu isi .env
pnpm db:push                # buat tabel di database (atau db:generate + db:migrate)
psql "$DATABASE_URL" -f seed.sql   # seed perangkat pertama (plant-001)
pnpm dev                    # http://localhost:4000
```

## Catatan

- Handler auth di `/api/auth/*` (Better Auth, Google OAuth). Redirect URI OAuth:
  `{BETTER_AUTH_URL}/api/auth/callback/google`.
- Angkat admin manual:
  `UPDATE "user" SET role = 'admin' WHERE email = 'email@gmail.com';`
  (user harus login Google sekali dulu).
- Topic MQTT memakai prefix `MQTT_TOPIC_PREFIX` (`plant`); backend publish ke
  `{prefix}/{device_id}/pump/set` dan subscribe telemetry, `pump/status`, `status`.
- Perintah pompa di-rate-limit 10/menit per user; tanpa konfirmasi 10 detik →
  log berstatus `timeout` (job watchdog berjalan tiap 5 detik).
- Migrasi dikelola drizzle-kit (`pnpm db:generate` lalu `pnpm db:migrate`,
  atau `pnpm db:push` untuk dev cepat).

## Arsitektur HTTP (Hono)

Lapisan HTTP memakai **Hono** supaya bisa jalan di dua runtime:

| Entry | Runtime | Dipakai untuk |
|---|---|---|
| `src/index.ts` | Node (`@hono/node-server`) | `pnpm dev`, MQTT subscriber, watchdog, auto-pump |
| `worker/index.ts` | Cloudflare Workers | `wrangler deploy` |

- `src/app.ts` — satu Hono app berisi CORS, header keamanan, handler Better Auth
  (`auth.handler`), route health & devices, plus error/404 handler.
- Middleware auth memanggil `auth.api.getSession({ headers: c.req.raw.headers })`.
- Tidak ada `app.listen()` lagi. Untuk lokal, `serve()` dari `@hono/node-server`.

## Deploy ke Cloudflare Workers

Tanpa Docker: `wrangler.jsonc` → `worker/index.ts` → `src/app.ts`.

1. Buat **Hyperdrive** di dashboard Cloudflare yang mengarah ke Supabase.
2. Uncomment binding di `wrangler.jsonc` dan isi id-nya:
   `"hyperdrive": [{ "binding": "HYPERDRIVE", "id": "<id>" }]`
3. Set secrets/vars (DATABASE_URL, BETTER_AUTH_*, GOOGLE_*, FRONTEND_URL, MQTT_*).
4. `pnpm dlx wrangler deploy`.

Kode `src/db/index.ts` otomatis memakai `HYPERDRIVE.connectionString` bila
binding ada, sehingga `pg` tidak perlu menangani TLS sendiri di Workers.

**Keterbatasan Worker:** tidak ada subscriber MQTT persisten. Endpoint tetap
bisa dipakai, tetapi telemetry tidak tersimpan dan `pump/set` tidak dipublish
(`services/pump.ts` hanya mencatat `pump_logs`). Untuk fungsi penuh, jalankan
entry Node atau tambahkan bridge MQTT terpisah.
