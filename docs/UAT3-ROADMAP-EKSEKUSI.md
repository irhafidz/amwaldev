# Roadmap Eksekusi — UAT #3 "View Public" (9 Oktober 2026)

Sumber: Google Sheets "UAT 3 - 9 Oktober 2026" (tab `User - Mas Atiq`,
`User-Mas Melvin`, ` User-Mba Muthia`, `User - Mba Nurul`; dibaca lewat
konektor Google Sheets, 16/10/2026). Tab `Template User` dan `Template Admin`
tidak dipakai. Dokumen ini **hanya rencana: belum ada kode yang diubah.**

Format ID: `U3-nn`. Akar masalah yang sudah dicocokkan dengan kode ditandai
**[terkonfirmasi]**; sisanya **[hipotesis]** dan harus direproduksi dulu.

## 1. Ringkasan hasil

16 skenario per responden (Daftar Akun s.d. Tanya Amwal). Mba Muthia memiliki
satu baris tambahan (Infaq), jadi totalnya 69 percobaan tugas.

| Responden | Tugas | Sukses | Gagal | Task Success | SEQ rata-rata | SUS |
|---|---|---|---|---|---|---|
| Mas Atiq | 17 | 13 | 4 | 76,5% | 5,94 | 65,0 |
| Mas Melvin | 17 | 14 | 3 | 82,4% | 5,93 (14 tugas bernilai) | 65,0 |
| Mba Muthia | 18 | 18 | 0 | 100% | 4,71 | 65,0 |
| Mba Nurul | 17 | 17 | 0 | 100% | 6,47 | 77,5 |
| **Total** | **69** | **62** | **7** | **89,9%** | **5,75** (65 nilai) | **68,1** |

- SUS 68,1 tepat di sekitar rata-rata industri (68): bisa dipakai, belum
  nyaman. Pola jawabannya konsisten: "mudah dipahami", tetapi
  "beberapa fitur tidak bisa menemukan tombol".
- Skor SUS Mba Nurul butir 9 ("percaya diri") = 1 bertentangan dengan butir
  lain yang positif; kemungkinan salah isi. Dengan butir itu dibuang, SUS
  rata-rata naik sedikit. Tidak mengubah kesimpulan.
- Perangkat per responden **tidak tercatat di sheet** (hanya disebut:
  Android, iPhone, iPad, laptop). Pemetaan di bawah diambil dari catatan
  ("iOS", "tampilan desktop").

### Tugas gagal dan SEQ rendah

| Tugas | Hasil | Catatan |
|---|---|---|
| Qurban Kambing / Sapi Patungan / Sapi Utuh | **6 dari 12 percobaan gagal** (Atiq 3, Melvin 3), SEQ 3 | Semua gagal dengan alasan sama: tombol lanjut tidak ditemukan. Muthia dan Nurul (6 percobaan) sukses. |
| Menulis komentar | 1 gagal (Atiq), Melvin sukses dengan catatan | "Tombol kirim tidak ditemukan"; di iOS "tombol send tertutup menu". |
| Zakat Mal | semua sukses, SEQ rata-rata **5,25** (6, 6, 3, 6) | Nisab tidak jelas; hasil Rp 0 tanpa penjelasan. |
| Tanya Amwal | SEQ rata-rata 5,5 | Jawaban tidak bisa diringkas, format kurang rapi. |
| Pembayaran Waqaf | SEQ Muthia 4 | "Tidak notice tombol pembayaran di kanan." |

Di luar Qurban, task success 98% (1 gagal dari 57).

### Akar masalah yang terkonfirmasi

1. **Qurban: tombol lanjut tertutup bottom nav [terkonfirmasi].**
   `routes/qurban/$batchId.tsx` tidak mematikan bottom nav (checkout, status,
   detail wakaf, dll. memakai `showNav={false}`). Bilah bayar tetap di
   `qurban-detail.tsx:182` memakai `fixed bottom-0 z-30`, sedangkan
   `BottomNav` memakai `fixed bottom-0 z-50 h-[72px] md:hidden`. Di layar
   ponsel (< md) bilah bayar tepat di bawah menu. Di iPad/laptop menu tidak
   tampil, itu sebabnya Muthia dan Nurul lolos.
2. **Komentar: tombol kirim tertutup menu di iOS [terkonfirmasi].** Modal
   komentar `fixed inset-0 z-50 items-end` (bottom sheet) bertabrakan dengan
   `BottomNav` yang ber-`z-50` dan lebih belakang di DOM, sehingga menu
   menimpa tombol "Kirim Komentar".
3. **Zakat Mal [terkonfirmasi].** `zakat-calculator.tsx` sudah memiliki
   status `Belum Wajib Zakat` dan tombol nonaktif, tetapi hanya berupa pil
   kecil; total tetap tampil "Rp 0" tanpa alasan, dan petunjuk "Dihitung
   setahun (× 12)" hanya satu baris abu-abu.
4. **Pendaftaran [terkonfirmasi].** `register-view.tsx` dan `register-form.tsx` selesai mendaftar lalu
   `window.location.assign('/auth/login?...')`: pengguna harus mengetik ulang.
5. **Notifikasi pembayaran [dikoreksi 16/10].** Notifikasi `PAYMENT_SETTLED`
   ("Pembayaran berhasil") SUDAH dibuat saat transaksi lunas
   (`packages/core/src/notification.ts`; tampil pada screenshot H8). Yang belum
   ada hanya notifikasi untuk pembayaran yang dibuat/menunggu, gagal, atau
   kedaluwarsa, jadi komentar "transaksi tidak ada di notifikasi" kemungkinan
   berasal dari transaksi yang belum lunas. Rencana U3-12 cukup menambah tiga
   jenis itu, bukan membuat mekanisme baru. (Catatan awal dokumen ini salah.)
6. **Menu desktop tanpa Berita [terkonfirmasi].** `desktop-sidebar.tsx`
   tidak memuat `/berita`.
7. **Sapi Utuh "program tidak ada yang bisa dipilih" [hipotesis].** Kemungkinan
   data (semua paket sapi utuh `PENUH`/belum ada di lingkungan uji) atau
   penyaringan tab; perlu dicek di data staging sebelum memutuskan.

### Catatan penting: build yang diuji

UAT dilakukan pada 9 Oktober, bersamaan dengan Fase 1–8 pengerjaan QA Test#1.
Beberapa komentar kemungkinan sudah tertangani di kode terbaru dan hanya perlu
diverifikasi, bukan dikerjakan ulang:
kartu ringkasan tidak ikut scroll (QA-18), foto profil tidak bisa diunggah dan
"belum bisa ubah gambar" (QA-10), email Mayar kosong (QA-06), indikator
langkah donasi wakaf (stepper Fase 6), daftar shohibul fitrah (QA-19).
**Langkah pertama Fase 1 adalah mengulang skenario pada build terbaru** supaya
tidak memperbaiki yang sudah selesai.

## 2. Matriks keputusan

Keputusan: **K1** wajib dikerjakan, **K2** polish/enhancement ringan,
**K3** tidak dikerjakan, **V** verifikasi/klarifikasi dulu.

### Kelompok 1 — Wajib dikerjakan (Critical UX / High ROI)

| ID | Temuan (responden) | Keputusan & rencana | Alasan |
|---|---|---|---|
| U3-01 | Qurban: tombol lanjut tidak kelihatan; "bingung cara menambah paket" (Atiq, Melvin) | `showNav={false}` pada `/qurban/$batchId`; bilah bayar `pb-[max(1rem,env(safe-area-inset-bottom))]`; kartu paket tetap punya tombol "Pilih Paket" jelas | 6 dari 7 kegagalan UAT; alur inti pendapatan; perbaikan kecil |
| U3-02 | Komentar: tombol kirim tertutup menu di iOS (Atiq, Melvin) | Naikkan z-index modal ke atas bottom nav (atau render lewat portal), `max-h-[100dvh]`, padding safe-area; periksa modal fixed lain dengan pola sama | 1 kegagalan + komplain iOS; akar masalah sama dengan U3-01 |
| U3-03 | Indikator langkah qurban (1,2,3) dikira tombol (Muthia) | Ubah daftar "Cara Qurban" di katalog menjadi teks non-interaktif (tanpa bentuk lingkaran/kapsul menyerupai tombol) | Permintaan eksplisit; kebingungan alur |
| U3-04 | Sapi Utuh: "tidak ada program yang bisa dipilih" (Atiq) | Cek data; tambah empty state eksplisit per tab ("Sapi utuh sedang penuh / segera hadir") dan hitung paket per tab | Gagal total di 0:10; bila memang data kosong, UI harus menjelaskan |
| U3-05 | Zakat Mal: nisab membingungkan, Rp 0 tanpa alasan, "tidak muncul bayar bila belum nisab", gaji bulanan vs tahunan (Atiq, Muthia, Melvin) | Panel status berwarna: hijau "Wajib zakat", kuning "Belum mencapai nisab" + bilah progres harta/nisab + kalimat "kurang Rp X"; ganti tombol Bayar dengan penjelasan dan tautan "Tetap ingin berbagi? Infaq"; label gaji: "Gaji per bulan — dihitung ×12 setahun" | Skor SEQ terendah di luar Qurban (3); mengurangi bingung dan error pengguna |
| U3-06 | Tanda `*` untuk isian wajib, opsional tidak perlu tanda (Melvin) | Komponen kecil penanda wajib + `aria-required`; terapkan di form wakaf, infaq, zakat, qurban, daftar | Quick win yang diminta; aksesibilitas |
| U3-07 | Setelah daftar harus masuk ulang (Nurul, Melvin) | Auto-login: setelah `auth.register` sukses panggil `auth.login` dengan kredensial yang sama lalu arahkan ke tujuan; bila gagal jatuh ke halaman masuk seperti sekarang | Quick win; mengurangi friksi pertama |
| U3-08 | Salah isi form → langsung diarahkan ke bagian yang salah (Melvin) | Fokus dan gulir ke isian tidak valid pertama + ringkasan error | Mencegah pembayaran "mandek" tanpa sebab terlihat |

### Kelompok 2 — Polish & enhancement ringan

| ID | Temuan (responden) | Rencana | Catatan |
|---|---|---|---|
| U3-09 | Tombol bayar kurang terlihat di sisi kanan; "terlalu banyak tombol, warna bayar eye catching" (Muthia) | V lalu polish: setelah verifikasi sticky QA-18, perkuat kontras tombol "Lanjut Pembayaran" | Bisa sudah tertangani |
| U3-10 | Kartu "Doa & Harapan" dibuat lebih menarik (Melvin) | Latar/aksen berbeda, ikon, contoh doa singkat | Murni visual |
| U3-11 | "View more" 8 Asnaf, syarat zakat, tautan ke artikel zakat (Melvin) | Dialog ringkas "Pelajari 8 Asnaf" + kartu syarat + tautan artikel edukasi | Konten statis |
| U3-12 | Notifikasi berhasil/gagal bayar; "transaksi tidak ada di notifikasi" (Melvin, Muthia, Nurul) | Buat notifikasi per pengguna saat transaksi lunas/gagal/kedaluwarsa + toast di halaman status | Menyentuh webhook pembayaran → butuh tes ketat; Fase 3 |
| U3-13 | Riwayat: nama program, pembeda Zakat Mal vs Fitrah (Melvin) | Label `jenis · program` di daftar riwayat | Router `transactions.list` + `transaction-history.tsx` |
| U3-14 | Profil: hapus foto (Atiq), deskripsi level (Melvin), "lupa password lama?" (Muthia) | Tombol "Hapus foto"; tooltip level; tautan "Lupa kata sandi?" di form ganti sandi | Fitur reset sandi sudah ada |
| U3-15 | Kuis: teks setelah kirim membingungkan, kuis sulit ditemukan (Atiq); penjelasan dalil (Muthia) | Tab/CTA "Kuis" lebih terlihat di atas artikel; teks hasil jelas; tampilkan penjelasan per soal | Soal tambahan = tugas konten admin, bukan kode |
| U3-16 | Tanya Amwal: jawaban rapi, spasi, penamaan referensi (Nurul, Atiq) | Render jawaban dengan paragraf/daftar berspasi dan daftar sumber bernama | Mengubah "lebih ringkas" butuh layanan RAG (di luar repo) |
| U3-17 | Tombol batal bila salah input pembayaran (Melvin) | Tautan "Batal / kembali" pada form donasi | Kecil |
| U3-18 | Tombol Berita di tampilan desktop; artikel vs berita (Nurul) | Tambah "Berita" di `desktop-sidebar.tsx`; perjelas label edukasi/berita | Kecil |
| U3-19 | Dokumentasi hewan belum bisa dilihat; PIC penanggung jawab (Muthia, Atiq) | Teks "Dokumentasi tersedia setelah penyembelihan" dan label "Dikelola Panitia Qurban Amwal" | Kontak PIC nyata → lihat K3 |
| U3-20 | Muthia keberatan daftar donatur infaq publik | **Jangan dicabut** (lihat K3); perjelas teks opsi anonim di form infaq: "Nama Anda tampil di daftar donatur kecuali memilih Hamba Allah" | Memenuhi kekhawatiran tanpa membuang transparansi |
| U3-21 | Grafik capaian/raport donasi di profil; beranda soroti program mendesak (Muthia) | Backlog; masuk Fase 4 jika waktu ada | Nice to have |

### Perlu klarifikasi / reproduksi (V)

| ID | Temuan | Pertanyaan |
|---|---|---|
| U3-22 | "Hide and Show langsung kelihatan kalau diedit" (Melvin, Daftar Akun); "kesulitan copy password" (Atiq) | Maksudnya tombol tampil/sembunyi sandi atau pratinjau? Apa yang ingin disalin? |
| U3-23 | "Gambarnya lebih dari satu saat masuk ke beranda" (Melvin, Qurban) | Halaman mana yang menampilkan gambar ganda (hero/carousel)? |
| U3-24 | Komentar "sistem lama seperti lag setelah di-refresh" (Atiq) | Jaringan atau kueri komentar? Ukur saat reproduksi U3-02 |
| U3-25 | Muthia: "gabisa buat email / yang sepuh" | Konteksnya pengguna tanpa email; checkout tamu dan login nomor HP sudah ada, perlu diuji bila registrasi masih mewajibkan email |

### Kelompok 3 — Tidak dikerjakan (beserta alasan)

| ID | Permintaan | Keputusan | Alasan rasional |
|---|---|---|---|
| U3-30 | Daging qurban diantar/diambil, logistik pengantaran (Muthia, Nurul) | **Drop** | Ini fitur operasional (kurir, alamat per penerima, status pengiriman, biaya) yang mengubah model bisnis dan di luar cakupan prototipe. Pilihan "pasrah / ambil sendiri 1/3" (`opsiPesan`) sudah ada; yang boleh ditambah hanya penjelasan teksnya. |
| U3-31 | Opsi bayar zakat mal per bulan vs sekaligus / cicilan (Nurul) | **Drop** | Zakat mal terikat haul tahunan; cicilan memerlukan tagihan berulang, pengingat, dan status "sebagian terbayar" di Zone 0 yang saat ini dirancang satu-transaksi-satu-sertifikat. Zakat Penghasilan sudah menampilkan "≈ per bulan" sebagai panduan. Bisa dievaluasi sebagai proyek terpisah. |
| U3-32 | Sembunyikan riwayat donatur infaq publik (Muthia) | **Drop (jangan dikerjakan)** | Daftar ini adalah temuan QA-12 (Awan) untuk transparansi dan audit. Privasi sudah dijaga: hanya donasi lunas, tanpa kontak/doa, dan nama anonim tampil "Hamba Allah". Menyembunyikannya membatalkan kebutuhan audit; solusinya transparansi opsi anonim (U3-20). |
| U3-33 | Balasan komentar / diskusi berutas (Nurul) | **Tunda** | Membutuhkan skema (parent id), moderasi, dan notifikasi; di luar kebutuhan UAT publik. |
| U3-34 | Waktu bayar 30 menit (Melvin) | **Tunda, butuh keputusan produk** | Batas bayar Mayar default 24 jam dan terhubung ke penahan slot qurban (+60 menit jeda) serta tampilan "Menunggu Pembayaran". Memendekkan tanpa keputusan merusak QRIS yang dibayar belakangan. Hitung mundur sudah ada. |
| U3-35 | Perbanyak basis data/jawaban AI lebih ringkas (Atiq) | **Di luar repo** | Korpus dan perilaku jawaban ada di layanan RAG; hanya format tampil (U3-16) yang bisa diubah di sini. Menambah soal kuis juga tugas konten admin. |
| U3-36 | Kontak PIC nyata per hewan/program (Atiq) | **Tunda** | Tidak ada model datanya dan data apa yang boleh publik belum diputuskan (sama dengan "kontak publik" lembaga). |

## 3. Roadmap eksekusi

Estimasi kasar untuk satu pengembang, termasuk tes dan uji browser.

### Fase 1 — Kegagalan task dan quick win (≈ 1,5 hari)

Tujuan: task success qurban 50% → ≥ 95%; SEQ Zakat Mal ≥ 5,5.

0. Ulangi skenario gagal pada build terbaru dengan viewport 390×844 (Chromium
   dan WebKit/iOS), catat mana yang sudah beres.
1. U3-01, U3-02 (satu akar masalah: tumpukan z-index dan safe area).
   Berkas: `routes/qurban/$batchId.tsx`, `components/qurban/qurban-detail.tsx`,
   `components/education/education-article-detail-view.tsx` (modal komentar),
   `components/bottom-nav.tsx`, `components/user-shell.tsx`.
2. U3-03, U3-04. Berkas: `components/qurban/qurban-catalog.tsx`,
   `qurban-batch-card.tsx`, `qurban-shared.tsx` (+ cek data staging).
3. U3-05. Berkas: `components/zakat/zakat-calculator.tsx` (MaalCalculator,
   SummaryCard); logika inti `packages/core/src/zakat/calculator.ts` tidak
   berubah.
4. U3-06, U3-08 (+ cek U3-09). Berkas: `wakaf/waqf-donate-form.tsx`,
   `infaq/infaq-view.tsx`, `zakat/zakat-checkout.tsx`,
   `qurban/qurban-checkout.tsx`, `auth/register-view.tsx`, komponen penanda
   wajib baru di `components/ui/`.
5. U3-07. Berkas: `components/auth/register-view.tsx`,
   `routes/auth/-components/register-form.tsx`, tes komponen.

Verifikasi: tes komponen/unit; skrip Playwright viewport ponsel untuk alur
qurban dan komentar (asersi: tombol terlihat dan dapat diklik, tidak tertutup
elemen lain); `check-types` dan seluruh suite hijau.

### Fase 2 — Polish form dan edukasi (≈ 1 hari)

U3-10, U3-11, U3-13, U3-14, U3-17, U3-18, U3-19, U3-20.
Berkas: `waqf-donate-form.tsx` (Doa & Harapan), `zakat-calculator.tsx` dan
komponen dialog Asnaf baru, `history/transaction-history.tsx` +
`orpc/router/transactions.ts`, `profile/profile-edit-view.tsx` +
`orpc/router/user.ts` (hapus foto), `desktop-sidebar.tsx`,
`qurban/qurban-detail.tsx`, `infaq/infaq-view.tsx`.

### Fase 3 — Notifikasi, kuis, Tanya Amwal (≈ 1,5 hari)

- U3-12: notifikasi pembayaran. Berkas: `packages/core/src/notification.ts`,
  `packages/core/src/payment/webhook.ts` (hanya sisipan idempoten setelah
  settlement), tes webhook dan notifikasi; toast di halaman status.
  Pertimbangkan migrasi bila kolom tautan transaksi diperlukan (aditif).
- U3-15: `education-article-detail-view.tsx`, `education-detail.tsx`.
- U3-16: `components/chat/chat-panel.tsx` (render jawaban dan sumber).

### Fase 4 — Backlog dan UAT ulang (≈ 0,5 hari + sesi uji)

U3-21 (grafik profil, program mendesak di beranda) bila waktu ada; selesaikan
V (U3-22–25) setelah jawaban; jalankan UAT #4 singkat: ulang 16 skenario
dengan matriks perangkat yang **dicatat per responden** (Android, iPhone, iPad,
laptop), target task success ≥ 95%, SEQ ≥ 6, SUS ≥ 75.

## 4. Pertanyaan terbuka untuk keputusan

1. Perangkat apa yang dipakai tiap responden? (menentukan viewport uji ulang)
2. U3-22, U3-23, U3-25: maksud komentar di atas.
3. U3-34: apakah batas bayar boleh dipersingkat, dan berapa?
4. U3-20: cukup memperjelas teks anonim, atau default anonim untuk infaq?
5. Fase 3 menyentuh webhook pembayaran: setuju notifikasi dibuat di dalam
   transaksi settlement yang sama (atomik), dengan tes duplikasi webhook?
