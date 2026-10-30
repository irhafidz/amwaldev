# Putaran 17 — Teks Siap Salin ke `docs/DECISION_LOG.md`

> Salin seluruh blok di bawah garis ini dan tempel ke bagian **paling bawah**
> `docs/DECISION_LOG.md`. Jangan menyunting entri Putaran 1–15 (append-only).
> Setelah ditempel, berkas ini boleh dihapus.
>
> Catatan: Putaran 16 (pemisahan KPI Tier A vs widget PRATINJAU RFM-D di
> `/admin`, dirujuk pada commit Batch 4) belum pernah dituliskan sebagai
> berkas standalone — hanya tercatat di pesan commit. Gap ini dicatat di sini,
> bukan diperbaiki, agar tidak memperluas cakupan Putaran 17.

---

## Putaran 17 — Architectural Realignment: Fullstack oRPC Monolith (Batch 0)

**Tanggal:** 11 September 2026 (eksekusi Batch 0 realignment `apps/server` → `apps/web`)
**Konteks:** Tim memutuskan melaksanakan klausul review Putaran 15 §6 — *"Penggabungan `apps/server` ke `apps/web` ditunda, ditinjau ulang pasca-staging, bukan di tengah sprint"* — sekarang setelah Batch 0–5 migrasi Dashboard Admin merge ke `main` dan live di staging (`amwal.testimoni.my.id`). Bukan pembatalan Putaran 15; ini pelaksanaan syarat yang sudah dijadwalkan di dalamnya.
**Pengambil keputusan:** Konsensus tim dev (Bara/Awan/Naufal), dieksekusi oleh Claude sebagai Lead Refactor Engineer.

### A. Koreksi Kerangka Rujukan

Permintaan awal merujuk commit `8a6933d`/`6b47cdf`/`99bcbad` sebagai "visi awal monorepo". Audit `git show --stat` membuktikan ketiganya adalah riwayat **scaffolding template** betterz-stack bertanggal 10–12 Agustus 2025 — `apps/server` yang dihapus di `8a6933d` berisi demo `routers/todo.ts` (43 baris), **bukan** `apps/server` Amwal (7.607 LOC domain fiqih/keuangan) yang baru ada kemudian. Keputusan Putaran 17 berdiri di atas **syarat review Putaran 15 §6**, bukan di atas ketiga commit tersebut.

### B. Pendekatan & Batasan

| # | Topik | Keputusan & Alasan |
|---|---|---|
| 1 | **Strangler-fig, bukan big-bang** | `apps/server` tetap bootable & melayani produksi sampai Batch 6. Cutover per-domain di balik flag `ORPC_DOMAINS`. Batch 0 tidak menghapus satu baris pun dari `apps/server`. |
| 2 | **Zone 0 harus tetap teruji tanpa build frontend** | Syarat literal Putaran 15 §6. Dipenuhi lewat `packages/core` di Batch 1 (belum dieksekusi) — Batch 0 baru menyalin `schema.ts`/`relations.ts` verbatim (hash SHA256 diverifikasi identik), belum memindahkan `lib/waqf/ledger.ts`. |
| 3 | **Branch terisolasi** | `refactor/orpc-monolith`, dicabangkan dari `origin/main` (`c421127`). `main` tidak disentuh sampai Batch 6 tuntas & teruji end-to-end. |
| 4 | **`apps/server` dilarang dihapus** sebelum seluruh gate Batch 5 hijau. |
| 5 | **Konsekuensi kredensial (pembalikan sebagian Putaran 14 #2)** | Container `web` akan memegang `DATABASE_URL` mulai Batch 1, dan `JWT_SECRET`/`ENCRYPTION_KEY`/`INTERNAL_SECRET`/`PAYMENT_SERVER_KEY` secara bertahap di Batch 2–4. `docker-compose.prod.yml` belum diubah di Batch 0 — perubahan compose/Caddy resmi ditunda ke Batch 6, tapi dampaknya dicatat di sini sejak sekarang. |

### C. Hasil Eksekusi Batch 0

**Berkas baru:**
- `apps/web/src/lib/db/{schema,relations}.ts` — salinan verbatim dari `apps/server/src/db/*` (SHA256 identik: `49405ff3…`, `dc28dbd9…`)
- `apps/web/src/lib/db/index.ts` — Drizzle client, driver `postgres-js` (sama persis dengan `apps/server`)
- `apps/web/src/lib/orpc/{context,procedures,client}.ts` + `router/{index,admin}.ts` — transport oRPC + guard `publicProcedure`/`protectedProcedure`/`roleProcedure`/`anyRoleProcedure`/`adminProcedure` (padanan 1:1 `requireRole`/`requireAnyRole` Hono — sama token source, sama urutan 401→403, sama pesan error)
- `apps/web/src/routes/health.ts`, `apps/web/src/routes/rpc/$.ts` — server route TanStack Start (`createServerFileRoute`) yang mem-mount `/health` dan `/rpc/*`
- `apps/web/tests/orpc/admin-overview.test.ts` — 3 tes kanari (401/403/200) memakai `call()` dari `@orpc/server`, pola DI `{ database }` sama seperti 68 tes lama

**Berkas dimodifikasi:**
- `apps/web/src/env/server.ts` — ditulis ulang di tempat (bukan berkas baru): field OAuth/CORS sisa template betterz-stack (nol pemakai, diverifikasi via grep) diganti kontrak nyata `DATABASE_URL` + `JWT_SECRET`
- `apps/web/vite.config.ts` — proxy dev `/rpc` dan `/health` **dihapus** (temuan konkret: proxy lama meneruskan kedua path itu ke `apps/server:3001`, menelan rute baru dengan 500 "proxy error" setiap kali `apps/server` tidak jalan). Proxy `/api` **dipertahankan** — 24 titik panggil `lib/amwal-api/*` masih bergantung padanya sampai Batch 4.
- `apps/web/package.json` — `pg`/`@types/pg` (nol pemakai) diganti `postgres` (driver yang sama dengan `apps/server`, agar perilaku `numeric`/tipe identik)

**Belum disentuh (sengaja, di luar cakupan Batch 0):** `apps/web/src/lib/auth/core.ts` (secret masih lewat `process.env.JWT_SECRET || fallback` lama — disatukan ke `env/server.ts` di Batch 2 bersama Auth), `apps/web/src/env/client.ts` (satu pemakai nyata: `routes/dev/payment-simulator.tsx`, dibiarkan).

### D. Bukti Gate (semua PASS)

| # | Kriteria | Hasil |
|---|---|---|
| 1 | `check-types` 2/2, `biome check` 0 error | ✅ `Tasks: 2 successful, 2 total`; `Checked 246 files… No fixes applied` |
| 2 | `apps/server bun test` tak tersentuh | ✅ 68 pass / 0 fail (tak berubah dari sebelum Batch 0) |
| 3 | `apps/web bun test` kanari baru | ✅ 3 pass (401 tanpa token, 403 WAKIF, 200 ADMIN) — total 9/9 termasuk 2 file lama |
| 4 | **Diff payload REST vs oRPC = 0** | ✅ Atas fixture sama (`P17-*`, dibersihkan pasca-verifikasi): REST `GET /api/admin/overview/kpi` dan oRPC `POST /rpc/admin/overview/kpi` sama-sama mengembalikan `{"totalFundsCollected":"1734567.00","paidTransactions":2,"totalTransactions":3,"activePrograms":1}` — byte-identik |
| 5 | `env/server.ts` tidak bocor ke bundel klien | ✅ `bun run build` lalu `grep -rlE "env/server\|DATABASE_URL\|JWT_SECRET" .output/public/` → nol hasil. Muncul benar di `.output/server/` (SSR, privat) |
| 6 | Zero-mock | ✅ `grep -rn "const mock\|DATA_SIMULASI" apps/web/src` → nol hasil |
| 7 | Infra produksi belum berubah | ✅ `docker-compose.prod.yml`, `Caddyfile`, `.github/workflows/deploy.yml` — `git status --porcelain` kosong untuk ketiganya |

### E. Berkas Instruksi Agen — Ditemukan Basi, Diperbaiki

`AGENTS.md`, `GEMINI.md`, dan `.github/instructions/bts.instructions.md` masih mendeskripsikan layout template lama (`apps/server/src/api/`, `apps/server/src/db/schema/` sebagai direktori, `apps/server/src/lib/auth.ts`) — jalur yang **tidak pernah ada** di kode nyata (skema asli: `apps/server/src/db/schema.ts`, satu berkas). Diperbaiki di Batch 0 langkah 10 sekaligus penulisan dokumen ini, karena seluruh agen (termasuk Claude) membaca berkas ini sebagai peta repo.

### F. Rencana Batch Berikutnya (tidak berubah dari usulan awal)

Batch 1 (Shared Kernel & Zone 0) → Batch 2 (Auth & Session) → Batch 3 (Domain Publik & Keuangan) → Batch 4 (Backoffice 17 rute) → Batch 5 (Migrasi Test Suite) → Batch 6 (Decommission `apps/server` + infra). Rincian cakupan file/gate per batch ada di transkrip perencanaan sesi ini.

---

## Putaran 17 — Penutupan Gap WhatsApp, Decommissioning `apps/server`, Penyesuaian Infrastruktur (Batch 6)

**Tanggal:** 11 September 2026
**Konteks:** Batch 5 menutup dengan 165/165 tes lolos secara simultan tapi menandai satu gap fungsional yang belum ditutup: notifikasi WhatsApp konfirmasi settlement belum pernah dipindah dari `apps/server` ke `apps/web` (hanya proxy status/QR Baileys admin yang pindah di Batch 4). Tim memutuskan **tidak menerima regresi fungsional** — porting WhatsApp wajib tuntas sebelum `apps/server` dihapus. Batch 6 ini juga jadi eksekusi final strangler-fig: `apps/server` (yang sejak Batch 0 "dilarang dihapus sebelum seluruh gate Batch 5 hijau" — §B.4 di atas) sekarang boleh dihapus, sekaligus penyesuaian `docker-compose.prod.yml`/`Caddyfile`/`Dockerfile`/`deploy.yml` yang di §B.5 dicatat "ditunda ke Batch 6".
**Catatan cakupan:** Batch 1–5 tidak pernah dituliskan sebagai entri standalone di berkas ini (pola yang sama seperti gap Putaran 16 yang dicatat di §A) — hanya tercatat di pesan commit sepanjang sesi. Gap itu dicatat di sini, bukan diperbaiki, dengan alasan yang sama seperti Putaran 16: tidak memperluas cakupan Batch 6.
**Pengambil keputusan:** Tim dev Amwal, dieksekusi oleh Claude sebagai Lead Refactor Engineer.

### G. Penutupan Gap WhatsApp (Zero Regression)

`apps/server/src/lib/whatsapp/{service,templates,notify}.ts` dipindah mengikuti pola Batch 1–5: `templates.ts` (murni) dan orkestrasi `notify.ts`/`service.ts` (DB/env-touching tapi DI-clean) pindah utuh ke `packages/core/src/whatsapp/*` — `baileysServiceUrl`/`internalSecret` kini parameter wajib, bukan `env` modul-level (paket bersama tidak boleh mengasumsikan environment satu app). `apps/web/src/lib/whatsapp/index.ts` adalah shim komposisi tipis yang mengikat `env.BAILEYS_SERVICE_URL`/`env.INTERNAL_SECRET` milik `apps/web` sendiri, dengan tanda tangan panggilan identik dengan `notifySettlement` lama `apps/server`.

Hook `onSettled` di `apps/web/src/routes/api/webhooks/payment.ts` kini memanggil `notifySettlement` ini — otomatis terpicu tepat sekali per settlement asli (dijamin oleh guard idempotensi `handlePaymentWebhook` yang sama, bukan mekanisme baru), tidak pernah pada replay webhook, dan kegagalan pengiriman WA tidak pernah memengaruhi respons webhook (best-effort, tidak pernah `throw`).

Tes baru `apps/web/tests/orpc/whatsapp.test.ts` (5 skenario, memakai `Bun.serve()` sungguhan sebagai pengganti wa-bot, bukan mock `fetch`): template WAQF terkirim dengan nomor & isi pesan benar; donatur anonim disapa "Hamba Allah" bukan nama asli; donatur tanpa nomor telepon dilewati tanpa error; layanan Baileys tak terjangkau tidak pernah melempar error; dan — bukti idempotensi end-to-end — settlement asli memicu tepat satu notifikasi sementara replay webhook memicu nol.

### H. Decommissioning `apps/server`

- `apps/server/` dihapus tuntas (`git rm -r` lalu bersihkan `node_modules` sisa) — 60+ berkas sumber, 18 berkas tes, semuanya sudah punya padanan teruji di `apps/web`/`packages/core` per audit paritas Batch 5.
- `apps/server/drizzle.config.ts` dan `apps/server/drizzle/` (3 migrasi SQL + `meta/`) dipindah (`git mv`, riwayat git terjaga) ke `apps/web/` — **bukan dihapus**, karena ini riwayat skema produksi nyata, bukan artefak yang bisa dibuang. `apps/web/package.json` menambah script `db:pull`/`db:generate`/`db:check`/`db:migrate` (drizzle-kit sudah jadi devDependency `apps/web` sejak awal).
- Root `package.json`: `workspaces` menjadi `["apps/web", "apps/wa-bot", "packages/*"]`. `apps/wa-bot` sebelumnya SUDAH ada di direktori (Dockerfile + `bun.lock` sendiri) tapi **tidak pernah terdaftar** sebagai workspace — jadi bukan sekadar mengganti `apps/server`, ini juga menutup gap terpisah yang ditemukan saat audit.
- Tidak ada script/alias literal `apps/server` tersisa di root `package.json` (semua script mendelegasikan lewat `turbo`, yang otomatis hanya menjalankan task untuk workspace yang terdaftar).

### I. Penyesuaian Infrastruktur & Deploy

- **`docker-compose.prod.yml`**: service `server` dihapus total. `web` sekarang satu-satunya aplikasi — memegang `env_file: .env.production` penuh, healthcheck `/health` (menggantikan bekas healthcheck `server`), dan `BAILEYS_SERVICE_URL=http://wa-bot:3001` di jaringan internal `amwal_internal` yang sama. `caddy`'s `depends_on` dialihkan dari `server: service_healthy` ke `web: service_healthy`.
- **`Caddyfile`**: blok `@backend`/`reverse_proxy server:3001` dihapus. Seluruh domain `{$AMWAL_DOMAIN}` (production: `amwal.testimoni.my.id`, dari `.env.production`) sekarang `reverse_proxy web:3000` langsung — `/rpc/*`, `/api/*`, `/health`, dan SSR/aset statis semuanya dilayani `web` dalam satu proses.
- **`Dockerfile`** (root, image `web`): tahap `deps` menambah `COPY packages/core/package.json` (sebelumnya hilang — risiko laten `bun install --frozen-lockfile` gagal konsisten dengan lockfile begitu `packages/core` jadi dependency nyata `apps/web`). Tahap `runner` menambah salinan `packages/core/src/db` + `apps/web/drizzle.config.ts` + `apps/web/drizzle/` — drizzle-kit di dalam image produksi sekarang bisa menjalankan `db:generate`/`db:check`/`db:migrate` lewat `docker compose exec web bun run db:migrate`.
- **`.github/workflows/deploy.yml`**: job build-push `server` dihapus. Skrip deploy SSH diperbarui: `pull web` (bukan `pull server web`), `up -d --build wa-bot web caddy` (menutup gap terpisah: `wa-bot` sebelumnya **tidak pernah** disertakan di `up -d` deploy — jadi kemungkinan besar belum pernah benar-benar jalan di produksi lewat pipeline ini), dan polling healthcheck sekarang membaca `amwal_web` bukan `amwal_server`.
- **Belum/tidak diverifikasi**: Docker daemon tidak tersedia di lingkungan eksekusi sesi ini (`docker info` gagal — `dockerDesktopLinuxEngine` tidak berjalan), sehingga `docker build`/`docker compose up` **belum benar-benar dijalankan**. Perubahan di atas diverifikasi lewat pembacaan cermat + penalaran tentang tiap stage, bukan build sungguhan. **Rekomendasi: build & jalankan `docker compose --env-file .env.production -f docker-compose.prod.yml config` serta `up -d --build` di staging sebelum deploy produksi pertama pasca-Batch-6.**

### J. Audit Keselarasan Template `betterz-stack` (masrurimz/betterz-stack)

Struktur file lengkap upstream diambil langsung dari GitHub (`gh api repos/masrurimz/betterz-stack/git/trees/master?recursive=true`) dan dibandingkan berkas-per-berkas dengan `amwal-bun` pasca-Batch-6.

| # | Aspek | Template `betterz-stack` | `amwal-bun` (pasca-Batch 6) | Status |
|---|---|---|---|---|
| 1 | Nama paket root | `my-better-t-app-2` | `my-better-t-app-2` (belum pernah diganti) | ⚠️ Selaras tapi nama generik — pertimbangkan ganti nama di batch terpisah, di luar cakupan ini |
| 2 | Shape monorepo | `apps/web` + `packages/*` | `apps/web` + `apps/wa-bot` + `packages/*` | ✅ Selaras + ekstensi sah (`wa-bot`, microservice Baileys, bukan bagian template) |
| 3 | Handler oRPC (`routes/api/rpc.$.ts`) | `RPCHandler` di-mount lewat `createServerFileRoute('/api/rpc/$')`, prefix `/api/rpc` | `RPCHandler` + `ResponseHeadersPlugin` di `routes/rpc/$.ts`, prefix `/rpc` | ⚠️ **Menyimpang** — prefix `/rpc` (bukan `/api/rpc`) sudah jadi kontrak Caddy/klien sejak Batch 0; mengubah sekarang murni churn tanpa manfaat fungsional. Dipertahankan sengaja. |
| 4 | Guard procedures (`os.$context<T>()`) | `lib/orpc/index.ts` — `publicProcedure`/`protectedProcedure` via satu middleware `requireAuth` | `lib/orpc/procedures.ts` — `publicProcedure`/`protectedProcedure`/`roleProcedure`/`anyRoleProcedure`/`adminProcedure`, guard berbasis peran (bukan sekadar sesi) | ✅ Pola inti sama (`os.$context`, middleware `.use()`); diperluas karena Amwal butuh RBAC multi-peran, bukan sekadar login/logout |
| 5 | Komposisi router | Objek `default export` datar, tiap prosedur di file terpisah (`routes/todos/-app/get-todos.ts`, dst.) mengikuti layering `-app`/`-domain`/`-components` yang didokumentasikan `CLAUDE.md` | `router/<domain>.ts` — satu file per **domain** (bukan per prosedur), tanpa folder `-app`/`-domain`/`-components` | ⚠️ **Menyimpang paling signifikan.** ~60 prosedur di 12+ domain; satu-file-per-prosedur ala template akan jadi >60 berkas. Pilihan pragmatis Batch 0–5, tapi menyimpang dari Clean Architecture layering yang didokumentasikan `CLAUDE.md` proyek sendiri. |
| 6 | Drizzle config & lokasi migrasi | `schema: './src/lib/db/schema'` (folder), `out: './src/lib/db/migrations'` (co-located di `src/`) | `schema: '../../packages/core/src/db/schema.ts'` (satu file, di paket lain), `out: './drizzle'` (root app, sibling `src/`) | ⚠️ Menyimpang di dua sumbu (lokasi skema DAN lokasi output migrasi) — warisan konvensi `apps/server` lama, dipindah apa adanya di Batch 6 tanpa direstrukturisasi (di luar cakupan) |
| 7 | Skema Drizzle: modular vs monolitik | Folder `schema/` per domain (`auth.ts`, `todo.ts`, `utils.ts`) + `index.ts` barrel | Satu `packages/core/src/db/schema.ts` (30+ tabel) | ⚠️ Menyimpang — tapi kontrak Zod (setengah lain dari "typesafe contracts separation") SUDAH modular: `packages/core/src/contracts/*.ts`, satu file per domain (waqf/zakat/qurban/infaq/admin-*). Skema tabel tidak, kontrak input ya. |
| 8 | Strategi autentikasi | `better-auth` (sesi tersimpan di DB, plugin `reactStartCookies`, siap social login) | JWT access+refresh custom, bcrypt, cookie `amwal_token`/`amwal_refresh` custom | ⚠️ **Menyimpang, sengaja & terdokumentasi** — tabel `users`/`password_hash` bcrypt dipakai bersama aplikasi Next.js lama yang masih hidup; migrasi ke `better-auth` berarti migrasi data legacy, di luar cakupan Putaran 17 mana pun |
| 9 | Driver database | `drizzle-orm/bun-sql` (Bun native `SQL`) | `drizzle-orm/postgres-js` | ⚠️ Menyimpang — keputusan pra-Putaran-17 (kebutuhan Supabase pooler session-mode port 5432, didokumentasikan di `drizzle.config.ts`/`.env.production.example`); terbukti stabil lewat 100+ tes, tidak direkomendasikan diganti |
| 10 | Strategi migrasi | `db:push` (drizzle-kit push, schema-drift langsung — cocok prototipe) tersedia di root scripts | Hanya migrasi SQL bertahap (`db:generate`+`db:migrate`), tidak ada `db:push` | ✅ **Perbedaan yang benar, bukan gap** — Amwal punya data donatur/transaksi produksi nyata; `db:push` cocok untuk template greenfield, bukan sistem live |
| 11 | Tooling root (biome/ultracite/lefthook/turbo) | `@biomejs/biome` 2.1.2, `ultracite` 5.1.2, `lefthook`, `turbo` — identik versi | Sama persis | ✅ Selaras penuh |

**Kesimpulan audit:** `amwal-bun` secara struktural masih jelas berakar dari `betterz-stack` (nama paket, tooling root, pola dasar `os.$context()`+middleware, `createServerFileRoute` untuk rute HTTP murni) — bukan divergensi liar. Penyimpangan yang ada (baris 3, 5, 6, 7, 8, 9) semuanya **bisa dijelaskan dan sengaja**: sebagian warisan pra-Putaran-17 yang dipindah apa adanya demi menghindari churn tak perlu (6, 9), sebagian keputusan produksi yang lebih matang dari template greenfield (8, 10), dan satu (5) adalah trade-off pragmatis skala (~60 prosedur) yang layak didiskusikan ulang di putaran refactor terpisah kalau tim ingin benar-benar menyamai layering `-app`/`-domain`/`-components` template. Tidak ada yang direkomendasikan diubah sebagai bagian Batch 6 ini — audit ini murni pencatatan keselarasan, bukan rencana eksekusi.

### K. Bukti Gate Batch 6 (semua PASS)

| # | Kriteria | Hasil |
|---|---|---|
| 1 | `check-types` 3/3 paket (`@amwal/core`, `wa-bot`, `web`) | ✅ `Tasks: 3 successful, 3 total` |
| 2 | `biome check ./` (bukan `--write`) | ✅ `Checked 257 files… No fixes applied` — 0 error |
| 3 | `bun test` seluruh workspace tersisa | ✅ `apps/web` 78/78 (16 file, +1 `whatsapp.test.ts`), `packages/core` 24/24 — **apps/server (68 tes) sudah 100% terserap** ke dua workspace ini sejak Batch 5, bukan hilang |
| 4 | `apps/server/` benar-benar terhapus | ✅ `ls apps/` → hanya `wa-bot`, `web` |
| 5 | `bun install` pasca-perubahan workspace | ✅ sukses, lockfile tersinkron ulang (apps/wa-bot kini benar-benar anggota workspace) |
