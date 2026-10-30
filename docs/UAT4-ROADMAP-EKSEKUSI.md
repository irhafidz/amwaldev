# Roadmap Eksekusi — UAT #4 "View Admin & Amil" (16 Oktober 2026)

Sumber: Google Sheets "UAT 4 - Amwal Heti Admin 2026" (tab `Template`,
`User 1 Mas Atiq`, `User 2 - Mbak Liha`, `User 3 - Mbak Mutia`,
`User 4 - Mbak Thalia`, `User 5 - Mba Nurul`, `User 6 - Mbak Yasmin`,
`Rangkuman`; dibaca lewat konektor Google Sheets, 18/10/2026). Target uji:
`https://amwal.id/admin`, Jumat 16/10/2026 pukul 13–15 WIB di Masjid Manarul
Ilmi. Dokumen ini **hanya rencana: belum ada kode yang diubah.**

Format ID: `U4-nn`. Akar masalah yang sudah dicocokkan dengan kode ditandai
**[terkonfirmasi]**; yang belum bisa dibuktikan dari membaca kode ditandai
**[hipotesis]** dan harus direproduksi dulu sebelum dikerjakan. Rujukan kode
memakai nama berkas + baris pada commit `1be6109`.

## 0. Catatan kualitas data sheet (baca dulu)

1. **Tab `Rangkuman` belum diisi dan bukan milik UAT #4.** Isinya templat sisa
   UAT #1 (judul "18 September 2026", partisipan "Mas Melvin, Mbak Nurul, Mba
   Taqiya"), semua sel rumus `#DIV/0!`, dan kalimat kesimpulan statis ("SUS
   54.17 dan SEQ 6.49") tidak berasal dari data ini. Seluruh angka di bawah
   **dihitung ulang dari tab per responden**; Rangkuman perlu diisi ulang
   dengan angka di §1.
2. **Format durasi tidak seragam.** `m:ss` (Muthia, Yasmin, sebagian Atiq),
   `m.ss` (Liha, Atiq, Nurul), teks ("1 menit 56 detik", Thalia), dan bilangan
   bulat yang jelas berarti detik (Nurul). Angka satu digit seperti `0.1`,
   `2.1`, `0.5` dibaca sebagai `0:10`, `2:10`, `0:50` (Sheets membuang nol di
   belakang). Nilai `20.2` (Nurul, T10) tidak bisa ditafsirkan dan **dibuang**.
   Durasi dihitung hanya dari tugas sukses; baris kosong tidak dihitung.
   Anggap durasi sebagai indikatif, bukan hasil ukur presisi.
3. **Penomoran tugas tidak sama.** Tab Mbak Mutia tidak punya baris Video
   Edukasi (12–14), sehingga nomor 12–20 bergeser sembilan ke bawah; saya
   petakan kembali ke nomor templat (15–23). Mbak Liha dan Mba Nurul menulis
   "Pencatatan Infaq/Zakat" pada baris yang di templat bernama "Program
   Infaq/Zakat".
4. **Status kosong.** Mbak Yasmin T17 tanpa status tetapi ada durasi dan SEQ 7
   dihitung **sukses**; T18–T20 tanpa status dengan catatan "belum ada"
   dihitung **gagal (fitur tidak ada)**. Tugas yang kosong total (Video
   Edukasi untuk Atiq, Liha, Thalia, Yasmin) dianggap **tidak diuji**.
5. **SUS Mba Nurul butir 6** ("banyak hal tidak konsisten") dijawab 5 dengan
   catatan "sudah konsisten": hampir pasti salah baca butir negatif. Bila
   dikoreksi ke 1, SUS Nurul naik dari 65,0 ke 75,0 dan rata-rata dari 65,0
   ke 66,7.
6. **Bias fasilitator:** Mbak Mutia diuji oleh fasilitator yang juga pengembang
   (kolom "Tester: Bara"); catatan tester Atiq dan Thalia kosong. Pertahankan
   pencatat netral pada UAT berikutnya.

## 1. Ringkasan hasil

### Responden

| Responden | Divisi | Usia | Tugas dicatat | Sukses | Tidak sukses | Task Success | SEQ rata-rata | SUS | Durasi rata-rata/tugas |
|---|---|---|---|---|---|---|---|---|---|
| Mas Atiq | Media (Desain Grafis) | 23 | 20 | 17 | 3 | 85,0% | 6,88 (17) | 57,5 | 0:57 |
| Mbak Liha | Finance YMI | 30–40 | 20 | 19 | 1 | 95,0% | 6,32 (19) | **45,0** | 1:15 |
| Mbak Mutia | Konten Strategis | 24 | 20 | 17 | 3 | 85,0% | 6,81 (16) | 82,5 | 2:30 (11 tugas) |
| Mbak Thalia | Fundraising | 24 | 20 | 20 | 0 | 100% | 6,65 (20) | 70,0 | 0:53 |
| Mba Nurul | Fundraising | 27 | 23 | 20 | 3 | 87,0% | 6,65 (20) | 65,0 (75,0*) | 1:10 |
| Mbak Yasmin | Video Editor | 25 | 20 | 17 | 3 | 85,0% | 7,00 (17) | 70,0 | 0:44 |
| **Total** | | | **123** | **110** | **13** | **89,4%** | **6,71** (109 nilai) | **65,0** (66,7*) | |

\* setelah koreksi butir 6 (§0.5). Angka dalam kurung pada kolom SEQ =
jumlah tugas bernilai (tugas gagal tidak diberi SEQ).

- **SUS 65,0** berada di bawah rata-rata industri (68), "bisa dipakai tetapi
  perlu pembiasaan". Rentangnya sangat lebar (45,0 s.d. 82,5) dan enam orang
  sepakat pada dua hal: mudah dipahami (butir 2 "rumit" rata-rata 1,8 dan
  butir 8 "membingungkan" 1,7) tetapi butuh pendampingan di awal (butir 4 =
  3,7 dan butir 10 = 4,5 dari 5). Ini
  masalah **onboarding**, bukan ketidakbisaan memakai.
- **SEQ 6,71 dari 7**: tugas yang berhasil terasa mudah. Skor ≤ 5 hanya
  muncul pada tugas *membuat* (Buat Program Wakaf, Buat Artikel & Kuis, Buat
  Sematan YouTube, Buat Program Infaq, Buat Program Qurban). Edit dan Hapus
  hampir semuanya 7.

### Dekomposisi 13 tugas yang tidak sukses

| Kategori | Jumlah | Rincian |
|---|---|---|
| **Bug / defek UX nyata** | 3 | Atiq T4 (input "080%"), Atiq T7 dan T8 (artikel/kuis hilang saat refresh) |
| **Usulan desain** yang dicatat "Failed" | 1 | Liha T22 (Edit Program Qurban): isinya usul menyatukan katalog & stok |
| **Fitur tidak ada di produk** | 9 | Upload Video Edukasi / Edit / Hapus (Nurul 3); "Program Zakat" buat/edit/hapus (Muthia 3, Yasmin 3). Lihat §4 |

Jika tugas yang fiturnya memang belum ada (T12–T14 dan T18–T20 pada responden
yang tidak mendapati objeknya) dikeluarkan, Task Success = **110 dari 114 =
96,5%**; empat sisanya adalah tiga bug dan satu usulan desain di atas.

### Per tugas (sukses/dicatat, SEQ, durasi rata-rata tugas sukses)

| # | Tugas | Sukses | Rate | SEQ | Durasi | Catatan |
|---|---|---|---|---|---|---|
| 1 | Login dashboard admin | 6/6 | 100% | 7,00 | 0:28 | |
| 2 | Buat Program Wakaf | 6/6 | 100% | 6,50 | 3:00 | median 2:36; SEQ 5 (Liha); modal tertutup tak sengaja |
| 3 | Edit Program Wakaf | 6/6 | 100% | 7,00 | 0:48 | |
| 4 | Kelola Progress Program Wakaf | 5/6 | 83,3% | 6,40 | 4:01 | **terlama** (median 2:24; Muthia 8:24) |
| 5 | Hapus Program Wakaf | 6/6 | 100% | 7,00 | 0:24 | |
| 6 | Buat Artikel dan Kuis | 6/6 | 100% | 6,33 | 3:31 | SEQ 5 (Muthia) |
| 7 | Edit Artikel dan Kuis | 5/6 | 83,3% | 7,00 | 0:51 | gagal: Atiq |
| 8 | Hapus Artikel dan Kuis | 5/6 | 83,3% | 7,00 | 0:08 | gagal: Atiq |
| 9 | Buat Sematan Video YouTube | 6/6 | 100% | **6,17** | 1:30 | SEQ 5 (Liha, Nurul); "bingung melanjutkan" |
| 10 | Edit Sematan Video YouTube | 6/6 | 100% | 6,83 | 0:30 (3 nilai) | |
| 11 | Hapus Sematan Video YouTube | 6/6 | 100% | 7,00 | 0:10 (4 nilai) | |
| 12–14 | Upload / Edit / Hapus Video Edukasi | 0/1 | — | — | — | hanya Nurul yang mencoba; fitur tidak ada |
| 15 | Buat Program Infaq | 6/6 | 100% | **6,17** | 1:43 | SEQ 5 (Atiq, Thalia) |
| 16 | Edit Program Infaq | 6/6 | 100% | 6,83 | 0:20 | |
| 17 | Hapus Program Infaq | 6/6 | 100% | 6,83 | 0:15 | |
| 18 | Buat Program Zakat | 4/6 | 66,7% | 6,25 | 1:08 | 2 orang: "belum ada" |
| 19 | Edit Program Zakat | 4/6 | 66,7% | 6,75 | 0:24 | |
| 20 | Hapus Program Zakat | 4/6 | 66,7% | 6,75 | 0:17 | |
| 21 | Buat Program Qurban | 6/6 | 100% | 6,33 | 1:46 | SEQ 5 (Liha) |
| 22 | Edit Program Qurban | 5/6 | 83,3% | 7,00 | 0:28 | gagal: Liha (usul desain) |
| 23 | Hapus Program Qurban | 6/6 | 100% | 7,00 | 0:05 | |

Per modul: Login 100% · Wakaf (T2–5) 95,8% · Artikel & Kuis (T6–8) 88,9% ·
YouTube (T9–11) 100% · Infaq 100% · Qurban 94,4% · Zakat 66,7% (tertekan
fitur tidak ada) · Video Edukasi 0% (fitur tidak ada). SEQ per modul
seragam 6,6–6,8.

**Bacaan utama:** alur CRUD admin sudah matang. Beban ada di tiga tempat:
(1) form pembuatan yang panjang (Wakaf, Artikel/Kuis), (2) halaman Kelola
Progress yang paling lama dan paling banyak catatan (4 dari 6 orang
berkomentar), (3) kerapian input (nominal, persentase, wilayah).

## 2. Matriks analisis temuan

Kolom "Bukti" menunjuk tab responden dan nomor tugas (T#).

### 2.1 Pencocokan dengan lima butir yang diminta

#### U4-01 — Input persentase progres fisik menjadi "080%" [terkonfirmasi]

- **Bukti:** Atiq T4 (Failed): "persentasenya ga automatis ke hapus untuk angka
  0 nya, ketika di input jadinya 080% dan bukan 80%".
- **Kode:** `components/admin/wakaf-programs-view.tsx:2250-2264` (input),
  `:1586` (`handleSliderChange`), `:1595` (`handleSaveProgressFisik`).
- **Akar masalah:** input `type="number"` yang *controlled* dengan
  `value={selectedProgram.progressFisik}` (bertipe angka). Saat admin
  menghapus isi, `Number.parseInt('')` → `NaN` → dipaksa `0`, sehingga kolom
  menampilkan `0`. Mengetik `8` menghasilkan `"08"` di DOM; `parseInt` → `8`,
  state menjadi `8`, tetapi React **tidak menulis ulang** nilai DOM karena
  `"08"` secara numerik sama dengan `8`. Ketik `0` lagi → `"080"` → `80`.
  Tampilan "080" itulah yang dilihat penguji; nilai yang tersimpan memang 80.
- **Solusi teknis:** pisahkan *teks yang diketik* dari *angka yang disimpan*.
  Simpan string draft lokal; `type="text"` + `inputMode="numeric"`;
  `onChange` hanya meloloskan digit, membuang nol di depan
  (`replace(/^0+(?=\d)/, '')`), dan membatasi ke 100; `onFocus` memilih seluruh
  isi supaya mengetik langsung menimpa; angka dikomit ke state saat blur dan
  saat Simpan. Tambahkan penggeser (`@radix-ui/react-slider` sudah terpasang,
  belum dipakai; label 0%/50%/100% di bawah kolom jelas dirancang untuk
  penggeser) sebagai masukan kasar dua arah. Kontrak server
  (`packages/core/src/contracts/admin-waqf.ts:27`, `0–100`) sudah benar.
  Fungsi pembersih ditulis murni dan diberi tes `bun test`.
- **Cakupan sama:** semua `type="number"` terkontrol lain memakai state string,
  jadi tidak mengalami "080"; masalahnya ada di U4-10.

#### U4-02 — Provinsi (dan wilayah lain) tidak bisa dicari [terkonfirmasi]

- **Bukti:** Nurul T2: "dibagian provinsi tidak bisa di search, harus cari
  satu-satu, biar gak scroll satu-satu".
- **Kode:** `wakaf-programs-view.tsx:3750-3850` (Provinsi, Kab/Kota,
  Kecamatan, Kelurahan), `components/ui/select-field.tsx`.
- **Akar masalah:** keempat kolom memakai `SelectField` = pembungkus **Radix
  Select**. Radix Select hanya mendukung *typeahead* (ketik huruf pertama saat
  daftar terbuka), tidak punya kotak cari yang terlihat, dan tidak bisa diberi
  `<input>` di dalamnya (bentrok fokus/typeahead). Provinsi ±38 baris masih
  tertolong; Kelurahan bisa ratusan baris (katalog Kepmendagri ±91 ribu baris,
  difetch per jenjang oleh `router/wilayah.ts`), di sana scroll satu-satu
  benar-benar menyiksa.
- **Solusi teknis:** komponen baru `SearchableSelect` di `components/ui/`
  dengan antarmuka sama seperti `SelectField` (`value`, `onChange` membaca
  `event.target.value`, anak `<option>`), sehingga penggantian di empat kolom
  hanya mengganti nama komponen. Implementasi: tombol pemicu + **Radix
  Popover** (dependensi baru satu paket `@radix-ui/react-popover`, satu
  keluarga dengan Select yang sudah ada) berisi kotak cari + daftar terfilter
  (abaikan huruf besar/kecil dan diakritik, tampilkan maks. 100 baris dengan
  petunjuk "ketik untuk mempersempit"), navigasi panah/Enter/Esc, `role=
  "combobox"`/`listbox`. Tidak perlu `cmdk`. Berguna juga untuk pilihan bank
  dan kategori yang panjang.

#### U4-03 — Modal Buat Program tertutup saat klik di luar, isian hilang [terkonfirmasi]

- **Bukti:** Atiq T2: "klik di luar tab mungkin bisa di-adjust supaya tidak
  terulang/kesimpan sebagai draft"; Liha T2 (SEQ 5): "saat isi form, stay pop up
  sampai terisi supaya tidak mengisi ulang".
- **Kode:** `wakaf-programs-view.tsx:3152-3160` (`onClick` pada latar:
  `e.target === e.currentTarget` → `setShowModal(false)`), `:870-895` (Esc
  juga menutup tanpa tanya), `:1144-1181` (`handleOpenAddModal` **mengosongkan
  seluruh `formData`** tiap dibuka). Pola latar-menutup yang sama ada di
  `qurban-modals.tsx:212-214` dan `:1150-1152`, dan `users-modals.tsx:62-64`.
- **Akar masalah:** form panjang (nama, banner, RAB, legalitas, rekening,
  wilayah bertingkat, dst.) hidup di dalam modal yang menutup pada satu klik
  nyasar/Esc, lalu membuka modal lagi me-reset form. Tidak ada deteksi
  "belum disimpan".
- **Solusi teknis (dua lapis, dikerjakan bersama):**
  1. *Cegah:* untuk modal **form** latar tidak menutup (hanya tombol X, Batal,
     dan Esc). Esc dan X bertanya lewat `confirmAction` yang sudah ada
     (`components/ui/confirm-action.tsx`) **hanya bila form kotor** (bandingkan
     `formData` dengan nilai awal). Modal informasi/pratinjau tetap boleh
     ditutup dengan klik di luar.
  2. *Pulihkan:* simpan draft isian teks ke `sessionStorage` (kunci
     `amwal:wakaf-draft:<userId>`; **tanpa** banner/PDF base64 yang besar) dan
     tawarkan "Lanjutkan draft?" saat membuka modal; hapus draft setelah
     sukses simpan. Ini juga menjawab "kesimpan sebagai draft" milik Atiq.
  Implementasi terbaik di primitif `Modal` bersama (`qurban-modals.tsx:212`)
  dengan prop `dismissOnBackdrop` dan `isDirty`, lalu dipakai Wakaf, Qurban,
  Pengguna.

#### U4-04 — Artikel/kuis "hilang" saat refresh atau menekan Edit [terkonfirmasi sebagian + hipotesis]

- **Bukti:** Atiq T7 (Failed): "ketika telah membuat artikel dan kuis, ... ingin
  memencet tombol edit atau bahkan refresh laman, artikelnya hilang"; Atiq T8
  (Failed): "bug artikelnya tidak kelihatan ketika direfresh"; SUS Atiq butir
  5: "ada sedikit bug ketika refresh bagian menu artikel"; Muthia T6 (SEQ 5):
  "perlu auto simpan draft saat sesi berakhir".
- **Kode:** `components/admin/education-management-view.tsx:1415-1425`
  (`articleForm`, `hasArticleDraft`), `:1197-1210` (sub-tampilan),
  `:1274-1329` (`fetchEducationArticles`), `lib/orpc/router/admin/education.ts:342-369`
  (`articlesList`).
- **Fakta terverifikasi:** (a) draft artikel dan pembangun kuis **hanya state
  React** (`articleForm`, `articleQuizOptions`, ...). `hasArticleDraft`
  hanya mencegah form dibuang saat pindah tab, bukan saat refresh; muat ulang
  halaman = semua isian dan kuis yang belum diterbitkan lenyap. (b) Prosedur
  `articlesList` di server benar (tidak memfilter status, mengurutkan terbaru).
  (c) `fetchEducationArticles` menelan semua galat (`catch (_err) {}`,
  komentarnya: "dibiarkan senyap ... empty state akan tampil"), sehingga bila
  pemuatan ulang gagal (token kedaluwarsa, jaringan, galat 5xx) admin melihat
  **daftar kosong tanpa pesan** yang persis seperti "artikelnya hilang".
- **Hipotesis yang harus direproduksi:** kalimat Atiq ("artikel yang telah
  dibuat hilang") bisa berarti (1) draft di form (pasti terjadi, lihat a), atau
  (2) daftar artikel kosong setelah refresh di produksi (mungkin lewat c).
  Reproduksi di `amwal.id/admin`: terbitkan artikel, hard-refresh, perhatikan
  tab Network pada `admin.education.articles.list`.
- **Solusi teknis:** (1) tampilkan keadaan galat + tombol "Muat ulang"
  menggantikan `catch` senyap (Wakaf sudah punya pola `loadError` di
  `wakaf-programs-view.tsx:1909`); (2) autosave draft artikel + butir kuis ke
  `localStorage` (kunci per admin, debounce ±800 ms, dihapus saat terbit),
  tawarkan "Lanjutkan draft"; (3) simpan sebagai **Draf** ke server sudah
  didukung (`status: draft|published`), tambahkan tombol "Simpan Draf" yang
  jelas bila belum ada; (4) `articlesList` mengembalikan isi artikel penuh
  untuk semua baris (`content` ikut dikirim); ganti dengan ringkasan saja
  bila daftar membesar (perbaikan performa terpisah, bukan kebutuhan UAT).

#### U4-05 — Blocker pembuatan Program Qurban (kambing) [hipotesis]

- **Bukti:** Nurul T21 (SEQ 6): "opsi tambah kambing masih belum bisa ditambahkan
  karena ada opsi slot kambing sedang, kalau kambing kan nggak perlu slot?";
  SUS butir 5: "tadi masih ada program yang belum bisa dibuat karena terhalang
  mengisi semua isian (slot di bagian tambahan kambing)".
- **Kode:** `components/admin/qurban-modals.tsx:392-420` (form hewan),
  `qurban-module-view.tsx:355-372` (kirim).
- **Temuan:** untuk Kambing kolom Jumlah Slot sudah otomatis `1` dan
  dinonaktifkan; jadi pesan "slot wajib diisi" tidak terbaca dari kode pada
  jalur normal. Kemungkinan penyebab: pengguna mengganti Jenis dari Sapi ke
  Kambing di form yang sudah terisi, atau memakai tombol tambah yang berbeda
  (tombol "Buka Sapi Baru" pada tab Patungan hanya untuk sapi 7 slot,
  `qurban-module-view.tsx:900-905`, sedangkan tombol tambah di tab Katalog
  berada di tempat lain; keluhan Atiq T21 "pencarian tombol menambahkan
  program qurban susah"). Reproduksi dengan Nurul/log ketimbang menebak.
- **Solusi teknis (setelah reproduksi):** perbaiki validasi/keadaan yang
  menghalangi; satukan tombol "Tambah Hewan" di bilah aksi tetap pada tab
  Katalog dengan pilihan jenis di dalamnya; sembunyikan (bukan hanya
  nonaktifkan) Jumlah Slot untuk Kambing.

### 2.2 Kelola Progress Wakaf (tata letak dan UX)

#### U4-06 — Urutan alur: termin → kuitansi/penggunaan; bukti di atas [terkonfirmasi]

- **Bukti:** Liha T4: "posisi termin pencairan terlebih dahulu baru kuitansi,
  ada beberapa termin (lebih kiri) baru ke penggunaan, formnya disamakan dengan
  form bukti"; Muthia T4 (durasi 8:24): "bukti foto kuitansi dan dokumentasi
  bisa dialihkan ke atas"; Yasmin T4: "dokumentasi dan kwitansi lebih baik
  langsung ditampilkan tanpa perlu klik"; Nurul T4: "bukti nota dan dokumentasi
  kegiatan tidak terlihat".
- **Kode:** `wakaf-programs-view.tsx:2238-2308` (kontrol persentase),
  `:2384-2399` (urutan tab: `receipts`, `termin`, `wakif`, `bwi`),
  `:511` (`workbenchTab` awal), `:2401-2640` (satu tab Kuitansi yang
  mencampur dua jenis bukti via pilihan `newReceiptType`), `:2766` (tab Termin).
- **Akar masalah:** (a) Tab pertama dan bawaan adalah Kuitansi, padahal alur
  dana adalah *pencairan termin dulu, baru penggunaan (kuitansi)*, sesuai
  kerangka Finance. (b) Kuitansi belanja dan dokumentasi foto kegiatan, dua
  hal berbeda (uang vs. bukti lapangan), disatukan dalam satu form dengan
  pemilih jenis; jenis "Dokumentasi" tetap menampilkan kolom Vendor dan
  Nominal (Nurul: "dokumentasi kegiatan tidak usah pakai nominal vendor karena
  cuma dokumentasi kita yang menjalankan"). (c) Invarian backend: laporan
  persentase **wajib** punya minimal satu foto bukti (komentar di
  `wakaf-programs-view.tsx:1611`), tetapi foto itu diunggah di tab yang
  tersembunyi di bawah kontrol persentase; admin menekan Simpan Progres lebih
  dulu lalu ditolak. Inilah yang membuat tugas ini terlama (rata-rata 4:01).
- **Solusi teknis (struktur baru, data tidak berubah):**
  - Urutan tab: **Pencairan Termin → Kuitansi Belanja → Dokumentasi
    Kegiatan → Wakif & Kabar WA → Laporan BWI.** Pecah tab Kuitansi menjadi
    dua; flag `isPhotoEvidence` di tabel lampiran sudah membedakannya, jadi
    tidak perlu migrasi.
  - Form **Dokumentasi**: judul kegiatan + unggah banyak foto, **tanpa** vendor
    dan nominal. Form **Kuitansi**: judul, vendor, nominal, berkas; tata letak
    kolom dan gaya tombol disamakan dengan form Termin (permintaan Liha).
  - Di atas kontrol persentase tampilkan **galeri dokumentasi** (kotak
    miniatur terbaru, jumlah foto, tombol "Tambah foto") dan status
    "Bukti foto: n"; tombol Simpan Progres tampil nonaktif dengan alasan
    "Unggah minimal 1 foto dokumentasi dulu" alih-alih galat setelah klik.
  - Daftar kuitansi/dokumentasi menampilkan miniatur di baris (lihat U4-07),
    bukan hanya nama berkas.

#### U4-07 — Preview foto kecil, lag, dan tanpa umpan balik unggah [terkonfirmasi]

- **Bukti:** Muthia T4: "sempat lag saat upload foto"; Nurul T4: bukti nota dan
  dokumentasi "tidak terlihat"; Yasmin T4: tampilkan langsung tanpa klik.
- **Kode:** `wakaf-programs-view.tsx:1118-1142`
  (`handleReceiptFileSelect`), `:2596-2616` (preview), `:1640-1735`
  (`handleAddReceipt`), `:2681-2740` (tabel), `lib/amwal-api/admin.ts:210-248`
  (`uploadProgramReceipt`), `packages/core/src/storage/mime.ts:11`
  (`MAX_RECEIPT_FILE_SIZE_BYTES` = 5 MB).
- **Akar masalah (semuanya terbaca di kode):**
  1. Pratinjau membaca **seluruh** berkas lewat `FileReader.readAsDataURL`
     (string base64 di thread utama, ±133% ukuran asli) lalu menyimpannya di
     state React; foto kamera 4–8 MB membuat UI tersendat. Itulah "lag".
  2. Pratinjau hanya **56 × 56 px** (`h-14 w-14`): bukti tidak "terlihat".
  3. Tidak ada validasi ukuran/tipe di klien. Batas server 5 MB; foto ponsel
     biasanya lebih besar, jadi pengguna menunggu unggah penuh lalu ditolak.
  4. Tombol "Tambah Kuitansi"/"Simpan Dokumentasi" tidak punya keadaan
     *sedang mengunggah* (tidak ada `isUploading`): tak ada spinner, tombol
     tetap aktif (risiko unggah ganda), toast baru muncul di akhir.
  5. Tabel hanya menampilkan **nama berkas** sebagai tautan; melihat isi harus
     klik lalu menunggu pengambilan signed URL (`getReceiptSignedUrl`).
- **Solusi teknis:** `URL.createObjectURL(file)` + `revokeObjectURL` (tanpa
  base64, tanpa penahan memori); validasi tipe dan ukuran sebelum unggah;
  perkecil foto di klien lewat `createImageBitmap` + `canvas.toBlob`
  (sisi terpanjang ≤ 1600 px, JPEG ≈ 0,8) sehingga foto ponsel lolos batas
  5 MB dan unggahan cepat, PDF dibiarkan; `isUploading` (spinner + tombol
  nonaktif + teks "Mengunggah…"); pratinjau besar (`aspect-video`, minimal
  tinggi 160 px) dan miniatur di tiap baris tabel dengan `loading="lazy"` yang
  memicu signed URL saat terlihat. Bila progres persen diperlukan, ganti
  `fetch` dengan `XMLHttpRequest` pada `uploadProgramReceipt` (fetch tidak
  melaporkan progres unggah); jika cukup spinner, tidak perlu.

#### U4-08 — Hapus Program meninggalkan tampilan "loading" [hipotesis]

- **Bukti:** Atiq T4: "pengeditan agak loading karena progress program wakaf
  masih ada tetapi programnya sudah kehapus".
- **Kode:** `wakaf-programs-view.tsx:1554-1580` (`handleDeleteProgram`),
  `lib/orpc/router/admin/waqf.ts:260-320` (`deleteProgram`).
- **Temuan:** server menghapus laporan progres, lampiran, dan buku besar
  program dalam satu transaksi, jadi data yatim tidak mungkin tersisa di DB.
  Yang tersisa adalah **state klien**: setelah hapus, `selectedProgId`
  diarahkan memakai larik `programs` yang *usang* (`programs.find(p => p.id
  !== id)`, closure sebelum `setPrograms`) dan tampilan detail tetap membuka
  program yang baru dihapus (bagian "loading"). Perlu direproduksi:
  hapus program saat panel detailnya terbuka.
- **Solusi teknis:** setelah hapus, kembali ke `activeView='main'` dan kosongkan
  `selectedProgId`; hitung program pengganti dari hasil `setPrograms`
  fungsional.

### 2.3 Tipografi dan hierarki form (Thalia)

#### U4-09 — Teks terlalu kecil; ikon kecil; "di HP belum bisa" [terkonfirmasi sebagian + hipotesis]

- **Bukti:** Thalia T4: "jelas, tapi tulisannya agak kecil"; T10: "icon
  tombolnya agak dibesarkan"; SUS butir 3/5/6: "beberapa icon kecil dan di HP
  belum bisa", "di HP belum bisa meskipun sudah tampil".
- **Kode (terukur):** `wakaf-programs-view.tsx` memakai `text-[10px]` 47 kali,
  `text-[11px]` 44 kali, `text-xs` 52 kali, tetapi `text-sm` hanya 6 kali;
  `infaq-module-view.tsx` 8 + 6 + 30 vs 5; `qurban-modals.tsx` 0 + 7 + 14 vs 3.
  Label formulir, nilai KPI, dan tombol ikon (`h-3.5 w-3.5`, 49 kemunculan di
  Wakaf saja) berada di skala 10–12 px. Tidak ada hierarki antara label,
  isi, dan bantuan.
- **Solusi teknis:** tetapkan skala tipografi admin (bantuan/keterangan 12 px
  minimum, label 13–14 px tebal, isi input 14 px; **16 px pada input di ≤ 640 px**
  agar iOS tidak melakukan zoom otomatis); hapus semua `text-[10px]` dan
  `text-[11px]` kecuali lencana; tombol ikon berukuran sentuh ≥ 40 px dengan
  ikon 18–20 px dan `aria-label`. Kerjakan sebagai penyapuan terjadwal per
  berkas (Wakaf, Infaq, Zakat, Qurban, Edukasi), bukan satu commit raksasa.
- **Hipotesis "di HP belum bisa":** admin tidak pernah masuk skrip screenshot
  mobile (hanya laptop, karena `○` pada daftar layar). Jalankan audit di 390 px
  untuk bilah samping, tabel lebar, dan modal; skrip
  `scripts/video/capture-screenshots.mjs --only I1,I2,I5 --viewports mobile`
  bisa dipakai setelah layar admin dinaikkan ke ◐ (perubahan satu baris per
  layar).

### 2.4 Temuan modul lain

#### U4-10 — Input nominal: panah naik/turun, titik/koma, nol otomatis [terkonfirmasi]

- **Bukti:** Nurul T15: "tombol up down di nominal ga perlu, yang penting ketika
  ketik langsung bisa format accounting"; Atiq T22: "penambahan koma atau titik
  untuk nominal saat pengeditan harga"; Liha T19: "untuk input semua nominal
  bisa tambah nol otomatis supaya menghindari kesalahan pengisian".
- **Kode:** `type="number"` pada `infaq-module-view.tsx:1394,1496`,
  `zakat-module-view.tsx:1030,1169,1480,1498`, `qurban-modals.tsx:431,474,483,799`,
  `wakaf-programs-view.tsx:2534` (nominal kuitansi), `:4035` (hasil),
  `:4525` (edit kuitansi). Hanya "Target Dana"
  (`wakaf-programs-view.tsx:3524-3535`) yang sudah memakai
  `inputMode="numeric"` + `toThousandsDisplay`.
- **Solusi teknis:** satu komponen `RupiahInput` di `components/ui/`
  (membuang non-digit, memformat `id-ID` saat mengetik, menjaga posisi kursor,
  emit string digit murni ke state sehingga kontrak API tidak berubah, tanpa
  panah spinner), mengangkat `toThousandsDisplay` yang sudah ada.
  Tambahkan baris bantu "Terbaca: Rp 5.500.000" (pola sudah ada pada form
  kuitansi) sebagai pengaman salah ketik angka nol, yang menjawab kekhawatiran
  Liha tanpa heuristik "tambah nol" yang berisiko salah nilai. Ganti semua
  sebelas titik di atas.

#### U4-11 — Infaq: lampiran bukti, sinkron dropdown, penempatan program [terkonfirmasi sebagian]

- **Bukti:** Liha T15 (SEQ 6): "untuk pencatatan infaq kurang kolom untuk
  upload lampiran"; Nurul T15: "setelah membuat program baru otomatis
  tersinkron di dropdown input donasi manual biar gak nulis program lagi";
  Atiq T15 (SEQ 5): "penamaan Program Infaq mungkin bisa ditaruh di bawah
  Program Wakaf"; Thalia T15 (SEQ 5): "lupa menunya jadi sedikit bingung".
- **Kode:** `infaq-module-view.tsx:605-625` (tab Ringkasan | Akad & Program),
  `:1394-1500` (form). Pencarian `lampiran|bukti|attachment` pada berkas ini
  **tidak menemukan** apa pun: form donasi manual memang tidak punya unggahan.
- **Solusi teknis:** (a) lampiran bukti donasi manual = kolom/tabel baru +
  rute unggah (pola `POST /api/uploads/receipts` + `programReceiptAttachments`):
  **migrasi aditif 0025** dan tes; (b) sinkron dropdown: **[hipotesis]** daftar
  program donasi manual diambil dari state yang sama dengan tab Program; cek
  apakah daftar di-*refetch* setelah membuat program atau tersaring status;
  (c) tata menu: lihat U4-14.

#### U4-12 — Zakat: banner, kalkulator, jenis zakat, catatan verifikasi [terkonfirmasi sebagian]

- **Bukti:** Liha T18: "banner di atas dihapus aja (yang hijau tua) langsung ke
  informasi krusial"; Nurul T18 (SEQ 6): "jenis zakat harusnya bisa diedit,
  kolom hitung zakat mungkin bisa dimasukkan kalkulator zakat biar bisa
  cross-check nominal"; Nurul T19: "notes apa yang membuat di-verif".
- **Kode:** `zakat-module-view.tsx` (tab Ringkasan, Penyaluran 8 Asnaf,
  Parameter Nisab & Fitrah), `admin-primitives.tsx:103-146` (`AdminPageHeader`,
  kartu hijau `#356152` dengan pola), `master-data-management-view.tsx:68`
  (kategori "Jenis Zakat" sudah dikelola di Master Data).
- **Solusi teknis:** (a) `AdminPageHeader` adalah primitif bersama; usulan Liha
  hanya terasa di Zakat, jadi tambahkan varian `compact` (tanpa pola, tinggi
  setengah) dan pakai di modul Amil, bukan menghapusnya dari semua halaman
  (Wakaf memakai banner untuk aksi utama); (b) "jenis zakat bisa diedit" =
  tautan "Kelola jenis" ke Master Data (pola pintasan yang sudah dipakai
  untuk kategori edukasi), bukan form baru; (c) kalkulator: pakai fungsi
  hitung yang sama dengan kalkulator publik (`components/zakat/zakat-calculator.tsx`
  + parameter nisab di `@amwal/core`) di samping nominal sebagai pembanding
  (bukan pengisi otomatis); (d) catatan verifikasi: tampilkan alasan/catatan
  verifikasi pada baris transaksi, setelah dicek apakah kolomnya ada.

#### U4-13 — Qurban: katalog vs stok, kolom ganda, target penerima [terkonfirmasi sebagian]

- **Bukti:** Liha T22 (Failed): "katalog dan stok fungsinya cukup untuk edit stok
  saja, untuk edit tetap di patungan sapi dsb... 'Jenis hewan' di atas, bawahnya
  baru pilih dan isi"; Nurul T22: "nama hewan harusnya tidak usah karena sudah ada
  jenis, jadi dobel, kambing jawa jenis jawa"; Nurul T23: "katalog dan stok
  hewan... cukup satu saja tapi kelihatan berapa stoknya, misal kambing jawa
  ada 5 stok, jadi bukan 5 program"; Nurul T21: "target penerima manfaat
  seharusnya juga ada di program baru"; Atiq T21: tombol tambah sulit dicari.
- **Kode:** `qurban-module-view.tsx:83` (tab "Katalog & Stok Hewan"),
  `qurban-modals.tsx:381-470` (form: Jenis, Jumlah Slot, Harga per Slot, Nama /
  Tag Hewan, Ras, Grade, Berat, ...).
- **Solusi teknis (hanya tampilan; model data tetap):** satu batch =
  satu ekor fisik dengan slot, RPH, tim juleha, dan dokumentasi sembelih; model
  ini **harus** dipertahankan (§3 K3-04). Di Katalog, **kelompokkan** per
  jenis + ras ("Kambing Jawa: 5 tersedia, 2 terpesan") dengan baris lipat per
  ekor, ganti label "Nama / Tag Hewan" menjadi "Tag internal (opsional)" dan
  buat otomatis dari jenis + ras bila kosong (menghilangkan duplikasi), serta
  satu tombol "Tambah Hewan" tetap di bilah aksi. Kolom "Target Penerima
  Manfaat" pada qurban perlu keputusan produk terlebih dulu (qurban sudah
  punya `wilayahPenyaluran`).

#### U4-14 — Artikel, Kuis, dan YouTube: detail polesan [terkonfirmasi sebagian]

- **Bukti:** Atiq T6: "penambahan kategori baru lebih di-highlight agar
  kelihatan"; Muthia T6: "edit pratinjau perlu seperti tampilan artikel,
  tampilan jawaban benar dan salah tidak perlu dibuka, langsung hijau merah
  saja"; Nurul T6: "opsi kuis di jawaban harusnya bisa dipilih 3/4 jawaban biar
  lebih interaktif"; Nurul T9: "tidak terlihat opsi video, kayak tersembunyi";
  Yasmin T9: "sedikit bingung mencari atau melanjutkan task"; Muthia T10:
  "kedip-kedip tampilan thumbnailnya"; Thalia T10: "tidak bisa menambahkan
  kategori baru saat edit"; Yasmin T15: "tambahkan foto untuk thumbnail atau
  banner" (Infaq).
- **Kode:** `education-management-view.tsx:1425-1432` (pembangun kuis tetap 4
  opsi: `['', '', '', '']`), `:3796-3804` (teks kosong: "Video ... melalui
  'Sematkan Video' **atau 'Upload Berkas'**"), `:2563-2571` (tombol hanya
  "Sematkan Video YouTube"), `youtube-link-field.tsx`,
  `router/admin/education.ts:335-340` (`options: z.array(...).min(2)`).
- **Temuan:** (1) kontrak server menerima **≥ 2 opsi**, jadi kuis 2–6 opsi
  murni perubahan UI; (2) teks pada keadaan kosong menjanjikan "Upload Berkas"
  yang **tidak ada di UI** (salah satu sebab bingung pada T9 dan T12–14);
  (3) kedip thumbnail kemungkinan thumbnail otomatis menggantikan gambar
  setiap `videoUrl` berubah (`videoLinkThumbnailAuto`); **[hipotesis]**,
  perlu direproduksi; (4) pratinjau artikel di admin bukan komponen yang sama
  dengan halaman publik (`components/education/education-detail.tsx`).
- **Solusi teknis:** kuis dengan jumlah opsi dinamis (2–6, tombol "+ Opsi");
  pratinjau memakai komponen detail publik; jawaban benar/salah langsung
  hijau/merah pada pratinjau; kategori baru lewat tombol bergaya sekunder yang
  terlihat jelas di kedua form (buat dan edit) dengan modal kategori yang
  sudah ada; perbaiki teks keadaan kosong dan tampilkan tombol tindakan
  utama di dalam keadaan kosong; dukung banner/thumbnail untuk program infaq
  bila model datanya memiliki kolom gambar (cek skema dulu).

#### U4-15 — Navigasi: program dipisah-pisah [terkonfirmasi sebagian]

- **Bukti:** Atiq T15: "penamaan Program Infaq bisa ditaruh di bawah Program
  Wakaf"; Liha T15: "untuk + program jadi satu di wakaf aja di 'pengawasan
  program' supaya bagian funding lebih mudah... + di kanan, dan jumlahnya di
  atas"; Liha T2: tombol Buat Program "ditaruh kanan saja supaya mata langsung
  ketemu (seperti di proses buat artikel)"; Nurul (catatan akhir): "kenapa
  program wakaf aja yang disendirikan?".
- **Kode:** `components/backoffice/backoffice-sidebar.tsx:90-215`: bagian
  **"Pengawasan Program"** hanya berisi Program Wakaf; Infaq, Zakat, dan Qurban
  ada di bagian terpisah "Monitoring ZISWAF" (dropdown "Modul Amil ZISWAF").
  `wakaf-programs-view.tsx:1916-1925`: "Terbitkan Program Baru" berada di
  `actions` `AdminPageHeader` (kanan atas kartu hijau; pada layar sempit
  `flex-wrap` memindahkannya ke bawah deskripsi, sisi kiri).
- **Solusi teknis:** (a) ubah pengelompokan bilah samping menjadi satu bagian
  **"Program & Dana"** berisi Wakaf, Infaq, Zakat, Qurban sebagai item datar
  berdampingan (tanpa dropdown); hanya penataan `backoffice-sidebar.tsx`,
  tanpa mengubah rute; (b) pastikan tombol aksi utama `AdminPageHeader`
  tetap di kanan pada semua lebar (`shrink-0`, tanpa `flex-wrap` untuk
  tombol) dan seragam di halaman Wakaf, Infaq, Qurban, Edukasi.
  Satu formulir "+ program" lintas jenis **tidak** diusulkan (K3-05).

#### U4-16 — Onboarding admin baru [terkonfirmasi dari SUS]

- **Bukti:** SUS butir 4 (butuh bantuan) rata-rata 3,7, butir 7 (orang lain
  cepat paham) 3,8, butir 10 (perlu pembiasaan) 4,5: Atiq "butuh
  tutorial untuk penggunaan pertama", Liha "program baru jadi perlu beberapa
  pendampingan", Muthia "kalau pertama kali perlu eksplorasi tombol", Thalia
  "untuk menuntun di awal".
- **Solusi teknis (murah):** keadaan kosong yang menjelaskan "apa dan mulai
  dari mana" di tiap modul, tooltip pada ikon aksi, dan satu halaman
  "Panduan Admin" (3–5 tugas utama dengan tangkapan layar, dapat dibuat dari
  `screenshots/` yang sudah otomatis). Bukan tur interaktif pada tahap ini.

## 3. Pengelompokan eksekusi

### KELOMPOK 1 — WAJIB DIEKSEKUSI (bug dan UX admin kritis)

| ID | Masalah | Sumber | Mengapa wajib |
|---|---|---|---|
| U4-01 | Input persentase menjadi "080%" | Atiq T4 | Satu-satunya tugas gagal karena bug input; menyentuh data publik (progres fisik terlihat donatur) |
| U4-02 | Wilayah tidak bisa dicari (Provinsi, Kab/Kota, Kec., Kel.) | Nurul T2 | Dibutuhkan pada setiap pembuatan program; Kelurahan = ratusan baris |
| U4-03 | Modal Buat/Edit Program menutup tak sengaja dan isian hilang | Atiq T2, Liha T2 | Kehilangan data pada form paling panjang; pola sama di Qurban dan Pengguna |
| U4-04 | Draft artikel/kuis hilang saat refresh; galat muat daftar senyap | Atiq T7/T8, Muthia T6 | Dua tugas gagal; mengancam kepercayaan ("artikel hilang") |
| U4-05 | Blocker pembuatan qurban kambing (**setelah reproduksi**) | Nurul T21 | Menghalangi pembuatan konten; belum terbukti dari kode |

### KELOMPOK 2 — POLISH DAN RESTRUKTURISASI (bernilai tinggi)

| ID | Perubahan | Sumber |
|---|---|---|
| U4-06 | Urutan tab Termin → Kuitansi → Dokumentasi; galeri bukti di atas kontrol persentase; Simpan Progres tanpa kejutan | Liha, Muthia, Yasmin, Nurul T4 |
| U4-07 | Preview besar, miniatur di tabel, perkecil foto, status unggah | Muthia, Nurul, Yasmin T4 |
| U4-08 | Perbaikan keadaan setelah hapus program (**hipotesis**) | Atiq T4 |
| U4-09 | Skala tipografi admin, target sentuh ikon, audit mobile 390 px | Thalia |
| U4-10 | `RupiahInput` untuk semua nominal | Nurul, Atiq, Liha |
| U4-11 | Infaq: lampiran bukti (migrasi 0025), sinkron dropdown | Liha, Nurul |
| U4-12 | Zakat: banner kompak, tautan Master Data, kalkulator pembanding | Liha, Nurul |
| U4-13 | Qurban: katalog dikelompokkan per jenis, hapus duplikasi Nama/Jenis | Liha, Nurul |
| U4-14 | Kuis opsi dinamis, pratinjau seperti artikel, kategori terlihat, copy video | Atiq, Muthia, Nurul, Thalia, Yasmin |
| U4-15 | Bilah samping "Program & Dana", posisi tombol aksi | Atiq, Liha, Nurul |
| U4-16 | Keadaan kosong penuntun + halaman Panduan Admin | SUS (semua) |

### KELOMPOK 3 — DITANGGUHKAN / DI LUAR LINGKUP

| ID | Masukan | Alasan ditangguhkan |
|---|---|---|
| K3-01 | **Unggah berkas Video Edukasi** (T12–14; Nurul "Failed") | Fitur belum ada di UI (hanya sematan YouTube; skema memiliki `source_type='upload'`). Butuh keputusan penyimpanan, bandwidth, dan batas ukuran di VPS. Sementara: koreksi teks keadaan kosong (U4-14) dan keluarkan T12–14 dari skrip UAT berikutnya. |
| K3-02 | **"Program Zakat" (buat/edit/hapus)** (T18–20; Muthia, Yasmin "belum ada") | Zakat **tidak punya entitas program** di produk: tabnya Ringkasan & Transaksi, Penyaluran 8 Asnaf, Parameter Nisab & Fitrah. Atiq/Thalia/Liha/Nurul mengerjakannya sebagai pencatatan transaksi. Ini ketidakcocokan **naskah uji** dengan produk, bukan bug. Tulis ulang T18–20 menjadi "Catat transaksi zakat / Ubah parameter nisab / Salurkan ke asnaf". Membuat entitas program zakat adalah keputusan fikih dan kelembagaan (amil, BAZNAS/UU 23/2011) di luar lingkup. |
| K3-03 | **Recycle bin / riwayat program yang dihapus** (Liha T5, Yasmin T17) | Perlu `deleted_at` lintas tabel dan kebijakan retensi. Catatan: program wakaf yang sudah menerima donasi/hasil/pencairan **sudah tidak bisa dihapus** (`deleteProgram`), jadi risiko kehilangan dana tidak ada; yang bisa dihapus hanya program kosong. Sementara: pastikan penghapusan tercatat di Log Audit (`/admin/transparansi`), dan jawab pertanyaan Muthia ("apakah program selesai bisa dinonaktifkan?"): status `SELESAI` sudah ada di model, perlu dicek apakah UI menyediakannya. |
| K3-04 | **Stok qurban sebagai satu angka** ("5 stok, bukan 5 program") | Satu batch = satu hewan fisik dengan slot, RPH, juleha, dan dokumentasi sembelih. Menggantinya dengan penghitung merusak pelacakan per ekor. Yang diambil hanya tampilan terkelompok (U4-13). |
| K3-05 | **Satu formulir "+ program" untuk semua jenis** (Liha, Nurul) | Program wakaf membawa nazhir, akad, dokumen RAB/legalitas, dan invarian BWI; infaq/qurban memiliki model berbeda. Penyatuan tata letak menu saja (U4-15) tanpa menyatukan formulir. |
| K3-06 | **Konfirmasi hapus dengan kata sandi ulang** (Yasmin T8/T11/T23) | Konfirmasi dialog **sudah ada** pada semua penghapusan (program, artikel/video lewat `deleteConfirm`, qurban, infaq, zakat), jadi sebagian sudah terpenuhi; verifikasi ulang kata sandi adalah kebijakan keamanan yang perlu persetujuan pengurus. |
| K3-07 | **"Target Penerima Manfaat" pada program qurban** (Nurul T21) | Butuh keputusan produk dan kemungkinan kolom baru; tunda sampai pengurus memutuskan. |

## 4. Rencana tahapan

### Fase 1 — Blocker dan quick wins (±2–3 hari kerja, tanpa migrasi)

Tujuan: semua tugas Kelompok 1 lulus, ulang UAT mini pada skenario gagal.

1. **U4-01** `sanitizePercent()` murni + tes, input teks numerik, `onFocus`
   select, penggeser opsional. (S)
2. **U4-03** `Modal` bersama: prop `dismissOnBackdrop` dan `isDirty`;
   terapkan di Wakaf, Qurban, Pengguna; draft `sessionStorage` pada Wakaf. (M)
3. **U4-04** keadaan galat + "Muat ulang" menggantikan `catch` senyap pada
   artikel, video, statistik, kategori; autosave draft artikel/kuis ke
   `localStorage`. Reproduksi dugaan "daftar kosong" di produksi. (M)
4. **U4-05** reproduksi bersama Nurul; perbaiki setelah penyebab jelas. (S–M)
5. **Quick win murah:** teks keadaan kosong video (hapus "Upload Berkas"),
   urutan tab Termin → Kuitansi dan tab bawaan (bagian dari U4-06), highlight
   tombol "Tambah Kategori" (U4-14), `createObjectURL` + validasi ukuran + status
   unggah (bagian dari U4-07), reset tampilan setelah hapus program (U4-08). (S)
6. Tes: `bun test` untuk `sanitizePercent`; `bun run check-types`; lint.

**Gerbang keluar:** Atiq mengulang T2, T4, T7, T8 dan Nurul T2, T21 tanpa
hambatan; tidak ada galat konsol.

### Fase 2 — Form dan redesain Progress (±1,5–2 minggu)

Urutan menurut nilai/risiko:

1. **U4-02** `SearchableSelect` + ganti empat kolom wilayah; pakai juga untuk
   bank/kategori panjang. Dependensi baru `@radix-ui/react-popover` (satu
   paket, disetujui sebelum dipasang). (M)
2. **U4-10** `RupiahInput` + sebelas titik penggantian. (M)
3. **U4-06/07/08** redesain Kelola Progress: pecah tab Kuitansi, galeri bukti,
   miniatur, perkecil foto, pratinjau besar, status unggah. Berkas
   `wakaf-programs-view.tsx` 4.646 baris; **pecah dulu** bagian workbench ke
   komponen sendiri sebelum mengubah, agar diff mudah ditinjau. (L)
4. **U4-09** penyapuan tipografi dan target sentuh per berkas + audit mobile
   390 px (naikkan layar admin ke ◐ di skrip screenshot). (M–L)
5. **U4-14, U4-12, U4-13, U4-15** polesan modul: kuis dinamis, pratinjau
   artikel, header kompak, katalog qurban terkelompok, bilah samping. (M)
6. **U4-11** lampiran bukti donasi manual: **migrasi aditif 0025**,
   rute unggah, tes integrasi; sinkron dropdown (setelah verifikasi). (M)
7. **U4-16** keadaan kosong penuntun + halaman Panduan Admin. (S–M)

**Gerbang keluar:** tangkap ulang layar admin (laptop + mobile) dengan
`capture-screenshots.mjs` sebagai bukti sebelum/sesudah, `bun test` hijau,
`check-types` dan Biome bersih.

### Fase 3 — Setelah keputusan pengurus (tidak dijadwalkan)

K3-01 … K3-07 menunggu keputusan produk/kebijakan.

### Verifikasi: UAT #5 (usul)

- Tulis ulang naskah: buang T12–14 sampai fitur ada; ganti T18–20 sesuai K3-02;
  tambahkan skenario "isi form wakaf lalu klik di luar modal", "refresh saat
  menulis artikel", "unggah foto 6 MB dari ponsel", "cari kelurahan".
- Seragamkan durasi `m:ss` dengan validasi sel, status wajib terisi
  (Success/Failed/Tidak tersedia), pencatat netral, dan isi tab Rangkuman
  dengan rumus yang benar (hapus kalimat kesimpulan statis).
- Target: Task Success ≥ 95% tanpa menghitung fitur yang tidak ada, SEQ per
  tugas ≥ 6, SUS ≥ 70.

## 5. Yang sengaja tidak diubah

- Tidak ada perubahan skema pada Fase 1. Satu-satunya migrasi yang
  direncanakan adalah 0025 (lampiran donasi manual, aditif, tidak merusak
  aplikasi Next.js lama yang memakai DB bersama).
- Invarian fikih/pembayaran (`packages/core`) tidak tersentuh oleh satu pun
  butir; semua perubahan berada di `apps/web` (komponen UI dan, untuk U4-11,
  satu rute unggah).
- Perilaku server yang sudah benar dipertahankan: batas 0–100 persentase,
  syarat minimal satu foto bukti pada laporan progres, larangan menghapus
  program yang sudah menerima dana.

## 6. Status eksekusi (diperbarui 18/10/2026)

| ID | Status | Catatan |
|---|---|---|
| U4-01, U4-02, U4-03, U4-06/07, U4-09 | Selesai (Fase 1) | commit `9f52054` |
| U4-10 RupiahInput, U4-06/07 alur Kelola Progres, draf form program | Selesai (Fase 2) | commit `774c858` |
| U4-04 draf artikel + galat muat daftar | Selesai | Dugaan "daftar kosong" ternyata nyata: galat ditelan senyap. Kini tampil peringatan + "Coba Lagi"; draf artikel/kuis dipulihkan dari sessionStorage |
| U4-05 qurban kambing | Selesai (penyebab: pesan galat, bukan slot) | Slot kambing sudah otomatis 1. Yang menghalangi: galat validasi server ("Input validation failed") tidak menyebut kolomnya. Kini dicegat di klien per kolom dan pesan server memakai nama kolom |
| U4-11 lampiran bukti donasi infaq | Selesai | Migrasi aditif 0025 `infaq_orders.bukti_transaksi`, rute `POST /api/uploads/infaq-proof`, `admin.infaq.proofUrl/removeProof` |
| U4-12 kuis opsi dinamis | Selesai | 2 sampai 5 opsi |
| U4-13 katalog qurban per jenis, U4-14 zakat kompak | Selesai | Kelompok Kambing / Domba dan Sapi; header zakat ramping, tabel di atas grafik |
| U4-15 bilah samping, U4-16 panduan admin, pratinjau artikel, dll. | Belum | |

