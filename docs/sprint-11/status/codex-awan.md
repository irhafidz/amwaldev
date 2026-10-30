# Status Sprint 11 — Codex Awan (`codex-awan`)

**Peran:** Lane Awan — Sertifikat & verifikasi publik (I-5), pustaka tombol bagikan (I-3), UI poin & check-in (I-10c)
**Branch:** `codex/awan` (rebase dari `sprint-11` @ `66595b9`)
**DB uji:** `amwal_bun_s11_codex_awan_test` (dibuat, `db:migrate` bersih)
**Waktu update:** Selasa — jendela merge 12:00 WIB

---

## 1. Selesai

### `I-5` — Sertifikat detik WIB + `/verifikasi/$nomor`

- **Format kanonik** `DD MMMM YYYY, HH:mm:ss WIB` di `packages/core/src/certificate/display.ts`
  (baru). Seluruhnya lewat `Intl` dengan `timeZone: 'Asia/Jakarta'` eksplisit — `toLocaleDateString()`
  tanpa zona waktu (biang bug D4) sudah tidak dipakai lagi di generator.
- **Timestamp Postgres dibaca sebagai UTC.** Kolom `timestamp(3)` (`mode: 'string'`) mengembalikan
  `YYYY-MM-DD HH:mm:ss` tanpa offset; `new Date()` atas nilai itu akan memakai zona runtime.
  `toInstant()` menormalkannya lebih dulu. Tanpa ini, perbaikan zona waktu hanya berpindah bug.
- **QR memakai `PUBLIC_APP_URL`**, bukan `https://amwal.id/verify-cert/…` yang tidak punya rute.
  `buildVerificationUrl()` **fail-closed**: basis kosong atau bukan http(s) → PDF tidak diterbitkan.
- **Prosedur publik** `certificate.verify` (`apps/web/src/lib/orpc/router/certificate.ts`, kontrak
  `@amwal/core/contracts/certificate`) dengan **output tervalidasi Zod**.
  Muatannya minimal: nomor, status sah, jenis & judul program, tanggal-jam WIB, nama donatur
  (disamarkan bila anonim). **Nominal dan id internal tidak pernah keluar** — diuji lewat
  perbandingan daftar kunci, bukan sekadar pembacaan kode.
- **Nama di halaman publik adalah inisial, bukan nama lengkap.** Nomor sertifikat berurutan
  (`CERT-AMW-YYYY-NNNN`) sehingga halaman verifikasi bisa dienumerasi; inisial cukup bagi pemegang
  sertifikat untuk mengenali miliknya, tidak cukup untuk menyusun daftar donatur. PDF tetap memuat
  nama lengkap — itu dokumen donatur sendiri, di balik gate pemilik/admin.
- **Paritas layout dikunci lewat tes**, bukan lewat kepercayaan: stream teks jsPDF (tidak
  dikompresi) di-assert memuat letterhead, judul, nomor, nominal, baris akad, blok tanda tangan,
  UU No. 41/2004, dan tanggal-jam WIB.
- **Halaman** `/verifikasi/$nomor` (`apps/web/src/routes/verifikasi/**`) publik tanpa sesi, dengan
  empat keadaan jujur: memuat, sah, tidak sah, tidak ditemukan.
- Unduhan PDF tetap rute HTTP ber-auth (`routes/api/certificates.$id.ts`) — gate kepemilikan
  donor/admin tidak berubah, kini meneruskan `env.PUBLIC_APP_URL` ke generator.

**Uji:** `packages/core/tests/certificate-display.test.ts` (15 uji murni),
`apps/web/tests/orpc/certificate-verify.test.ts` (6 uji integrasi, termasuk transaksi
`2026-09-30 17:30 UTC` → `01 Oktober 2026, 00:30:00 WIB`), plus 2 uji generator baru di
`certificate.test.ts` (paritas teks PDF + label anonim). **18/18 hijau** untuk kedua berkas sertifikat.

### `I-3` — Pustaka komponen bagikan

- `apps/web/src/components/share/share-template.ts` — penyusun pesan murni: judul program,
  deskripsi ringkas (dipotong di batas kata, ≤ 160 karakter), deep link, dan `?ref=<kode>` bila
  donatur login (kode opak, `I-4`). `buildShareLink()` menjaga query string yang sudah ada.
- `apps/web/src/components/share/share-program-button.tsx` — kontrol generik satu paket untuk
  empat modul (`ajakan`: berwakaf/berzakat/berinfaq/berqurban). Web Share API bila ada,
  **fallback clipboard** bila tidak, dengan modal WhatsApp + salin template.
  *Defensif:* Web Share hanya dipakai bila `navigator.share` **dan** `navigator.canShare(payload)`
  tersedia; `AbortError` (donatur menutup share sheet) tidak memicu fallback maupun toast. Salin
  yang berhasil memunculkan toast global "Pesan & tautan disalin"; bila Clipboard API ditolak,
  modal tetap menampilkan teksnya untuk disalin manual.
- `components/wakaf/wakaf-share-button.tsx` kini hanya pembungkus `berwakaf` — API-nya
  (`judul`, `variant`, `className`) tidak berubah, jadi `waqf-detail.tsx` dan `wakaf-header.tsx`
  tidak perlu disentuh.

**Uji:** `apps/web/tests/share-template.test.ts` (8 uji murni, 8/8 hijau).

### `I-10c` — UI poin & check-in

- `components/gamification/**`: `points-view.tsx` (saldo, rentetan, tombol check-in, riwayat),
  `check-in-button.tsx`, `points-history-list.tsx`, `points-summary-card.tsx`, ditambah
  `format.ts` (label aktivitas, delta bertanda, jam WIB) dan `points-api.ts`.
- `routes/poin.tsx` tidak lagi merender `GamificationScaffold` (Tier C). Komponen scaffold-nya
  sendiri tidak disentuh — itu milik Antigravity Awan.
- **Badge `PRATINJAU` sengaja masih tampil**: prosedur `gamification.*` (`I-10b`, Codex Naufal)
  belum ada, jadi layar menampilkan panel "backend poin belum tersedia" alih-alih saldo tiruan.
  Badge dicabut saat prosedurnya mendarat, bukan sebelumnya.
- **Riwayat transaksi** (`components/history/**`, ditugaskan backlog ke lane ini walau tidak
  terdaftar di matriks §3): daftar dan detail kini memakai **skeleton** (bukan spinner) dan detail
  punya tombol **Coba lagi** pada keadaan error. Empty state daftar sudah ada sebelumnya.
- **Check-in anti double-click:** tombol terkunci selama request dan dibungkus debounce 700 ms.

**Uji:** `apps/web/tests/points-format.test.ts` (7 uji murni, 7/7 hijau).

### Verifikasi menyeluruh

- `packages/core`: **115 pass / 0 fail** (18 berkas).
- `apps/web`: **121 pass / 0 fail** (24 berkas) di `amwal_bun_s11_codex_awan_test`.
- `check-types` 3/3 hijau · `biome check` bersih · `vite build` (nitro, SSR + klien) sukses ·
  `routeTree.gen.ts` diregenerasi (satu-satunya perubahan: rute `/verifikasi/$nomor`).

---

## 2. Berkas milik agent lain yang tersentuh (mohon dicatat di jendela merge)

Matriks §3 menetapkan berkas-berkas ini milik **Claude Pro**; ketiganya disentuh secara aditif
dan seminimal mungkin supaya `I-5` benar-benar berjalan, bukan sekadar mendarat:

| Berkas | Perubahan | Alasan |
|---|---|---|
| `apps/web/src/env/server.ts` | +`PUBLIC_APP_URL` (opsional, default dev `http://localhost:3000`) | Basis QR. Tanpa ini generator tidak punya sumber alamat. Silakan verifikasi bentuk skemanya |
| `apps/web/src/lib/orpc/router/index.ts` | +`certificate` (2 baris) | Pra-registrasi namespace `I-5` belum ada saat saya mulai; tanpa mount, prosedurnya tidak terjangkau |
| `apps/web/src/routes/api/certificates.$id.ts` | meneruskan `env.PUBLIC_APP_URL` ke `assembleCertificateData()` | Satu argumen; gate auth/IDOR tidak berubah |

`packages/core/package.json` **tidak disentuh.** Helper baru (`display.ts`) dicapai lewat
re-export dari `./certificate/generator` dan `./certificate/service` yang sudah terdaftar. Bila
Claude Pro lebih suka subpath tersendiri (`./certificate/display`), tinggal tambahkan barisnya —
tidak ada perubahan kode di sisi saya selain menghapus re-export.

## 3. Terblokir / menunggu pihak lain

1. **`I-10c` tanpa backend.** `gamification.{summary,checkIn,history}` (`I-10b`, Codex Naufal)
   belum ada. `components/gamification/points-api.ts` mencap namespace itu lewat **satu cast
   terdokumentasi** dan menampilkan keadaan "belum tersedia". Begitu prosedurnya mendarat,
   cast itu dihapus dan badge `PRATINJAU` dicabut — tidak ada perubahan lain di layar.
2. **Bentuk respons `gamification.*` belum dibekukan.** Kontrak input sudah beku di
   `@amwal/core/contracts/gamification`, tetapi bentuk **respons** belum dideklarasikan siapa pun.
   `components/gamification/points-types.ts` memuat dugaan saya (`saldo`,
   `sudahCheckInHariIni`, `streakHari`, `items[]`, `nextCursor`) — **mohon dikonfirmasi atau
   dikoreksi** oleh pemilik `I-10b`; berkasnya sengaja tunggal supaya koreksinya satu edit.
3. **Penempatan tombol bagikan di halaman zakat/infaq/qurban** adalah milik Claude Code Awan
   (`components/{wakaf,zakat,qurban,infaq}/**`, kecuali `wakaf-share-button.tsx`). Yang saya
   serahkan adalah komponennya; wakaf sudah terpasang lewat pembungkus lama.
4. **`?ref=` belum tersambung ke data nyata.** Komponen menerima `refCode` sebagai prop; nilai
   itu baru ada setelah `I-4` (Antigravity Naufal) mendarat.
5. **Check-in belum bisa diuji end-to-end.** Debounce dan penguncian tombol sudah ada, tetapi
   pemetaan kode `ALREADY_CLAIMED` menunggu bentuk respons `I-10b` yang belum dibekukan.
6. **Kepemilikan `components/history/**`** tidak terdaftar di matriks §3 mana pun padahal backlog
   menugaskan perbaikannya ke lane ini. Sudah dikerjakan; mohon ditetapkan pemiliknya saat merge.

## 4. Pengambilalihan `I-10b` + kernel `I-10` (18 Sep, atas persetujuan pemilik sprint)

`/poin` sudah selesai di sisi UI tetapi tidak bisa menampilkan data riil selama prosedurnya tidak ada —
dan badge `PRATINJAU` hanya boleh dicabut setelah backend riil. Atas persetujuan pemilik sprint,
lane ini mengambil alih `I-10b` sekaligus kernel `I-10` yang menjadi dasarnya.

### Yang mendarat

| Berkas | Isi |
|---|---|
| `packages/core/src/gamification/ledger.ts` (baru, subpath `./gamification/ledger`) | `award()` idempoten (`INSERT … ON CONFLICT (idempotency_key) DO NOTHING`), `getBalance()` (dijepit ≥ 0), `getCheckInDates()` (tanggal WIB), `listLedger()` (keyset cursor), `settleUserPenalties()` (`pg_advisory_xact_lock(hashtext(userId))` **per pengguna**, satu statement untuk semua baris penalti) |
| `packages/core/src/gamification/points.ts` | `ACTIVITY_POINTS` + builder kunci `registerKey`/`checkInKey`/`quizKey`/`readKey`/`watchKey` — satu tempat, bukan tersebar di prosedur |
| `packages/core/src/gamification/penalties.ts` | parameter `registeredOn` opsional: hari sebelum akun dibuat tidak pernah ditagih |
| `packages/core/src/contracts/gamification.ts` | skema **respons** (`pointsSummaryResultSchema`, `pointsHistoryResultSchema`, `checkInResultSchema`, `claimResultSchema`) + `GAMIFICATION_CLAIM_STATUSES` |
| `apps/web/src/lib/orpc/router/gamification.ts` | enam prosedur nyata menggantikan stub `NOT_IMPLEMENTED` |
| `apps/web/src/lib/gamification/settle-hook.ts` (baru) | D2: `+200` dan `+⌊nominal/1.000⌋` dari `transactions.amount`, dipanggil slot `onSettled` webhook |
| `apps/web/src/routes/api/cron/streak.ts` (baru) | sweep penalti `POST /api/cron/streak`, `CRON_SECRET`, batch 500 + cursor, memanggil fungsi yang sama dengan jalur lazy |
| `apps/web/src/lib/orpc/router/auth.ts` | `+1000` saat daftar, **di dalam transaksi yang sama** dengan baris `users` |
| `apps/web/src/components/gamification/**` | cast sementara di `points-api.ts` **dihapus**; tipe respons kini `z.infer` dari kontrak; `PointsView` tidak lagi punya cabang "belum tersedia"; badge `PRATINJAU` **dicabut** |

### Bukti

- `apps/web/tests/orpc/gamification.test.ts` — **16 uji**, semuanya hijau: D2 lewat hook settlement
  (webhook ganda tetap membayar satu kali), D6 (saldo 30 + 3 hari bolos → **0**, bukan −30; 10 hari bolos
  → hanya 7; tidak menagih hari sebelum akun dibuat), check-in sekali per hari WIB, **20 check-in paralel
  → tepat satu baris ledger**, riwayat + cursor, klaim kuis `CLAIMED`/`ALREADY_CLAIMED`/`NOT_ELIGIBLE`,
  gerbang cron.
- `packages/core/tests/gamification/ledger-pure.test.ts` — 10 uji murni (cutoff pendaftaran, streak,
  tanggal WIB, tabel poin & kunci).
- `packages/core` **149 pass / 0 fail** · `apps/web` **185 pass / 0 fail** · `check-types` 3/3 ·
  `biome check` bersih · `vite build` sukses (route tree memuat `/api/cron/streak`).

### Gap yang dinyatakan, bukan disembunyikan

1. **`readBegin` belum ada.** Verifikasi dwell sisi server menuntut tabel sesi baca yang belum ada di
   skema; DDL-nya harus lewat jendela `0005` milik Claude Pro. Sampai itu ada, dwell pada `claimRead`
   masih datang dari klien (`claimReadSchema` menolak < 30 detik, tetapi klien yang berbohong belum
   tertangkap). `DWELL_TOO_SHORT` sudah ada di enum hasil tetapi belum pernah terpicu karena alasan ini.
2. **Notifikasi perolehan poin** (`I-10` Rabu, lewat modul notifikasi `pankop`) tidak dikerjakan —
   di luar lingkup yang disetujui.

### Berkas milik lane lain yang tersentuh (aditif, mohon dicatat di jendela merge)

| Berkas | Perubahan |
|---|---|
| `packages/core/package.json` | +`./gamification/ledger` |
| `packages/core/src/time/wib.ts` | +`parseInstant()` & `toWibDate()` — satu aturan "naive = UTC" dipakai sertifikat, check-in, dan penalti; `certificate/display.ts` sekarang menumpang helper ini |
| `apps/web/src/env/server.ts` | +`CRON_SECRET` (opsional; tanpa isinya rute cron 401) |
| `apps/web/src/routes/api/webhooks/payment.ts` | slot `onSettled` memanggil `settleTransactionPoints()` (best-effort, sudah di dalam try/catch webhook) |
| `apps/web/.env.example` | dokumentasi `CRON_SECRET` |
| `apps/web/tests/orpc/auth.test.ts` | pembersihan menghapus baris ledger lebih dulu (FK `ON DELETE RESTRICT`) + asersi bonus `+1000` |

`apps/web/.env` lokal saya tambahi `CRON_SECRET="dev-cron-secret-sprint11"` supaya sweep bisa diuji;
nilainya dev-only dan berkas itu tidak ter-track.

## 5. Berikutnya

- Menunggu konfirmasi bentuk respons `I-10b` → hapus cast + cabut badge `PRATINJAU` di `/poin`.
  → **Selesai 18 Sep**: cast dihapus, tipe di-infer dari kontrak, badge dicabut.
- Review silang PR: berkas saya tidak menyentuh Zone 0 (`payment/**`, `db/**`).
  → **Koreksi:** pengambilalihan ini menyentuh `core/payment` **tidak**; tetapi `time/wib.ts`,
  `package.json`, dan slot `onSettled` webhook adalah berkas Claude Pro (dirinci di §4). Migrasi
  `0004` tetap tidak disentuh.

## 6. Deviasi dari checklist backlog (dinyatakan, bukan disembunyikan)

| Butir | Keputusan |
|---|---|
| Hook `useShare()` | Tidak dibuat. Deteksi kemampuan browser hidup di dalam `ShareProgramButton`; satu berkas lebih sedikit, perilakunya identik |
| `wibParts` untuk format sertifikat | Diganti `Intl` + `timeZone: 'Asia/Jakarta'` karena butuh nama bulan Indonesia; batas 00:30 & 23:59:59 WIB tetap diuji |
| Riwayat transaksi `components/history/**` | Dikerjakan karena backlog menugaskannya ke lane ini, walau tidak ada di matriks §3 — perlu penetapan pemilik |
