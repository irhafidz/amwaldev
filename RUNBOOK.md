# Runbook Operasional Amwal Monorepo

Panduan resmi prosedur migrasi basis data, deployment staging/produksi, serta verifikasi kepatuhan arsitektur (AMW-01, AMW-02, AMW-16).

> **Kondisi arsitektur (Putaran 17, Batch 6 — lihat `docs/PUTARAN-17.md`):**
> `apps/server` sudah dihapus. Hanya ada dua container aplikasi: `web`
> (TanStack Start + oRPC + Drizzle, port 3000) dan `wa-bot` (Baileys, port
> internal 3001, tanpa rute publik). Seluruh perintah `drizzle-kit`
> dijalankan dari `apps/web`.

---

## 1. Spesifikasi Lingkungan & Variabel

### Port & Koneksi Database (AMW-01 Guardrail)
* **Wajib Port 5432 (Session Mode):** Semua eksekusi `drizzle-kit` dan migrasi Drizzle wajib mengarah ke port `5432`. Guard ini ditegakkan di `apps/web/drizzle.config.ts` — konfigurasi menolak jalan jika `DATABASE_URL` menunjuk port lain.
* **Dilarang Port 6543:** Transaction pooler Supabase (port 6543) tidak mendukung advisory locks dan prepared statements Drizzle.

### Variabel Esensial
* `DATABASE_URL`: Format postgresql session mode (`postgres://...@...:5432/postgres`). Dipegang container `web` (sejak Batch 1; sebelumnya milik `apps/server`).
* `JWT_SECRET`: Secret key HS256 untuk penandatanganan access token (min. 32 karakter).
* `INTERNAL_SECRET`: Secret otentikasi antar-service (`web` → `wa-bot`), min. 16 karakter.
* `PAYMENT_PROVIDER`: `MOCK_SANDBOX` | `MIDTRANS_SANDBOX` | `MIDTRANS_PRODUCTION`.
* `PAYMENT_SERVER_KEY`: Server key Midtrans — **server-only**, tidak pernah masuk bundel klien.
* `BAILEYS_SERVICE_URL`: URL internal wa-bot (opsional; default jaringan Docker).

Kontrak lengkap & validasi zod: `apps/web/src/env/server.ts` (server-only) dan `apps/web/src/env/client.ts` (`VITE_*`, boleh masuk bundel).

---

## 2. Prosedur Migrasi Database (Zero Schema Drift)

Aturan mengikat ada di `db/MIGRATION_RULES.md` — **additive-only**, tidak ada
`db:push`, tidak ada `DROP`/`ALTER ... TYPE` terhadap tabel yang masih dibaca
aplikasi Next.js lama.

### A. Deteksi Drift Lokal
Sebelum melakukan push atau migrasi, pastikan tidak ada deviasi skema:

```bash
cd apps/web
bun run db:generate   # menghasilkan SQL dari packages/core/src/db/schema.ts
bun run db:check      # memvalidasi konsistensi berkas migrasi
```

Jika `db:generate` menghasilkan berkas baru padahal skema tidak sengaja
diubah, itu drift — periksa sebelum melanjutkan.

### B. Terapkan Migrasi

```bash
cd apps/web
bun run db:migrate
```

Migrasi tersimpan di `apps/web/drizzle/` (`0000_baseline.sql` dan
seterusnya). Sumber skema adalah `packages/core/src/db/schema.ts`, bukan
berkas re-export di `apps/web/src/lib/db/schema.ts`.

**Di produksi langkah ini tidak lagi manual.** Container `web` menjalankan
`bun run db:migrate` sendiri lewat `docker-entrypoint.sh` sebelum server naik,
jadi `docker compose ... up -d --build` sudah termasuk migrasi. Kalau migrasi
gagal setelah `DB_MIGRATE_MAX_ATTEMPTS` percobaan (default 10, jeda 3 detik),
container menolak naik — itu disengaja, supaya tidak ada kode baru melayani
trafik di atas skema lama. Menjalankan perintah di atas manual tetap benar dan
idempotent (journal `drizzle.__drizzle_migrations`), misalnya untuk migrasi
lebih awal sebelum jadwal deploy. `SKIP_DB_MIGRATE=1` melewati langkah ini
untuk keadaan darurat.

### C. Guard Otomatis
`scripts/guard-destructive-sql.mjs` berjalan sebagai hook pre-commit
(lefthook) dan menolak SQL destruktif pada berkas migrasi yang di-stage.

---

## 3. Verifikasi Sebelum Deploy

Jalankan seluruh gate dari root repo:

```bash
bun run check-types
bunx @biomejs/biome check ./
cd packages/core && bun test
cd ../../apps/web && bun test
```

Tes `apps/web` memerlukan `TEST_DATABASE_URL` yang menunjuk basis data
fixture terpisah — suite menolak berjalan terhadap basis data lain.

---

## 4. Topologi Deployment

`docker-compose.prod.yml` mendefinisikan tiga service:

| Service | Peran | Ekspos publik |
|---|---|---|
| `caddy` | Reverse proxy + TLS otomatis | 80 / 443 |
| `web` | TanStack Start + oRPC + Drizzle (port 3000) | Lewat Caddy saja |
| `wa-bot` | Daemon Baileys (port 3001, jaringan internal) | **Tidak pernah** (AMW-02) |

Caddy meneruskan seluruh trafik ke `web:3000` — satu blok `reverse_proxy`,
tidak ada lagi blok `@backend` terpisah. Health check memakai `web:3000/health`.

Sesi Baileys disimpan di named volume Docker agar bertahan lintas restart
(AMW-16).
