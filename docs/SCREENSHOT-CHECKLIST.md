# Checklist Screenshot Antarmuka Amwal — HKI, Paper HETI, Laporan UAT

Disusun dari audit `apps/web/src/routes/` dan komponen UI, 16/10/2026.
Dokumen ini adalah rencana; eksekusinya otomatis lewat `scripts/video/capture-screenshots.mjs`.

## 1. Aturan umum

**Viewport** (sesuai breakpoint Tailwind app: `md` = 768 px, `lg` = 1024 px):

| Kode | Ukuran | Yang tampil |
|---|---|---|
| **L** Laptop | 1440×900 | Sidebar kiri (`md:flex`), kolom ganda, kartu ringkasan sticky |
| **P** Pad | 820×1180 | Sidebar kiri tetap tampil, **satu kolom**, bilah bayar bawah (`lg:hidden`) tampil, tanpa bottom nav |
| **M** Mobile | 390×844 | Bottom nav (`md:hidden`), bilah bayar bawah, top app bar |

Pad bukan "laptop yang dipersempit" maupun "mobile yang dilebarkan": ia punya
sidebar sekaligus tata letak satu kolom. Itu sebabnya tampilan ini layak
masuk dokumen untuk layar donasi dan qurban.

**Prioritas** (kolom `Vp`):
- **★ L+P+M**: layar inti dan yang berbeda nyata di tiap ukuran.
- **◐ L+M**: layar yang tata letaknya praktis sama di Pad.
- **○ L saja**: layar admin dan dokumen A4 (admin dirancang desktop-first).

**Akun demo** (password `Amwal123!`): `wakif@amwal.local` (donatur),
`admin@amwal.local`, `nadzir@amwal.local`, `petugas@amwal.local`. "Tamu" =
tanpa login. Gunakan hanya DB demo `amwal_video_demo` (env `.env.video`),
**jangan** `.env` produksi.

**Resolusi**: skala 2× (`deviceScaleFactor: 2`) untuk dokumen cetak; full-page
untuk halaman panjang, kecuali dicatat "viewport saja".

## 2. Persiapan data (sekali, sebelum menjepret)

1. Seed: `seed.ts`, `seed-qurban-demo.ts`, `seed-video-demo.ts`, lalu
   `warmup-donations.mjs` agar dana terkumpul/statistik tampil bukan 0.
2. Data yang **belum ada di seed** dan harus disiapkan: transaksi **PENDING**
   milik `wakif@` (untuk B5, H2), 3+ donasi infaq **lunas** termasuk satu
   "Hamba Allah" (C2), nomor BWI + kontak publik pada `DEMO-NADZIR-01` (G1),
   satu transaksi lunas wakaf yang memiliki sertifikat (G2, H5).
3. Bersihkan akun uji (`uat3*@example.com`) dan transaksi percobaan dari DB
   demo supaya daftar riwayat dan donatur rapi.
4. Port: bila `localhost:3000` terpakai aplikasi lain, jalankan Amwal di port
   lain dan set `VIDEO_BASE_URL`.

## 3. Checklist per modul

Kolom **State** = kondisi yang harus aktif sebelum menjepret.

### A. Beranda & navigasi publik

| ID | Layar | URL | State | Vp |
|---|---|---|---|---|
| A1 | Beranda tamu: hero, **kartu statistik dampak**, program pilihan | `/` | Tamu; warmup donasi sudah jalan | ★ |
| A2 | Beranda donatur: kartu poin/XP pribadi | `/` | Login `wakif@` | ◐ |
| A3 | Navigasi: sidebar (L/P) dan bottom nav (M) | `/` | Viewport saja, tanpa scroll | ★ |
| A4 | Masuk | `/masuk` | Tamu | ◐ |
| A5 | Daftar akun (validasi: fokus ke isian salah) | `/daftar` | Kirim kosong sekali agar pesan galat tampil | ◐ |
| A6 | Syarat & Ketentuan, Pusat Bantuan | `/syarat-ketentuan`, `/bantuan` | Tamu | ○ |

### B. Modul Wakaf

| ID | Layar | URL | State | Vp |
|---|---|---|---|---|
| B1 | Katalog program wakaf | `/wakaf` | 3 program LIVE tampil | ★ |
| B2 | Detail program (progres, **kartu nazhir yang bisa diklik**, legalitas) | `/wakaf/DEMO-WQF-MASJID` | Tamu; scroll penuh | ★ |
| B3 | Form donasi: stepper, nominal, identitas, **Doa & Harapan**, metode bayar, **ringkasan sticky** | `/wakaf/DEMO-WQF-MASJID/donate` | Nominal terisi, QRIS dipilih | ★ |
| B4 | Form dengan galat validasi | sama | Kirim tanpa nominal | ◐ |
| B5 | Halaman status: **instruksi QRIS/VA (menunggu bayar)** | `/wakaf/status?orderId=…` | Pesanan baru provider mock | ★ |
| B6 | Halaman status sukses | sama | Setelah webhook simulasi (`/api/dev/mock-webhook`) | ◐ |
| B7 | Daftar donatur program | `/wakaf/DEMO-WQF-MASJID/donatur` | Ada donasi lunas | ◐ |

### C. Modul Infaq

| ID | Layar | URL | State | Vp |
|---|---|---|---|---|
| C1 | Form infaq + ringkasan sticky + opsi anonim | `/infaq` | Nominal preset dipilih | ★ |
| C2 | **Tabel donatur infaq publik** | `/infaq` (scroll ke bawah) | 3+ donasi lunas, satu Hamba Allah | ★ |
| C3 | Status infaq | `/infaq/status?orderId=…` | Pesanan menunggu bayar | ◐ |

### D. Modul Zakat

| ID | Layar | URL | State | Vp |
|---|---|---|---|---|
| D1 | Kalkulator **Fitrah** (jumlah jiwa + daftar nama bernomor) | `/zakat/kalkulator` | Jiwa = 3, nama terisi | ★ |
| D2 | **Zakat Maal di bawah nisab** (panel kuning, progres, ajakan infaq) | sama, tab Maal | Gaji 3.000.000 | ★ |
| D3 | **Zakat Maal di atas nisab** (hijau, tombol Bayar, ≈ per bulan) | sama | Gaji 50.000.000 | ★ |
| D4 | Dialog **Panduan 8 Asnaf & Syarat Zakat Mal** | sama | Dialog terbuka | ◐ |
| D5 | Checkout zakat (identitas tamu, metode bayar) | `/zakat/checkout?...` | Dari tombol Bayar D3 | ◐ |
| D6 | Status zakat | `/zakat/status?orderId=…` | — | ○ |

### E. Modul Qurban

| ID | Layar | URL | State | Vp |
|---|---|---|---|---|
| E1 | Katalog qurban (tab Kambing) + langkah + nilai tambah | `/qurban` | — | ★ |
| E2 | Tab Sapi: Kolektif 1/7 dan **Individu (Sapi Utuh)** | `/qurban` | Dua tangkapan, mode berbeda | ◐ |
| E3 | Detail batch qurban + **bilah bayar bawah** | `/qurban/DEMO-HWB-SAPI02` | M/P: bilah terlihat di dasar layar (bukti perbaikan UAT) | ★ |
| E4 | **Checkout sapi utuh, 7 kolom nama shohibul** | `/qurban/checkout?batchId=DEMO-HWB-SAPIUTUH01` | Tambah Nama ×6, tombol hilang di 7 | ★ |
| E5 | Status qurban | `/qurban/status?orderId=…` | Pesanan menunggu bayar | ◐ |
| E6 | Paket penuh (tombol "Penuh") | `/qurban` | Kambing 1 (`PENUH`) | ○ |

### F. Edukasi & AI

| ID | Layar | URL | State | Vp |
|---|---|---|---|---|
| F1 | Katalog edukasi **tamu** (tanpa badge XP) | `/edukasi` | Tamu | ★ |
| F2 | Katalog edukasi **donatur** (badge XP, skor) | `/edukasi` | Login | ◐ |
| F3 | Artikel (baca) | `/edukasi/demo-ilmu-faraidh-dijamin-bisa-bagi-waris` | Tamu | ★ |
| F4 | Kuis artikel: soal terbuka, lalu hasil | sama, tab Kuis | Tamu lulus → **banner ajakan masuk** | ◐ |
| F5 | Kuis 8 Asnaf | `/edukasi/8-asnaf` | Hasil lulus (login: tampil +100 XP) | ◐ |
| F6 | **Modal komentar** | artikel di F3 | Login; M: tombol "Kirim Komentar" terlihat | ◐ |
| F7 | Halaman **Tanya Amwal** (tamu, dengan catatan batas) | `/tanya-ai` | Satu pertanyaan sudah dijawab | ★ |
| F8 | **Widget chat mengambang** terbuka | halaman mana pun | Widget terbuka | ◐ |

### G. Lembaga & transparansi

| ID | Layar | URL | State | Vp |
|---|---|---|---|---|
| G1 | **Profil nazhir publik**: nomor BWI, kontak, wilayah, program aktif | `/lembaga/DEMO-NADZIR-01` | BWI + kontak publik terisi | ★ |
| G2 | **Verifikasi sertifikat** (tujuan QR) | `/verifikasi/<nomor sertifikat>` | Nomor dari sertifikat B6 | ◐ |

### H. Transaksi & dokumen keluaran

| ID | Layar | URL | State | Vp |
|---|---|---|---|---|
| H1 | **Riwayat donatur** (badge Menunggu Pembayaran dan Berhasil) | `/riwayat` | Login; ada PENDING + LUNAS | ★ |
| H2 | **Detail transaksi pending**: instruksi bayar, hitung mundur, tombol Lanjutkan | `/riwayat/<id>` | Transaksi PENDING | ★ |
| H3 | Detail transaksi lunas: Unduh PDF, Lihat Kuitansi | `/riwayat/<id>` | Transaksi LUNAS | ◐ |
| H4 | **Modal kuitansi** | sama | Modal terbuka | ◐ |
| H5 | **Kuitansi cetak A4** | sama | PDF/pratinjau cetak (emulasi `print`) | ○ (1 halaman) |
| H6 | **Sertifikat PDF A4** berkop (wakaf; zakat; qurban sapi utuh 7 nama) | unduhan | Tiga PDF | ○ (3 halaman) |
| H7 | Lacak pesanan tamu | `/transaksi/<orderId>` | Pesanan tamu | ◐ |
| H8 | Notifikasi | `/notifikasi` | Ada notifikasi admin | ◐ |
| H9 | Profil, ubah profil (unggah foto), keamanan | `/profil`, `/profil/edit`, `/profil/keamanan` | Login; foto terunggah | ◐ |
| H10 | Poin Berkah | `/dashboard/poin-berkah` | Login | ◐ |

### I. Admin / Amil (Laptop saja, 1440×900)

| ID | Layar | URL | State | Vp |
|---|---|---|---|---|
| I1 | Dasbor admin (KPI, grafik) | `/admin` | Login admin | ○ |
| I2 | **Workbench program wakaf** + kelola progres/unggah kuitansi | `/admin/wakaf` | Dialog Kelola Progres terbuka | ○ |
| I3 | Verifikasi nazhir: tab Terverifikasi + modal **Ubah Data Publik** | `/admin/nadzir-verifikasi` | Modal terbuka | ○ |
| I4 | Modul Zakat: tab **Penyaluran 8 Asnaf** + modal Catat Penyaluran | `/admin/ziswaf/zakat` | Satu penyaluran tercatat | ○ |
| I5 | Modul Qurban: Katalog & Stok + form **Tambah Hewan (unggah foto)** | `/admin/ziswaf/qurban` | Pratinjau foto tampil | ○ |
| I6 | Modul Infaq | `/admin/ziswaf/infaq` | — | ○ |
| I7 | **Matriks hak akses** (checkbox) | `/admin/roles` | — | ○ |
| I8 | Manajemen pengguna | `/admin/users` | — | ○ |
| I9 | Edukasi admin + pengelola kategori | `/admin/edukasi?kategori=artikel` | Modal kategori terbuka | ○ |
| I10 | Master Data + pintasan Kategori Edukasi | `/admin/master-data` | Scroll ke kartu pintasan | ○ |
| I11 | Transparansi / dokumen | `/admin/transparansi`, `/admin/dokumen` | — | ○ |
| I12 | Dasbor nazhir | `/nadzir/dashboard` | Login `nadzir@` | ○ |

## 4. Ringkasan jumlah

Dieksekusi otomatis oleh `scripts/video/capture-screenshots.mjs` (lihat
`scripts/video/README.md`). Perbedaan dari rencana awal: E6 (paket penuh)
digabung ke E1 karena kartu "Penuh" sudah tampil di katalog, sehingga
**59 layar**; layar dengan beberapa kondisi (kuis, modal, tab) menghasilkan
lebih dari satu berkas. Hasil akhir: **142 berkas** (laptop 71, pad 22,
mobile 49) di `screenshots/`, lengkap dengan `screenshots/README.md`.

- ★ (3 viewport): 20 layar
- ◐ (2 viewport): 23 layar
- ○ (1 viewport): 16 layar (E6 digabung ke E1)

Untuk paper dengan ruang terbatas, pakai tiga set yang paling kuat:
**B3, D2/D3, E3/E4, G1, H2, I4** (fitur yang menjadi kebaruan dan perbaikan UAT).
