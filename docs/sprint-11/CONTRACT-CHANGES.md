# Contract Changes — Sprint 11

Catatan **append-only**. Hanya **Claude Pro** yang menulis di berkas ini.

Agent lain mengajukan temuan, permintaan dependensi, atau perubahan kontrak lewat berkas statusnya sendiri (`docs/sprint-11/status/<slug>.md`). Claude Pro menyalin yang disetujui pada jendela merge berikutnya (12:00 / 16:30), lalu seluruh agent hilir rebase.

Entri tidak pernah diedit atau dihapus. Entri yang salah dibatalkan oleh entri baru yang menyebut nomornya.

---

## 2026-09-16-01 — Revisi D5: bentuk webhook Mayar (SUPERSEDES asumsi dokumentasi)

**Sumber:** `docs/sprint-11/status/claude-bara.md` (spike `I-11`, sandbox live)
**Dampak:** `I-3` (webhook), `I-11`, `lib/payment/on-settled.ts`, env server
**Status:** DITERIMA — bukti lapangan mengalahkan dokumentasi

Keputusan D5 disusun dari dokumentasi Mayar. Spike terhadap sandbox nyata menemukan empat perbedaan. Yang berlaku adalah temuan lapangan.

| # | Asumsi D5 semula | Kenyataan terverifikasi |
|---|---|---|
| 1 | Tidak ada header token pada webhook | Header **`x-callback-token` ada**, hex 128 karakter, **cocok persis** dengan `MAYAR_WEBHOOK_TOKEN` (dicocokkan tanpa mencetak nilainya) |
| 2 | `data.status` bertipe boolean | Bertipe **string**, bernilai `"SUCCESS"` |
| 3 | `data.transactionStatus` menandakan hasil pembayaran | Bernilai `"created"` **bahkan pada event `payment.received`** |
| 4 | Base URL `api.mayar.id` | **`https://api.mayar.io/hl/v1`** untuk pembuatan pembayaran, **`/hl/v2`** untuk payment link & pembaruan webhook |

### Yang wajib diterapkan

- **Verifikasi `x-callback-token` secara constant-time** sebelum memproses payload. Header ini ada, jadi tidak ada alasan menerima webhook tanpa autentikasi.
- **Jangan pernah memakai `transactionStatus` sebagai penentu.** Nilainya `"created"` pada event sukses; logika yang mempercayainya akan menolak pembayaran yang sah.
- **Tetap fail-closed dan tetap re-fetch.** Payload webhook bukan sumber kebenaran; status final selalu diambil ulang dari server Mayar. Temuan 1 tidak melonggarkan aturan ini — hanya menambah lapisan.
- **Bandingkan `status` sebagai string** `"SUCCESS"`, bukan sebagai boolean.

### Bentuk payload nyata yang diterima

Medan yang hadir: `id`, `transactionId`, `status`, `transactionStatus`, `amount`, `productId`, `paymentMethod` (contoh nyata: `"QRIS"`).

**Tidak ada gema nomor order kita di payload.** Pemetaan kembali ke transaksi kita harus melalui `transactionId` / `productId` yang disimpan saat anchor, bukan dengan mengurai nomor order dari webhook.

### Batasan operasional

Request pembayaran **V1 tidak dapat disimulasikan** lewat jalur sandbox V2 — checkout GraphQL membalas 404. Simulasi pembayaran hanya berhasil lewat transaksi **payment link**. Rancangan uji end-to-end Selasa harus mengikuti batas ini, bukan melawannya.

### Terbukti berhasil

Order ID v2 **`800926000001`** dipakai pada panggilan nyata dan diterima Mayar. Format 12 digit `MM BB YY SS NNNN` tervalidasi ujung-ke-ujung.

---

## 2026-09-16-02 — Koreksi tipe FK pada DDL lampiran kuitansi (`I-2`)

**Sumber:** `docs/sprint-11/status/antigravity-bara.md`, poin penyelarasan no. 1
**Dampak:** `I-2`, migrasi `0004`
**Status:** DITERIMA — koreksi diterapkan di draf

DDL yang diajukan memakai `integer` untuk `program_id` dan `progress_report_id`; pengaju menandai sendiri keraguannya.

Verifikasi terhadap skema berjalan: **`waqf_programs.id` dan `program_progress_reports.id` keduanya `text`.** Kedua FK dikoreksi menjadi `text` di `docs/sprint-11/0004_consolidated_sprint11.draft.sql`. Kolom `program_id` dinamai ulang menjadi `waqf_program_id` agar konsisten dengan penamaan FK yang sudah berlaku di repo.

Ini penyelarasan normal antar-agent, bukan cacat kerja.

---

## 2026-09-16-03 — Migrasi `0004` dikonsolidasi oleh Claude Pro

**Dampak:** `I-1`, `I-2`, `I-4`, `I-6`, `I-9`, `I-10`
**Status:** DRAF — belum diterapkan ke database mana pun

Seluruh DDL Sprint 11 masuk satu migrasi: `docs/sprint-11/0004_consolidated_sprint11.draft.sql`.

Aturan yang mengikat semua agent:

1. **Tidak ada agent yang membuat migrasi sendiri.** Kebutuhan DDL diajukan lewat berkas status; Claude Pro mengonsolidasi.
2. **SQL draf bukan migrasi.** Migrasi final dihasilkan `db:generate` setelah `schema.ts` diubah, supaya journal dan snapshot konsisten. SQL tulis tangan tanpa snapshot merusak `drizzle-kit check`.
3. **Index waktu `S-3` di luar `0004`.** `CREATE INDEX CONCURRENTLY` tidak boleh berada dalam transaksi, sedangkan Drizzle membungkus tiap migrasi dalam transaksi; dijalankan manual di luar jam sibuk.
4. **Aditif saja.** Tidak ada `DROP` / `RENAME` / `ALTER COLUMN ... SET NOT NULL`. Kategori baru memakai `text` + `CHECK`, bukan nilai enum baru — aplikasi Next.js lama membaca database yang sama dan Prisma-nya melempar error pada nilai enum asing.

Jendela `0005` tersedia pukul 12:00 hanya bila ada kebutuhan DDL susulan yang disetujui.

---

## 2026-09-16-04 — Bukti sandbox di berkas status ditulis tanpa URL bertanda tangan

**Dampak:** seluruh agent
**Status:** BERLAKU MULAI SELASA

Berkas status hari Senin memuat signed URL Supabase lengkap berikut project ref. URL tersebut sudah kedaluwarsa (TTL 600 detik) sehingga tidak ada insiden.

Mulai Selasa, bukti operasi storage ditulis sebagai **kode status + ukuran berkas + hasil verifikasi integritas**, bukan sebagai URL bertanda tangan. Berlaku sama untuk token, header autentikasi, dan kredensial apa pun: yang dicatat adalah *hasil pencocokan*, bukan nilainya.

---

## 2026-09-16-05 — Barrier ekspor `@amwal/core` dibuka

**Dampak:** seluruh agent yang menulis di `apps/web`
**Status:** SELESAI — sudah mendarat di `sprint-11`

Penghalang utama integrasi Selasa sudah dihapus. Tujuh subpath dibuka di `packages/core/package.json`:

| Subpath | Ekspor publik |
|---|---|
| `@amwal/core/time/wib` | `wibParts` |
| `@amwal/core/analytics/period` | `parseAnalyticsPeriod` |
| `@amwal/core/analytics/aggregation` | `aggregateTimeSeriesBuckets`, `aggregateComposition` |
| `@amwal/core/gamification/points` | `transactionPoints`, `transactionPointKeys`, `affiliateRewardPoints` |
| `@amwal/core/gamification/penalties` | `settlePenalties`, `penaltyKey` |
| `@amwal/core/affiliate/code` | `generateReferralCode` |
| `@amwal/core/affiliate/eligibility` | `isEligibleForAffiliateReward` |

**`@amwal/core/payment/order-id` sudah terbuka sejak sebelumnya** — gunakan langsung, jangan menyalin ulang helper order ID ke `apps/web`.

Diverifikasi dengan impor sungguhan dari konteks `apps/web` (10/10 resolve), bukan hanya `tsc`. `check-types` 3/3 dengan cache miss, `packages/core` 81 pass / 0 fail.

**Aturan yang tetap berlaku:** modul baru di `packages/core` **tidak otomatis terjangkau**. Setiap kernel baru harus didaftarkan di `exports`, dan hanya Claude Pro yang menyunting `package.json`. Ajukan lewat berkas status; jangan menambah sendiri.

### Keputusan tertunda — `packages/core/src/storage/index.ts`

Berkas barrel (`export * from './mime'` dan `'./supabase'`) ada tetapi tidak terdaftar di `exports`, sehingga tidak terjangkau siapa pun alias kode mati. Berkas ini milik **Antigravity Bara** (`core/storage/**`, PLAN §3) sehingga tidak saya sunting sepihak.

Dua pilihan, dipilih Selasa oleh pemiliknya: daftarkan sebagai `./storage`, atau hapus. Keduanya sama-sama benar; yang tidak benar adalah membiarkannya ada tanpa bisa dijangkau. Karena kedua subpath individual sudah terbuka, **saran saya: hapus** — barrel `export *` menyeret klien Supabase ke konsumen yang hanya butuh helper mime.

---

## 2026-09-16-06 — Lane Bara pindah ke branch tunggal `bara`

**Dampak:** Claude Code Bara, Codex Bara, Antigravity Bara
**Status:** BERLAKU MULAI SELASA — branch `bara` sudah disiapkan di remote

Dasar keputusan ada di `AUDIT-GATE-SENIN.md` §5. Ringkasnya: ketiga branch lane lama **nol commit unik** terhadap `sprint-11`, nol konflik, `bun.lock` disentuh satu commit saja — isolasi yang dibeli struktur tiga branch terbukti tidak terpakai, sementara `I-1` dan `I-2` justru sama-sama bermuara ke `0004`.

### Catatan penting: `bara` bukan branch baru

Nama `bara` **sudah terpakai sejak Sprint 10** — branch itu sudah ada di remote pada `3e4c0f2` ("Portal Nadzir + backoffice scaffold cleanup", Batch 0–5), dan pernah di-merge ke `main` lewat PR #6.

Sebelum disentuh, posisinya diperiksa: **nol commit unik** terhadap `sprint-11` (seluruh isinya sudah termuat di garis keturunan `sprint-11`) dan tertinggal **60 commit**. Karena `bara` terbukti leluhur langsung `sprint-11`, memajukannya adalah **fast-forward murni** — di-push tanpa `--force`, dan commit Sprint 10 `3e4c0f2` tetap menjadi leluhurnya. **Nol riwayat hilang.**

Basisnya kini sama persis dengan `sprint-11` **setelah** barrier ekspor dibuka, sehingga lane mulai dari basis yang hijau dan tidak terhalang.

Konsekuensi yang perlu diketahui: siapa pun yang masih memegang `bara` lama secara lokal harus menjalankan `git checkout bara && git pull --ff-only`. Jangan `git pull` biasa yang membuat merge commit, dan jangan reset ke posisi lama.

### Lima aturan yang tidak boleh dilonggarkan

1. **`git pull --rebase origin bara` sebelum setiap push.** Tidak ada `--force` maupun `--force-with-lease` di `bara`, tanpa kecuali — satu force-push menghapus kerja dua agent lain.
2. **Prefiks subjek commit** `[claude-code]`, `[codex]`, atau `[antigravity]`, supaya atribusi dan `git blame` tetap terbaca setelah branch digabung.
3. **Matriks kepemilikan tetap mengikat per berkas.** Pemeriksaan kepemilikan dijalankan sebelum push — ini menggantikan audit diff PR per-lane yang hilang karena penggabungan branch.
4. **Hanya Claude Pro yang menyentuh `bun.lock` dan `package.json` mana pun.** Butuh dependensi? Ajukan di berkas status.
5. **Satu PR `bara` → `sprint-11` per jendela merge**, dan branch wajib hijau (`check-types` + uji `packages/core`) saat PR dibuka. Commit yang merusak branch diperbaiki maju oleh yang merusak — tidak ada reset.

### Yang tidak berubah

Lane **Naufal** dan **Awan** tetap pada branch masing-masing. Kopling antar-lane mereka jauh lebih rendah sehingga keuntungannya kecil, sementara blast radius akan melompat dari 3 agent menjadi 10.

Tiga branch lane lama (`claude-code/bara`, `codex/bara`, `antigravity/bara`) **tidak dihapus** — sudah ter-merge penuh sehingga tidak berbahaya, dan riwayat PR-nya berguna saat audit Kamis. Statusnya arsip: jangan ada commit baru di sana.

---

## 2026-09-17-01 — KOREKSI: temuan "agregasi tanpa uji" pada `I-8` keliru

**Dampak:** Codex Bara, putusan gate Senin
**Status:** DIKOREKSI — `I-8` dinaikkan dari LULUS BERSYARAT menjadi LULUS

Audit gate Senin menyatakan fungsi agregasi tidak punya uji sama sekali. Itu salah. `tests/analytics-period.test.ts` memuat blok `describe('@amwal/core/analytics/aggregation')` berisi tiga uji yang lulus.

Kesalahan metode saya: mencari *nama berkas* yang mengandung "aggregation", tidak menemukan, lalu menyimpulkan tidak ada cakupan. Nama berkas bukan bukti cakupan uji — pelajaran yang berlaku untuk seluruh audit berikutnya.

Penguatan tetap dikerjakan lewat `tests/analytics-aggregation.test.ts` (13 uji), menyasar yang memang belum tertutup: atribusi batas WIB, penyaringan di luar periode, dan jumlah hari Februari kabisat. **Seluruhnya lulus pada eksekusi pertama**, yang sekaligus membuktikan implementasi Codex Bara sudah benar mengatribusi menurut WIB sejak awal.

---

## 2026-09-17-02 — `nextOrderSequence()` mendarat; `webhook.ts` kini mengenali order v2

**Dampak:** `I-1`, `I-3`, seluruh pemanggil pembuatan order
**Status:** MENDARAT di `bara` — belum tersambung ke `createPayment`

### Yang berubah

- **`@amwal/core/payment/order-sequence`** (subpath baru, sudah didaftarkan di `exports`) berisi `orderScopeKey()`, `nextOrderSequence()`, dan `nextOrderId()`. Kenaikan nomor memakai satu pernyataan atomik `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` sehingga tidak ada celah baca-lalu-tulis. Pelanggaran batas 9999 diterjemahkan menjadi `ORDER_SEQUENCE_EXHAUSTED`, kosakata galat yang sama dengan `formatOrderId()`.
- **`MODULE_TO_CODE` kini diekspor** dari `order-id.ts`, dibutuhkan untuk merakit kunci cakupan.
- **`webhook.ts` tidak lagi punya `moduleFromOrderId` privat.** Fungsi lama hanya mengenali `AMW-*`/`INF-*`, sehingga order v2 akan gagal `Transaction not found` **setelah** donatur membayar. Sekarang memakai versi v2-aware dari `order-id.ts` yang juga memetakan `SEDEKAH → INFAQ`.

### Yang sengaja BELUM dikerjakan

`createPayment()` di `service.ts` **masih memakai `createOrderId()`** (format ULID lama). Menyambungkannya berarti memindahkan pembuatan nomor order ke dalam transaksi anchor dan mengubah format ID yang dibaca aplikasi Next.js lama pada database yang sama. Itu perubahan perilaku pada alur pembayaran hidup, bukan pekerjaan sisa — harus jadi keputusan sendiri, bukan efek samping.

**Wajib dipatuhi saat menyambungkannya nanti:** `nextOrderSequence()` harus dipanggil di dalam transaksi anchor yang sama dengan penyisipan order. Kalau anchor gagal setelah nomor diambil di transaksi terpisah, nomor itu hangus dan deret berlubang.

### Cakupan uji

`orderScopeKey()` diuji murni (`tests/order-sequence.test.ts`). `nextOrderSequence()` **tidak** diuji dengan mock — menirukan constraint dan atomisitas Postgres berarti menguji mock, bukan jaminan sebenarnya. Perilakunya diverifikasi terhadap database uji lewat `apps/web/scripts/verify-0004.ts`.

### Catatan kepemilikan

`payment/**` milik Claude Code Bara dan `analytics/**` milik Codex Bara menurut PLAN §3. Perubahan ini dikerjakan Claude Pro atas arahan langsung pemilik sprint, bukan pengambilalihan berkas. Kedua agent perlu rebase dari `bara` sebelum melanjutkan pekerjaannya.

---

## 2026-09-17-03 — Keputusan adapter Mayar (melengkapi & mengoreksi 2026-09-16-01)

**Sumber:** `docs/sprint-11/status/claude-bara.md` §7.2–7.3 (Claude Code Bara, Selasa), diverifikasi terhadap `packages/core/src/payment/mayar.provider.ts`
**Dampak:** `I-11`, job rekonsiliasi Rabu
**Status:** DITERIMA

### Koreksi atas entri 2026-09-16-01

Entri 16-01 mencatat status Mayar sebagai string `"SUCCESS"`. Itu benar **untuk payload webhook**, tetapi tidak lengkap: endpoint **re-fetch** `GET /hl/v2/transactions/{id}` mengembalikan `data.status: "paid"` untuk transaksi yang sama. Karena status final selalu diambil dari re-fetch, `"paid"` adalah nilai yang benar-benar menentukan hasil.

| Nilai status (case-insensitive) | Hasil normalisasi |
|---|---|
| `"SUCCESS"` (webhook) · `"paid"` (re-fetch) | **`LUNAS`** |
| `"created"` | `PENDING` |
| `data.transactionStatus` apa pun | **tidak pernah dipakai** sebagai penentu |

### Keputusan yang mengikat

1. **`x-callback-token` dibandingkan dengan `timingSafeEqual`**, setelah panjangnya dicocokkan. Token salah → 403 **sebelum** database disentuh.
2. **Hanya `payment.received` yang diproses**; event lain `ignored` → 200.
3. **Re-fetch selalu dilakukan**, dengan `AbortSignal.timeout(8000)`.
4. **Timeout, error jaringan, dan 5xx dari Mayar → `retry` (HTTP 502/504)**, tidak pernah `GAGAL`. Timeout berarti "tidak tahu", bukan "gagal". Membalas 5xx membuat Mayar dapat mengirim ulang, dan ledger tidak tersentuh.
5. **Korelasi lewat `providerRef` ↔ `transactions.payment_gateway_ref`**, karena payload Mayar tidak menggemakan order ID internal.
6. **Nominal hasil re-fetch dibandingkan numerik** dengan anchor (`"10000"` = `"10000.00"`). Selisih → `AmountMismatchError` → **409**, dan seluruh transaksi di-rollback.

### Yang BELUM sesuai backlog

Backlog Selasa (checklist Defensif Claude Code Bara) meminta **retry maksimal 2× dengan backoff** untuk error jaringan/5xx. Adapter saat ini **tidak punya loop retry internal**; ia mengembalikan 5xx dan bergantung pada pengiriman ulang Mayar — yang kebijakannya tidak terdokumentasi. Jaring pengaman yang sebenarnya adalah **job rekonsiliasi Rabu**, jadi butir itu wajib selesai sebelum Mayar dinyalakan di produksi. Dicatat terbuka di audit Selasa, bukan ditandai lulus.

---

## 2026-09-17-04 — Variabel env Mayar resmi masuk skema Zod

**Dampak:** `apps/web/src/env/server.ts`, `apps/web/src/lib/payment/index.ts`
**Status:** MENDARAT di `bara`

- `PAYMENT_PROVIDER` kini menerima `MAYAR_SANDBOX` dan `MAYAR_PRODUCTION`. Factory tidak lagi menyiasati enum dengan `const providerName: string`.
- `MAYAR_API_KEY` dan `MAYAR_WEBHOOK_TOKEN` **opsional di skema**, dan **wajib fail-fast di factory** saat provider `MAYAR_*` dipilih. Alasannya: deployment MOCK/MIDTRANS tidak boleh dipaksa mengisi rahasia Mayar hanya supaya aplikasi bisa boot.
- `MAYAR_API_BASE_URL` opsional, default `https://api.mayar.io/hl/v1` — host yang terbukti bekerja pada spike sandbox, bukan tebakan. Boleh diisi akar polos atau dengan akhiran `/hl/v1`/`/hl/v2`; factory menurunkan **keduanya** dari akar yang sama.
- Jembatan `process.env` mentah dari Selasa **dicabut**.

**Nama variabel:** yang dipakai adalah `MAYAR_API_BASE_URL`, bukan `MAYAR_BASE_URL`. Nama itu sudah dipakai kode dan berkas status agent; menggantinya berarti mematahkan `.env` yang sudah ada tanpa manfaat.

**Kebiasaan lama yang masih tersisa:** `PAYMENT_SERVER_KEY` tetap wajib meskipun provider-nya Mayar dan nilai itu tidak dipakai. Tidak diubah di sweep ini karena di luar lingkup; untuk sekarang cukup diisi apa saja pada deployment Mayar.

---

## 2026-09-17-05 — Mock & Midtrans memakai kontrak `PaymentProvider` v2

**Dampak:** `I-11`; seluruh tes dan simulasi pembayaran lokal
**Status:** MENDARAT di `bara`

`MockPaymentProvider` dan `MidtransPaymentProvider` kini mengimplementasikan `PaymentProviderV2` (`name` + `resolveWebhook`). Keduanya memakai resolver tunggal baru `@amwal/core/payment/signed-webhook`, dan `handlePaymentWebhook` kini **satu jalur** untuk semua provider.

**Alasannya:** sebelum ini, logika status bergaya Midtrans hidup langsung di dalam handler webhook, terpisah dari jalur v2 yang dipakai Mayar. Dua jalur berarti dua tempat yang bisa menyimpang diam-diam. Sekarang simulasi lokal melewati `resolveWebhook → applyProviderEvent` yang persis sama dengan Mayar — **tanpa jaringan dan tanpa sandbox eksternal**.

Jalur cadangan tetap ada, tetapi hanya untuk `PaymentProvider` pihak ketiga yang belum v2 (mis. test double), dan memakai resolver yang sama.

**Kontrak lama tidak berubah:** `apps/web/tests/orpc/webhook.test.ts` tidak disunting sejak fondasi Selasa dan **lulus seluruhnya** terhadap Postgres sungguhan (403 tanda tangan palsu, 404 order tak dikenal, 10 webhook paralel menaikkan ledger sekali, deny/pending tidak menurunkan LUNAS).

**Satu perbaikan kecil yang ikut masuk:** body `null` atau angka mentah (JSON sah tetapi bukan objek) kini ditolak 400. Handler lama melempar `TypeError` → 500.

**Catatan keamanan, bukan bug baru:** tanda tangan bergaya Midtrans hanya mencakup `order_id + status_code + gross_amount`. `transaction_status` dan `fraud_status` **tidak** ikut ditandatangani; hasil pembayaran hanya terlindungi tidak langsung lewat `status_code`. Itu skema Midtrans sendiri, dan alasan yang sama membuat adapter Mayar diwajibkan re-fetch. Kalau Midtrans diaktifkan di produksi, pertimbangkan re-fetch status ke API Midtrans sebelum menyentuh ledger.

---

## 2026-09-17-06 — Filter periode WIB pada daftar admin zakat, qurban, infaq [I-8]

**Dampak:** Codex Bara (Rabu, UI filter), `apps/web/src/lib/amwal-api/admin.ts`
**Status:** MENDARAT di `bara`

| Prosedur | Input baru | Catatan |
|---|---|---|
| `admin.zakat.ordersList` | `year?` | `jenis` tetap berlaku |
| `admin.qurban.ordersList` | `{ year? }` **opsional seluruhnya** | pemanggil UI lama tanpa argumen tetap sah |
| `admin.infaq.ordersList` | `year?`, `month?`, `kategori?: 'INFAQ' \| 'SEDEKAH'` | `jenis` tetap berlaku |

**Aturan yang mengikat:**

- Rentang **setengah terbuka `[awal, akhir)` dalam WIB**, dari `parseAnalyticsPeriod`. Memakai `<= 23:59:59` akan membuang transaksi pada 23:59:59.500, karena kolom menyimpan milidetik.
- **Bulan tanpa tahun → 400**, bukan diam-diam mengembalikan semua data.
- Filter dijalankan di **SQL**, bukan di JavaScript setelah semua baris ditarik, dan tanpa `DATE()`/`EXTRACT()` di sisi kiri — supaya index waktu `S-3` terpakai begitu dijalankan.
- Pemisahan Infaq/Sedekah dari **`infaq_orders.jenis`**, bukan digit 80/85 order ID (order `INF-<ULID>` lama tidak punya digit itu). Pola LIKE memakai garis bawah yang di-escape (`INFAQ\_%`); tanpa escape, `_` cocok dengan karakter apa pun.
- Helper bersama: `apps/web/src/lib/orpc/period-filter.ts` (`createdAtWithin`, `yearField`, `monthField`). **Pakai ini**, jangan menyalin blok `parseAnalyticsPeriod` ke router lain.

**Terbukti ke Postgres, bukan diasumsikan:** tipe kolom waktunya berbeda — `infaq_orders.created_at` `timestamptz`, `zakat_orders`/`qurban_orders` `timestamp(3)` tanpa zona. Tes `admin-period-filters.test.ts` menaruh fixture tepat di kedua sisi tengah malam WIB pada kedua jenis kolom, dan keduanya lulus.

**Belum dikerjakan:** `admin.waqf.progressList` masih menyalin blok `parseAnalyticsPeriod` sendiri. Perilakunya benar dan sudah teruji, jadi tidak disentuh di sweep ini; migrasikan ke helper saat berkas itu disunting berikutnya.

---

## 2026-09-17-07 — Retry re-fetch Mayar (menutup celah di 2026-09-17-03)

**Dampak:** `I-11`, `packages/core/src/payment/mayar.provider.ts`
**Status:** MENDARAT di `bara`

Butir "Yang BELUM sesuai backlog" pada entri 17-03 kini tertutup.

| Kegagalan re-fetch | Dicoba ulang? | Jawaban ke Mayar bila habis |
|---|---|---|
| Timeout (`AbortError`/`TimeoutError`) | ya | `retry` 504 |
| Error jaringan | ya | `retry` 502 |
| HTTP 5xx | ya | `retry` 502 |
| HTTP 404 | **tidak** | `rejected` 404 |
| HTTP 4xx lain | **tidak** | `retry` 502 |
| JSON rusak / `data` kosong | **tidak** | `retry` 502 |

- Maksimal **2 retry (3 permintaan)**, jeda **500 ms lalu 1000 ms**. Konfigurasi `retryDelaysMs` dipotong ke dua entri.
- **Setiap percobaan memakai `AbortSignal.timeout` baru.** Sinyal yang sudah kedaluwarsa akan membuat percobaan berikutnya gagal seketika — retry yang pura-pura.
- **4xx tidak dicoba ulang, tetapi tetap dijawab `retry`, bukan `GAGAL`.** Kunci API yang salah tidak akan benar dalam satu detik, jadi mengulang hanya memperpanjang webhook; tetapi setelah konfigurasi diperbaiki, pengiriman ulang Mayar masih harus bisa menyelesaikan pembayaran.
- **Semua jalur yang habis tetap 5xx, tidak pernah `GAGAL`.**
- Batas atas latensi webhook: **3 × `timeoutMs` + 1,5 detik** (≈ 25,5 detik dengan default). Bila Mayar ternyata memutus webhook lebih cepat dari itu, turunkan `timeoutMs`, bukan jumlah retry.

**Retry tidak menggantikan job rekonsiliasi.** Ia mengurangi ketergantungan pada kebijakan pengiriman ulang Mayar yang tidak terdokumentasi, tetapi pembayaran yang gagal di-re-fetch tiga kali berturut-turut tetap PENDING sampai rekonsiliasi Rabu menyelesaikannya.

---

## 2026-09-17-08 — Konsolidasi lane Awan: backend CMS PR #27 dibawa sebagian (framing PR #28 dikoreksi di -09)

**Dampak:** `I-9`, seluruh komponen `components/admin/**`, lane Awan
**Status:** backend CMS MENDARAT di `bara` lewat PR konsolidasi. ~~PR #28 direkomendasikan ditutup~~ — dikoreksi: PR #28 adalah migrasi desain yang disetujui; lihat 2026-09-17-09

Rincian lengkap: `docs/sprint-11/AUDIT-GATE-SELASA-NAUFAL-AWAN.md` §4.

**Aturan yang mengikat mulai sekarang:**

1. **Tidak ada `fetch('/api/...')` baru di `apps/web`.** Sejak Putaran 17 hanya ada tiga rute HTTP murni; data aplikasi lewat prosedur oRPC. Kode yang memanggil REST `/api/*` akan 404 di runtime dan tidak tertangkap type-check.
2. **Konfigurasi kualitas bersifat global dan tidak diturunkan per PR.** `tsconfig` (`noUnusedLocals`, `noUnusedParameters`) dan `biome.json` hanya disunting Claude Pro. Mematikan pemeriksaan untuk meloloskan kode tidak memperbaiki kodenya.
3. **Branch fitur dibangun dari `sprint-11` terbaru**, bukan dari `main` lama. Branch yang merge-base-nya di luar `sprint-11` akan membawa ribuan baris yang tidak terkait dengan tiketnya.
4. **Status "Selesai" di `SPRINT_BACKLOG.md` dan `STATUS.md` hanya diubah setelah checklist tiket — termasuk Defensif — terbukti di kode.** `STATUS.md` dibaca ke luar tim.

**Backend CMS yang dibawa** memiliki celah terbuka yang tetap menjadi tanggung jawab Antigravity Awan: `cursor` diterima tetapi diabaikan (halaman kedua = halaman pertama), tidak ada `slugify()` bersufiks, dan tidak ada sanitizer + tes XSS. `I-9` **bukan** berstatus selesai.

## 2026-09-17-09 — Admin-UI-Rewire: tata letak Awan (PR #28) dirajut ke oRPC

**Dampak:** seluruh `components/admin/**`, `admin.waqf` (baca aditif), `amwal-api/{admin,cms}.ts`
**Status:** MENDARAT di `bara`

**Koreksi atas 2026-09-17-08:** PR #28 adalah migrasi visual 1:1 `/admin` dari `amwalheti` atas permintaan tim, bukan rollback sembarangan. Desainnya diadopsi; yang tidak dibawa hanya wiring REST dan pelonggaran `tsconfig`/`biome.json` (tidak pernah diterapkan di `bara` — kedua berkas tidak berubah).

**Peta komponen → prosedur:**

| Komponen | Sumber data |
| --- | --- |
| `overview-view` | `admin.overview.kpi`, `admin.analytics` (tren, akumulasi, komposisi), `admin.waqf.nadzirList` |
| `wakaf-programs-view` | `admin.waqf.programsList/verifyProgram/progressList/addProgress/withdrawalsList/reviewWithdrawal/recordYield`, `receipts.waqf.list/url`, unggah via rute HTTP `POST /api/uploads/receipts` (biner, bukan JSON-RPC) |
| `approvals-view`, `nadzir-verification-view` | `admin.waqf.nadzirList/verifyNadzir/withdrawalsList/reviewWithdrawal/progressList`, `admin.documents`, `receipts.waqf` |
| `transparency-view`, `documents-view` | `admin.transparency.logs`, `admin.documents.list/verify` |
| `news-management-view`, `education-management-view` | `admin.cms.list/create/update/publish/archive/delete` |
| `settings-view` | status/QR Baileys; pengaturan lain pratinjau hanya-baca |
| `cohort-retention-view`, `donor-segmentation-view` | data contoh di balik `PreviewDataBanner` (PII sintetis) |

**Perubahan baca aditif (tanpa mutasi baru):** `admin.waqf.programsList` + `deskripsi`, `durasiHari`, `namaBank`, `nomorRekeningBank`; `nadzirList` + nama/email/telepon user; `withdrawalsList` + `requestedByName/Email`; `progressList` + `createdByName`.

**Keputusan desain:**

1. Aksi tanpa prosedur ditampilkan **nonaktif dengan alasan** — tidak ada toast sukses palsu, tidak ada isian yang diam-diam dibuang (mis. vendor/nominal kuitansi, lokasi/tag berita, pemateri/durasi video dihapus dari formulir karena tidak berkolom).
2. **XSS:** `dangerouslySetInnerHTML` di editor edukasi diganti editor Markdown + `SafeMarkdown` (node React saja, tautan hanya http(s), HTML warisan dibuang). Tes regresi: `apps/web/tests/safe-markdown.test.tsx`. URL sampul/banner hanya dirender bila http(s).
3. Kotak B/C overview (kohort & Markov pada desain) diganti tren donatur & akumulasi riil dari `admin.analytics`.
4. Semua waktu ditampilkan WIB lewat `lib/format-wib.ts` (timestamp tanpa zona dibaca sebagai UTC).

**Celah backend yang kini terlihat di UI (belum ada prosedur):** buat/ubah/hapus program wakaf; kaskade wilayah; pengajuan penarikan oleh admin; daftar wakif per program & siaran WA; laporan PDF BWI & kolom nomor registrasi BWI; riwayat bagi hasil (hanya catat); permohonan institusional; analisis AI; pengaturan RFMD/pembayaran yang persisten; kuis, diskusi, suka/pembaca, pin, CRUD kategori, dan unggah berkas video pada CMS. Berita & edukasi berbagi tabel `education_contents` tanpa pembeda jenis — halaman berita menampilkan seluruh `ARTIKEL`.

## 2026-09-17-10 — Backend afiliasi [I-4] diisi, job rekonsiliasi Mayar [I-11] baru

**Dampak:** `payment/service.ts` (parameter `refCode` baru), `affiliate` router (`myCode`, `dashboard`), rute baru `/r/$kode` dan `/api/cron/payments-reconcile`
**Status:** MENDARAT di `bara`

Tabel `affiliate_codes`/`affiliate_attributions`/`affiliate_clicks`, kontrak `contracts/affiliate.ts`, dan helper murni `affiliate/code.ts` + `affiliate/eligibility.ts` sudah ada sejak Senin (lane Naufal, dibekukan). Sweep ini mengisi sisanya: penyimpanan atribusi, dua prosedur oRPC yang diminta backlog, dan rute HTTP murni yang belum ada.

**1. `recordAttribution` [I-4] — `@amwal/core/affiliate/record-attribution.ts`:**

- Dipanggil di DALAM transaksi anchor `createPayment` (`payment/service.ts`), sesudah `insertModuleOrder`, untuk keempat modul (WAQF/ZAKAT/INFAQ/QURBAN) — bukan hanya WAQF/INFAQ. Atribusi tidak peduli modul; kelayakan REWARD (yang mengecualikan ZAKAT/QURBAN) diputuskan terpisah saat hadiah diselesaikan (`onSettled`, gamifikasi I-10 — kini di tangan Awan, belum di-wire).
- **Gagal-terbuka dengan sengaja**: kode tidak dikenal atau self-referral tidak pernah menggagalkan checkout, hanya melewatkan baris `affiliate_attributions`. Cookie `amwal_ref` yang basi tidak boleh mengganggu jalur uang.
- Anti-abuse yang diimplementasikan: hanya self-referral (`referrerUserId === donorUserId`, sesuai request eksplisit). Dua pemeriksaan dinamis yang disebut docstring kontrak (maks 10 konversi berpoin/hari WIB per perujuk, maks 1/pasangan per 24 jam) BELUM diimplementasikan — itu bagian dari settle-hook reward (I-10), bukan atribusi.
- `CommonPaymentParams` mendapat field opsional `refCode?: string | null`; keempat router checkout (`waqf`, `zakat`, `infaq`, `qurban`) membaca cookie `amwal_ref` lewat helper baru `apps/web/src/lib/affiliate/referral-cookie.ts` dan meneruskannya.

**2. Rute redirect `GET /r/$kode` — pure HTTP (bukan oRPC, karena 302 + `Set-Cookie` bukan respons JSON-RPC):**

- First-touch: cookie `amwal_ref` yang sudah ada TIDAK PERNAH ditimpa, apa pun hasil validasi kode kali ini.
- Kode tidak dikenal tidak menghasilkan galat berbeda dari kode valid — responsnya identik (redirect tanpa cookie) supaya rute ini bukan *oracle* untuk menebak kode orang lain.
- **Keputusan desain (tidak ada di spesifikasi tiket, didokumentasikan di sini):** whitelist tujuan redirect (`?to=`) memakai validasi struktural — hanya path relatif satu-`/` yang diterima (`apps/web/src/lib/affiliate/referral-redirect.ts`), bukan daftar prefiks modul (`/wakaf`, `/zakat`, dst.) yang harus disinkronkan manual tiap ada halaman baru. Apa pun berawalan skema, `//` (protokol-relatif), atau memuat karakter di luar `[\w/-]` jatuh ke default `/`.

**3. Prosedur oRPC `affiliate.myCode` dan `affiliate.dashboard`:**

- `myCode`: ambil-atau-buat kode referral (`affiliate/get-or-create-code.ts`), idempoten, aman dari race lewat `onConflictDoNothing()` + baca ulang.
- `dashboard`: **ini yang diminta ticket sebagai "`affiliate.stats`".** Nama prosedur TETAP `dashboard` karena itulah yang dibekukan `contracts/affiliate.ts` Senin 13:00 WIB — menambah prosedur `stats` terpisah untuk nama yang sama akan menduplikasi permukaan API tanpa alasan. Bentuk responsnya: `{ code, totalClicks, totalAttributedDonations }`.
- `capture` dan `claims` TETAP STUB. `capture` tidak perlu diisi: rute `/r/$kode` sudah menutup jalur penangkapan `?ref=` utama; oRPC `capture` dicadangkan untuk penangkapan sisi-klien tanpa navigasi penuh dan belum ada UI yang memanggilnya. `claims` menunggu ledger gamifikasi (I-10) menuliskan baris ber-`idempotencyKey` `affiliate:{transactionId}`.

**4. Job rekonsiliasi `POST /api/cron/payments-reconcile` [I-11] — `@amwal/core/payment/reconciliation.ts`:**

- Memanggil `applyProviderEvent` — fungsi SAMA yang dipanggil webhook Mayar — sehingga run yang tumpang tindih dengan webhook terlambat tidak bisa menghitung ganda. Idempotensi berasal dari `UPDATE transactions ... WHERE status != 'LUNAS'` di dalam `applyProviderEvent`, plus query rekonsiliasi sendiri hanya mengambil baris `PENDING` (transaksi yang sudah LUNAS otomatis tidak lagi jadi kandidat run berikutnya).
- Kueri: `statusPembayaran = 'PENDING' AND paymentGatewayRef IS NOT NULL AND createdAt < now() - 15 menit`, dibatasi 50 baris per pemanggilan (`limit`/`staleMinutes` bisa dioverride, dipakai tes).
- `MayarPaymentProvider.reconcileTransaction(providerRef)` baru — method publik yang diekstrak dari isi `resolveWebhook` supaya logika retry/backoff [I-11 Defensif, 17 Sep] dan pemetaan status dipakai bersama oleh webhook DAN rekonsiliasi, bukan disalin dua kali. Dideklarasikan opsional di `PaymentProvider` dasar (pola sama seperti `resolveWebhook?`), sehingga `reconcilePendingTransactions()` menerima `PaymentProvider` mana pun dan melaporkan `supported: false` untuk provider tanpa API polling (Mock, Midtrans) — bukan galat.
- Satu transaksi bermasalah (mis. `AmountMismatchError` dari nominal yang tidak cocok) ditangkap per-item dan dicatat sebagai `error`, tidak menghentikan sisa batch.
- Proteksi: header `Authorization: Bearer <CRON_SECRET>` dibandingkan `timingSafeEqual`, sama seperti token callback Mayar. `CRON_SECRET` (env baru, wajib, ≥16 karakter) didaftarkan di `env/server.ts` dan `.env`/`.env.example`/`.env.test`.

**Tes:** `apps/web/tests/orpc/affiliate.test.ts` (myCode idempoten, dashboard, atribusi end-to-end lewat `infaq.createOrder`, self-referral gagal-terbuka, kode tidak dikenal gagal-terbuka, tanpa cookie), `apps/web/tests/routes/referral-redirect.test.ts` (first-touch, kode tidak dikenal, whitelist redirect + 4 kasus open-redirect), `apps/web/tests/orpc/payments-reconcile.test.ts` (settle sekali, idempotensi run kedua, transaksi segar diabaikan, retry transien di-skip, amount mismatch ditangkap, gerbang bearer token, `supported:false` untuk MOCK_SANDBOX).

## 2026-09-18-01 — Sprint 11.1: patch keamanan wa-bot [S-4] + prosedur baru `gamification.submitQuizAttempt` [I-10b]

**Dampak:** `apps/wa-bot/src/index.ts`, `apps/web/src/env/server.ts` (`INTERNAL_SECRET` sekarang wajib), tiga pemanggil proxy wa-bot, kontrak `gamification.ts` (+1 prosedur, additive), `router/gamification.ts`, `education-detail.tsx`
**Status:** MENDARAT di `bara`, hasil audit konsolidasi Sprint 1–11 & 11.1 (lihat `SPRINT_BACKLOG.md`)

**1. Remediasi keamanan `apps/wa-bot` [S-4] — celah rilis-blocker dari audit 18-09:**

- Bypass lama membaca header `Host` untuk menyimpulkan "klien ini localhost" — header itu dikirim klien sendiri dan bisa dipalsukan bebas, **termasuk saat `NODE_ENV=production`**. Diganti: kalau ada secret dikonfigurasi (`INTERNAL_SECRET`/`WA_BOT_SECRET`), HANYA itu yang valid, dibandingkan `timingSafeEqual`. Kalau TIDAK ada secret dikonfigurasi, produksi menolak boot sama sekali (lihat butir berikut); dev/test tanpa secret hanya menerima klien yang alamat socket-nya benar-benar loopback, dibaca dari `server.requestIP()` (Bun) — bukan header.
- Tiga string diterima tanpa syarat sebelumnya: `DEFAULT_DEV_SECRET` (`'amwal-dev-wa-secret'`) dan `'rahasia-amwal-internal'` hardcoded di kode, plus `INTERNAL_SECRET` itu sendiri. Sekarang tidak ada string cadangan sama sekali.
- Secret masuk log plaintext lewat `console.log('[WA-BOT AUTH]', { secret: incomingSecret })` — dihapus.
- `apps/web/src/env/server.ts`: `INTERNAL_SECRET` kehilangan `.default('amwal-dev-wa-secret')` — sekarang **wajib** (skema Zod melempar saat modul diimpor bila env kosong, produksi maupun dev). Tiga pemanggil (`lib/whatsapp/index.ts`, `router/admin/wa.ts`, `router/admin/settings.ts`) berhenti punya fallback hardcoded sendiri-sendiri; ketiganya sekarang memakai `env.INTERNAL_SECRET` langsung. Menutup regresi AMW-02/S10-N-01 yang ditemukan audit.
- Tidak menyentuh kontrak oRPC apa pun — perubahan murni di `apps/wa-bot` (proses terpisah) dan resolusi env `apps/web`, jadi tidak melanggar pembekuan kontrak Senin 13:00.

**2. `gamification.submitQuizAttempt` [I-10b] — prosedur BARU, additive:**

- Menutup gap yang ditemukan audit: `claimQuiz` selalu hanya MEMBACA baris `quiz_attempts` yang lulus; tidak ada satu pun prosedur yang MENULISNYA, sehingga "+100 XP Berkah" di kuis edukasi 8 Asnaf murni tampilan — skor dihitung di klien dan tidak pernah dikirim ke server.
- Server menilai `answers` sendiri lewat `@amwal/core/education/asnaf-quiz` (`gradeAsnafQuiz`, kunci jawaban Zone 0 murni) — klien tidak pernah mengirim skor jadi, supaya panggilan oRPC langsung tidak bisa memalsukan kelulusan (dibuktikan tes `packages/core/tests/education/asnaf-quiz.test.ts` dan `apps/web/tests/orpc/gamification.test.ts`).
- Hanya mendukung `ASNAF_QUIZ_ID = 'QUIZ-EDU-8-ASNAF'` (satu-satunya kuis edukasi yang ada hari ini, hardcoded di UI, bukan CMS). Baris `quizzes` untuk id ini di-upsert (`onConflictDoNothing`) oleh handler sendiri saat percobaan pertama — tidak perlu migrasi/seed terpisah karena `quizzes.education_content_id` sudah nullable. Kuis CMS umum menyusul saat artikel `I-9` tersambung ke tabel `quizzes`.
- Tidak mengubah `claimQuiz`, `QUIZ_PASS_SCORE` (70, kernel `I-10b`), atau `ACTIVITY_POINTS.QUIZ` (75) — nilai kelulusan UI (≥80%, sesuai PLAN §I-10b) tetap lebih ketat daripada gerbang klaim kernel, jadi setiap percobaan yang UI tandai "lulus" otomatis memenuhi syarat `claimQuiz`.
- UI (`education-detail.tsx`) menampilkan poin yang BENAR-BENAR dikembalikan `claimQuiz` (`+{claim.points} XP Berkah`), bukan angka statis — termasuk badge "+100 XP" lama yang sekarang menampilkan `ACTIVITY_POINTS.QUIZ` (75) dari satu sumber yang sama.

**Tes:** `packages/core/tests/education/asnaf-quiz.test.ts` (7 kasus grading murni, termasuk upaya memalsukan skor), `apps/web/tests/orpc/gamification.test.ts` (submit → claim end-to-end, quizId tak dikenal, anonim 401), `apps/web/tests/components/education-quiz.test.tsx` (alur UI penuh dengan `submitQuizAttempt`/`claimQuiz` di-inject, pola sama dengan `ReceiptDropzone.customUploadFn`).
