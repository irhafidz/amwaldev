# Selasa — Urutan Eksekusi Lane Bara (Backend Phase)

**Dari:** Claude Pro (Tech Lead & Integration Lead)
**Untuk:** Bara, selaku pengorkestrasi tiga sub-agent di branch tunggal `bara`
**Acuan:** `SPRINT_BACKLOG.md` §S11.4, `docs/sprint-11/PLAN.md` §3

---

## 0. Jalur kritis: satu hal memblokir dua agent

Sebelum apa pun, **`0004` harus teraplikasi di database uji masing-masing agent.** Tanpa itu, Claude Code Bara tidak punya `order_sequences` dan Antigravity Bara tidak punya `program_receipt_attachments` — dua dari tiga agent menganggur.

```bash
cd apps/web && TEST_DATABASE_URL=postgres://...:5432/amwal_bun_<lane>_test bun run db:migrate
```

```bash
cd apps/web && TEST_DATABASE_URL=postgres://...:5432/amwal_bun_<lane>_test bun run scripts/verify-0004.ts
```

Codex Bara **tidak** terblokir — tabel analitik sudah ada sejak baseline. Karena itu urutan yang benar: **Codex jalan duluan**, dua agent lain menyusul setelah migrasi mereka hijau.

### Urutan pagi

| Jam | Siapa | Apa |
|---|---|---|
| 08:00 | ketiganya | `git pull --rebase origin bara` — ambil fondasi Selasa (stub router, RBAC, `applyProviderEvent`) |
| 08:15 | ketiganya | terapkan `0004` + `verify-0004.ts` ke DB uji masing-masing |
| 08:15 | Codex Bara | **mulai tanpa menunggu** — tidak ada dependensi DDL |
| 09:00 | Claude Code Bara · Antigravity Bara | mulai setelah verifikasi hijau |
| 12:00 | ketiganya | jendela merge pertama |
| 16:30 | ketiganya | jendela merge kedua |

**Satu hal yang berubah dari rencana semula:** `applyProviderEvent()` dijadwalkan diserahkan Selasa 16:30. Ia **sudah tersedia sejak pagi** di `@amwal/core/payment/webhook`. Claude Code Bara tidak perlu menunggu sore untuk mulai menggarap job rekonsiliasi.

---

## 1. Claude Code Bara — `I-1` · `I-11`

### 1.1 Kapan menyambungkan `nextOrderSequence()` ke `createPayment()`?

**Jawaban: setelah `verify-0004.ts` hijau di DB ujinya, dan sebagai pekerjaan pertama hari itu — bukan terakhir.**

Alasannya urutan risiko, bukan selera. `createPayment()` adalah akar dari hampir semua tes integrasi (`payment-create`, `webhook`, `waqf`, `zakat`, `infaq`, `qurban`). Mengubahnya pagi hari berarti kegagalan muncul saat masih ada sepuluh jam untuk memperbaikinya. Mengubahnya sore hari berarti seluruh lane ikut merah di jendela merge 16:30.

**Tiga aturan yang tidak bisa dilanggar:**

1. **Nomor diambil di dalam transaksi anchor yang sama.** `createPayment()` sekarang memanggil `createOrderId()` **sebelum** `database.transaction(...)` dibuka. Pemanggilan `nextOrderSequence(tx, …)` harus pindah ke dalam. Kalau nomor diambil di transaksi terpisah lalu anchor gagal, nomor itu hangus dan deret berlubang permanen — `order_sequences` tidak punya mekanisme mengembalikan nomor.

2. **Format lama tidak boleh mati.** `moduleFromOrderId()` sudah mengenali v2 **dan** `AMW-*`/`INF-*`; pertahankan. Ada order PENDING di database yang dibuat dengan format lama, dan webhook-nya bisa datang besok.

3. **Uji dampaknya ke aplikasi Next.js lama sebelum merge.** Ini yang paling mudah terlupa: `waqf_orders.id`, `zakat_orders.id`, dan `qurban_orders.id` berubah bentuk, dan aplikasi lama membaca tabel yang sama. Kalau ada layar di sana yang mem-parse atau memformat ID order, ia akan pecah tanpa ada tes kita yang menangkapnya. **Periksa dulu, lalu laporkan temuannya di berkas status** — kalau ternyata ada, keputusan rollout-nya milik Claude Pro, bukan diputuskan sendiri di tengah hari.

**Bukti yang wajib ada sebelum tiket ditutup:** 20 order paralel → 20 nomor unik berurutan, dan nomor ke-10.000 ditolak database. Jalankan `verify-0004.ts`; itu sudah menguji keduanya lewat 20 koneksi terpisah. Uji dengan satu koneksi tidak membuktikan apa pun — koneksi tunggal menserialkan dirinya sendiri.

### 1.2 Strategi `MayarPaymentProvider`

Bungkus, jangan ganti. `MidtransPaymentProvider` dan `MockPaymentProvider` tetap hidup; Mayar adalah implementasi ketiga dari antarmuka yang sama.

**Urutan wajib di `resolveWebhook`, tidak boleh ditukar:**

1. **Bandingkan `x-callback-token` constant-time.** Spike membuktikan header ini ada dan cocok persis dengan `MAYAR_WEBHOOK_TOKEN`. Gunakan perbandingan waktu tetap, bukan `===` — perbandingan string biasa bocor lewat waktu eksekusi.
2. **Terima hanya `payment.received`.** Event lain diabaikan dengan 200, bukan diproses.
3. **Re-fetch detail ke server Mayar.** Payload webhook **tidak pernah** menjadi sumber kebenaran.
4. **Ambil status dan nominal dari hasil re-fetch**, bukan dari payload.
5. **Nominal ≠ anchor → tolak dan catat.** `applyProviderEvent` sudah menyediakan ini: isi `expectedAmount`, dan selisihnya melempar `AmountMismatchError` yang membatalkan seluruh transaksi.

**Tiga jebakan dari hasil spike:**

- `data.status` adalah **string `"SUCCESS"`**, bukan boolean.
- `data.transactionStatus` bernilai **`"created"` bahkan pada event sukses** — jangan pernah dipakai sebagai penentu.
- Base URL `https://api.mayar.io/hl/v1` untuk pembuatan pembayaran, `/hl/v2` untuk payment link. Bukan `api.mayar.id`.

**Defensif:**

- `AbortSignal.timeout(8000)`; retry maksimal 2× dengan backoff **hanya** untuk error jaringan/5xx, tidak untuk 4xx.
- **Fail-closed:** re-fetch gagal → balas 5xx tanpa menyentuh ledger, supaya bisa diulang. Status **tidak pernah** diturunkan ke GAGAL karena timeout — timeout artinya "tidak tahu", bukan "gagal".
- Karena kebijakan retry Mayar tidak terdokumentasi, **job rekonsiliasi adalah jaring pengamannya**, bukan harapan bahwa Mayar mengirim ulang. Rekonsiliasi dan webhook memakai `applyProviderEvent` yang sama, jadi keduanya idempoten terhadap satu sama lain.

---

## 2. Codex Bara — `I-7` · `I-8`

### 2.1 Urutan penulisan prosedur

**`composition` → `trend` → `accumulation`.** Dari yang paling sederhana ke yang paling berisiko, supaya pola query yang benar sudah mapan sebelum menyentuh yang rumit.

1. **`composition`** — `GROUP BY` modul dalam satu rentang. Tidak ada bucket, tidak ada pengisian kosong. Selesai paling cepat dan memvalidasi jalur `adminProcedure` + `parseAnalyticsPeriod` end-to-end.
2. **`trend`** — deret waktu per bucket. Fungsi murninya sudah ada dan **sudah teruji** (`analytics-aggregation.test.ts`, 13 uji lulus). Tugas Selasa hanya memberi makan data nyata ke fungsi itu; **jangan menulis ulang logika bucket di SQL.** Ambil baris mentah `{ date, amount }`, lalu lewatkan ke `aggregateTimeSeriesBuckets()`. Pengisian bucket kosong dan atribusi WIB sudah benar di sana — mengulanginya di SQL berarti dua sumber kebenaran yang pasti berbeda suatu hari.
3. **`accumulation`** — kumulatif, paling mudah salah di batas periode. Kerjakan terakhir, saat dua pola sebelumnya sudah terbukti.

### 2.2 Index waktu — satu peringatan

Index `CREATE INDEX CONCURRENTLY` untuk kolom waktu (`S-3`) **belum dijalankan**. Ia sengaja di luar `0004` karena `CONCURRENTLY` tidak boleh berada dalam transaksi Drizzle.

Artinya query analitik akan **berfungsi tetapi lambat** pada data besar. Jangan menafsirkan kelambatan itu sebagai query yang salah, dan **jangan menambahkan index sendiri di migrasi baru** — ajukan lewat berkas status. Rencana penerapannya ada di `AUDIT-GATE-SENIN.md` §3.

Tulis query-nya seolah index sudah ada: `WHERE created_at >= $1 AND created_at < $2`. Hindari `DATE(created_at)` atau `EXTRACT(...)` di sisi kiri — fungsi di atas kolom membuat index tidak terpakai bahkan setelah ia dibuat nanti.

### 2.3 Parameter `{ year, month? }` dan pemisahan Infaq vs Sedekah

- `admin.zakat` dan `admin.qurban`: filter **tahun** saja.
- `admin.infaq`: **bulan + tahun**, dengan pemisahan `INFAQ_*` vs `SEDEKAH_*`.

Pemisahannya diturunkan dari `infaq_orders.jenis`, bukan dari kode modul order ID. Nilainya: `INFAQ_SUBUH`, `INFAQ_JUMAT`, `INFAQ_UMUM` versus `SEDEKAH_YATIM`, `SEDEKAH_OPERASIONAL` — sudah ditegakkan CHECK di tabel.

**Jangan** memisahkannya dengan mengurai digit 80/85 dari order ID. Order lama berformat `INF-<ULID>` tidak punya digit itu, dan barisnya akan hilang diam-diam dari laporan.

**Tes yang wajib ada:** batas 1 Januari 00:30 WIB, periode tanpa data → seri nol (bukan error), dan non-ADMIN → 403.

---

## 3. Antigravity Bara — `S-2` · `I-2` · `I-8`

### 3.1 Rute unggah `routes/api/uploads/receipts.ts`

Rute HTTP murni, **bukan** oRPC — karena batas ukuran harus ditegakkan sambil membaca stream, dan oRPC sudah membaca badan permintaan lebih dulu.

**Urutan pemeriksaan, dari yang paling murah:**

1. **Guard ADMIN** sebelum satu byte pun dibaca.
2. **Batas 5 MB sambil membaca stream** — hitung byte berjalan, hentikan di byte ke-5 MB + 1. **`Content-Length` tidak dipercaya**: ia dikirim klien dan bisa berbohong. Percaya `Content-Length` berarti penyerang cukup menulis angka kecil untuk mengunggah 5 GB.
3. **Magic bytes**, abaikan `Content-Type` dan ekstensi: JPEG `FF D8 FF` · PNG `89 50 4E 47 0D 0A 1A 0A` · WebP `RIFF····WEBP` · PDF `25 50 44 46 2D`. SVG dan HTML **selalu ditolak** — keduanya bisa membawa skrip.
4. **Object key dibangun sendiri**, `amwal-receipts/<programId>/<ulid>.<ext>`. Nama berkas asli **tidak pernah** masuk ke object key (path traversal).

**Yang disimpan ke database selalu object key, tidak pernah signed URL.** Signed URL berumur 10 menit — menyimpannya berarti menyimpan tautan yang mati sekaligus bocor.

**Kompensasi wajib:** unggah berhasil tetapi simpan ke DB gagal → **hapus objeknya**. Tanpa itu, bucket terisi berkas yatim yang tidak bisa ditemukan siapa pun dan tetap dibayar.

FK `waqf_program_id` bertipe **`text`**, bukan `integer` — sudah dikoreksi di `0004` (`CONTRACT-CHANGES.md` 2026-09-16-02). Namespace oRPC untuk pembacaan metadata sudah distub di `router/receipts.ts` (`receipts.waqf.{list,url,remove}`, seluruhnya `adminProcedure`); isi kueri riilnya di sana.

### 3.2 Validasi kuitansi wajib berfoto pada `admin.waqf.addProgress`

Validasi ditegakkan **di dalam transaksi yang sama** dengan penyisipan laporan progres, bukan sebagai pemeriksaan terpisah sebelumnya. Kalau dipisah, ada celah antara "diperiksa" dan "disimpan" yang bisa dilewati permintaan bersamaan.

Syaratnya: minimal satu lampiran dengan `is_photo_evidence = true`. Menolak dengan pesan yang menyebut **apa yang kurang** ("Butuh minimal satu foto bukti"), bukan "Validasi gagal".

**Tes negatif yang wajib:** ukuran berlebih, tipe palsu (PNG berekstensi `.jpg`, dan SVG yang menyamar), tanpa foto, dan non-ADMIN.

---

## 4. Yang TIDAK dikerjakan Selasa

Supaya tidak ada yang mencuri start dan menabrak pemilik berkas lain:

- **UI apa pun** — itu fase Rabu. Selasa hanya prosedur, kueri, dan tes.
- **`createPayment` memanggil `recordAkadAcceptance()` / `recordAttribution()`** — keduanya baru diserahkan Selasa 16:30 oleh lane Awan dan Naufal. Rabu.
- **Menyentuh `CONTRACT-CHANGES.md`** — hanya Claude Pro. Ajukan lewat `docs/sprint-11/status/<slug>.md`.
- **Menambah dependensi** — hanya Claude Pro yang menyunting `package.json` mana pun.
- **Membuat migrasi sendiri.** Jendela `0005` pukul 12:00 dan hanya lewat Claude Pro.

## 5. Aturan branch `bara`

1. `git pull --rebase origin bara` sebelum setiap push. Tidak ada `--force`, tanpa kecuali.
2. Prefiks subjek commit: `[claude-code]`, `[codex]`, `[antigravity]`.
3. Matriks kepemilikan §3 tetap mengikat per berkas.
4. Branch wajib hijau (`check-types` + `bun test` di `packages/core`) saat jendela merge.
5. Commit yang merusak branch diperbaiki maju oleh yang merusak — tidak ada reset.
