# Status — Claude Pro (Tech Lead & Integration Anchor)

## Audit Gate Selasa — Backend Phase, lane Bara

**Tanggal:** Kamis, 17 September 2026
**Branch:** `bara`
**Acuan:** `SPRINT_BACKLOG.md` §S11.4 (checklist Selasa + Defensif)
**Wewenang:** bypass kepemilikan berkas diberikan Bara untuk sweep penutupan gap

---

## 0. Ringkasan

**Gate Selasa lane Bara: LULUS BERSYARAT.**

> **Diperbarui 17 September 2026 (sore): LULUS.** Satu-satunya butir yang terbuka — retry re-fetch Mayar — sudah ditutup. Lihat §5.

Seluruh butir *fungsional* Selasa terpenuhi dan terbukti ke Postgres sungguhan. **Satu butir *defensif* tidak terpenuhi**: retry 2× dengan backoff pada adapter Mayar (§2.1). Butir itu tidak memblokir integrasi Rabu karena perilaku fail-closed-nya benar, tetapi **wajib ditutup sebelum Mayar dinyalakan di produksi**.

| Verifikasi | Hasil |
|---|---|
| `bun run check-types` | **3/3** workspace |
| `bun test` di `packages/core` | **117 pass / 0 fail** (19 berkas) |
| `bun test` di `apps/web`, **seluruh suite**, Postgres sungguhan | **131 pass / 0 fail** (25 berkas) |
| `biome check` berkas yang diubah | bersih |
| Kontrak lama `webhook.test.ts` | **tidak disunting** sejak fondasi Selasa, **lulus** |

Ini pertama kalinya tes integrasi webhook **dieksekusi**, bukan hanya dibaca. Pada fondasi Selasa, kontrak itu dipertahankan lewat pembacaan cermat karena database uji tidak tersedia; sekarang terbukti.

---

## 1. Empat gap yang ditutup sweep ini

| # | Gap | Penutupan | Bukti |
|---|---|---|---|
| 1 | Env Mayar di luar skema Zod; factory membaca `process.env` mentah | Tiga variabel masuk skema; enum `PAYMENT_PROVIDER` diperluas; jembatan dicabut | check-types 3/3 |
| 2 | Keputusan adapter Mayar belum masuk dokumen resmi | `CONTRACT-CHANGES.md` 2026-09-17-03, termasuk koreksi `"SUCCESS"` vs `"paid"` | — |
| 3 | Mock & Midtrans belum v2; webhook punya dua jalur resolusi | Resolver tunggal `signed-webhook.ts`; kedua provider `PaymentProviderV2`; handler satu jalur | 10 uji unit baru + `webhook.test.ts` lulus |
| 4 | `admin.zakat` / `admin.qurban` / `admin.infaq` tanpa filter periode | Helper `period-filter.ts`; filter di SQL; pemisahan Infaq/Sedekah | 10 uji integrasi baru di dua jenis kolom waktu |

---

## 2. Audit checklist Selasa per agent

Setiap butir diperiksa terhadap **kode**, bukan terhadap klaim berkas status.

### 2.1 Claude Code Bara — `I-1` · `I-11`

| Butir | Status | Bukti |
|---|---|---|
| `createPayment()` memakai ID v2 + counter di dalam transaksi anchor | ✅ | `service.ts:223-227` — `nextOrderSequence(tx, …)` di dalam `database.transaction` |
| `moduleFromOrderId()` mengenali v2 **dan** format lama | ✅ | `order-id.ts` |
| Midtrans & Mock dibungkus ke kontrak v2, tidak dihapus | ✅ | **ditutup sweep ini** (§1 #3) |
| `MayarPaymentProvider`: token constant-time → `payment.received` → re-fetch → status & nominal dari re-fetch → mismatch ditolak → korelasi `providerRef` | ✅ | `mayar.provider.ts`, `mayar-webhook.test.ts` lulus |
| Keputusan Mayar ditulis di berkas status | ✅ | `status/claude-bara.md` §7 |
| **Defensif** — timeout `AbortSignal.timeout(8000)` | ✅ | `mayar.provider.ts:12, 280` |
| **Defensif** — retry maks 2× + backoff, hanya jaringan/5xx | ❌ → ✅ ditutup kemudian (§5) | **tidak ada loop retry internal**; adapter mengembalikan 502/504 dan bergantung pada pengiriman ulang Mayar |
| **Defensif** — fail-closed, timeout tidak pernah GAGAL | ✅ | jalur `retry` tidak memanggil `applyProviderEvent`; diuji |
| **Defensif** — sequence habis → `ORDER_SEQUENCE_EXHAUSTED` | ✅ | `order-sequence.ts` |

**Mengapa butir retry tidak saya tandai lulus meski fail-closed-nya benar:** kebijakan retry Mayar tidak terdokumentasi. Membalas 5xx hanya aman kalau ada yang dijamin mencoba lagi — dan saat ini tidak ada: job rekonsiliasi baru dijadwalkan Rabu. Sampai job itu hidup, satu timeout sesaat bisa meninggalkan pembayaran yang sudah dibayar donatur tetap PENDING tanpa batas waktu.

### 2.2 Codex Bara — `I-7` · `I-8`

| Butir | Status | Bukti |
|---|---|---|
| `admin.analytics.{trend, accumulation, composition}` di balik `adminProcedure` | ✅ | `analytics.ts:144, 174, 214` |
| Kueri memakai rentang kolom waktu, tanpa fungsi di sisi kiri | ✅ | `gte`/`lt` pada `transactions.createdAt` |
| Logika bucket tidak ditulis ulang di SQL | ✅ | memanggil `aggregateTimeSeriesBuckets` / `aggregateComposition` |
| Filter tahun `admin.zakat` & `admin.qurban`; bulan+tahun `admin.infaq` dengan pemisahan `INFAQ_*` vs `SEDEKAH_*` | ✅ | **ditutup sweep ini** (§1 #4) |
| Tes: batas WIB, periode kosong → seri nol, non-ADMIN → 403 | ✅ | `admin-analytics.test.ts` + `admin-period-filters.test.ts` lulus |

### 2.3 Antigravity Bara — `S-2` · `I-2` · `I-8`

| Butir | Status | Bukti |
|---|---|---|
| `routes/api/uploads/receipts.ts` khusus ADMIN; object key disimpan, bukan signed URL | ✅ | `receipts.ts:425`; router `receipts.waqf.url` menerbitkan URL saat diminta |
| `admin.waqf.addProgress` menolak tanpa minimal satu foto | ✅ | `waqf.ts` — invarian di dalam transaksi yang sama, pesan "Butuh minimal satu foto bukti" |
| Filter bulan+tahun `admin.waqf` | ✅ | `progressList` |
| Tes negatif upload | ✅ | `receipts-upload.test.ts` lulus |
| **Defensif** — batas 5 MB sambil membaca stream, `Content-Length` tidak dipercaya | ✅ | `getReader()` + hitung byte berjalan |
| **Defensif** — MIME dari magic bytes | ✅ | `detectMimeTypeFromBuffer` |
| **Defensif** — kompensasi hapus objek bila simpan DB gagal | ✅ | `deleteReceiptFile` pada jalur gagal |

### 2.4 Claude Pro — fondasi

| Butir | Status | Bukti |
|---|---|---|
| `webhook.ts` agnostik provider | ✅ | satu jalur `resolveWebhook` untuk semua provider |
| `applyProviderEvent(tx, event)` satu jalur webhook **dan** rekonsiliasi | ✅ | kini juga mencocokkan lewat `providerRef` (ditambah Claude Code Bara) |
| Jendela `0005` | ➖ | tidak ada kebutuhan DDL susulan |
| Salin keputusan Mayar ke `CONTRACT-CHANGES.md` | ✅ | **ditutup sweep ini** |
| Tes idempotensi webhook lama hijau **tanpa diubah** | ✅ | tidak disunting; lulus ke Postgres |
| Review PR Zone 0 `I-10` | ➖ | lane Naufal, di luar branch `bara` — tidak diaudit di sini |

---

## 3. Temuan di luar checklist

### 3.1 `.env.test` menunjuk database yang tidak ada — setiap `bun test` lokal gagal total

`apps/web/.env.test` berisi nama database `amwal_bun_s10_b06_test`, **sisa Sprint 10 yang sudah tidak ada** di server Postgres lokal. Satu-satunya database uji yang ada adalah `amwal_bun_bara_test`, dan itu sudah memuat kelima migrasi termasuk `0004`.

Akibatnya, `cd apps/web && bun test` tanpa override menghasilkan **kegagalan koneksi di seluruh tes integrasi** — yang mudah disalahbaca sebagai kode rusak. Audit ini menjalankan suite dengan override `DATABASE_URL`/`TEST_DATABASE_URL` ke `amwal_bun_bara_test`.

**Tindakan:** perbarui nama database di `apps/web/.env.test` lokal masing-masing mesin. Berkas itu tidak dilacak git, jadi perbaikannya tidak bisa dikirim lewat commit.

### 3.2 Tanda tangan gaya Midtrans tidak mencakup status transaksi

Hanya `order_id + status_code + gross_amount` yang ditandatangani. Bukan bug baru — itu skema Midtrans — tetapi relevan sebelum Midtrans diaktifkan di produksi. Rincian: `CONTRACT-CHANGES.md` 2026-09-17-05.

### 3.3 Sisa kecil yang sengaja tidak disentuh

- `PAYMENT_SERVER_KEY` masih wajib meski provider Mayar tidak memakainya.
- `admin.waqf.progressList` masih menyalin blok `parseAnalyticsPeriod` alih-alih memakai helper baru. Perilakunya benar dan teruji.

---

## 4. Yang harus selesai sebelum Mayar menyala di produksi

1. ~~**Retry 2× dengan backoff** untuk error jaringan/5xx di `mayar.provider.ts`~~ — **SELESAI** (§5).
2. **Job rekonsiliasi** `POST /api/cron/payments-reconcile` (jadwal Rabu) — satu-satunya jaminan pembayaran PENDING akibat timeout pada akhirnya diselesaikan.
3. `PAYMENT_PROVIDER=MAYAR_PRODUCTION` diuji ujung-ke-ujung di sandbox dengan env yang divalidasi Zod, bukan jembatan `process.env`.

---

## 5. Pembaruan — retry re-fetch Mayar ditutup

Butir Defensif yang tercatat ❌ di §2.1 kini terpenuhi.

- Retry maksimal **2× (3 permintaan)**, jeda **500 ms lalu 1000 ms**.
- Hanya untuk **timeout, error jaringan, dan HTTP 5xx**. 4xx, 404, JSON rusak, dan `data` kosong **tidak** dicoba ulang.
- Setiap percobaan memakai `AbortSignal.timeout` baru.
- Seluruh jalur yang habis tetap `retry` 5xx — **tidak pernah GAGAL**.

Bukti: 7 tes baru di `packages/core/tests/payment/mayar-provider.test.ts` (urutan jeda, jumlah permintaan, 4xx tanpa retry, sinyal baru per percobaan, pemotongan konfigurasi). `packages/core` 124 pass / 0 fail; seluruh suite `apps/web` hijau terhadap Postgres. Rincian kontrak: `CONTRACT-CHANGES.md` 2026-09-17-07.

Dengan ini **gate Selasa lane Bara: LULUS**. Job rekonsiliasi (Rabu) tetap wajib sebelum Mayar menyala di produksi — retry mengurangi, tetapi tidak menghapus, kemungkinan pembayaran tertahan PENDING.

---

## 6. Pembaruan — job rekonsiliasi Mayar dan backend afiliasi

Butir §4.2 kini terpenuhi.

- `POST /api/cron/payments-reconcile`: memoles transaksi `PENDING` > 15 menit lewat `applyProviderEvent` — fungsi SAMA yang dipakai webhook, jadi tidak ada jalur idempotensi kedua yang bisa salah sendiri-sendiri. Diproteksi bearer `CRON_SECRET` (`timingSafeEqual`).
- `MayarPaymentProvider.reconcileTransaction(providerRef)` baru: retry/backoff [I-11 Defensif] dan pemetaan status yang sudah dites §5 sekarang dipakai bersama webhook dan rekonsiliasi, bukan disalin.
- Sekalian menutup `I-4` (afiliasi, lane Naufal — kernel murni sudah mendarat Senin, wiring-nya belum): `recordAttribution` di dalam transaksi anchor `createPayment` untuk keempat modul, gagal-terbuka pada kode tak dikenal/self-referral; rute `/r/$kode` (first-touch, whitelist redirect terstruktur, bukan daftar prefiks); `affiliate.myCode`/`.dashboard` terisi.

Bukti: 23 tes baru (`affiliate.test.ts`, `payments-reconcile.test.ts`, `referral-redirect.test.ts`). `packages/core` 124 pass / 0 fail; `apps/web` 169 pass / 0 fail. `check-types` 3/3 hijau. Rincian kontrak: `CONTRACT-CHANGES.md` 2026-09-17-10.

**§4 kini lengkap.** Item terakhir sebelum Mayar produksi tinggal uji ujung-ke-ujung `MAYAR_PRODUCTION` di sandbox nyata (§4.3) — di luar cakupan yang bisa diverifikasi dari lingkungan tes.
