-- Seed awal: tambahkan perangkat pertama (id sama dengan device_id di MQTT).
-- Jalankan lewat psql / Neon SQL editor setelah migrasi.
INSERT INTO devices (id, name, online, pump_status)
VALUES ('plant-001', 'Tanaman Teras', false, 'OFF')
ON CONFLICT (id) DO NOTHING;

INSERT INTO device_settings (device_id, moisture_threshold)
VALUES ('plant-001', 35)
ON CONFLICT (device_id) DO NOTHING;

-- Angkat admin (ganti email, user harus login Google sekali dulu):
-- UPDATE "user" SET role = 'admin' WHERE email = 'email@gmail.com';
