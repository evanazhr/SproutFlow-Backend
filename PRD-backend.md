# PRD Backend: Smart Plant Watering API (v1.1)

> Dokumen ini selaras dengan `PRD-frontend.md`. Bagian **3. Kontrak Bersama** identik di kedua dokumen; jika ada perubahan, ubah di keduanya.

## 1. Ringkasan

Backend Express.js yang:
- menangani autentikasi Google OAuth dan role (Better Auth),
- menyimpan data sensor dan log pompa di NeonDB (Postgres),
- menerima telemetry dari perangkat lewat MQTT,
- menjadi **satu-satunya perantara** perintah pompa dari dashboard ke perangkat.

**Di luar cakupan v1:** UI manajemen role (admin diubah manual di database), notifikasi push, eksekusi mode auto (belum dispesifikasikan), firmware.

## 2. Tech Stack

| Kebutuhan | Pilihan |
|---|---|
| Runtime & framework | Node.js 20+, Express, TypeScript |
| Auth | Better Auth (Google OAuth, session cookie) |
| Database | NeonDB (Postgres) |
| ORM | Drizzle ORM (+ drizzle-kit untuk migrasi) |
| MQTT | `mqtt` (mqtt.js) |
| Validasi | Zod |
| Keamanan | helmet, cors, express-rate-limit |
| Logging | pino |

## 3. Kontrak Bersama (Frontend ↔ Backend)

### 3.1 Konvensi API
- Base URL: `VITE_API_URL` (contoh `https://api.domain.com`). Semua endpoint aplikasi berawalan `/api`.
- Auth memakai **httpOnly cookie** dari Better Auth. Semua request frontend memakai `credentials: 'include'`.
- Format sukses: `{ "data": ..., "meta": { ... } }` (`meta` hanya untuk pagination).
- Format error: `{ "error": { "code": "FORBIDDEN", "message": "..." } }`.
- Kode error: `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `VALIDATION_ERROR` (422), `RATE_LIMITED` (429), `INTERNAL_ERROR` (500).
- Waktu memakai **ISO 8601 UTC** di REST (`2026-11-16T10:00:00Z`); payload MQTT memakai `ts` unix detik.

### 3.2 Role
Hanya dua role: `user` dan `admin`. Disimpan di kolom `user.role` (default `user`), diubah manual di database. Role dikirim ke frontend lewat objek session.

| Fitur | `user` | `admin` |
|---|---|---|
| Dashboard monitoring | ✅ | ✅ |
| `/history` | ✅ | ✅ |
| Kontrol pompa | ❌ | ✅ |
| `/settings` (lihat & ubah) | ❌ | ✅ |

### 3.3 Autentikasi (Better Auth, Google OAuth)
- Handler Better Auth dipasang di backend pada `/api/auth/*`.
- Login: `authClient.signIn.social({ provider: "google", callbackURL: FRONTEND_URL + "/dashboard" })`.
- Session: `authClient.getSession()` / `useSession()` mengembalikan `user: { id, name, email, image, role }`.
- Logout: `authClient.signOut()`.

### 3.4 Endpoint REST

| Method | Endpoint | Akses | Keterangan |
|---|---|---|---|
| GET | `/api/health` | publik | Cek layanan hidup |
| GET | `/api/devices` | login | Daftar perangkat |
| GET | `/api/devices/:id` | login | Detail + pembacaan terakhir + status pompa |
| GET | `/api/devices/:id/readings` | login | Riwayat sensor |
| GET | `/api/devices/:id/pump-logs` | login | Riwayat perintah/aktivitas pompa |
| POST | `/api/devices/:id/pump` | **admin** | Kirim perintah pompa |
| GET | `/api/devices/:id/settings` | **admin** | Ambil pengaturan |
| PUT | `/api/devices/:id/settings` | **admin** | Ubah pengaturan |

**`GET /api/devices/:id`**
```json
{
  "data": {
    "id": "plant-001",
    "name": "Tanaman Teras",
    "online": true,
    "latest": { "soil_moisture": 42, "temperature": 29.5, "humidity": 70, "recorded_at": "2026-11-16T10:00:00Z" },
    "pump_status": "OFF"
  }
}
```

**`GET /api/devices/:id/readings`** — query: `from`, `to` (ISO), `interval` (`raw` | `5m` | `1h`, default `raw`), `page`, `limit` (default 50, maks 200).
```json
{
  "data": [{ "soil_moisture": 42, "temperature": 29.5, "humidity": 70, "recorded_at": "2026-11-16T10:00:00Z" }],
  "meta": { "page": 1, "limit": 50, "total": 1200 }
}
```

**`GET /api/devices/:id/pump-logs`** — query: `from`, `to`, `page`, `limit`.
```json
{
  "data": [{
    "id": "uuid", "command": "ON", "status": "confirmed",
    "triggered_by": { "type": "user", "id": "u1", "name": "Evan" },
    "created_at": "2026-11-16T10:00:00Z", "confirmed_at": "2026-11-16T10:00:02Z"
  }],
  "meta": { "page": 1, "limit": 50, "total": 20 }
}
```
`status`: `sent` | `confirmed` | `timeout`. `triggered_by.type`: `user` | `auto`.

**`POST /api/devices/:id/pump`**
```json
// request
{ "command": "ON" }   // "ON" | "OFF"
// response 202
{ "data": { "request_id": "uuid", "command": "ON", "status": "sent" } }
```
`202` artinya perintah sudah diteruskan ke MQTT, **bukan** pompa sudah menyala. Konfirmasi datang lewat topic `pump/status`.

**`PUT /api/devices/:id/settings`**
```json
{ "moisture_threshold": 35 }
```

### 3.5 MQTT
Topic memakai prefix `plant` (`MQTT_TOPIC_PREFIX`). Topic dan payload ini **asumsi**; sesuaikan dengan firmware lalu ubah di kedua dokumen.

| Topic | Publisher | Subscriber | QoS | Retain |
|---|---|---|---|---|
| `plant/{device_id}/telemetry` | perangkat | frontend, backend | 0 | tidak |
| `plant/{device_id}/pump/status` | perangkat | frontend, backend | 1 | **ya** |
| `plant/{device_id}/pump/set` | backend | perangkat | 1 | tidak |
| `plant/{device_id}/status` (opsional, LWT) | perangkat | frontend, backend | 1 | ya |

Payload:
```json
// telemetry
{ "soil_moisture": 42, "temperature": 29.5, "humidity": 70, "ts": 1731700000 }
// pump/status
{ "pump_status": "ON", "ts": 1731700002 }
// pump/set (backend -> perangkat)
{ "command": "ON", "request_id": "uuid" }
// status (LWT)
{ "online": true }
```
- `soil_moisture` dan `humidity`: persen (0–100). `temperature`: °C.
- `pump_status` nilai `ON` | `OFF`. Perangkat sebaiknya menyertakan kembali `request_id` pada `pump/status` jika merespons perintah tertentu (opsional).
- Akun MQTT frontend: **subscribe only** (ACL broker). Hanya backend yang boleh publish ke `pump/set`.

### 3.6 Alur Kontrol Pompa
```
Admin klik toggle → POST /api/devices/:id/pump → backend cek role → publish pump/set
Perangkat menjalankan pompa → publish pump/status (retained) → frontend & backend menerima
Backend menandai pump_logs.status = confirmed; frontend mengubah badge pump_status
Jika tidak ada konfirmasi dalam 10 detik → pump_logs.status = timeout
```

## 4. Autentikasi & Otorisasi di Backend

```ts
// auth.ts
export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  socialProviders: {
    google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET },
  },
  user: {
    additionalFields: {
      role: { type: "string", defaultValue: "user", input: false }, // tidak bisa diubah dari client
    },
  },
  trustedOrigins: [env.FRONTEND_URL],
});
```
- Pasang `app.all("/api/auth/*splat", toNodeHandler(auth))` **sebelum** `express.json()`.
- Middleware `requireAuth`: ambil session dengan `auth.api.getSession({ headers })`; tanpa session → `401 UNAUTHORIZED`.
- Middleware `requireAdmin`: setelah `requireAuth`, `session.user.role !== "admin"` → `403 FORBIDDEN`.
- Angkat admin lewat SQL (user harus login Google sekali dulu):
  ```sql
  UPDATE "user" SET role = 'admin' WHERE email = 'email@gmail.com';
  ```
- CORS: `origin: FRONTEND_URL`, `credentials: true`.
- Google Cloud Console: buat OAuth Client (Web application), *Authorized redirect URI* = `{BETTER_AUTH_URL}/api/auth/callback/google` (tambahkan versi localhost untuk development).

## 5. Skema Database (NeonDB)

**Tabel auth** (dibuat via `npx @better-auth/cli generate`, lalu migrasi dengan drizzle-kit): `user`, `account`, `session`, `verification`. Tambahan di `user`: `role text not null default 'user'`.

**Tabel aplikasi**

```
devices
├── id            text, PK          (mis. 'plant-001', sama dengan device_id di MQTT)
├── name          text
├── online        boolean, default false
├── last_seen_at  timestamptz
├── pump_status   text ('ON' | 'OFF'), default 'OFF'
└── created_at    timestamptz

sensor_readings
├── id            bigserial, PK
├── device_id     FK → devices.id
├── soil_moisture real
├── temperature   real
├── humidity      real
└── recorded_at   timestamptz
    INDEX (device_id, recorded_at DESC)

pump_logs
├── id            uuid, PK         (= request_id pada pump/set)
├── device_id     FK → devices.id
├── command       text ('ON' | 'OFF')
├── status        text ('sent' | 'confirmed' | 'timeout')
├── triggered_by_user_id  text, FK → user.id, nullable (null = auto)
├── created_at    timestamptz
└── confirmed_at  timestamptz, nullable
    INDEX (device_id, created_at DESC)

device_settings
├── device_id     FK → devices.id, PK
├── moisture_threshold  integer (0–100)
└── updated_at    timestamptz
```
Catatan: simpan telemetry dengan **sampling** (default 1 menit, `READING_SAMPLE_INTERVAL_SECONDS`), bukan setiap pesan, agar tabel tidak cepat besar. Pertimbangkan retensi (mis. hapus data mentah > 90 hari dan simpan agregat per jam).

## 6. Integrasi MQTT di Backend
- Satu koneksi singleton dengan auto-reconnect, memakai akun `backend` (boleh publish dan subscribe).
- Subscribe `plant/+/telemetry`, `plant/+/pump/status`, `plant/+/status`.
- Setiap pesan divalidasi dengan Zod; pesan tidak valid dicatat lalu diabaikan.
- **telemetry:** update `devices.last_seen_at` dan `online = true`; simpan ke `sensor_readings` bila interval sampling terpenuhi.
- **pump/status:** update `devices.pump_status`; cari `pump_logs` berstatus `sent` terbaru (atau yang cocok dengan `request_id`) untuk perangkat itu dan ubah menjadi `confirmed` dengan `confirmed_at`.
- **status (LWT):** update `devices.online`.
- **Watchdog:** job berkala menandai `online = false` jika tidak ada telemetry > 30 detik, dan mengubah `pump_logs` berstatus `sent` yang lebih tua dari 10 detik menjadi `timeout`.
- **Publish perintah:** `POST /api/devices/:id/pump` membuat baris `pump_logs` (`sent`), lalu publish `pump/set` QoS 1 dengan `request_id` = `pump_logs.id`.

## 7. Aturan Bisnis & Keamanan
- Perintah pompa hanya dari `admin`; rate limit pada `POST /pump` (mis. 10 request/menit per user).
- Tolak perintah jika perangkat diketahui `online = false` dengan `409` atau tetap kirim dengan peringatan (tentukan; default: tetap kirim, log `sent`, akan berakhir `timeout`).
- Validasi semua input dengan Zod (`command`, `moisture_threshold` 0–100, query pagination).
- Gunakan `helmet`, HTTPS di produksi, cookie `secure` dan `httpOnly`.
- Akun MQTT frontend read-only di broker (ACL); kredensial backend hanya di `.env` backend.
- Jangan pernah mengembalikan token OAuth (`account.access_token`, dll.) di respons API.
- Log pino tanpa data sensitif; sertakan `request_id` untuk setiap perintah pompa.

## 8. Environment Variables

```env
NODE_ENV=development
PORT=4000

# Database (NeonDB, sslmode=require)
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require

# Better Auth
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=http://localhost:4000
FRONTEND_URL=http://localhost:3000

# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# MQTT (akun backend: boleh publish & subscribe)
MQTT_URL=mqtt://localhost:1883
MQTT_USERNAME=backend
MQTT_PASSWORD=
MQTT_TOPIC_PREFIX=plant              # harus sama dengan frontend

# Perilaku
READING_SAMPLE_INTERVAL_SECONDS=60
PUMP_ACK_TIMEOUT_SECONDS=10
DEVICE_OFFLINE_AFTER_SECONDS=30
```
Validasi env saat startup dengan Zod (`src/env.ts`); sediakan `.env.example`.

## 9. Struktur Folder
```
src/
├── index.ts              # bootstrap Express
├── env.ts
├── auth.ts               # konfigurasi Better Auth
├── db/
│   ├── index.ts          # koneksi Neon + Drizzle
│   └── schema.ts         # auth + tabel aplikasi
├── mqtt/
│   ├── client.ts         # koneksi singleton
│   └── handlers.ts       # telemetry, pump/status, status
├── middleware/
│   ├── requireAuth.ts
│   ├── requireAdmin.ts
│   └── errorHandler.ts
├── routes/
│   ├── devices.ts
│   └── health.ts
├── services/
│   ├── readings.ts
│   ├── pump.ts           # buat log + publish + konfirmasi
│   └── watchdog.ts
└── schemas/              # Zod: payload MQTT & request API
```

## 9a. Non-Fungsional
- Latensi API p95 < 300 ms untuk endpoint baca (di luar cold start Neon).
- Pesan MQTT diproses dan diteruskan < 1 detik.
- Graceful shutdown: tutup koneksi MQTT dan DB.
- Migrasi database dikelola dengan drizzle-kit dan masuk ke repo.

## 10. Kriteria Penerimaan
- [ ] Login Google berhasil, user baru otomatis berrole `user`.
- [ ] `/api/auth/*` aktif dan session mengandung `role`; `role` tidak dapat diubah dari client.
- [ ] Setelah role diubah ke `admin` di database, endpoint admin dapat diakses.
- [ ] Endpoint login-only menolak request tanpa sesi (`401`); endpoint admin menolak non-admin (`403`).
- [ ] Telemetry MQTT tersimpan sesuai interval sampling dan tampil di `/readings`.
- [ ] `POST /pump` membuat `pump_logs` berstatus `sent`, mem-publish `pump/set`, dan berubah menjadi `confirmed` saat `pump/status` diterima, atau `timeout` setelah 10 detik.
- [ ] `GET /api/devices/:id` mengembalikan pembacaan terakhir, status pompa, dan status online.
- [ ] Semua respons mengikuti format di 3.1; input tidak valid menghasilkan `422`.
- [ ] CORS hanya mengizinkan `FRONTEND_URL` dengan credentials.
- [ ] Rate limit pada endpoint kontrol pompa aktif.

## 11. Dependensi pada Frontend & Perangkat
- Frontend: memakai Better Auth client, mengikuti kontrak di bagian 3, dan hanya subscribe MQTT. Lihat `PRD-frontend.md`.
- Perangkat/firmware: mengikuti topic dan payload di 3.5, mempublish `pump/status` (retained) setelah mengeksekusi perintah, dan sebaiknya mengatur LWT pada topic `status`.
- Broker MQTT: aktifkan WebSocket (frontend), ACL (frontend read-only, backend read/write), dan TLS di produksi.

## 12. Pertanyaan Terbuka
1. Format topic dan payload MQTT final dari firmware?
2. Mode **auto** dijalankan di perangkat atau backend? Jika di backend, tambahkan layanan yang membandingkan `soil_moisture` dengan `moisture_threshold` dan mengirim `pump/set` dengan `triggered_by = auto`.
3. Perilaku saat perangkat offline: tolak (`409`) atau tetap kirim?
4. Kebijakan retensi data sensor (berapa lama data mentah disimpan)?
