# Sprint 11 — Master Plan (Salinan Eksekusi)

> **Status:** DISETUJUI tim · **Basis kode:** `main` + fitur `pankop` (dimerge ke `sprint-11`)
> **Jendela kerja agent:** Senin–Rabu (3 hari aktif) · **Kamis:** freeze, audit manual & smoke test oleh Bara, Naufal, Awan
> **Pelaksana:** 10 agent AI — 9 agent lane + Claude Pro (anchor & reviewer)
> **Lingkungan eksternal:** sandbox **live** Mayar dan Supabase Storage (bukan mock lokal)
>
> Berkas ini adalah **sumber kebenaran tunggal** untuk agent. Artefak "Sprint 11 Flight
> Plan" (4 hari, 7 agent) sudah digantikan oleh dokumen ini. Setiap agent **wajib**
> membaca §3 (kepemilikan berkas) dan §4 (aturan hotspot) sebelum menulis satu baris pun.

---

## 0. Prasyarat yang sudah dieksekusi (14 Sep 2026)

| # | Ranjau | Tindakan | Bukti |
|---|---|---|---|
| P1 | `apps/web/.env` menyimpan URL Supabase pooler **produksi** (baris yang di-comment, berisi password asli) | Baris dihapus; tersisa hanya DB dev lokal | `grep -c pooler apps/web/.env` → `0`. Berkas ini tidak ter-track git — **setiap mesin agent wajib memeriksa `.env`-nya sendiri** |
| P2 | `_journal.json` di `pankop` mereferensikan `0003_sharp_silver_sable` tanpa SQL/snapshot (ikut terhapus bersama `apps/server` saat merge `49ad0d7`) | SQL + snapshot dipulihkan **byte-identik** dari `cbee823`, bukan digenerate ulang | `drizzle-kit check` bersih · `drizzle-kit generate` → "No schema changes" · `prevId` snapshot `0003` = id snapshot `0002` di `main` |
| P3 | Guard DB uji terkunci ke satu nama (`amwal_bun_s10_b06_test`), diduplikasi di 19 berkas tes | Dipusatkan ke `apps/web/tests/test-database-guard.ts`; pola `^amwal_bun_[a-z0-9_]+_test$` dicocokkan ke **nama database** (bukan substring URL), dan diterapkan ke `DATABASE_URL` **serta** `TEST_DATABASE_URL` | Lihat §4.3 |
| P4 | Hook pre-commit `npx ultracite format` berjalan pada **seluruh repo** (tanpa `{staged_files}`). Setiap commit yang men-stage `.ts`/`.json` memformat ulang berkas milik agent lain dan meninggalkannya kotor — bertentangan langsung dengan §3 | **Diperbaiki (disetujui tim).** Hook kini `bunx @biomejs/biome check --write … {staged_files}`. Biome dipanggil langsung, bukan lewat `ultracite format`, karena ultracite membungkus ulang setiap path dengan kutip ganda untuk shell kedua — di shell POSIX, `$` pada `certificates.$id.ts`, `rpc/$.ts`, `riwayat/$transactionId.tsx` ikut terekspansi. Seluruh repo juga sudah diformat sekali di `sprint-11` (`2c3d78f`) | Terjadi saat commit pemulihan `0003`: 31 berkas `pankop` ikut termodifikasi (hanya format) |

> **Kenapa guard tidak diletakkan di `tests/orpc/test-utils.ts`:** berkas itu meng-import
> `lib/orpc/context.ts` → `lib/db` → `env/server.ts`, yang memvalidasi env **saat import** dan
> melempar error-nya sendiri (mis. `ENCRYPTION_KEY` hilang) — pesan guard tidak akan pernah terlihat.
> Modul guard sengaja tidak meng-import apa pun dari aplikasi.

---

## 1. Keputusan final D1–D6 (kontrak mengikat)

Setiap keputusan di bawah **dibekukan Senin 13:00 WIB** dalam bentuk kontrak Zod/TypeScript
milik Claude Pro. Perubahan sesudahnya hanya lewat `docs/sprint-11/CONTRACT-CHANGES.md`.

> **Konfirmasi tim (14 Sep 2026)** — tiga poin yang sebelumnya terbuka kini final:
> - **D1 sub-program:** konstanta pemetaan dengan default `'00'` untuk semua modul sampai YMI
>   menyerahkan tabel resmi. Mengganti pemetaan tidak memerlukan migrasi.
> - **D5 Mayar:** desain fail-closed dilanjutkan — body webhook tidak pernah dipercaya; status dan
>   nominal selalu diambil ulang dari API Mayar memakai API key sisi server.
> - **D5 kredensial:** hanya di sandbox terisolasi. `MAYAR_API_KEY` → Claude Code Bara & Claude Pro;
>   `SUPABASE_SERVICE_ROLE_KEY` → Antigravity Bara & Claude Pro. Agent lain tidak menerima keduanya.
>
> Daftar tiket harian ada di `SPRINT_BACKLOG.md` (root) bagian **SPRINT 11**.

### D1 — ID Transaksi 12 digit

```
 MM  BB  YY  SS  NNNN
 60  09  26  00  0001   →  600926000001
 │   │   │   │   └─ sequence 0001–9999, reset per cakupan MM+BB+YY+SS
 │   │   │   └───── sub-program (2 digit)
 │   │   └───────── tahun, 2 digit terakhir — zona Asia/Jakarta
 │   └───────────── bulan 01–12 — zona Asia/Jakarta
 └───────────────── modul: 60 Wakaf · 70 Zakat · 80 Infaq · 85 Sedekah · 90 Qurban
```

- **Regex kanonik:** `^(60|70|80|85|90)(0[1-9]|1[0-2])(\d{2})(\d{2})(\d{4})$`
- **Zona waktu:** bulan & tahun dihitung di `Asia/Jakarta` lewat satu helper `wibParts()` di
  `@amwal/core/time/wib.ts`. Server berjalan UTC — tanpa ini, order 1 Okt 00:00–06:59 WIB
  tercatat bulan September.
- **Sedekah (85) vs Infaq (80):** tidak ada modul pembayaran `SEDEKAH` terpisah. Kode diturunkan
  dari `infaq_orders.jenis`: `SEDEKAH_*` → `85`, `INFAQ_*` → `80`.
- **Sub-program:** tabel pemetaan resmi **belum diberikan**. Sampai YMI menyerahkannya, semua
  modul memakai `00`. Pemetaan tinggal di satu konstanta di `order-id.ts` — mengubahnya tidak
  memerlukan migrasi.
- **Kapasitas & kehabisan:** 9.999 per modul+bulan+sub-program. Order ke-10.000 **melempar
  `ORDER_SEQUENCE_EXHAUSTED`** — tidak pernah berputar ke `0000`, tidak pernah menambah digit ke-13.
- **Celah nomor itu normal:** nomor dibuat *sebelum* charge (anchor-before-charge), jadi order yang
  gagal di gateway meninggalkan celah. Nomor ini adalah referensi, bukan nomor kuitansi tanpa celah.
- **Penyimpanan:** selalu `text`. Jangan pernah di-cast ke `number` di kode maupun ekspor.
- **Kompatibilitas:** `moduleFromOrderId()` di webhook **wajib** tetap mengenali format lama
  (`AMW-WAQF-…`, `INF-…`) selama order PENDING lama masih bisa menerima callback.

**Counter race-safe** (tabel baru di migrasi `0004`, dijalankan di dalam transaksi anchor yang sama):

```sql
CREATE TABLE transaction_id_counters (
  scope_key  text PRIMARY KEY,          -- '60-0926-00'
  last_value integer NOT NULL CHECK (last_value BETWEEN 1 AND 9999)
);

INSERT INTO transaction_id_counters (scope_key, last_value) VALUES ($1, 1)
ON CONFLICT (scope_key)
DO UPDATE SET last_value = transaction_id_counters.last_value + 1
RETURNING last_value;
-- CHECK constraint menjadikan kehabisan sequence gagal di level database, bukan hanya di TypeScript.
```

### D2 — Poin transaksi

```
poin = 200 + ⌊ nominal_rupiah / 1.000 ⌋        -- hanya untuk transaksi LUNAS
```

- Dua baris ledger dengan kunci idempotensi terpisah: `txn:{transactionId}` (+200) dan
  `txnamt:{transactionId}` (+⌊nominal/1.000⌋). Webhook ganda tidak mungkin memberi poin dua kali.
- Nominal dihitung dari `transactions.amount` (numeric) sebagai rupiah bulat; pecahan ditolak.
- **Poin non-moneter.** Tidak ada prosedur, kolom, atau UI yang mengonversi poin ke rupiah.

### D3 — Template akad dinamis

Akad adalah **bukti hukum**. Karena itu redaksi tidak pernah di-`UPDATE` di tempat: setiap
perubahan admin menerbitkan **versi baru**, dan setiap donasi mencatat versi mana yang disetujui.

```sql
CREATE TABLE akad_templates (
  id            text PRIMARY KEY,
  module        text NOT NULL CHECK (module IN ('WAKAF','ZAKAT','INFAQ','SEDEKAH','QURBAN')),
  version       integer NOT NULL,
  title         text NOT NULL,
  body          text NOT NULL,
  is_active     boolean NOT NULL DEFAULT false,
  created_by_id text,
  created_at    timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (module, version)
);
CREATE UNIQUE INDEX akad_templates_one_active ON akad_templates (module) WHERE is_active;

CREATE TABLE akad_acceptances (
  transaction_id    text PRIMARY KEY,
  akad_template_id  text NOT NULL,
  version           integer NOT NULL,
  body_sha256       text NOT NULL,        -- menjamin teks yang disetujui tidak bisa diubah diam-diam
  accepted_at       timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

- **Nilai bawaan:** migrasi `0004` mengisi versi 1 per modul **dari redaksi yang sudah tampil di UI
  saat ini** (mis. modal akad wakalah qurban). Agent **dilarang mengarang teks akad baru**. Modul yang
  belum punya redaksi di UI diisi `is_active = false` sampai admin mengaktifkannya.
- **Prosedur admin:** `admin.akad.list`, `admin.akad.publishVersion` (insert versi baru, nonaktif),
  `admin.akad.activate` (menukar versi aktif dalam satu transaksi).
- **Prosedur publik:** `akad.active({ module })` — mengembalikan `null` bila modul belum punya versi aktif.
- **Pencatatan persetujuan:** `createPayment()` menerima parameter opsional `akadAcceptance` dan
  menulis `akad_acceptances` **di dalam transaksi anchor yang sama**.
- Tabel terpisah ini sengaja dipilih agar tidak menambah kolom pada 4 tabel order yang masih dibaca
  aplikasi Next.js lama.

### D4 — Sertifikat

- **Layout:** generator di `@amwal/core/certificate/generator.ts` sudah port 1:1 dari
  `amwalheti/lib/certificate-generator.ts` (diff hanya komentar & format). Tugasnya **mengunci
  paritas**, bukan mendesain ulang — setiap perubahan visual di luar dua butir berikut butuh acuan
  dari tim desain.
- **Jam transaksi:** `DD MMMM YYYY, HH:mm:ss WIB` dengan `timeZone: 'Asia/Jakarta'` eksplisit.
  Generator hari ini memakai `toLocaleDateString` tanpa zona waktu → transaksi dini hari WIB tercetak
  **tanggal kemarin**. Ini bug yang ikut diperbaiki.
- **Verifikasi QR:** rute publik `/verifikasi/$nomor`. QR saat ini menaut ke
  `https://amwal.id/verify-cert/…` yang **tidak punya rute** — basis URL dipindah ke env server
  `PUBLIC_APP_URL`.
- **Minimisasi data halaman verifikasi:** hanya nomor sertifikat, status valid/tidak, jenis & judul
  program, tanggal-jam. Nama donatur **disamarkan** bila `isAnonymous`. Nominal tidak ditampilkan.

### D5 — Mayar & Supabase Storage (sandbox live)

**Mayar — fail-closed, re-fetch dari API server:**

Dokumentasi resmi Mayar **tidak mendokumentasikan autentikasi webhook** (tanpa HMAC/header tanda
tangan), `data.status` bertipe Boolean, dan tidak ada field referensi merchant yang terdokumentasi.
Karena itu body webhook **tidak pernah** dipakai untuk mengubah ledger.

```ts
// @amwal/core/payment/types.ts — kontrak v2 (Claude Pro, beku Senin 13:00)
export interface ProviderEvent {
  providerRef: string;                    // → transactions.payment_gateway_ref (sudah unique)
  orderId: string | null;
  outcome: 'LUNAS' | 'PENDING' | 'GAGAL'; // normalisasi pindah ke adapter, keluar dari webhook.ts
  grossAmount: string;
}
export interface PaymentProvider {
  readonly name: 'MOCK' | 'MIDTRANS' | 'MAYAR';
  createTransaction(payload: CreatePaymentPayload): Promise<CreatePaymentResponse>;
  /** null ⇒ 403 tanpa menyentuh database. */
  resolveWebhook(request: Request, rawBody: string): Promise<ProviderEvent | null>;
}
```

`MayarPaymentProvider.resolveWebhook`:
1. Token `?t=` di URL webhook dibandingkan constant-time dengan `MAYAR_WEBHOOK_TOKEN` (saringan murah, bukan bukti).
2. Hanya event `payment.received` yang diproses; event lain → `200` tanpa efek.
3. **Re-fetch** detail transaksi dari API Mayar memakai `MAYAR_API_KEY` di server.
4. Status & nominal **hanya** diambil dari hasil re-fetch.
5. Nominal re-fetch ≠ nominal anchor → tolak dan catat alert (melindungi ledger wakaf, Zone 0).
6. Korelasi lewat `providerRef` yang disimpan saat `createTransaction`.

- Midtrans & Mock **dibungkus ulang ke kontrak v2, tidak dihapus**. Verifikasi SHA-512 dan
  `paymentOutcome()` pindah ke adapter masing-masing. Tes idempotensi webhook yang ada **wajib tetap
  hijau tanpa diubah** — itulah jaring pengaman refaktor.
- `PAYMENT_PROVIDER` ditambah `MAYAR_SANDBOX | MAYAR_PRODUCTION`. Basis URL API **tidak diasumsikan**:
  `MAYAR_API_BASE_URL` diisi dari dashboard Mayar.
- **Satu URL webhook per akun Mayar.** Dev server lokal tidak bisa dijangkau internet, jadi hanya
  **Claude Code Bara** yang mendaftarkan satu URL tunnel/staging. Agent lain memakai `MOCK_SANDBOX`.
- **Gate keputusan Selasa 13:00:** bila spike belum membuktikan korelasi `providerRef` dan bentuk
  status asli, Mayar tetap di balik flag dan Midtrans menjadi jalur demo Kamis.

**Supabase Storage — privat, fail-closed:**

- Bucket privat `amwal-receipts`. Upload **hanya lewat server** (`routes/api/uploads/**`).
- MIME allowlist: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`; ukuran ≤ 5 MB.
- Yang disimpan di database adalah **object key** (`amwal-receipts/<programId>/<ulid>.<ext>`), bukan
  URL publik. Tampilan memakai signed URL berumur 10 menit.
- **Gagal = error.** Helper legacy `amwalheti/lib/storage.ts` diam-diam mengembalikan URL palsu dan
  menyimpan URL project hardcoded — **dilarang di-port**.
- **Wajib foto:** pencatatan kuitansi belanja ditolak bila tidak melampirkan minimal satu foto
  barang/pembuat/progres fisik.

**Aturan kredensial untuk 10 agent:**
- Gunakan **project Supabase sandbox tersendiri**, bukan project yang dirujuk `.env.production`.
- `SUPABASE_SERVICE_ROLE_KEY` (melewati RLS) hanya dipasang di lingkungan **Antigravity Bara** dan
  **Claude Pro**. Agent lain menguji upload lewat dev server.
- `MAYAR_API_KEY` hanya di lingkungan **Claude Code Bara** dan **Claude Pro**.
- Kredensial tidak pernah ditulis ke berkas yang ter-track, log, pesan commit, atau status agent.

### D6 — Kebijakan saldo poin

- Saldo **tidak pernah di bawah 0**.
- Penalti tidak check-in **−20 per hari**, dihitung paling jauh **7 hari ke belakang** per penyelesaian.
- Dihitung **malas** (saat check-in atau membuka saldo) dan diulang oleh sweep malam — keduanya
  memanggil fungsi yang sama.

```
settlePenalties(userId, today WIB):
  pg_advisory_xact_lock(hashtext(userId))       -- kunci per-user; tidak menyentuh tabel transactions
  saldo := SUM(points_earned) milik user
  untuk d dari (today − 7) sampai (today − 1), urut naik, lewati hari sebelum tanggal daftar:
    jika tidak ada baris 'checkin:{userId}:{d}':
      potong := min(20, saldo)                  -- floor 0
      INSERT ... ('penalty:{userId}:{d}', -potong) ON CONFLICT (idempotency_key) DO NOTHING
      saldo  := saldo − potong
```

Baris penalti bernilai `0` **tetap ditulis** ketika saldo sudah 0 — itu yang menandai hari tersebut
"sudah diselesaikan" sehingga perhitungan ulang selalu menghasilkan saldo identik.

**Aturan poin lengkap** (semua lewat `INSERT … ON CONFLICT (idempotency_key) DO NOTHING`):

| Aktivitas | Poin | Kunci idempotensi |
|---|---|---|
| Daftar akun | +1000 | `register:{userId}` |
| Daily check-in | +50 | `checkin:{userId}:{YYYY-MM-DD WIB}` |
| Kuis lulus | +75 | `quiz:{userId}:{quizId}` — sekali per kuis |
| Baca artikel (dwell ≥ 30 dtk) | +50 | `read:{userId}:{contentId}` |
| Tonton video | +50 | `watch:{userId}:{contentId}` — **dipotong pertama** bila telat |
| Transaksi LUNAS | +200 | `txn:{transactionId}` |
| Nominal transaksi | +⌊Rp/1.000⌋ | `txnamt:{transactionId}` |
| Tidak check-in | −20 (floor 0) | `penalty:{userId}:{YYYY-MM-DD WIB}` |

Migrasi `0004` menambah kolom aditif `idempotency_key text UNIQUE` dan `source_ref text` pada
`gamification_point_ledgers`.

---

## 2. Rekonsiliasi lingkup

| # | Item | Pemilik | Hari |
|---|---|---|---|
| I-1 | ID transaksi 12 digit (D1) | Claude Code Bara | Sen–Sel |
| I-2 | Bukti pengeluaran kas + foto wajib (D5) | Antigravity Bara | Sen–Rab |
| I-3 | Tombol bagikan + template chat | Codex Awan (komponen) · Claude Code Awan (penempatan) | Sel–Rab |
| I-4 | Afiliasi + anti-abuse | Antigravity Naufal | Sel–Rab |
| I-5 | Sertifikat detik WIB + `/verifikasi/$nomor` (D4) | Codex Awan | Sel–Rab |
| I-6 | Template akad dinamis (D3) | Claude Code Awan | Sel–Rab |
| I-7 | Overhaul grafik admin | Codex Bara | Sel–Rab |
| I-8 | Filter waktu | Codex Bara (zakat/qurban/infaq/sedekah) · Antigravity Bara (wakaf) | Sel–Rab |
| I-9 | CMS artikel & berita + penutupan stub | Antigravity Awan | Sel–Rab |
| I-10 | Kernel ledger poin (D2, D6) | Claude Code Naufal | Sel |
| I-10b | Prosedur gamifikasi + sweep | Codex Naufal | Sel–Rab |
| I-10c | UI poin & check-in | Codex Awan | Rab |
| I-11 | Adapter Mayar (D5) + rekonsiliasi PENDING | Claude Code Bara (adapter, rekonsiliasi) · Claude Pro (kontrak + webhook) | Sen–Rab |
| S-1 | Fitur `pankop` (notifikasi, ask-ai, setoran amil, NIK, RBAC) | Sudah di `sprint-11`; pemeliharaan Claude Code Naufal | — |
| S-2 | Fondasi Storage privat (bucket `amwal-receipts`, helper fail-closed, signed URL) | Antigravity Bara | Sen |
| S-3 | Index kolom waktu | Claude Pro | Sen |
| — | Portal Nadzir (Tier C) | **Dipotong** → Sprint 12 | — |
| — | Analitik RFMD / segmentasi | **Dikeluarkan** (ditunda pasca-MVP sejak Putaran 6) — jangan diselundupkan lewat I-7 | — |

### Anti-abuse afiliasi (I-4)

- Reward **hanya** dari donasi LUNAS di hook `onSettled`, kunci `affiliate:{transactionId}`.
  **Klik dan impresi tidak pernah diberi poin** — batas per IP gagal ke dua arah (VPN lolos, pengguna
  NAT kampus yang berbagi IP justru terhukum).
- `?ref=` membawa **kode referral opak**, bukan `USER_ID` mentah. Server route menyimpan cookie httpOnly
  `amwal_ref` 30 hari, *first-touch*.
- Atribusi disimpan di tabel baru `affiliate_attributions(transaction_id PK, referrer_user_id)` — tidak
  menambah kolom pada `transactions`.
- Klik dicatat di `affiliate_clicks` dengan `sha256(ip + ua + garam harian)`, dedup per kode per hari, 0 poin.
- Syarat reward: referrer ≠ donatur · email/HP tidak sama · donatur bukan akun anonim sistem ·
  modul **WAKAF & INFAQ/SEDEKAH saja** (zakat & qurban dikecualikan sampai ada kajian fiqih) ·
  nominal ≥ Rp10.000 · maks 10 konversi berpoin per referrer per hari WIB · maks 1 per pasangan
  referrer–donatur per 24 jam.
- `poin_afiliasi = min(100 + ⌊nominal / 10.000⌋, 500)`. Tidak dibayar dari dana ZISWAF.

---

## 3. Matriks alokasi 10 agent & kepemilikan berkas eksklusif

**Aturan inti:** setiap berkas punya **tepat satu pemilik** selama sprint. Mengedit berkas milik agent
lain = PR ditolak otomatis. Glob di bawah bersifat rekursif; tes milik sebuah modul ikut dimiliki
pemilik modul tersebut. Setiap agent juga memiliki berkas statusnya sendiri
`docs/sprint-11/status/<slug>.md`.

> **Revisi 14 Sep 2026 (WBS harian).** Pembagian kerja harian di `SPRINT_BACKLOG.md` §S11.4 menggeser
> beberapa berkas. Tabel di bawah sudah memuat pergeseran itu — tidak ada berkas yang punya dua pemilik:
> - `packages/core/src/time/**` (`wibParts()`) pindah dari Claude Pro ke **Claude Code Bara**.
>   Signature dibekukan **Senin 10:00** agar I-5, I-8, dan I-10 bisa menulis terhadapnya sebelum implementasi masuk.
> - **Berkas router fitur dibuat oleh pemilik fiturnya** (stub `NOT_IMPLEMENTED`, ≤ Senin 11:30).
>   Claude Pro hanya me-mount di `router/index.ts` / `router/admin/index.ts` dan mendaftarkan RBAC.
> - `routes/api/cron/**` dipecah: `streak.ts` → Codex Naufal, `payments-reconcile.ts` → Claude Code Bara.
> - Berkas yang sebelumnya tanpa pemilik kini diberi pemilik atau **dibekukan** (lihat "Beku" di akhir bagian ini).

### Claude Pro — Anchor, Lead Architecture, Reviewer, Audit Gates

| | |
|---|---|
| **Modul** | Migrasi `0004` & index concurrently · pembekuan kontrak (Zod per fitur ditulis pemiliknya, dibekukan Claude Pro Sen 13:00) · `PaymentProvider` v2 · webhook agnostik provider · mount router & RBAC · primitif UI bersama (skeleton, toast) · review semua PR · gate 17:00 · membuka PR `sprint-11 → main` Rabu 18:00 |
| **Berkas eksklusif** | `packages/core/src/db/**` · `apps/web/drizzle/**` · `packages/core/package.json` · `apps/web/package.json` · `bun.lock` · `packages/core/src/payment/types.ts` · `packages/core/src/payment/webhook.ts` · `packages/core/src/auth/rbac.matrix.ts` + tesnya · `apps/web/src/lib/orpc/router/index.ts` · `apps/web/src/lib/orpc/router/admin/index.ts` · `apps/web/src/lib/orpc/procedures.ts` · `apps/web/src/lib/payment/**` · `apps/web/src/routes/api/webhooks/**` · `apps/web/src/env/**` · `**/.env.example` · `apps/web/src/components/ui/**` · `apps/web/src/components/backoffice/backoffice-sidebar.tsx` · `apps/web/src/routes/__root.tsx` · `apps/web/tests/test-database-guard.ts` · `apps/web/tests/orpc/test-utils.ts` · `apps/web/tests/orpc/webhook.test.ts` · `lefthook.yml` · `docs/sprint-11/PLAN.md` · `docs/sprint-11/CONTRACT-CHANGES.md` |
| **Catatan** | PR Zone 0 milik Claude Pro sendiri (`types.ts`, `webhook.ts`, migrasi) **tidak boleh di-review oleh dirinya**: di-review Claude Code Bara, lalu diaudit Bara (manusia) pada Kamis. Bila Claude Pro berjalan tanpa akses tulis repo, seluruh kepemilikan di atas pindah ke Claude Code Bara dan Claude Pro menjadi reviewer murni. |

### Lane Bara — Pembayaran, Keuangan, Storage, Analitik

| Agent | Modul | Berkas eksklusif |
|---|---|---|
| **Claude Code Bara** | `wibParts()` · I-1 ID 12 digit · I-11 adapter Mayar + spike sandbox + URL webhook tunggal · rekonsiliasi PENDING Mayar · Midtrans/Mock ke kontrak v2 | `packages/core/src/time/**` · `packages/core/src/payment/{order-id,service,signature,mayar.provider,midtrans.provider,mock.provider}.ts` · `packages/core/tests/{time,payment}/**` · `apps/web/tests/orpc/payment-create.test.ts` · `apps/web/src/routes/api/cron/payments-reconcile.ts` · `apps/web/src/routes/api/dev/**` · `apps/web/src/routes/dev/payment-simulator.tsx` |
| **Codex Bara** | I-7 grafik admin · I-8 filter tahun (zakat, qurban) & bulan+tahun (infaq, sedekah) | `packages/core/src/analytics/**` · `packages/core/src/contracts/{admin-analytics,admin-zakat,admin-qurban}.ts` · `apps/web/src/lib/orpc/router/admin/{analytics,overview,zakat,qurban,infaq}.ts` · `apps/web/src/components/admin/charts/**` · `apps/web/src/components/admin/overview-view.tsx` · `apps/web/src/routes/admin/index.tsx` · `apps/web/src/routes/admin/ziswaf/**` · `apps/web/tests/orpc/{admin-overview,admin-modules}.test.ts` |
| **Antigravity Bara** | Storage privat · I-2 kuitansi belanja + foto wajib · filter bulan+tahun wakaf | `packages/core/src/storage/**` · `apps/web/src/lib/storage/**` · `apps/web/src/routes/api/uploads/**` · `apps/web/src/lib/orpc/router/admin/waqf.ts` · `packages/core/src/contracts/admin-waqf.ts` · `apps/web/src/components/admin/receipts/**` · `apps/web/src/components/admin/wakaf-programs-view.tsx` · `apps/web/src/routes/admin/wakaf.tsx` · `apps/web/tests/orpc/admin-waqf.test.ts` |

### Lane Naufal — Keterlibatan: Poin, Afiliasi, Fitur `pankop`

| Agent | Modul | Berkas eksklusif |
|---|---|---|
| **Claude Code Naufal** | I-10 kernel ledger (D2, D6) · slot gamifikasi di `onSettled` · notifikasi perolehan poin · pemeliharaan fitur hasil `pankop` (notifikasi, ask-ai, amil) | `packages/core/src/gamification/**` · `apps/web/src/lib/gamification/**` · `packages/core/src/{crypto,notification}.ts` · `packages/core/src/llm/**` · `apps/web/src/lib/orpc/router/{notifications,ask-ai,amil}.ts` · `packages/core/src/contracts/amil.ts` · `apps/web/src/components/user-area/**` · `apps/web/src/components/amil/**` · `apps/web/src/routes/tanya-ai.tsx` · tes `notifications`, `ask-ai`, `amil`, `amil-setoran`, `mustahiq-nik`, `crypto`, `gamification` (core) |
| **Codex Naufal** | I-10b prosedur gamifikasi (check-in, saldo, riwayat, klaim kuis/baca/tonton) · hook +1000 saat daftar · sweep penalti | `packages/core/src/contracts/gamification.ts` · `apps/web/src/lib/orpc/router/{gamification,auth}.ts` · `apps/web/src/routes/api/cron/streak.ts` · `apps/web/tests/orpc/{gamification,auth}.test.ts` |
| **Antigravity Naufal** | I-4 afiliasi: atribusi, pencatatan klik, reward, dasbor referral | `packages/core/src/affiliate/**` · `packages/core/src/contracts/affiliate.ts` · `apps/web/src/lib/orpc/router/affiliate.ts` · `apps/web/src/lib/affiliate/**` · `apps/web/src/components/affiliate/**` · `apps/web/src/routes/r/**` · `apps/web/tests/orpc/affiliate.test.ts` |

### Lane Awan — Konten, Akad, Sertifikat, Antarmuka Publik

| Agent | Modul | Berkas eksklusif |
|---|---|---|
| **Claude Code Awan** | I-6 template akad dinamis (D3) · **satu-satunya pemilik** komponen donasi publik: penempatan tombol bagikan + checkbox akad | `packages/core/src/akad/**` · `packages/core/src/contracts/akad.ts` · `apps/web/src/lib/orpc/router/{akad,waqf,zakat,qurban,infaq}.ts` · `apps/web/src/lib/orpc/router/admin/akad.ts` · `apps/web/src/components/admin/akad/**` · `apps/web/src/routes/admin/akad.tsx` · `apps/web/src/components/{wakaf,zakat,qurban,infaq}/**` **kecuali** `wakaf-share-button.tsx` · tes `waqf`, `zakat`, `qurban`, `infaq` |
| **Codex Awan** | I-5 sertifikat (D4) + `/verifikasi/$nomor` · I-3 pustaka komponen bagikan · I-10c UI poin & check-in · skeleton & state riwayat transaksi | `packages/core/src/certificate/**` · `apps/web/src/lib/orpc/router/certificate.ts` · `apps/web/src/routes/api/certificates.$id.ts` · `apps/web/src/routes/verifikasi/**` · `apps/web/src/components/share/**` · `apps/web/src/components/wakaf/wakaf-share-button.tsx` · `apps/web/src/routes/poin.tsx` · `apps/web/src/components/gamification/**` · `apps/web/src/components/history/**` · `apps/web/src/routes/riwayat.tsx` · `apps/web/src/routes/riwayat/**` · `apps/web/tests/orpc/{certificate,transactions}.test.ts` |
| **Antigravity Awan** | I-9 CMS admin & publik · UI klaim kuis & baca artikel · penutupan stub Tier C · dokumentasi status | `packages/core/src/contracts/cms.ts` · `apps/web/src/lib/orpc/router/cms.ts` · `apps/web/src/lib/orpc/router/admin/cms.ts` · `apps/web/src/components/cms/**` · `apps/web/src/routes/{berita,edukasi}*` · `apps/web/src/routes/admin/{berita,edukasi}.tsx` · `apps/web/src/components/admin/{news,education}-management-view.tsx` · `apps/web/src/components/tier-c/**` · `apps/web/src/components/education/**` · `STATUS.md` · `docs/DECISION_LOG.md` · `apps/web/tests/orpc/cms.test.ts` |

### Beku — tidak punya pemilik selama Sprint 11

Berkas berikut **tidak boleh diedit agent mana pun**. Perubahan hanya lewat entri
`docs/sprint-11/CONTRACT-CHANGES.md` yang disetujui Claude Pro.

| Berkas | Alasan |
|---|---|
| `apps/web/src/components/nadzir/**` | Portal Nadzir dipotong ke Sprint 12 |
| `apps/web/src/components/admin/{cohort-retention,donor-segmentation}-view.tsx` | Analitik RFMD dikeluarkan (pasca-MVP) |
| `apps/web/src/components/admin/tier-c-preview.tsx` | Masih dipakai `overview-view.tsx`, portal nadzir, dan dua view RFMD |
| `apps/web/src/lib/amwal-api/{index,admin,types}.ts` | Adapter lama dibekukan (§4.1); fitur baru membuat adapter sendiri |

---

## 4. Aturan hotspot

### 4.1 Berkas bersama

| Berkas | Kenapa bentrok | Aturan |
|---|---|---|
| `schema.ts` + `drizzle/meta/_journal.json` | Dua `db:generate` paralel pasti menghasilkan dua migrasi bernomor sama dengan snapshot saling menimpa | **Hanya Claude Pro.** Satu migrasi `0004` Senin. Kebutuhan DDL setiap fitur diserahkan ke Claude Pro **≤ Senin 10:00**. Kebutuhan susulan: satu jendela `0005` **Selasa 12:00**. Sesudahnya → Sprint 12 |
| Berkas router fitur · `router/index.ts` · `router/admin/index.ts` · `rbac.matrix.ts` + tesnya | Setiap namespace baru wajib ter-mount dan terdaftar; tes matriks mengunci pemetaan persis | **Pemilik fitur membuat berkas router-nya sendiri** sebagai stub yang menjawab `NOT_IMPLEMENTED` (≤ Senin 11:30). **Claude Pro me-mount semuanya dalam satu commit** di jendela Senin 12:00 dan mendaftarkan RBAC. Claude Pro tidak pernah membuat atau mengedit berkas router fitur |
| `packages/core/src/time/wib.ts` | Dipakai ID transaksi (I-1), sertifikat (I-5), filter & grafik (I-8), check-in & penalti (I-10) | Pemilik **Claude Code Bara**. Signature `wibParts()` dibekukan **Senin 10:00**; konsumen menulis terhadap signature itu sebelum implementasi masuk jendela 12:00. Tidak ada helper zona waktu kedua di mana pun |
| `packages/core/src/payment/service.ts` (`createPayment`) | Akad (I-6) dan atribusi afiliasi (I-4) harus tercatat **di dalam** transaksi anchor | Parameter opsional `akadAcceptance` dan `attribution` dibekukan Claude Pro dalam kontrak Senin 13:00. Fungsi pencatatnya milik pemilik fitur (`recordAkadAcceptance` — Claude Code Awan, `recordAttribution` — Antigravity Naufal), tetapi **pemanggilannya hanya ditulis Claude Code Bara** di `service.ts` |
| `package.json` · `bun.lock` | Lockfile tidak bisa di-merge manual dengan benar | Dependensi baru hanya Senin oleh Claude Pro (`recharts`). **Jangan `bun add`** — ajukan di berkas status agent; Claude Pro yang memutuskan dan mencatatnya di `CONTRACT-CHANGES.md` |
| `env/server.ts` · `env/client.ts` | Semua fitur butuh variabel baru | Senin, sekaligus: `MAYAR_API_KEY`, `MAYAR_API_BASE_URL`, `MAYAR_WEBHOOK_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STORAGE_BUCKET_RECEIPTS`, `PUBLIC_APP_URL`, `CRON_SECRET`, `AFFILIATE_CLICK_SALT` — semuanya opsional di skema env agar agent tanpa kredensial tetap bisa boot |
| `routes/api/webhooks/payment.ts` · `lib/payment/on-settled.ts` | Poin transaksi, reward afiliasi, notifikasi, dan WhatsApp sama-sama menempel di `onSettled` | Claude Pro memindahkan isi `onSettled` ke `lib/payment/on-settled.ts` dengan dua slot. **Stub slot dibuat pemiliknya** (≤ Senin 11:30, no-op): `lib/gamification/settle-hook.ts` (Claude Code Naufal) dan `lib/affiliate/settle-hook.ts` (Antigravity Naufal); Claude Pro hanya meng-import-nya. Slot gagal tidak pernah menggagalkan webhook |
| `routes/api/cron/**` | Dua job terjadwal berbeda pemilik | Satu berkas per job: `streak.ts` → Codex Naufal, `payments-reconcile.ts` → Claude Code Bara. Keduanya dijaga `CRON_SECRET` |
| `components/ui/**` | Primitif dipakai hampir semua agent UI | Pemilik **Claude Pro**. `skeleton.tsx` dibuat **≤ Senin 12:00**. `ToastProvider` sudah dipasang global di `routes/__root.tsx`; agent memakai `useToast()` dan **tidak pernah** membuat provider lokal (`useToast()` diam-diam no-op di luar provider) |
| `components/tier-c/tier-c-scaffolds.tsx` | Export-nya dipakai halaman milik tiga pemilik berbeda: `NewsScaffold` (`/berita`), `GamificationScaffold` (`/poin`, Codex Awan), `AskAiScaffold` (`/tanya-ai`, Claude Code Naufal) | Pemilik Antigravity Awan, tetapi **Senin hanya inventaris — tidak ada penghapusan.** Sebuah export dicabut hanya setelah PR yang memindahkan konsumen terakhirnya sudah ter-merge. `AskAiScaffold` tetap ada sepanjang Sprint 11 |
| `lib/amwal-api/{index,admin,types}.ts` | Semua fitur lama lewat sini | **Dibekukan.** Fitur baru membuat adapter sendiri `lib/amwal-api/<fitur>.ts` (dimiliki pemilik fitur) atau memanggil `orpc` langsung |
| `routeTree.gen.ts` | Berkas generated berubah setiap ada rute baru | Jangan merge manual. Ambil sisi mana pun, jalankan `bun run build`, commit hasil regenerasi |
| Export subpath `packages/core/package.json` | Setiap modul core baru butuh entri export | Claude Pro mendeklarasikan export wildcard per folder pada Senin (`./gamification/*`, `./affiliate/*`, `./akad/*`, `./analytics/*`, `./storage/*`, `./time/*`) |

### 4.2 Database per agent

Setiap agent memakai database uji **sendiri**. Nama wajib cocok dengan guard:

```
amwal_bun_s11_claude_pro_test
amwal_bun_s11_claude_bara_test     amwal_bun_s11_codex_bara_test     amwal_bun_s11_antigravity_bara_test
amwal_bun_s11_claude_naufal_test   amwal_bun_s11_codex_naufal_test   amwal_bun_s11_antigravity_naufal_test
amwal_bun_s11_claude_awan_test     amwal_bun_s11_codex_awan_test     amwal_bun_s11_antigravity_awan_test
```

Setelah membuat database: `bun --env-file=.env.test run db:migrate` dari `apps/web`, lalu `bun test`.

### 4.3 Guard database uji

Setiap tes integrasi memanggil `const connectionUrl = assertTestDatabase();` dari
`apps/web/tests/test-database-guard.ts` di level modul, **sebelum query pertama** (klien postgres-js
bersifat lazy — membuat klien tidak membuka koneksi). Guard menolak berjalan bila:

- `DATABASE_URL` tidak diisi,
- `DATABASE_URL` (yang dipakai singleton `lib/db`) **atau** `TEST_DATABASE_URL` (bila diisi) menunjuk
  database yang namanya tidak cocok `^amwal_bun_[a-z0-9_]+_test$`,
- keduanya diisi tetapi menunjuk **database berbeda** — rute yang diuji membaca `DATABASE_URL`, sehingga
  fixture dan asersi akan berjalan di dua database, atau
- URL tidak bisa di-parse.

Tes integrasi baru **wajib** memakai guard ini; menulis ulang pengecekan inline ditolak di review.

Pencocokan dilakukan pada **nama database** hasil `new URL(...).pathname`, bukan substring URL —
sehingga URL produksi yang kebetulan memuat teks `amwal_bun_x_test` di password atau query tetap ditolak.

---

## 5. Jadwal harian & fail-fast gate

Semua jam dalam **WIB**. Jendela merge harian **12:00** dan **16:30**, urutan:
**Claude Pro → Lane Bara → Lane Naufal → Lane Awan**.

### SENIN — Fondasi skema, ID, storage, adapter Mayar, pra-registrasi

Rincian tugas setiap agent untuk hari ini ada di **`SPRINT_BACKLOG.md` §S11.5** (matriks salin-pagi) dan **§S11.4** (checklist bertingkat + defensif). Tabel tugas harian sengaja tidak disimpan di sini agar jadwal hanya hidup di satu tempat; titik serah terima antar-agent ada di **§S11.4.0**.

> **GATE SENIN 17:00 — "Kontrak & fondasi"**
> - `0004` teraplikasi bersih di database kosong **dan** di salinan staging; `drizzle-kit check` bersih
> - `check-types` 3/3 · `biome check` bersih · seluruh tes lama hijau
> - Setiap router baru ter-mount dan menjawab `NOT_IMPLEMENTED`; tes matriks RBAC hijau dengan namespace baru
> - 20 panggilan paralel `nextOrderId` pada cakupan sama → 20 nomor unik berurutan; nomor ke-10.000 ditolak database
> - Satu berkas terunggah ke bucket privat sandbox dan terbaca lewat signed URL
>
> **Gagal:** Selasa pagi dipakai hanya untuk memperbaiki fondasi. Tidak ada agent yang memulai fitur di atas kontrak yang belum beku.

### SELASA — Kernel poin/afiliasi/analitik, CRUD CMS, admin akad, webhook Mayar

Rincian tugas setiap agent untuk hari ini ada di **`SPRINT_BACKLOG.md` §S11.5** (matriks salin-pagi) dan **§S11.4** (checklist bertingkat + defensif). Tabel tugas harian sengaja tidak disimpan di sini agar jadwal hanya hidup di satu tempat; titik serah terima antar-agent ada di **§S11.4.0**.

> **GATE SELASA 17:00 — "Kernel terbukti"**
> - Webhook LUNAS dikirim 2× → poin `+200` dan `+⌊nominal/1.000⌋` masing-masing tercatat tepat sekali
> - `settlePenalties` dijalankan 2× berturut-turut → saldo identik; saldo 30 dengan 3 hari bolos → saldo 0, bukan −30; 10 hari bolos → hanya 7 hari dihitung
> - Reward afiliasi ditolak untuk self-referral, akun anonim, zakat, dan nominal < Rp10.000
> - Sertifikat untuk transaksi 00:30 WIB mencetak tanggal & jam yang benar
> - Mengaktifkan versi akad baru tidak mengubah `body_sha256` pada `akad_acceptances` yang sudah ada
> - Tes idempotensi webhook lama tetap hijau **tanpa diubah** setelah refaktor provider-agnostik
> - Mayar: jalur sandbox LUNAS end-to-end, **atau** keputusan tertulis flag-only di `CONTRACT-CHANGES.md`
>
> **Gagal:** jalankan urutan potong §6 butir 1–2 sebelum Rabu 09:00.

### RABU — Integrasi UI, grafik & filter, tombol bagikan, rute sertifikat, penutupan stub

Rincian tugas setiap agent untuk hari ini ada di **`SPRINT_BACKLOG.md` §S11.5** (matriks salin-pagi) dan **§S11.4** (checklist bertingkat + defensif). Tabel tugas harian sengaja tidak disimpan di sini agar jadwal hanya hidup di satu tempat; titik serah terima antar-agent ada di **§S11.4.0**.

> **GATE RABU 17:00 — "Freeze"**
> - Setiap fitur didemokan end-to-end di dev server memakai akun `db:seed`, dengan data riil — nol mock di luar `MOCK_SANDBOX`
> - `check-types` 3/3 · `biome check` bersih · seluruh tes lama + baru hijau di database uji Claude Pro
> - `git diff --name-only origin/main...sprint-11` tidak memuat berkas di luar matriks §3
> - Tidak ada layar Tier C yang berubah menjadi "selesai" tanpa backend riil
> - `STATUS.md` mencerminkan hasil gate, bukan rencana
>
> **Gagal:** item yang belum lulus dipotong sesuai §6 dan dicatat di `STATUS.md` sebagai "Pending" — tidak ada perpanjangan ke Kamis.

### KAMIS — Freeze kode · audit manusia (Bara, Naufal, Awan)

Tidak ada agent yang menulis kode. Daftar periksa tim:

- [ ] Audit Zone 0: `webhook.ts`, `types.ts`, `order-id.ts`, `service.ts`, migrasi `0004` — Bara
- [ ] Audit poin, afiliasi, akad (D2, D3, D6) — Naufal
- [ ] Audit CMS, sertifikat, halaman verifikasi, a11y halaman publik — Awan
- [ ] E2E: donasi wakaf via Mayar sandbox → LUNAS → poin +200+⌊Rp/1.000⌋ → sertifikat `HH:mm:ss WIB` → QR membuka `/verifikasi/$nomor`
- [ ] E2E: admin mencatat kuitansi tanpa foto → ditolak; dengan foto → tersimpan di bucket privat
- [ ] E2E: admin menerbitkan versi akad baru → donasi berikutnya mencatat versi baru, donasi lama tidak berubah
- [ ] Load test: 50 order paralel pada cakupan ID yang sama → tidak ada duplikat, tidak ada deadlock
- [ ] Deploy `sprint-11` ke staging · jalankan `0004` + index concurrently · smoke test
- [ ] Merge PR `sprint-11 → main` hanya bila semua butir di atas lulus

---

## 6. Urutan potong scope

Diputuskan di gate Selasa 17:00 dan Rabu 12:00, berurutan:

1. Poin tonton video
2. Reward afiliasi — atribusi & pencatatan klik tetap jalan
3. Grafik pendukung di luar tiga grafik inti (tren donatur vs transaksi, akumulasi dana, komposisi modul)
4. Mayar produksi — sandbox tetap; Midtrans menjadi jalur demo
5. UI admin template akad — prosedur & seed default tetap ada

---

## 7. Branching & protokol sinkronisasi

```
main                          protected — hanya menerima PR sprint-11 setelah audit Kamis
 └─ sprint-11                 branch induk, integrasi harian
     ├─ s11/claude-pro/<tiket>
     ├─ s11/claude-bara/<tiket>    s11/codex-bara/<tiket>    s11/antigravity-bara/<tiket>
     ├─ s11/claude-naufal/<tiket>  s11/codex-naufal/<tiket>  s11/antigravity-naufal/<tiket>
     └─ s11/claude-awan/<tiket>    s11/codex-awan/<tiket>    s11/antigravity-awan/<tiket>
```

**Sebelum membuka PR ke `sprint-11`:**
1. `git fetch && git rebase origin/sprint-11`
2. `bun run check-types` · `bunx @biomejs/biome check ./` · `cd packages/core && bun test` · `cd apps/web && bun test`
3. `git diff --name-only origin/sprint-11...HEAD` → setiap berkas harus milik agent tersebut menurut §3

**Aturan PR:**
- PR ditolak otomatis bila memuat berkas di luar kepemilikan agent.
- PR yang menyentuh `packages/core/src/{payment,gamification,db}/**` atau ledger wakaf wajib di-review Claude Pro; PR Zone 0 milik Claude Pro di-review Claude Code Bara.
- Trailer commit wajib: `Agent: <slug>` dan `Ticket: <I-x>`.
- Dilarang: `--no-verify`, force-push ke `sprint-11`, mengedit migrasi yang sudah di-merge.

**Komunikasi antar-agent — repo adalah kanalnya:**
- Satu berkas status per agent: `docs/sprint-11/status/<slug>.md` (selesai · berikutnya · terblokir), diperbarui setiap jendela merge. Satu berkas per agent = nol konflik.
- Perubahan kontrak setelah Senin 13:00 hanya lewat catatan append-only `docs/sprint-11/CONTRACT-CHANGES.md` **yang hanya ditulis Claude Pro**. Agent lain mengajukannya di berkas statusnya sendiri; Claude Pro mencatat yang disetujui, lalu semua agent hilir rebase di jendela berikutnya.

---

## 8. Risiko yang tetap terbuka

| Risiko | Mitigasi |
|---|---|
| Autentikasi webhook Mayar tidak terdokumentasi | Re-fetch server-side (§D5), spike Senin, keputusan flag Selasa 13:00 |
| Database dipakai bersama aplikasi Next.js lama | Migrasi aditif saja (`db/MIGRATION_RULES.md` Rule 1); kategori baru `text + CHECK`, tidak menulis nilai enum baru (Rule 6); index lewat `CONCURRENTLY` di luar transaksi migrasi |
| Kredensial live di 10 lingkungan agent | Project Supabase sandbox tersendiri; service role & API key Mayar hanya di 2 lingkungan (§D5) |
| Zona waktu | Satu helper `wibParts()` untuk ID, sertifikat, check-in, penalti, filter |
| Tafsir fiqih poin & afiliasi | Zakat & qurban dikecualikan dari afiliasi; poin non-moneter; tinjauan Dewan Syariah sebelum fitur tukar poin apa pun |
| Tabel pemetaan sub-program belum ada | Default `00`; pemetaan di satu konstanta, dapat diubah tanpa migrasi |
| Kapasitas 3 hari untuk 13 item | Urutan potong §6; tidak ada perpanjangan ke Kamis |
