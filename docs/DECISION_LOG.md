# Decision Log — Amwal V.1

Living document — histori seluruh keputusan scope, teknis, dan bisnis proyek Amwal.
Tambahkan entri baru di bagian bawah, JANGAN edit/hapus entri lama (append-only, untuk
audit trail program HETI / ADB Loan ITS).

> **Catatan migrasi repo (6 September 2026):** Putaran 1–12 berada di
> `amwalheti/docs/DECISION_LOG.md` pada tag `frozen-nextjs-v1`. Isinya dipertahankan utuh
> di sana sebagai arsip. **Salin seluruh Putaran 1–12 ke atas file ini sebelum commit
> pertama** agar jejak audit tetap berada dalam satu berkas.
>
> **Perbaikan yang wajib dilakukan saat menyalin:** file lama mengalami duplikasi — isi
> baris 1–130 terulang kembali mulai baris 131. Versi lengkap ada di paruh kedua
> (Putaran 1–12); paruh pertama adalah salinan usang yang berhenti di Putaran 9. Salin
> **hanya paruh kedua**. Temuan AMW-13.

---

## Putaran 13 — Migrasi Greenfield ke Bun & Perubahan Scope Resmi

**Tanggal:** 6 September 2026
**Konteks:** Tindak lanjut `Amwal Baseline Audit` (temuan AMW-01 s/d AMW-17), yang
menemukan empat blocker kritis dan pola sistemik DoD tercentang mendahului kode.
**Pengambil keputusan:** Konsensus tim dev (Bara, Awan, Naufal), dengan rekomendasi
Tech Lead.

### A. Keputusan Arsitektur

| # | Topik | Keputusan & Alasan |
|---|---|---|
| 1 | Migrasi ke ekosistem Bun (greenfield) | Repo baru `amwal-bun` dibangun dari nol. Tiga dari empat blocker kritis (AMW-01 migrasi tertinggal, AMW-03 matcher RBAC tidak pernah cocok, AMW-04 payment outbound tidak ada) adalah cacat fondasi, bukan bug — lebih murah dibangun benar sekali daripada ditambal di atas struktur yang salah. Opsi "tuntaskan Next.js dulu" dan "paralel dua repo" ditolak; opsi paralel dinilai terburuk karena membagi perhatian tim 3 orang ke dua codebase. |
| 2 | Repo Next.js dibekukan, **setelah** lubang ditutup | `amwalheti` tetap hidup di Vercel sebagai referensi. Karena itu AMW-02 (QR WhatsApp terbuka) dan AMW-03 (backoffice tanpa login) **wajib diperbaiki lebih dulu** — membekukan repo tidak membekukan deployment-nya. Setelah diperbaiki: tag `frozen-nextjs-v1`, repo tidak disentuh lagi. |
| 3 | Backend: **Hono**, bukan ElysiaJS | Runtime-agnostic sehingga taruhan Bun tetap reversibel; skema Zod existing diport 1:1; representasi jauh lebih tebal di data latih model, yang berpengaruh nyata pada kualitas keluaran vibe coding. |
| 4 | ORM: **Drizzle**, bukan Prisma | `drizzle-kit pull` membangkitkan 38 model secara mekanis dari Supabase; `generate` menghasilkan berkas SQL yang di-commit dan direview, sehingga kelas drift AMW-01 menjadi mustahil secara struktural. Mempertahankan Prisma berarti mengganti framework tapi menyimpan dependensi terberatnya. |
| 5 | Frontend: **Vite + React 19 SPA** | ~60 komponen existing berpindah nyaris 1:1. Konsekuensi diterima sadar: halaman program wakaf publik kehilangan SEO server-side di V.1; ditutup dengan prerender statis pasca-staging. |
| 6 | Deployment: **VPS sendiri** (8 vCPU / 24 GB / 300 GB), bukan Vercel | Vercel tidak menjalankan Bun sebagai runtime server. Efek samping: Baileys menjadi service internal Docker tanpa port terekspos (menutup AMW-02 secara struktural), `auth_session` di named volume (menutup AMW-16), dan cron retensi KTP 30 hari (Putaran 2 #2) menjadi mungkin untuk pertama kalinya. |
| 7 | Koneksi DB: **session mode port 5432** | Proses Bun bersifat long-lived. Transaction pooler `:6543` tidak mendukung prepared statement `postgres-js`, dan DDL serta `ALTER TYPE ADD VALUE` memerlukan session mode. Migrasi selalu ke 5432. |

### B. Keputusan Scope — Pembalikan Putaran 6

Putaran 6 mengeluarkan Infaq/Sedekah, Gamifikasi, Edukasi & Kuis, dan AI Chatbot dari
scope. Putaran 10 #2 menyatakan sudah diverifikasi tidak ada UI yang mengeksposnya.
**Kedua keputusan itu dibalik di sini,** dengan tiga catatan wajib:

| # | Topik | Keputusan |
|---|---|---|
| 1 | Infaq/Sedekah, Gamifikasi, Edukasi & Kuis, Tanya AI | **Masuk kembali ke scope.** Catatan faktual: keempatnya **belum pernah dibangun** di Next.js — yang ada hanya model Prisma tanpa route atau UI fungsional. Infaq bahkan belum punya tabel order, baru nilai enum `TransactionType.INFAQ`. Jadi ini pengembangan fitur baru, bukan migrasi. |
| 2 | Tiga tingkat komitmen | Karena kapasitas 18 hari-orang tidak menutup 14 area modul di kedalaman yang sama, dipakai tingkat **[A] Wajib / [B] Target / [C] Scaffold**. Tier C = UI penuh + backend stub `501`, wajib menampilkan badge `PRATINJAU`, dan **dilarang disebut selesai ke luar tim**. |
| 3 | Larangan data mock konstan | Tier C **tidak boleh** menampilkan array konstan seolah data asli. Ini pengulangan langsung temuan AMW-10 dan AMW-11, di mana dashboard admin tampak jadi padahal digerakkan `lib/mock-drm-analytics.ts`. Diverifikasi dengan `grep` di CI. |
| 4 | Dashboard Analitik RFM-D | Tetap **Tier C scaffold**. Pipeline datanya belum ada dan riset lanjutannya (Thesis S2 Najwan) di luar sprint ini. |
| 5 | Tetap di luar scope V.1 | Pembagian warisan (faraid), integrasi API real-time BWI/Kemenag, migrasi data historis `itsedekah.id`. |

### C. Penurunan Prinsip Non-Custodial (Wajib Dibaca Auditor)

| # | Topik | Keputusan |
|---|---|---|
| 1 | Status kustodian V.1 | **Split settlement TIDAK tersedia** di akun Midtrans saat ini. V.1 karena itu bersifat **custodial**: dana transit di rekening resmi yayasan sebelum disalurkan ke Nadzir. Ini **bertentangan dengan PRD §4.1** yang menyebut non-custodial sebagai prinsip mengikat dan non-negotiable. Dicatat di sini sebagai penurunan sementara, bukan didiamkan. |
| 2 | Mitigasi akuntabilitas | `disbursement_destination` tetap wajib diisi — kini berfungsi sebagai **niat penyaluran tercatat**, bukan instruksi ke gateway. Ditambahkan tabel `manual_disbursements` (nominal, tanggal, bukti transfer, `approved_by_id`) untuk mencatat setiap penyaluran manual dari rekening yayasan ke Nadzir. Tanpa tabel ini, klaim transparansi ke ADB tidak punya dasar data. |
| 3 | Batasan klaim publik | UI publik V.1 **dilarang** menuliskan klaim "dana langsung ke rekening Nadzir". |
| 4 | Rencana pemulihan | Non-custodial penuh menjadi syarat masuk V.2, bergantung pada ketersediaan Midtrans Iris atau tingkatan partner yang mendukung split settlement. |

### D. Keputusan Payment Gateway

| # | Topik | Keputusan |
|---|---|---|
| 1 | Akun Midtrans Sandbox belum tersedia | Dibangun `MockPaymentProvider` di `lib/payment/`. Mock dan Midtrans hanya berbeda **kunci dan URL**; alur database, verifikasi signature, dan idempotensi identik. Pergantian nanti = ganti satu variabel environment, nol perubahan logika. |
| 2 | `MOCK_SANDBOX` terlarang di produksi | Ditegakkan di `env.ts` saat boot — proses menolak start, bukan sekadar peringatan. |
| 3 | Anchor sebelum charge | Baris order dan `Transaction` dibuat dalam **satu transaksi DB sebelum** provider dipanggil. Menutup AMW-04, di mana modul Zakat dan Qurban tidak pernah membuat `Transaction` sehingga cabang webhook-nya mencari anchor yang tidak akan pernah ada. |
| 4 | Idempotensi aman-balapan | Penjaga berupa `UPDATE` bersyarat **di dalam** transaksi, bukan pembacaan status sebelum transaksi dibuka. Pola lama rawan balapan: dua retry Midtrans yang datang bersamaan dapat lolos berdua dan menambah ledger dua kali — pada wakaf itu cacat fiqih, bukan sekadar selisih angka. |
| 5 | Satu endpoint webhook | `POST /api/webhooks/payment` tunggal, routing internal lewat prefix `AMW-{MODULE}-{ulid}`. Tiga handler per-modul di repo lama (AMW-12) tidak dibawa. |

### E. Tata Kelola Proses — Perbaikan Pola DoD Semu

| # | Topik | Keputusan |
|---|---|---|
| 1 | Aturan bukti | Task boleh dicentang hanya bila menghasilkan **artefak yang bisa dijalankan ulang orang lain**: tes yang lewat, `curl` beserta keluarannya, query SQL beserta hasilnya, atau rekaman layar. Kalimat "sudah dites manual", "sudah jalan di lokal saya", dan "tercakup di regression suite" tidak diterima sebagai bukti. |
| 2 | Latar belakang aturan ini | Audit menemukan empat klaim penyelesaian tanpa dasar, termasuk Putaran 8 #5 yang menyebut "diverifikasi dalam unit/integration suite" pada proyek yang **tidak punya test runner sama sekali**. |
| 3 | Zona vibe coding | Zona 0 (uang/fiqih/identitas) ditulis manusia + Claude dengan tes lebih dulu; Zona 1 (route/validasi) diisi DeepSeek dari kontrak dan tes yang sudah ada; Zona 2 (UI) DeepSeek bebas. Tercantum di `AI_RULES.md`. |
| 4 | Pemangkasan `/docs` | Dari 12 file menjadi 8. `DATABASE_SCHEMA.md` (844 baris DBML) dan `API_CONTRACTS.md` dihapus karena menduplikasi informasi yang hidup di kode — dan duplikasi itulah yang melahirkan drift AMW-01. Skema adalah `db/schema.ts`; kontrak API adalah skema Zod + tipe Hono RPC. |
| 5 | Gate harian | Setiap hari sprint ditutup satu gate terukur. Gate tidak lolos → hari berikutnya dimulai dari sana, bukan dari task baru. |

### F. Yang Perlu Ditindaklanjuti

- Domain publik untuk API di VPS belum ditetapkan; Caddy memerlukannya untuk TLS otomatis.
- Authorized Redirect URI Google OAuth harus ditambahkan untuk origin frontend baru.
- Strategi penyimpanan dan pencadangan secret di VPS (tidak ada lagi UI environment
  variable seperti Vercel) belum diputuskan.
- Rate limiting berbasis IP untuk `POST /api/wakaf/orders` (guest checkout, Putaran 8 #6)
  masih backlog dan wajib ada sebelum staging publik.

## Putaran 14 — Koreksi Stack Frontend & Lapisan API (Day 1 Sprint 10)

**Tanggal:** 7 September 2026
**Konteks:** Repo `amwal-bun` diinisialisasi dari template betterz-stack sebelum keputusan
stack ditinjau ulang. Dilakukan inspeksi fisik workspace dan evaluasi tiga sanggahan.
**Pengambil keputusan:** Konsensus tim dev, rekomendasi Tech Lead.

| # | Topik | Keputusan & Alasan |
|---|---|---|
| 1 | Frontend: **TanStack Start**, mengoreksi Putaran 13 A5 | Putaran 13 memilih Vite SPA dengan alasan TanStack Start terlalu muda untuk dibangun dalam 6 hari. Alasan itu gugur karena template sudah berjalan. Keuntungan yang didapat: 11 komponen shadcn, Lingui id/en, dan **SSR yang mengembalikan SEO halaman program wakaf publik** — kerugian yang di Putaran 13 diterima sadar. Konsekuensi: `apps/web` memerlukan runtime server, bukan CDN statis. |
| 2 | `apps/web` adalah **frontend murni** | Syarat mengikat atas keputusan #1. Tanpa Drizzle, tanpa akses database, tanpa server auth. Backend kedua di dalam TanStack Start adalah permukaan yang tidak tercakup `rbac.matrix.ts` — bentuk kegagalan AMW-03 yang dibangun ulang dengan framework berbeda. |
| 3 | Lapisan API: **oRPC di dalam Hono**, mengoreksi Putaran 13 A3 sebagian | Hono tetap server HTTP + middleware/RBAC (`SECURITY.md` §3 utuh); oRPC menjadi lapisan prosedur ber-tipe di bawah route yang sudah terlindungi. Alasan utama: `hc` punya masalah performa TypeScript terdokumentasi pada route tree besar, dan API kita >58 endpoint. Webhook Midtrans tetap handler Hono biasa (kontrak eksternal, bukan RPC). |
| 4 | Auth: **Better Auth DITOLAK**, Putaran 13 A tetap berlaku | Amwal memakai tabel `users`; Better Auth membuat `user`/`session`/`account`/`verification` — dua penyimpanan identitas terpisah, sementara 37 tabel domain ber-FK ke `users.id`. Memetakannya ke `users` memerlukan `ALTER TABLE users`, melanggar aturan additive-only terhadap Next.js yang masih aktif. Menjalankan keduanya mematahkan guest resolution Putaran 8 #3 dan `SYSTEM_ANONYMOUS_USER_ID`. Logika auth lama sudah lolos audit; porting lebih cepat dan lebih pasti benar daripada integrasi. |
| 5 | Temuan risiko: `turbo db:push` | Script `db:push` di root meneruskan `drizzle-kit push` ke `apps/web` dengan skema template 5 tabel. Terhadap `DATABASE_URL` Supabase, ini berpotensi menghapus 38 tabel yang dibaca aplikasi Next.js. Dicabut dari `package.json` root, `turbo.json`, dan `apps/web/package.json`. Menegaskan `db/MIGRATION_RULES.md` aturan larangan `push`. |
| 6 | Konsolidasi berkas aturan AI | Template membawa `CLAUDE.md`, `AGENTS.md`, `.rules`, `GEMINI.md`, dan `bts.instructions.md` (~43 KB) yang menyebut proyek dan struktur folder lain. Diganti penunjuk ke `docs/README.md` agar kebijakan pemuatan konteks tetap berlaku. `.rules` dipertahankan (panduan lint Ultracite, tidak bertabrakan). |
| 7 | Catatan proses | Template diinisialisasi sebelum usulannya dibahas, sehingga tim menghabiskan waktu membongkar yang sudah terpasang. Disepakati: perubahan atas keputusan yang sudah dikunci di `DECISION_LOG.md` diusulkan lebih dulu, dieksekusi setelah putusan. |
```

---

## Putaran 15 — Konsolidasi Deployment VPS & Pembekuan Arsitektur

**Tanggal:** 7 September 2026 (Day 1 Sprint 10, malam)
**Konteks:** Usulan ketiga perubahan arsitektur dalam 48 jam — meniadakan Hono dan menjalankan oRPC langsung di dalam TanStack Start yang dideploy ke Vercel.
**Pengambil keputusan:** Konsensus tim dev, rekomendasi Tech Lead.
**Rekaman lengkap:** `docs/PUTARAN-15.md`.

| # | Topik | Keputusan & Alasan |
|---|---|---|
| 1 | **Vercel disingkirkan sepenuhnya** | Seluruh service dideploy di VPS dedicated dalam satu jaringan Docker internal. Mengoreksi Putaran 13 A6 dan Putaran 14 #1. |
| 2 | Alasan utama: Baileys mengikat ke host persisten | WebSocket persisten + sesi filesystem mustahil di Vercel. VPS tetap harus hidup, jadi memindahkan API ke serverless hanya memperburuk runtime tanpa mengurangi beban operasional. |
| 3 | Alasan keamanan: mempertahankan AMW-02 | `web` di Vercel memaksa `wa-bot` dapat dijangkau publik — membatalkan perbaikan struktural Putaran 13 A6 dan kembali ke proteksi header-secret yang pernah jebol. |
| 4 | Port 5432 session mode dipertahankan | Proses long-lived membuat persoalan pooling tidak muncul; guard port-5432 tetap berlaku. |
| 5 | `apps/server` sebagai backend tunggal | Usulan meniadakan Hono **ditolak**; wawasan yang mendasarinya diterima — yang perlu dihapus ternyata Vercel, bukan Hono. |
| 6 | **Penggabungan `apps/server` ke `apps/web` ditunda** | Ditinjau ulang pasca-staging, bukan di tengah sprint. Syarat mengikat: Zone 0 harus tetap dapat di-`bun test` tanpa build frontend. |
| 7 | Caddy satu-satunya permukaan publik | Tidak ada rute publik ke `wa-bot` dalam bentuk apa pun. |

---

## Putaran 17 — Architectural Realignment: Fullstack oRPC Monolith

**Tanggal:** 10–12 September 2026
**Konteks:** Peninjauan ulang Putaran 15 #6 setelah sprint, sebagaimana disyaratkan di sana. Dieksekusi sebagai strangler-fig 7 batch di branch terisolasi `refactor/orpc-monolith`.
**Pengambil keputusan:** Konsensus tim dev, rekomendasi Tech Lead.
**Rekaman eksekusi lengkap (per batch, beserta bukti gate):** `docs/PUTARAN-17.md`.

### A. Keputusan Arsitektur

| # | Topik | Keputusan & Alasan |
|---|---|---|
| 1 | **`apps/server` dihapus; `apps/web` menjadi satu-satunya aplikasi HTTP** | Membalik Putaran 14 #2 dan Putaran 15 #5. Hono + oRPC-di-dalam-Hono digantikan oRPC yang di-mount langsung di TanStack Start (`routes/rpc/$.ts`, prefix `/rpc`). Pemisahan dua service terbukti lebih banyak upacara daripada nilai begitu Vercel tidak lagi jadi faktor. |
| 2 | **Syarat Putaran 15 #6 dipenuhi lewat `packages/core`, bukan lewat `apps/server`** | Zone 0 (ledger fiqih, pembayaran, webhook, guard auth, skema) diekstrak ke workspace terisolasi `@amwal/core` tanpa dependensi UI. Invarian fiqih kini diuji **tanpa DB dan tanpa bundler** — 24 tes, ~120 ms. Batas ini ditegakkan tooling (package/tsconfig terpisah), bukan sekadar konvensi. |
| 3 | **Strangler-fig, bukan big-bang** | `apps/server` tetap bootable dan melayani produksi sampai seluruh gate Batch 5 hijau; baru dihapus di Batch 6. Tidak satu baris pun dihapus sebelum padanannya teruji. |
| 4 | **Satu container aplikasi, port 3000** | `docker-compose.prod.yml` kehilangan service `server`; Caddy menjadi satu blok `reverse_proxy web:3000` (blok `@backend`/`server:3001` dihapus). `/rpc/*`, `/api/*`, `/health`, SSR, dan aset statis dilayani satu proses. `wa-bot` tetap internal (AMW-02 utuh). |
| 5 | **Webhook & unduhan biner tetap HTTP murni** | Webhook Midtrans (kontrak eksternal) dan unduhan PDF sertifikat bukan JSON-RPC, jadi tetap rute `routes/api/**`. Konsisten dengan Putaran 14 #3. |
| 6 | **Skema tetap satu berkas, sumber kebenaran tunggal** | `packages/core/src/db/schema.ts`; `apps/web/src/lib/db/schema.ts` hanya re-export shim. `drizzle.config.ts` menunjuk langsung ke core. Migrasi dipindah `git mv` dari `apps/server/drizzle/` ke `apps/web/drizzle/` — riwayat skema produksi tidak boleh dibuang. |
| 7 | Auth tetap JWT custom | Better Auth tetap ditolak (Putaran 14 #4 tidak berubah). |

### B. Bukti Gate Penutup

| Kriteria | Hasil |
|---|---|
| `check-types` | 3/3 paket (`@amwal/core`, `wa-bot`, `web`) |
| `biome check` | 0 error |
| Test suite | **106 pass / 0 fail** — 24 di `packages/core` (tanpa DB), 82 di `apps/web` |
| Dev server | Boot bersih di port 3000, tanpa error proxy |
| Login E2E | register → login → cookie httpOnly → redirect `/dashboard`, seluruhnya lewat `/rpc/auth/*` |
| Pembayaran E2E | order → simulator → `/api/dev/mock-webhook` → tanda tangan terverifikasi → transaksi `LUNAS` di basis data |

### C. Audit Silang terhadap Usulan Tandingan (`origin/pankop`)

Sebuah rencana revert fullstack terpisah disusun Naufal di `origin/pankop`
(`docs/PLAN_FULLSTACK_REVERT.md`, manifest `8b72567`), yang di sana diusulkan
dicatat sebagai "Putaran 16". Rencana itu **tidak pernah dieksekusi dan tidak
diratifikasi**; nomor Putaran 16 karenanya tidak terpakai. Audit perbandingan
("Manifest vs Monolith", 11 Sep 2026) menyimpulkan:

| # | Topik | Putusan |
|---|---|---|
| 1 | Penempatan lib: `apps/web/src/lib/*` (rencana) vs `packages/core` (dieksekusi) | **`packages/core` dipertahankan** — batas Zone 0 ditegakkan tooling, tes fiqih bebas bundler, dan kernel dapat dipakai bersama `apps/wa-bot` kelak. |
| 2 | Manifest ditulis terhadap server di branch lain | Manifest menjelaskan `apps/server` versi `origin/pankop`, bukan versi yang kita decommission; keduanya berpisah di `c421127`. Mayoritas "gap" di daftarnya adalah **fitur yang tidak pernah ada di lineage ini**, bukan porting yang terlewat. |
| 3 | Lapisan konsumen UI: hapus `lib/amwal-api` (rencana) vs adapter tipis (dieksekusi) | **Adapter dipertahankan untuk saat ini.** Arah Naufal (TanStack Query) benar dan akan diadopsi bertahap di balik batas adapter yang sama; membongkar 32 komponen sekaligus tepat setelah migrasi 7 batch adalah risiko tanpa manfaat pengguna. |
| 4 | Celah nyata yang diadopsi | (a) **IDOR sertifikat** — rute unduhan tidak memeriksa autentikasi/kepemilikan; ditutup di `8f277b9`. (b) **`/api/dev/mock-webhook` hilang** — satu-satunya porting yang benar-benar terlewat dari migrasi kita; dipulihkan di `8f277b9`. |
| 5 | Fitur yang masih tertinggal di `origin/pankop` | Notifikasi in-app, `ask-ai` DeepSeek, modul amil (setoran/rekap-cash/distribusi + migrasi `0003` geolokasi), serta helper keamanan (enkripsi NIK AES-GCM, matriks RBAC). Diputuskan **di-replay sebagai PR terpisah di atas monolith**, bukan dengan mengulang migrasi dari branch Naufal — yang akan membuang 8 commit pekerjaan teruji. |

### D. Yang Perlu Ditindaklanjuti

- Build & `docker compose up` di staging **belum pernah dijalankan** (Docker daemon tidak tersedia saat Batch 6); wajib sebelum deploy produksi pertama.
- Tombol Google OAuth di layar login/register menaut ke `/api/auth/google` yang tidak punya handler sejak better-auth dicabut (`f990bba`).
- Skrip `db:seed` menunjuk berkas yang dihapus di `8702038`.
- Audit matriks RBAC (`S10-N-15`) dan enkripsi NIK belum ada di jalur ini.

---

## Putaran 18 — Sprint 11: CMS Artikel & Berita + Penutupan Stub Tier C (`I-9`)

**Tanggal:** 17 September 2026 · **Branch:** `antigravity/awan` · **Pelaksana:** Antigravity Awan (Lane 3)

### A. Keputusan Arsitektur & Implementasi

| # | Topik | Putusan |
|---|---|---|
| 1 | **Tunggalisasi Tabel CMS (`education_contents`)** | Sesuai migrasi `0004_consolidated_migrations.sql`, tabel `education_contents` menampung seluruh tipe konten (`ARTICLE`, `VIDEO`, `INFOGRAPHIC`, `QUIZ`) dengan status string `DRAFT`, `PUBLISHED`, `ARCHIVED`. Tipe konten berita (`NEWS`) dan edukasi (`EDUCATION`) diakomodasi dalam relasi skema ini. |
| 2 | **Kontrak Zod di Core (`packages/core/src/contracts/cms.ts`)** | Skema Zod `cmsStatusSchema`, `cmsTypeSchema`, `listCmsSchema`, `createCmsArticleSchema`, `updateCmsArticleSchema` dibuat di Zone 0 / core sebagai sumber kebenaran tunggal untuk public dan admin router. |
| 3 | **Pemisahan Public & Admin oRPC Router** | - Public router: `apps/web/src/lib/orpc/router/cms.ts` (`list`, `bySlug`, `byId`) terpasang pada `publicProcedure` dan otomatis menyaring `status = 'PUBLISHED'`.<br>- Admin router: `apps/web/src/lib/orpc/router/admin/cms.ts` (`list`, `byId`, `create`, `update`, `publish`, `archive`, `delete`) dilindungi `adminProcedure` (RBAC `ADMIN`). |
| 4 | **Penutupan Stub Tier C di Frontend** | `TierCStubBanner` dan mock HTTP 404 pada rute publik `/berita` (`apps/web/src/components/cms/news-view.tsx`) dan `/edukasi` (`apps/web/src/components/education/education-view.tsx`) digantikan dengan pemanggilan `orpc.cms.list` / `orpc.cms.bySlug` berbasis TanStack React Query. |
| 5 | **Backoffice Admin Management View Integration** | `news-management-view.tsx` dan `education-management-view.tsx` dihubungkan langsung ke `orpc.admin.cms.*` untuk operasi CRUD, filter status, validasi slug duplikat, dan toast umpan balik. |

### B. Bukti Gate Penutup

| Kriteria | Hasil |
|---|---|
| `check-types` | **3/3 paket lulus** (`@amwal/core`, `wa-bot`, `web`) |
| `biome check` | **0 error** pada seluruh berkas CMS, router, dan view komponen |
| CMS Test Suite | **4 pass / 0 fail / 32 expect()** (`apps/web/tests/orpc/cms.test.ts` pada DB terisolasi `amwal_bun_s11_antigravity_awan_test`) |
| RBAC Guard | 401 unauthenticated & 403 non-ADMIN berhasil diverifikasi pada seluruh mutasi admin CMS |
| Slug Uniqueness | Verifikasi penolakan duplikasi slug `ALREADY_EXISTS` (409) pada pembuatan artikel |

