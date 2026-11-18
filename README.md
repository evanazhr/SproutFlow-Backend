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
