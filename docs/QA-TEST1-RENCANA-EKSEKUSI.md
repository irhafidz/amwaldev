# Rencana Eksekusi — QA Internal "Test#1" (Awan, 08/10/2026)

Sumber: Google Sheets "Internal QC Testing", sheet `Test#1` (dibaca langsung
lewat konektor Google Sheets, 09/10/2026). Video jam.dev di kolom bukti **belum
ditonton** — setiap butir di bawah direproduksi ulang di lokal sebelum
diperbaiki. Dokumen ini hanya rencana: belum ada kode yang diubah.

## Ringkasan

| Hasil | Jumlah |
|---|---|
| Pass | 24 |
| Partially | 16 |
| Not Pass | 7 |
| Belum diuji (admin CRUD edukasi/infaq/zakat/qurban, kelola progres & hapus wakaf) | 17 |
| **Total skenario** | **64** |

23 baris bermasalah dipadatkan menjadi 21 butir kerja (beberapa baris berbagi
akar masalah yang sama). Akar masalah yang sudah dipastikan dari kode ditandai
**[terkonfirmasi]**; sisanya **[hipotesis]** dan butuh reproduksi.

## Keputusan (disetujui 09/10/2026)

| # | Keputusan |
|---|---|
| D1 | Transaksi pending tampil di Riwayat dengan badge "Menunggu Pembayaran" + tombol "Lanjutkan Pembayaran" dan hitung mundur kedaluwarsa; tidak dihitung ke total donasi berhasil. |
| D2 | Donasi tamu tanpa kontak tetap dibolehkan. Order ID disimpan di `localStorage` perangkat, tautan `/transaksi/$orderId` bisa disalin, pengisian WhatsApp didorong (opsional). |
| D3 | Zakat Maal wajib mencatat nama muzakki (internal amil); donatur boleh memilih tampil anonim ("Hamba Allah") untuk publikasi/sertifikat publik. |
| D4 | Avatar & kuitansi pindah ke storage lokal VPS (volume Docker persisten) lewat `/api/media/...`; Supabase Storage tidak dipakai lagi di produksi. |
| D5 | Kuis edukasi boleh dimainkan tamu; XP disembunyikan; di akhir kuis ada ajakan login untuk mengklaim dan menyimpan XP. |
| D6 | Rute publik `/lembaga/$id`: nama lembaga, SK BWI, kontak publik, program aktif. |
| D7 | QRIS maksimal Rp 10.000.000 (batas BI). Di atas itu opsi QRIS dinonaktifkan dengan tooltip yang menyarankan Virtual Account. |

## Status

- **Fase 1 selesai** (QA-14, QA-07, QA-18, QA-17) — lihat catatan di masing-masing butir.
- **Fase 2 selesai** (QA-05, QA-01, QA-02, QA-03) — migrasi aditif
  `0019_payment_instructions` (3 kolom nullable di `transactions`). Diuji
  end-to-end di build lokal dengan provider mock: batas QRIS, layar konfirmasi
  tamu, tautan status di konteks browser baru, daftar perangkat, pelunasan, dan
  Riwayat donatur login (17/17 pemeriksaan).
- **Fase 3 selesai** (QA-04, QA-16, D3) — zakat dan qurban terbuka untuk tamu.
  Tamu wajib mengisi nama (zakat: nama asli selalu tercatat untuk amil,
  `isAnonymous` hanya menyamarkan tampilan publik); zakat tunai/beras tetap
  hanya untuk akun login. `orderStatus` zakat dan qurban kini publik: pemilik
  atau admin melihat data lengkap, selain itu hanya tampilan tanpa PII
  (pola wakaf). Pembatas tamu: per IP (zakat 20/jam, qurban 10/jam, in-memory)
  dan per nomor WhatsApp (maks. 3 pesanan qurban belum dibayar dalam 24 jam,
  di DB). **Celah yang tersisa:** slot qurban tetap `TERISI` sejak pesanan
  dibuat dan tidak pernah dilepas otomatis bila pembayaran kedaluwarsa atau
  gagal (hanya admin yang bisa membatalkan) — butir tersendiri.
- **Fase 4 selesai** (QA-10, QA-11, pelepasan slot) —
  - Media (foto profil, kuitansi) di volume Docker `amwal_media` lewat
    `/api/media/*`; tidak ada lagi ketergantungan `SUPABASE_*`. Avatar: unggah
    PUT dengan URL bertanda tangan 5 menit (nama objek dipilih server, isi
    divalidasi magic bytes, maks 2 MB); kuitansi tetap privat dengan URL
    bertanda tangan 10 menit. Penandatanganan memakai kunci turunan
    `JWT_SECRET` (mengganti `JWT_SECRET` mencabut semua tautan). **Deploy:**
    `docker compose ... up -d --build` membuat volume otomatis; set
    `MEDIA_ROOT=/app/media` sudah ada di compose. Produksi tidak pernah punya
    kredensial Supabase, jadi tidak ada berkas lama yang perlu dimigrasi.
  - Sertifikat PDF A4 berkop-kaki resmi (`certificate/letterhead.ts`), badan
    putih polos; sertifikat zakat/infaq/qurban kini memuat nama donatur dari
    pesanan modulnya (dulu "Wakif Dermawan"). "Unduh PDF": anchor dipasang
    sebelum klik dan URL blob dicabut tertunda; tombol disembunyikan sampai
    dokumennya siap.
  - Slot qurban milik pesanan GAGAL, atau PENDING yang lewat batas bayar +
    60 menit, dilepas otomatis (`releaseExpiredSlotHolds`, dipanggil dari
    katalog dan sebelum memesan, maks sekali per 30 dtk per proses).
- **Fase 5 selesai** (XP kuis, QA-09, QA-12, QA-13, QA-15, QA-06) —
  - XP kuis 100 di seluruh lini (`ACTIVITY_POINTS.QUIZ`, router edukasi,
    badge katalog, toast).
  - Tanya Amwal tamu: `askAi.ask` (publik, tanpa riwayat); 5 pertanyaan/10
    menit/IP, 20/hari/IP, 1000/hari seluruh tamu; maks. 300 karakter,
    karakter kontrol dibuang. Jalur login (`askAi.send`) tidak berubah.
  - `infaq.donatur`: hanya `SETTLED`, tanpa kontak/doa; tabel di /infaq.
  - Sapi utuh (SAPI, 1 slot) menampung 1-7 nama: kolom aditif
    `qurban_orders.nama_shohibul_list jsonb` (migrasi 0020);
    `nama_shohibul` tetap berisi "A, B, C" untuk pembaca lama. Sertifikat PDF
    mencetak baris "Atas Nama" (maks. 3 baris). Kambing/patungan tetap satu
    nama per slot. Catatan: sapi utuh > Rp 10 jt tidak bisa QRIS (batas BI).
  - `stats.public`: total terhimpun (transaksi LUNAS), donatur unik, program
    LIVE; cache 60 dtk; tampil di beranda untuk tamu.
  - Email pengganti Mayar: `hamba-allah+<orderId>@amwal.id` (kotak
    `hamba-allah@amwal.id` perlu ada bila ingin menerima balasan).
- **Fase 6 selesai** (D6, QA-17 tautan, QA-19, QA-20, stepper checkout) —
  - `/lembaga/$id` publik (`waqf.lembaga`): nama, kategori, status, nomor
    registrasi BWI, wilayah dari program aktif, dan program LIVE. Hanya lembaga
    VERIFIED (selain itu 404); kontak pengurus & data bank tidak ikut.
    Migrasi aditif 0021 `nadzir_profiles.nomor_registrasi_bwi` — diisi admin di
    kolom BWI yang sudah ada pada layar verifikasi nazhir. Kartu nazhir di
    detail program menaut ke halaman ini. **Kontak publik (D6) belum ada**:
    tabel belum punya kolom kontak lembaga; menambahkannya butuh keputusan
    data apa yang boleh publik.
  - Zakat fitrah: penjelasan "1 jiwa = 1 kuota", ringkasan jiwa × tarif =
    total, daftar nama bernomor per jiwa dengan penghitung terisi.
  - Matriks peran admin: Switch → checkbox native (85 sel).
  - Stepper checkout: lingkaran bernomor + garis, langkah selesai bercentang.
- **Fase 7 selesai** (QA-08/D5, slug kategori edukasi, token 3 jam) — hasil
  re-audit sheet 10/10/2026 (77 baris; 17 skenario admin kini terisi).
  - QA-08: tamu tidak melihat XP di katalog, kartu artikel, detail artikel,
    sidebar kuis, maupun kuis 8-asnaf; tetap boleh membaca dan bermain. Kuis
    8-asnaf tamu dinilai lewat `gamification.gradeQuiz` (publik, tanpa
    menulis percobaan/poin; `submitQuizAttempt` tetap wajib login). Tamu yang
    lulus melihat "Masuk sekarang untuk mengklaim +100 XP dan menyimpan
    pencapaian Anda!" (tidak untuk yang gagal: XP tidak bisa diklaim).
  - Kategori edukasi unik per (tipe, slug): migrasi 0022 membuat indeks
    komposit lebih dulu, baru membuang indeks global; cek duplikat create dan
    rename sekarang per tipe.
  - Access token 20 menit → 3 jam (cookie ikut). Refresh otomatis di SSR
    ditunda: merotasi refresh token dari dua permintaan SSR paralel memicu
    aturan "pakai ulang = pencurian" yang mencabut semua sesi. Konsekuensi: akun
    yang dinonaktifkan/diubah perannya baru berlaku paling lama 3 jam.
  - Ditangguhkan ke rilis berikutnya: kategori ke master data, upload foto
    hewan qurban, kontak publik lembaga, QA-21.
- **Fase 8 selesai** (sisa Kelompok B) —
  - Foto katalog hewan qurban: unggah berkas (bucket publik `qurban-photos`,
    maks. 5 MB, JPG/PNG/WebP, izin PUT bertanda tangan dari
    `admin.qurban.photoUploadUrl`); `fotoUrl` menyimpan path
    `/api/media/qurban-photos/<nama>`; tautan http(s) lama tetap valid
    (skema lain, mis. `javascript:`, kini ditolak).
  - Kontak publik lembaga: migrasi aditif 0023 `nadzir_profiles.kontak_publik`;
    diisi admin di modal verifikasi atau tombol "Ubah Data Publik" (lembaga
    terverifikasi), tampil di `/lembaga/$id`. Nomor BWI ikut bisa diedit di sana.
    Perbaikan: field BWI Fase 6 sempat tertulis di `verifyProgramSchema` (salah
    skema), kini hanya di `verifyNadzirSchema`.
  - Penyaluran zakat 8 asnaf: tab baru "Penyaluran 8 Asnaf" di modul Zakat
    admin (daftar + "Catat Penyaluran" + tambah mustahik di tempat). Backend
    sudah ada sejak lama; yang hilang hanya layarnya.
  - Cetak kuitansi (QA-21): modal dirender ke `<body>`; `@media print` menyembunyikan
    seluruh aplikasi lain, A4 margin 18/16 mm, kop logo + footer amwal.id,
    tombol disembunyikan. Format yang DIHARAPKAN tim belum dikonfirmasi.
  - Master Data: kartu pintasan ke Kategori Artikel/Video Edukasi
    (`/admin/edukasi?kategori=`), membuka pengelola kategori. Kategori tetap
    disimpan di modul Edukasi (belum dipindah ke tabel master data).
- Temuan baru saat Fase 2 (ikut diperbaiki karena menggagalkan QA-01/QA-02):
  1. `waqf.createOrder` dan `infaq.createOrder` tidak pernah memakai sesi login
     — donasi akun berpassword tercatat atas baris tamu baru dan tidak pernah
     muncul di Riwayat. Kini sesi yang sah menjadi pemilik order.
  2. Kolom `timestamp` naif (UTC) dibaca `Date.parse` sebagai waktu lokal: batas
     bayar tampak 7 jam lebih awal dan jam di Riwayat mundur 7 jam. Kini semua
     melalui `parseInstant` / `formatWibDateTime`.
- Temuan baru saat Fase 1: kuis artikel memberi **100 XP** (literal di
  `education.quiz.check`), konstanta `QUIZ_POINTS` = 75, dan banner katalog
  "KUIS LITERASI BERKAH • +50 XP". **Keputusan (09/10/2026): 100 XP di semua
  tempat** — router, konstanta core `QUIZ_POINTS`, dan badge katalog. Dikerjakan
  di Fase 5 bersama QA-08.

## P0 — Kritis / Transaksi

### QA-01 Transaksi belum dibayar langsung masuk Riwayat
Baris: Pembayaran waqaf tanpa login, dengan login (QRIS/VA/E-Wallet).
**[terkonfirmasi]** `transactions.list` mengembalikan semua status, termasuk
`PENDING`, tanpa pembeda yang jelas di UI.
- Ubah: `apps/web/src/lib/orpc/router/transactions.ts` (status + flag
  `bisaDilanjutkan`), `components/history/transaction-history.tsx` (label
  "Menunggu Pembayaran", filter default, total hanya LUNAS),
  `components/dashboard/dashboard-home.tsx` ("Pernah Anda Donasikan").
- Tes: `apps/web/tests/orpc/transactions*.test.ts` — PENDING tidak masuk total,
  tampil dengan status benar. Tergantung D1.

### QA-02 Pembayaran tertunda tidak bisa dilanjutkan
Baris: Infaq tanpa login ("tidak bisa bayar jika page-nya ke-close"), detail
riwayat ("ketika pending tidak bisa melihat link lanjutkan pembayaran").
**[terkonfirmasi]** Instruksi bayar (QR, nomor VA, tautan e-wallet) hanya
disimpan di `sessionStorage` (`components/payment/pending-payment.tsx`,
`components/infaq/infaq-view.tsx`, `components/wakaf/waqf-order-status.tsx`);
tabel `transactions` tidak menyimpan instruksi maupun tautan bayar.
- DB: migrasi **aditif** `transactions.payment_instructions jsonb` +
  `payment_expires_at` (sesuai `db/MIGRATION_RULES.md`; aman untuk aplikasi
  Next.js lama). Alternatif tanpa migrasi: ambil ulang dari Mayar
  `GET /transactions/{id}` — perlu dicek apakah respons itu memuat `paymentDetail`.
- Ubah: `packages/core/src/payment/service.ts` (simpan instruksi setelah
  `createTransaction`), `transactions.detail` + `waqf/infaq/zakat/qurban
  orderStatus` (kembalikan instruksi untuk pemilik), `components/history/
  transaction-detail.tsx` (tombol "Lanjutkan Pembayaran" bila PENDING & belum kedaluwarsa).
- Tes: core `payment/service` (instruksi tersimpan), web oRPC detail.

### QA-03 Donasi tamu tanpa email/HP tidak bisa dilacak
Baris: Pembayaran waqaf / infaq tanpa login.
**[terkonfirmasi]** `packages/core/src/identity/guest.ts` memetakan tamu tanpa
kontak ke satu akun sistem anonim — wajar secara privasi, tetapi donatur
kehilangan jejak setelah tab ditutup.
- Ubah: halaman status setelah checkout menampilkan kode transaksi + tautan
  `/transaksi/$orderId` (sudah ada, tampilan publik tersamarkan) + tombol
  "Salin/Simpan"; simpan daftar order di `localStorage` ("donasi dari perangkat
  ini"). Form: ajakan mengisi WhatsApp. Tergantung D2. Tanpa perubahan skema.

### QA-04 Zakat & Qurban wajib login (seharusnya bisa tamu seperti ITS Sedekah)
Baris: Zakat Fitrah tanpa login, Zakat Mal tanpa login, Qurban tanpa login (Not Pass).
**[terkonfirmasi]** `zakat.createOrder`/`orderStatus` dan
`qurban.createOrder`/`orderStatus` memakai `anyRoleProcedure(rbacMatrix.wakif)`;
UI menampilkan `LoginPrompt` (`components/zakat/zakat-checkout.tsx`,
`components/qurban/qurban-checkout.tsx`). Wakaf & infaq sudah `publicProcedure`
+ `resolveGuestDonor`. Zakat Mal "tidak diarahkan login" di awal karena gerbang
baru muncul di checkout — inkonsisten.
- Ubah: `lib/orpc/router/zakat.ts`, `lib/orpc/router/qurban.ts` (pola wakaf:
  public + `resolveGuestDonor` + tampilan publik tersamarkan untuk non-pemilik),
  kontrak `packages/core/src/contracts/zakat.ts` & `qurban.ts` (identitas tamu),
  kedua komponen checkout + rute `zakat/checkout.tsx`, `qurban/checkout.tsx`.
- Perhatian: reservasi slot qurban (row lock) & akad wakalah tetap wajib;
  rate limit pembuatan order tamu agar slot tidak bisa diborong.
- Tes: `tests/orpc/qurban*.test.ts`, `zakat*.test.ts` — tamu bisa membuat
  order, tamu tidak bisa membaca order milik orang lain, uji balapan slot tetap lolos.

### QA-05 Zakat Mal: pilih QRIS tetapi diarahkan ke VA
**[hipotesis kuat]** Nominal di atas batas QRIS; tidak ada batas maksimum per
metode di kode (`packages/core/src/payment/limits.ts` hanya `MIN_DONATION`).
- Ubah: batas per metode di `packages/core/src/payment/methods.ts` (+ tes core),
  `components/payment/payment-method-selector.tsx` (opsi di atas batas
  dinonaktifkan dengan alasan), validasi server di `createPayment`. Tergantung D7.

## P1 — Fungsional / Logika Data

### QA-06 Email tiruan tampil di halaman Mayar
**[terkonfirmasi]** Tamu tanpa email dikirim ke Mayar sebagai
`donatur+<orderId>@amwal.id` (dibutuhkan agar Mayar tidak menolak "Duplicate
request"). Opsi: alamat generik yang lebih rapi (mis. `hamba-allah+<kode>@amwal.id`)
atau cek apakah Mayar mengizinkan email kosong. File: `packages/core/src/payment/mayar.provider.ts`.

### QA-07 XP baca artikel: dijanjikan +50, diberi 25, dan terasa muncul saat kuis
**[terkonfirmasi]** `education.articles.claimReadingXp` menulis `points: 25`
secara literal, padahal `ACTIVITY_POINTS.READ = 50` (`packages/core/src/
gamification/points.ts`) dan badge UI "+50 XP"; toast juga menulis "+25 XP".
Klaim dipicu saat sentinel di akhir artikel terlihat — posisinya bersebelahan
dengan blok kuis, sehingga terasa diberikan setelah kuis.
- Ubah: `lib/orpc/router/education.ts` (pakai `ACTIVITY_POINTS.READ`),
  `components/education/education-article-detail-view.tsx` (sentinel di akhir isi
  artikel, toast dari konstanta). Tes: klaim memberi 50, idempoten.

**Selesai (Fase 1).** Server memakai `ACTIVITY_POINTS.READ` (50) untuk poin dan
`xpAwarded`; toast memakai nilai dari server. Sentinel sudah tepat di akhir isi
artikel — penyebab kesan "XP dari kuis" adalah syarat ganda (sampai akhir **dan**
30 detik): pembaca cepat menerima XP saat sudah di kuis. Kini ada penanda di
akhir artikel ("Hampir selesai… setelah membaca minimal 30 detik" → "+50 XP …
sudah tercatat"). Tes: `tests/orpc/gamification-claims.test.ts`,
`tests/components/education-article-detail.test.tsx`.

### QA-08 Tamu melihat badge XP di edukasi; kuis tanpa login
Baris: Membaca artikel / Mengerjakan kuis tanpa login (Not Pass).
- Ubah: `components/education/education-catalog-view.tsx`,
  `education-detail.tsx`, `education-article-detail-view.tsx` — sembunyikan
  XP bila `user` null; perilaku kuis sesuai D5.

### QA-09 Tanya Amwal tanpa login
Baris: Not Pass. **[terkonfirmasi]** `ask-ai.send`/`list` = `protectedProcedure`;
pembatas laju hanya per-user di memori (20/10 menit, AMW-06).
- Ubah: `lib/orpc/router/ask-ai.ts` — jalur tamu tanpa riwayat tersimpan, batas
  per-IP + kuota global harian, batas panjang pertanyaan; `routes/tanya-ai.tsx`,
  `edukasi/tanya-ai.tsx`, widget chat. Butuh tinjauan keamanan (biaya LLM,
  penyalahgunaan). Tes: tamu bisa bertanya, tamu terkena limit, user lama tidak berubah.

### QA-10 Upload foto profil gagal
**[terkonfirmasi]** `user.getAvatarUploadUrl` butuh `SUPABASE_URL` +
`SUPABASE_SERVICE_ROLE_KEY`, dan keduanya **tidak ada** di `.env.production` →
selalu `INTERNAL_SERVER_ERROR`. **Risiko terkait:** upload kuitansi admin
(`storage/supabase`) memakai ketergantungan yang sama — skenario "Kelola
Progress Program Wakaf" (belum diuji) kemungkinan juga gagal.
- Ubah sesuai D4: modul penyimpanan baru (`apps/web/src/lib/storage/*`), rute
  baca, `lib/orpc/router/user.ts`, `receipts.ts`, `components/profile/profile-edit-view.tsx`,
  `docker-compose.prod.yml` (volume). Tes: upload avatar + kuitansi end-to-end.

### QA-11 "Unduh PDF" di detail riwayat tidak berfungsi
**[hipotesis]** (a) rute `api/certificates.$id` hanya untuk transaksi wakaf
LUNAS — gagal untuk infaq/zakat/qurban atau status pending; (b)
`URL.revokeObjectURL` dipanggil langsung setelah `click()` (membatalkan unduhan
di sebagian browser); (c) env `CERTIFICATE_*` belum lengkap di produksi.
- Reproduksi dari video jam.dev, lalu perbaiki di
  `components/history/transaction-detail.tsx` / `routes/api/certificates.$id.ts`.
  Sembunyikan tombol bila jenis transaksi tidak punya sertifikat.

### QA-12 Tabel riwayat infaq keseluruhan belum ada
Baris: Not Pass. Wakaf punya `waqf.donatur`; infaq tidak.
- Ubah: prosedur publik `infaq.donatur` (hanya LUNAS, nama tersamarkan seperti
  wakaf) di `lib/orpc/router/infaq.ts`, tabel di `components/infaq/infaq-view.tsx`.

### QA-13 Qurban sapi utuh: tidak bisa mengisi 7 nama shohibul
**[terkonfirmasi]** Sapi utuh = 1 slot, dan form membuat satu nama per slot;
`qurban_animal_slots.nama_shohibul` menyimpan satu teks per slot. Secara fikih
satu sapi boleh atas nama hingga 7 orang.
- Opsi data: kolom aditif `qurban_orders.nama_shohibul_list jsonb` (rekomendasi)
  atau gabungan teks di slot. Ubah: kontrak `packages/core/src/contracts/qurban.ts`
  (1–7 nama untuk paket utuh), `qurban.createOrder`, `components/qurban/
  qurban-checkout.tsx`, tampilan admin & sertifikat qurban.

### QA-14 Daftar program wakaf admin lambat
**[terkonfirmasi]** `lib/orpc/router/admin/waqf.ts` (dan `nadzir.ts`) memilih
`waqfPrograms.bannerUrl` mentah — data URI base64 hingga beberapa MB per
program. Sisi publik sudah memakai `publicMediaColumns` + `withMediaUrls`
(`lib/waqf-media.ts`); terapkan pola yang sama. Tes: list tidak mengembalikan `data:`.

**Selesai (Fase 1).** `admin.waqf.programsList` dan `nadzir.programs` memakai
`publicMediaColumns` + `withMediaUrls`. Dua pengaman ikut ditambahkan:
`/api/waqf-media` kini melayani program DRAFT untuk admin/Nadzir pemiliknya
(`Cache-Control: private, no-store`), dan `updateProgram` mengabaikan tautan
`/api/waqf-media/...` yang dikirim balik form (tanpa ini data URI tersimpan
tertimpa tautan ke dirinya sendiri). Tes: `tests/orpc/waqf-media.test.ts`.

### QA-15 Statistik beranda sebelum login
Baris: Navigasi homepage sebelum login (Partially).
- Tamu melihat statistik platform (dana terhimpun bulan ini, jumlah donatur,
  program aktif) alih-alih XP/total pribadi bernilai 0. Prosedur publik baru
  (agregat LUNAS saja, tanpa PII, di-cache) + `components/dashboard/dashboard-home.tsx`.

### QA-16 Zakat Mal atas nama "Hamba Allah"
Tergantung D3; implementasi mengikuti QA-04.

## P2 — UI/UX, Polish & Konsistensi

| # | Temuan | File |
|---|---|---|
| QA-17 | Kategori nazhir tampil `BADAN_HUKUM` — **label selesai (Fase 1)**, `lib/nadzir-labels.ts` dipakai di kartu nazhir publik & verifikasi admin; tautan ke profil menunggu `/lembaga/$id` (D6) | Label map bersama (`packages/core` atau `lib/labels.ts`), `components/wakaf/waqf-detail.tsx`; halaman publik sesuai D6 |
| QA-18 | Kartu ringkasan pembayaran wakaf tidak ikut scroll — **selesai (Fase 1)**: akar masalah `sticky` di div dalam aside pada grid `items-start`; kini aside-nya yang sticky | `components/wakaf/waqf-donate-form.tsx:912` (pola `aside lg:sticky lg:top-24` dari `infaq-view.tsx:326`) |
| QA-19 | Daftar shohibul zakat fitrah kurang jelas | `components/zakat/zakat-checkout.tsx` |
| QA-20 | Edit hak akses: toggle → checkbox (saran) | editor matriks peran admin (`components/admin/*roles*`) |
| QA-21 | Tata letak kuitansi cetak belum dipastikan | butuh contoh/format yang diharapkan dari tim |

Temuan internal (bukan dari sheet): indikator langkah checkout wakaf
("1 • Hitung › 2 • Konfirmasi › 3 • Bayar") masih bergaya pill, tersisa dari
standarisasi tab sebelumnya.

## Tahapan Pengerjaan

Setiap fase = satu PR kecil. Untuk setiap butir: tes gagal dulu → perbaikan →
`bun run check-types`, `cd packages/core && bun test`, `cd apps/web && bun test`
(baseline saat ini: 325 + 593 lolos, 0 gagal) → Biome pada file yang disentuh.
Migrasi hanya aditif dan diterapkan ke DB uji sebelum produksi.

| Fase | Isi | Risiko | Catatan |
|---|---|---|---|
| 0 | Keputusan D1–D7; reproduksi QA-05, QA-11 dari video jam.dev; lingkungan lokal pakai DB demo (`scripts/video/README.md`) | — | Tanpa perubahan kode |
| 1 | QA-14 (perf admin), QA-07 (XP 50), QA-18 (sticky), QA-17 label | Rendah | Kemenangan cepat, tanpa migrasi |
| 2 | QA-05 batas metode → QA-01 status Riwayat → QA-02 instruksi tersimpan (migrasi aditif) → QA-03 pelacakan tamu | Sedang | Alur uang: uji di sandbox Mayar + `scripts/test-mayar.ts` sebelum deploy |
| 3 | QA-04 tamu untuk Zakat lalu Qurban (QA-16 ikut) | Tinggi | Satu modul per PR; uji balapan slot qurban wajib tetap lolos |
| 4 | QA-10 penyimpanan media (avatar + kuitansi), QA-11 PDF | Sedang | Butuh perubahan `docker-compose.prod.yml` + volume di Dokploy |
| 5 | QA-09 Tanya Amwal tamu, QA-08, QA-12, QA-13 (migrasi aditif), QA-15, QA-06 | Sedang | QA-09 lewat tinjauan keamanan |
| 6 | P2 sisa (QA-19, QA-20, QA-21) | Rendah | |
| 7 | QA ronde 2 bersama Awan: ulang semua baris Partially/Not Pass + 17 skenario admin yang belum diuji | — | Prioritaskan "Kelola Progress" (bergantung QA-10) dan "Hapus Program" (FK `restrict`) |
