# RECONCILIATION.md — Putusan Arsitektur & Penyelarasan Workspace

> ## ⚠️ CATATAN HISTORIS — SUDAH DITUTUP
>
> **Berkas ini adalah rekaman keputusan 7 September 2026 (Day 1) dan bukan
> deskripsi kondisi repo saat ini.** Seluruh "TINDAKAN MENDESAK" di §0 sudah
> dieksekusi, dan pemisahan `apps/server` / `apps/web` yang dibahas di sini
> **sudah tidak berlaku** — `apps/server` dihapus di Putaran 17 Batch 6.
>
> Untuk kondisi terkini baca `STATUS.md` (ground truth branch),
> `docs/ARCHITECTURE.md` (stack & topologi), dan `docs/DECISION_LOG.md`
> §Putaran 17. Jangan mengeksekusi instruksi apa pun dari berkas ini.

**Tanggal:** 7 September 2026 (Day 1, sore)
**Konteks:** Sanggahan Naufal atas tiga keputusan stack + repo `amwal-bun` sudah terlanjur
diinisialisasi dari template **betterz-stack** (Better-T-Stack CLI).
**Putusan:** **HYBRID** — 1 ditolak, 2 diterima.

---

## 0. TINDAKAN MENDESAK — Kerjakan Sebelum Membaca Sisanya

### 0.1 `turbo db:push` adalah bom aktif di root

```jsonc
// package.json (root) — saat ini
"db:push": "turbo db:push",     // ← meneruskan ke SEMUA workspace
```
```jsonc
// apps/web/package.json — saat ini
"db:push": "drizzle-kit push",  // ← perintah yang DILARANG di db/MIGRATION_RULES.md
```

`bun run db:push` dari root akan menjalankan `drizzle-kit push` di `apps/web`, yang
membandingkan skema template (5 tabel: `user`, `session`, `account`, `verification`, `todo`)
terhadap `DATABASE_URL`. Bila variabel itu pernah diisi kredensial Supabase — dan
`apps/server/.env` sudah memuatnya, jadi tinggal satu operasi salin — drizzle akan
menawarkan **menyelaraskan** database: menghapus 38 tabel yang tidak dikenalnya, yang
sedang dibaca aplikasi Next.js di Vercel.

Yang menyelamatkan kita sekarang hanya satu hal: `apps/web/.env` **belum ada**.
Itu bukan pengaman, itu kebetulan.

**Lakukan sekarang:**

```bash
# 1. Cabut db:push dari root package.json dan turbo.json
# 2. Cabut seluruh script db:* dari apps/web/package.json
# 3. Verifikasi tidak ada jalur tersisa
grep -rn "drizzle-kit push" package.json turbo.json apps/*/package.json
# harus kosong
```

### 0.2 Kerja Bara belum masuk git

```
?? apps/server/     ← untracked
```

S10-B-01 dan S10-B-02 — env fail-fast, 38 tabel hasil `drizzle-kit pull`, baseline
migrasi, guard port 5432 — seluruhnya **belum di-commit**. Satu `git clean -fd` yang salah
ketik menghapus pekerjaan sehari penuh.

```bash
git add apps/server && git commit -m "feat(server): S10-B-01 env fail-fast, S10-B-02 drizzle baseline 38 tabel"
```

---

## 1. Hasil Inspeksi Fisik

### Yang sudah benar — kerja Bara lolos verifikasi

| Item | Status |
|---|---|
| `apps/server/src/db/schema.ts` | **38 tabel**, cocok dengan Supabase |
| `apps/server/drizzle/0000_baseline.sql` | **38 `CREATE TABLE`** |
| `apps/server/drizzle.config.ts` | Menolak `DATABASE_URL` yang bukan port 5432 — **melebihi** yang diminta backlog |
| `apps/server/src/env.ts` | Ada, pola fail-fast |
| `apps/server/.env` | `PAYMENT_PROVIDER=MOCK_SANDBOX`, `ENCRYPTION_KEY` terisi terpisah dari `JWT_SECRET` |

Gate Day 1 sisi backend: **lolos**.

### Yang bertabrakan

| # | Tabrakan | Bukti | Dampak |
|---|---|---|---|
| 1 | **Dua backend** | `apps/server` (Hono) vs `apps/web/src/routes/api/rpc.$.ts` + `auth.$.ts` (oRPC server + Better Auth di dalam TanStack Start) | Dua sumber kebenaran API |
| 2 | **Dua konfigurasi Drizzle** | `apps/server/drizzle.config.ts` (38 tabel, guard 5432) vs `apps/web/drizzle.config.ts` (5 tabel template, tanpa guard) | Lihat §0.1 |
| 3 | **Dua tabel identitas** | Amwal `users` (jamak) vs Better Auth `user` (tunggal) | Dibahas di §2.1 — ini inti penolakan |
| 4 | **Empat berkas aturan AI bersaing** | `CLAUDE.md` (5 KB), `AGENTS.md` (19 KB), `.rules` (19 KB), `GEMINI.md`, `.github/instructions/bts.instructions.md` — seluruhnya milik template, menyebut "my-better-t-app-2" dan `apps/fumadocs` yang tidak ada | Kebijakan konteks `docs/README.md` batal; DeepSeek membaca aturan proyek lain |
| 5 | **Identitas repo masih template** | `package.json` → `"name": "my-better-t-app-2"`; seluruh histori git adalah histori template | Kosmetik, tapi menular ke Docker image dan log |
| 6 | **Artefak demo** | `schema/todo.ts`, `routes/demo/`, `todos.json` | Sampah yang akan disalin model sebagai pola |

---

## 2. Evaluasi Tiga Sanggahan

### 2.1 Better Auth vs jose + `Bun.password` → **DITOLAK**

Bukan karena preferensi. Karena benturan dengan skema yang tidak bisa kita ubah.

**Temuan menentukan:** Amwal memakai tabel `users` (jamak); Better Auth membuat `user`
(tunggal), `session`, `account`, `verification`. Tidak ada bentrok nama — dan justru itu
masalahnya. Keduanya akan hidup berdampingan sebagai **dua penyimpanan identitas terpisah**.

Seluruh FK domain menunjuk `users.id`: `wakif_id`, `nadzir_id`, `approved_by_id`,
`entered_by_amil_id`, `verified_by_*_id`. Sesi Better Auth untuk baris di tabel `user`
tidak punya hubungan apa pun dengan `users.id` yang dirujuk 37 tabel lainnya.

Untuk membuatnya bekerja, hanya ada dua jalan dan keduanya buntu:

**Jalan A — petakan Better Auth ke tabel `users` yang ada.**
Better Auth memang mendukung pemetaan tabel/kolom kustom. Tapi ia mengharapkan `name`,
`emailVerified`, `image`, dan **kata sandi di tabel `account` terpisah**. Skema Amwal
menyimpan `password_hash` langsung di baris user. Menyesuaikannya berarti `ALTER TABLE users`
— pada tabel yang **sedang dibaca aplikasi Next.js di Vercel**. Ini melanggar
`db/MIGRATION_RULES.md` aturan 1 dan 3 secara langsung.

**Jalan B — jalankan dua tabel identitas dan sinkronkan.**
Setiap pendaftaran menulis dua tempat. Setiap kegagalan parsial menghasilkan user yatim.
Logika *guest resolution* Putaran 8 #3 — yang mencari user dengan
`passwordHash IS NULL AND oauthProvider IS NULL` — tidak punya padanan di model Better Auth.
`SYSTEM_ANONYMOUS_USER_ID` juga tidak. Ini bukan integrasi, ini dua sistem yang saling
berbohong.

**Soal argumen kecepatan.** Argumen delegasi itu benar secara umum — untuk greenfield.
Di sini ia terbalik: `S10-N-02` adalah **porting kode yang sudah berjalan dan sudah lolos
audit keamanan**, sekitar 200 baris dengan perilaku yang sudah diketahui. Memindahkan kode
yang benar lebih cepat daripada mengintegrasikan pustaka terhadap skema asing yang tidak
boleh diubah — dan hasilnya sudah pasti benar, bukan mudah-mudahan benar.

**Ditambah:** Better Auth memakai sesi opak berbasis database. Kita sudah punya
`refresh_tokens` dengan rotasi dan deteksi reuse yang lolos audit, dan PRD §4.5 mengunci
**satu** sumber kebenaran sesi.

**Aksi:** hapus `better-auth`, `apps/web/src/lib/auth/`, `apps/web/src/routes/api/auth.$.ts`,
dan `apps/web/src/lib/db/schema/auth.ts`.

---

### 2.2 TanStack Start vs Vite SPA → **DITERIMA**

Naufal benar di poin ini, dan alasan penolakan saya sebelumnya sudah kedaluwarsa oleh
fakta lapangan.

Saya menolak TanStack Start karena "terlalu muda untuk dipertaruhkan dalam enam hari".
Argumen itu berlaku untuk *memulai dari nol*. Yang ada di disk sekarang adalah TanStack
Start yang **sudah berjalan**, dengan tiga hal yang belum kita punya:

| Yang sudah ada | Menggantikan |
|---|---|
| `components/ui/` shadcn — 11 komponen (button, card, input, select, dropdown, switch, slider, separator, label, badge, textarea) | Sebagian `S10-A-02` |
| Lingui terkonfigurasi, `global-id.po` + `global-en.po` | Infrastruktur i18n yang belum direncanakan sama sekali |
| SSR via Nitro | **Mengembalikan SEO halaman program wakaf publik** — yang di `ARCHITECTURE.md` §1 saya catat sebagai kerugian yang diterima sadar |

Poin ketiga itu bukan kenyamanan. Halaman program wakaf adalah halaman yang dibagikan ke
WhatsApp dan grup masjid; SSR membuatnya punya preview dan bisa diindeks. Kita mendapatkan
kembali sesuatu yang sudah saya relakan.

**Satu syarat mengikat:** `apps/web` menjadi **frontend murni**. Bukan full-stack.
Ia melakukan SSR dan routing, lalu memanggil `apps/server` lewat HTTP. Tidak ada Drizzle,
tidak ada Better Auth, tidak ada akses database dari `apps/web`.

Alasannya bukan kerapian: seluruh desain RBAC di `SECURITY.md` §3 bertumpu pada middleware
yang menempel di titik mount router Hono. Backend kedua di dalam TanStack Start adalah
permukaan yang tidak tercakup `rbac.matrix.ts` — persis bentuk kegagalan AMW-03, dibangun
ulang dengan framework berbeda.

**Konsekuensi yang harus dicatat:** `apps/web` sekarang butuh runtime server, bukan CDN
statis. Vercel menjalankan output Nitro dengan baik, jadi target deploy tidak berubah —
tapi `ARCHITECTURE.md` §2 perlu diperbarui karena topologinya bukan lagi "static dist/".

---

### 2.3 oRPC vs Hono RPC (`hc`) → **DITERIMA**

Diterima, dan salah satu argumen saya sebelumnya memang lemah.

Saya memilih `hc` sebagian karena densitas data latih. Itu masih benar — oRPC lebih tipis
di data latih daripada Hono. Tapi ada faktor teknis yang lebih berat dan luput saya
pertimbangkan: **`hc` punya masalah performa TypeScript yang terdokumentasi pada route tree
besar.** Pada 58+ endpoint, `hc` rutin memunculkan *"type instantiation is excessively deep"*
dan membuat IDE merangkak. Itu bukan risiko teoretis untuk ukuran API kita.

Dan ini bukan pilihan biner. `@orpc/server` punya adapter fetch yang dipasang **di dalam**
Hono. Jadi:

- **Hono** tetap server HTTP + lapisan middleware/RBAC — `SECURITY.md` §3 utuh
- **oRPC** menjadi lapisan prosedur ber-tipe di bawah route Hono yang sudah terlindungi
- `@orpc/tanstack-query` di sisi klien sudah terpasang di template — Awan tidak menulis
  lapisan data fetching sama sekali

**Dua batasan:**

1. **Webhook tetap handler Hono biasa.** `POST /api/webhooks/payment` adalah kontrak
   eksternal dari Midtrans dengan bentuk body yang sudah ditentukan. Membungkusnya sebagai
   prosedur RPC hanya menambah lapisan tanpa manfaat.
2. **`CODING_CONVENTIONS.md` wajib memuat satu pola prosedur oRPC kanonik.** Densitas data
   latih yang tipis diatasi dengan contoh yang benar di dalam konteks — itu memang fungsi
   berkas itu. Tanpa pola kanonik, DeepSeek akan mengarang variasi.

---

## 3. Rencana Penyelarasan

Urutan ini penting: langkah 1–2 menghentikan risiko, sisanya merapikan.

### Langkah 1 — Amankan (10 menit)

```bash
git add apps/server
git commit -m "feat(server): S10-B-01 env fail-fast, S10-B-02 drizzle baseline 38 tabel"
```

Cabut dari `package.json` root: script `db:push`.
Cabut dari `turbo.json`: task `db:push`, `db:start`, `db:stop`, `db:watch`, `db:down`.
Cabut dari `apps/web/package.json`: **seluruh** script `db:*`.

### Langkah 2 — Kosongkan `apps/web` dari tanggung jawab backend (30 menit)

```bash
rm -rf apps/web/src/lib/db          # skema template 5 tabel + migrasi
rm -rf apps/web/src/lib/auth        # better-auth
rm apps/web/drizzle.config.ts
rm apps/web/docker-compose.yml      # Postgres lokal template
rm apps/web/src/routes/api/auth.\$.ts
rm apps/web/todos.json
rm -rf apps/web/src/routes/demo
```

Hapus dependensi dari `apps/web/package.json`:
`better-auth`, `drizzle-orm`, `drizzle-kit`, `pg`, `@types/pg`, `@orpc/server`,
`@orpc/zod`, `@orpc/json-schema`, `@orpc/openapi`

Pertahankan: `@orpc/client`, `@orpc/tanstack-query`, seluruh `@tanstack/*`,
`@lingui/*`, `@radix-ui/*`, Tailwind.

### Langkah 3 — Pindahkan lapisan oRPC ke `apps/server` (Bara, 1 jam)

```bash
mkdir -p apps/server/src/rpc
mv apps/web/src/lib/orpc/router apps/server/src/rpc/
mv apps/web/src/lib/orpc/context.ts apps/server/src/rpc/
rm apps/web/src/routes/api/rpc.\$.ts
```

Pasang `RPCHandler` oRPC di bawah route Hono yang sudah dilindungi middleware.
`apps/web/src/lib/orpc/client.ts` diarahkan ke `VITE_API_URL` alih-alih path relatif.

### Langkah 4 — Satukan berkas aturan AI (30 menit)

Ini yang paling berpengaruh langsung ke kualitas vibe coding. Saat ini DeepSeek berpotensi
membaca 43 KB aturan milik proyek lain yang menyebut `apps/fumadocs` dan "my-better-t-app-2".

| Berkas | Aksi |
|---|---|
| `CLAUDE.md` | **Ganti isi** → penunjuk 10 baris ke `docs/README.md` |
| `AGENTS.md` | **Ganti isi** → penunjuk yang sama |
| `GEMINI.md` | **Hapus** |
| `.github/instructions/bts.instructions.md` | **Hapus** |
| `.rules` | **Pertahankan** — ini panduan Ultracite/Biome, murni soal lint, tidak bertabrakan |
| `docs/*` | **Sumber kebenaran.** Sudah ada di repo. |

### Langkah 5 — Identitas repo (5 menit)

`package.json` root: `"name": "my-better-t-app-2"` → `"amwal-bun"`.
Ganti `README.md` template (17 KB) dengan README Amwal yang menunjuk ke `docs/README.md`.

### Langkah 6 — Perbarui dokumen terkunci (Naufal, 30 menit)

- `docs/ARCHITECTURE.md` §1 — Frontend: TanStack Start (SSR), bukan Vite SPA
- `docs/ARCHITECTURE.md` §2 — `apps/web` butuh runtime server, bukan CDN statis
- `docs/ARCHITECTURE.md` §4 — tambahkan lapisan oRPC di bawah middleware Hono
- `docs/CODING_CONVENTIONS.md` §2 — tambahkan pola prosedur oRPC kanonik
- `docs/DECISION_LOG.md` — tambahkan Putaran 14 (teks siap salin di §5)

### Dampak ke jadwal

| Task | Perubahan |
|---|---|
| `S10-A-01` Scaffold Vite | **Selesai sebagian** oleh template — tinggal token dari Hi-Fi |
| `S10-A-02` Port UI kit | **Berkurang** — 11 komponen shadcn sudah ada |
| `S10-A-03` Klien API | **Berkurang** — `@orpc/tanstack-query` menggantikan wrapper manual |
| `S10-N-02` Auth core | **Tidak berubah** — tetap porting dari repo lama |
| Baru | ~2 jam penyelarasan hari ini |

Bersih: kira-kira **impas sampai sedikit untung**. Gate Day 4 tidak bergeser.

---

## 4. Draf Pesan untuk Grup Tim

> Halo tim. Sudah ada putusan arsitektur soal betterz-stack, biar tidak berlarut dan Day 1
> tetap jalan.
>
> **Hasilnya: 2 dari 3 usulan Naufal diterima.**
>
> **✅ TanStack Start — DITERIMA.** Alasan penolakan sebelumnya ("terlalu muda untuk
> dipertaruhkan 6 hari") berlaku kalau kita mulai dari nol. Yang ada di repo sekarang sudah
> jalan, plus bawa 11 komponen shadcn dan Lingui id/en yang belum kita rencanakan. Bonusnya
> paling penting: SSR mengembalikan SEO halaman program wakaf publik — sesuatu yang di
> ARCHITECTURE.md sudah saya relakan hilang. Halaman program itu yang dibagikan ke grup
> WhatsApp; punya preview dan bisa diindeks itu nilai nyata.
>
> **✅ oRPC — DITERIMA.** Argumen saya soal densitas data latih masih benar, tapi ada faktor
> yang lebih berat dan luput saya pertimbangkan: `hc` punya masalah performa TypeScript
> terdokumentasi pada route tree besar. Di 58+ endpoint itu bukan risiko teoretis. Dan ini
> tidak biner — `@orpc/server` dipasang di dalam Hono, jadi Hono tetap jadi lapisan
> middleware/RBAC, oRPC jadi lapisan prosedur ber-tipe. Bonus: `@orpc/tanstack-query` sudah
> terpasang, Awan tidak perlu menulis lapisan data fetching.
>
> **❌ Better Auth — DITOLAK.** Ini bukan soal selera, ada temuan keras dari inspeksi:
>
> Amwal punya tabel `users` (jamak). Better Auth bikin `user` (tunggal), `session`,
> `account`, `verification`. Tidak bentrok nama — dan justru itu masalahnya: jadi **dua
> penyimpanan identitas terpisah**. Padahal 37 tabel lain FK-nya menunjuk `users.id`
> (`wakif_id`, `nadzir_id`, `approved_by_id`, `entered_by_amil_id`, dst).
>
> Cuma ada dua jalan dan dua-duanya buntu. Petakan Better Auth ke `users` → butuh
> `ALTER TABLE users`, padahal tabel itu sedang dibaca Next.js di Vercel; itu melanggar
> aturan additive-only. Atau jalankan dua tabel identitas dan sinkronkan → guest resolution
> Putaran 8 dan `SYSTEM_ANONYMOUS_USER_ID` tidak punya padanan di model Better Auth.
>
> Soal kecepatan: argumen delegasi itu benar untuk greenfield, tapi di sini terbalik.
> S10-N-02 itu **porting kode yang sudah lolos audit keamanan**, ~200 baris dengan perilaku
> yang sudah diketahui. Memindahkan kode yang sudah benar lebih cepat daripada
> mengintegrasikan library ke skema asing yang tidak boleh disentuh — dan hasilnya sudah
> pasti benar, bukan mudah-mudahan benar.
>
> ---
>
> **Dua hal mendesak, tolong dikerjakan sekarang:**
>
> 1. **`apps/server/` masih untracked.** Kerja Bara sehari penuh (38 tabel + baseline
>    migrasi + guard port 5432) belum masuk git. Commit dulu.
> 2. **`bun run db:push` dari root harus dicabut hari ini.** Root meneruskannya ke
>    `apps/web`, yang menjalankan `drizzle-kit push` dengan skema template 5 tabel. Kalau
>    `DATABASE_URL` Supabase pernah tersalin ke `apps/web/.env`, drizzle akan menawarkan
>    "menyelaraskan" database dengan menghapus 38 tabel yang sedang dipakai Next.js. Yang
>    menyelamatkan kita sekarang cuma satu: `apps/web/.env` belum ada. Itu kebetulan, bukan
>    pengaman.
>
> **Pembagian rapikan (~2 jam, hari ini):** Bara → langkah 1 & 3 (commit, cabut db:push,
> pindah oRPC ke server). Naufal → langkah 2 & 6 (kosongkan apps/web dari backend, update
> ARCHITECTURE + DECISION_LOG). Awan → langkah 4 & 5 (satukan berkas aturan AI, identitas
> repo), lalu lanjut token Hi-Fi.
>
> Dampak ke jadwal kira-kira impas: S10-A-01/02/03 berkurang karena template, ditambah ~2
> jam rapikan. **Gate Day 4 (Wakaf E2E) tidak bergeser.**
>
> Detail lengkap + langkah teknis ada di `RECONCILIATION.md` di root repo.
>
> Catatan penutup: Naufal, terima kasih sudah menantang keputusan yang sudah dikunci —
> dua dari tiga terbukti lebih baik dari rencana awal, dan SSR itu benar-benar sesuatu yang
> saya lewatkan. Yang perlu kita rapikan cuma urutannya: template masuk sebelum keputusannya
> diambil, jadi kita menghabiskan waktu membongkar hal yang sudah terpasang. Lain kali
> usulkan dulu, baru `bun create`. Substansinya bagus.

---

## 5. Teks Putaran 14 — Siap Salin ke `docs/DECISION_LOG.md`

```markdown
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
