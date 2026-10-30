# Status Sprint 11 — Antigravity Bara (`antigravity-bara`)

**Peran:** Lane Bara — Storage privat, bukti belanja kuitansi & foto wajib (I-2), filter waktu wakaf (I-8)  
**Branch:** `antigravity/bara`  
**Waktu Update:** Jumat 18 September 2026 (lihat §4 — konsolidasi lane `bara` Selasa–Jumat; §1–3 di bawah dibiarkan apa adanya sebagai catatan Senin 08:30, fase kontrak & fondasi)

---

## 1. Setoran DDL ke Claude Pro (Target: ≤ 10:00 WIB) — [I-2]

Berikut adalah draf skema Drizzle untuk tabel lampiran bukti belanja program wakaf (`program_receipt_attachments`) yang diserahkan kepada Claude Pro untuk dikonsolidasikan ke dalam migrasi `0004`:

```typescript
import { sql } from 'drizzle-orm';
import { boolean, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const programReceiptAttachments = pgTable('program_receipt_attachments', {
  id: text('id').primaryKey().notNull(), // ULID
  programId: integer('program_id').notNull(),
  progressReportId: integer('progress_report_id'), // Opsional: null jika diunggah sebelum/di luar laporan progres formal
  objectKey: text('object_key').notNull(), // Path bucket privat, mis. amwal-receipts/<programId>/<ulid>.<ext> (BUKAN public URL)
  fileName: text('file_name').notNull(),
  mimeType: text('mime_type').notNull(),
  fileSize: integer('file_size').notNull(),
  isPhotoEvidence: boolean('is_photo_evidence').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
```

### Catatan Penyelarasan untuk Claude Pro:
1. **Tipe `program_id`:** Pada skema saat ini (`waqf_programs.id`), kolom `id` bertipe `text`. Jika pada konsolidasi `0004` relasi program wakaf tetap menggunakan `text`, silakan sesuaikan kolom `programId` menjadi `text('program_id').notNull()`. Jika modul belanja menggunakan penomoran `integer`, definisi di atas sudah siap pakai.
2. **Kerahasiaan Dokumen (`object_key`):** Tabel ini **hanya** menyimpan `object_key` privat (misalnya `amwal-receipts/123/01JG...pdf`). URL publik dilarang keras disimpan di basis data. Tampilan frontend hanya boleh menggunakan signed URL bertenggat waktu 10 menit (600 detik).
3. **Invarian Foto Wajib:** Kolom `is_photo_evidence` disediakan untuk menandai apakah lampiran merupakan foto bukti fisik/kegiatan/barang. Validasi transaksi pencatatan kuitansi belanja akan memeriksa bahwa minimal satu lampiran memiliki `is_photo_evidence === true`.

---

## 2. Status Pekerjaan

### Selesai (Done)
- [x] **[I-2]** Perumusan DDL `program_receipt_attachments` dan penyerahan catatan kontrak ke Claude Pro tepat waktu (≤ 10:00 WIB).
- [x] **[S-2]** Modul storage fail-closed di `packages/core/src/storage/supabase.ts`:
  - `uploadReceiptFile`: Upload aman dengan MIME type yang tervalidasi.
  - `createReceiptSignedUrl`: Pembuatan signed URL privat dengan default TTL 600 detik (10 menit).
  - `deleteReceiptFile`: Penghapusan berkas privat (untuk kompensasi jika penyimpanan metadata gagal).
  - `buildReceiptObjectKey` & `parseReceiptObjectKey`: Format kanonik `amwal-receipts/<programId>/<ulid>.<ext>`.
  - Invarian Fail-Closed: Selalu melempar error eksplisit jika terjadi kegagalan jaringan atau kredensial hilang. Tidak pernah mengembalikan URL palsu/dummy.
- [x] **[S-2][I-2]** Magic Bytes Detector murni di `packages/core/src/storage/mime.ts`:
  - Validasi biner asli untuk JPEG (`FF D8 FF`), PNG (`89 50 4E 47 0D 0A 1A 0A`), WebP (`RIFF....WEBP`), dan PDF (`25 50 44 46 2D`).
  - Penolakan ketat terhadap file berbahaya: HTML, SVG, script, dan executable (PE/ELF/Mach-O).
  - Batas ukuran file 5 MB (`MAX_RECEIPT_FILE_SIZE_BYTES`).
- [x] **[S-2]** Unit test komprehensif di `packages/core/tests/storage-mime.test.ts` (100% lulus).

- [x] **[S-2]** Uji upload nyata ke bucket privat sandbox dan baca lewat signed URL (bukti gate Senin terverifikasi via `scripts/test-storage-sandbox.ts`).

### Berikutnya (Next) — status per Jumat, lihat §4 untuk bukti
- [x] Menunggu migrasi `0004` dan pembekuan kontrak pukul 13:00 WIB oleh Claude Pro. → `0004` mendarat (`apps/web/drizzle/0004_consolidated_sprint11.sql`).
- [x] Membangun rute server upload kuitansi `routes/api/uploads/receipts.ts` khusus ADMIN pada fase Backend (Selasa). → ada dan teruji; **dipasang ke UI admin Jumat**, lihat §4.2.
- [x] Menegakkan aturan penolakan kuitansi tanpa foto pada prosedur `admin.waqf.addProgress`. → invarian bukti foto aktif (`router/admin/waqf.ts`).
- [ ] Menyiapkan filter bulan + tahun pada modul wakaf (`I-8`). — backend filter (`period-filter.ts`) ada; **UI filter di `wakaf-programs-view.tsx` belum ada.** Masih PENDING, tidak diklaim selesai.

### Terblokir (Blocked)
- *Tidak ada blocker aktif.* Modul storage `core` dirancang mandiri dan siap diintegrasikan dengan layer API TanStack Start / oRPC.

---

## 3. Bukti Pengujian Gate Senin [S-2] — Live Sandbox Storage

Pengujian mandiri menggunakan kredensial nyata dari `.env` (`SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY`) berhasil dieksekusi secara end-to-end melalui skrip `scripts/test-storage-sandbox.ts`.

### Log Eksekusi (`bun run scripts/test-storage-sandbox.ts`):

```text
--- Memulai Pengujian Supabase Storage Sandbox ---
✓ SUPABASE_URL terdeteksi: https://vzcgbspptxzepzbmrcho.supabase.co
✓ SUPABASE_SERVICE_ROLE_KEY terdeteksi.

1. Mengunggah berkas ke bucket "amwal-receipts" pada path "test-prog/smoke-test.png"...
✓ Upload berhasil! Path tersimpan: test-prog/smoke-test.png

2. Membuat Signed URL (TTL 600s)...
✓ Signed URL berhasil dibuat: https://vzcgbspptxzepzbmrcho.supabase.co/storage/v1/object/sign/amwal-receipts/test-prog/smoke-test.png?token=eyJraWQiOiI5OWRhOWU1OS1mZjE1LTQ3YjgtOGFhYy00MzVlM2JiNzBlNTEiLCJhbGciOiJIUzUxMiJ9.eyJ1cmwiOiJhbXdhbC1yZWNlaXB0cy90ZXN0LXByb2cvc21va2UtdGVzdC5wbmciLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzg5NTA0NDU4LCJleHAiOjE3ODk1MDUwNTh9.Wq6dXhj-76VqyhNKldiPShFdjNESOG3fLhmWSGj1CEETaPc3j3m79Ms-CyzUWFf8bmYL59GNQjG8JLe8n2PK2g

3. Menguji akses signed URL via fetch()...
✓ Response HTTP Status: 200 OK
✓ Berkas berhasil diunduh (16 bytes).
✓ Validasi integritas Magic Bytes PNG cocok!

4. Menghapus berkas uji coba (cleanup)...
✓ Berkas "test-prog/smoke-test.png" berhasil dihapus dari bucket "amwal-receipts".

🎉 SEMUA PENGUJIAN STORAGE SANDBOX BERHASIL (100% OK & BERSIH) 🎉
```

### Ringkasan Hasil Gate [S-2]:
1. **Upload Status:** Berhasil mengunggah objek biner PNG valid (`89 50 4E 47 0D 0A 1A 0A...`) ke bucket privat `amwal-receipts` pada path kanonik `test-prog/smoke-test.png`.
2. **Signed URL Generation:** Berhasil membuat signed URL berbasis token HMAC-SHA512 dengan tenggat waktu kedaluwarsa 600 detik (10 menit).
3. **HTTP Fetch Verification:** Permintaan native `fetch(signedUrl)` menghasilkan respons **`HTTP 200 OK`** dan integritas byte payload terverifikasi 100% identik dengan buffer asli.
4. **Cleanup Confirmation:** Berkas uji coba telah dihapus tuntas dari bucket privat menggunakan `deleteReceiptFile()`.

---

## 4. Konsolidasi lane `bara` — Selasa–Jumat, 15–18 September 2026

**Konteks:** audit internal Awan (18-09) menandai lane Bara sebagai lane paling disiplin, tetapi berkas status ini berhenti tercatat di Senin 08:30 — deliverable Selasa sampai Jumat tidak pernah dibukukan di sini walau sudah mendarat di `bara`. Bagian ini menutup gap pencatatan itu. §1–3 di atas tetap dibiarkan apa adanya sebagai arsip fase kontrak.

Semua HEAD di bawah adalah commit nyata di `git log bara`, bukan ringkasan lisan. Gate acuan (dijalankan ulang saat menulis bagian ini): `bun run check-types` **3/3**, `packages/core` **165/165**, `apps/web` **266/266** — total **431/431** di 69 berkas.

### 4.1 `I-1` / `I-11` — ID transaksi 12-digit, adapter Mayar sandbox, cron rekonsiliasi

**Status: SELESAI (sandbox).** Rincian penuh (payload webhook asli, keputusan status re-fetch, tes negatif) sudah tercatat lengkap di `docs/sprint-11/status/claude-bara.md` §7 — tidak diulang di sini supaya tidak ada dua sumber kebenaran. Ringkasan untuk audit lane:

- `packages/core/src/payment/order-id.ts` — ID v2 12 digit numerik (`MM BB YY SS NNNN`), bukan format `MW-…`; `nextOrderSequence` atomik di dalam transaksi anchor `createPayment` (`packages/core/src/payment/service.ts`).
- `packages/core/src/payment/mayar.provider.ts` — token callback dibandingkan `timingSafeEqual`, re-fetch wajib sebelum mempercayai status, retry 2× (500/1000 ms) hanya untuk jaringan/5xx, timeout → 504 tanpa pernah menurunkan status ke GAGAL.
- `apps/web/src/routes/api/cron/payments-reconcile.ts` + `packages/core/src/payment/reconciliation.ts` (commit `b1e440f`, "feat(backend): implement affiliate attribution I-4 and mayar reconciliation cron I-11") — `Authorization: Bearer <CRON_SECRET>` dibandingkan `timingSafeEqual`, memakai `applyProviderEvent` yang sama dengan webhook sehingga run yang tumpang tindih tidak pernah menghitung ganda.
- Belum ada: bukti E2E sandbox Mayar sampai LUNAS yang terekam sebagai artefak gate (dicatat sebagai gap terbuka, bukan diklaim selesai).

### 4.2 `I-2` — Kuitansi belanja: dropzone dipasang ke admin

**Status: SELESAI** — commit `3f273d1` ("feat(receipts): mount standalone dropzone component to admin audit page").

- `ReceiptDropzone` (`apps/web/src/components/receipts/receipt-dropzone.tsx`) sudah teruji (`tests/components/receipt-dropzone.test.tsx`) sejak fase Rabu tetapi **tidak pernah dipasang di halaman mana pun** — gap ini eksplisit di audit konsolidasi 18-09 (`SPRINT_BACKLOG.md`, Sprint 11.1 §I-2).
- Dipasang di `apps/web/src/components/admin/approvals-view.tsx`, sub-tab "Bukti Kuitansi Belanja" (`/admin/approvals`) — satu dropzone per laporan progres pending, `waqfProgramId`/`progressReportId` diambil dari baris yang sudah ada, `onUploadSuccess` memicu `reloadApprovals()` sehingga galeri kuitansi read-only di atasnya langsung memuat berkas baru.
- Rute upload (`routes/api/uploads/receipts.ts`, khusus ADMIN) dan invarian bukti foto (`admin.waqf.addProgress`) tidak diubah — murni pemasangan UI di atas backend yang sudah ada dan sudah lulus gate Selasa.
- Tidak ada perubahan skema DB, router oRPC, atau markup admin yang dipulihkan 1:1 dari `origin/awan` (PR-28) yang dihapus/diubah.

### 4.3 `I-3` — Tombol bagikan modular di Zakat, Infaq, Qurban

**Status: SELESAI** — commit `0e9a07a` ("feat(share): wire modular share button to zakat, infaq, and qurban detail pages").

- Sebelumnya `ShareProgramButton`/`share-template.ts` hanya terpasang di halaman wakaf (`wakaf-share-button.tsx`) — dicatat sebagai koreksi di audit 18-09 karena checklist "Tempatkan komponen bagikan" sempat tercentang keliru.
- Dipasang `ShareButton` (`apps/web/src/components/share/share-modal.tsx`), didukung `buildShareMessage()` kategori-aware di `apps/web/src/lib/share/message.ts` (WAKAF/ZAKAT/INFAQ/SEDEKAH/QURBAN, sudah 8/8 uji murni sejak Rabu — `tests/components/share-modal.test.tsx`), ke:
  - `zakat-calculator.tsx` (`category="ZAKAT"`)
  - `infaq-view.tsx` (`category="INFAQ"`)
  - `qurban-detail.tsx` (`category="QURBAN"`, judul diambil dari `batch.ras`/`batch.jenisHewan` yang sama dengan `<h1>` halaman)
- Tidak menyentuh halaman wakaf yang sudah berjalan produksi memakai komponen lama — dicatat sebagai gap konsistensi (dua implementasi share paralel), bukan disamarkan.

### 4.4 `I-10b` — Penilaian kuis di server, XP Berkah benar-benar tercatat

**Status: SELESAI** — commit `ac8c12f` ("fix(security,gamification): patch wa-bot auth bypass; wire quiz XP to ledger").

- Gap sebelum ini: kuis 8 Asnaf dinilai di klien, `gamification.claimQuiz` hanya **membaca** baris `quiz_attempts` yang lulus — tidak ada prosedur yang **menulisnya**, sehingga "+100 XP Berkah" di UI murni tampilan.
- Prosedur baru `gamification.submitQuizAttempt` (additive, tidak mengubah kontrak `claimQuiz` yang sudah dibekukan) menilai jawaban di server lewat kunci jawaban murni `packages/core/src/education/asnaf-quiz.ts` — percobaan langsung memalsukan skor lewat panggilan oRPC tidak mungkin, dibuktikan tes `packages/core/tests/education/asnaf-quiz.test.ts` (7 kasus) dan `apps/web/tests/orpc/gamification.test.ts` (submit → claim end-to-end, quizId tak dikenal, anonim 401).
- `education-detail.tsx` sekarang memanggil `submitQuizAttempt` → `claimQuiz` sungguhan, dan menampilkan poin **yang benar-benar dikembalikan server** (`ACTIVITY_POINTS.QUIZ` = 75) — bukan angka statis "+100" yang keliru.
- Perubahan kontrak didokumentasikan di `docs/sprint-11/CONTRACT-CHANGES.md` (entri `2026-09-18-01`).

### 4.5 `S-4` — Gateway WhatsApp Baileys: auto-init pairing + pengerasan otentikasi

**Status: FUNGSIONAL, blocker keamanan sudah ditutup.**

- Fondasi (`apps/wa-bot`, port 3005, QR pairing dinamis di `/admin/pengaturan`, kuitansi WA otomatis saat PAID/SETTLED) sudah mendarat lebih awal di commit `860d4b2` ("feat(wa-bot): wire up automatic whatsapp receipt trigger on donation payment success") dan `d2de0ee` ("fix(wa-bot): prevent connection re-init spam and ensure qr generation transition").
- Audit konsolidasi 18-09 menemukan celah rilis-blocker di `apps/wa-bot/src/index.ts` `isAuthorized`: bypass berbasis header `Host` (bisa dipalsukan, berlaku **juga di produksi**), dua secret hardcoded (`amwal-dev-wa-secret`, `rahasia-amwal-internal`) selalu diterima, secret dicatat plaintext ke log, dan `apps/web` `env/server.ts` memberi `INTERNAL_SECRET` default publik.
- Ditutup di commit `ac8c12f`: satu-satunya secret yang valid adalah `INTERNAL_SECRET`/`WA_BOT_SECRET` yang dikonfigurasi, dibandingkan `timingSafeEqual`; tanpa secret, produksi **menolak boot** (fail-fast) dan dev/test hanya menerima klien loopback sungguhan (`server.requestIP()`, bukan header); logging secret dihapus; `env/server.ts` kehilangan default-nya sehingga wajib diisi eksplisit di semua environment.
- Menutup regresi AMW-02 / S10-N-01 yang sebelumnya sudah ditutup di Sprint 10 lalu muncul lagi di Sprint 11.

### 4.6 Bonus hari ini — `I-9` dinamisasi `/edukasi/$slug`

Di luar lima item yang diminta, sekaligus dikerjakan pada commit yang sama dengan pembaruan berkas ini (trailer `Ticket: I-9, S11-STATUS`): `/edukasi/$slug` sebelumnya mengabaikan parameter slug dan selalu merender konten 8 Asnaf hardcoded tanpa 404. Sekarang slug `8-asnaf` tetap membuka pengalaman slide+kuis interaktif itu (yang punya penilaian & XP sungguhan sejak §4.4); slug lain memanggil `orpc.cms.bySlug` yang sudah ada dan diuji sejak Selasa, dengan state 404 eksplisit untuk slug tak dikenal/belum terbit. Rincian: `apps/web/src/routes/edukasi/$slug.tsx`, `apps/web/src/components/education/cms-article-detail.tsx`, `apps/web/tests/components/cms-article-detail.test.tsx` (4 tes baru).

