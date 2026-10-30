# Aset video dokumentasi HKI Amwal

Merekam klip untuk video HKI (Scene 4, 6, 7, 10) dari aplikasi **lokal** dengan
data **seed**, lalu menyimpannya ke `video_assets/` (diabaikan git). Hasil
dirakit di CapCut/Canva.

## Keamanan

`apps/web/.env` menunjuk ke DB **produksi** dan Mayar **live**. Semua perintah
di sini memakai `apps/web/.env.video` (DB lokal `amwal_video_demo`, pembayaran
`MOCK_SANDBOX`) lewat `bun --env-file=.env.video`, yang mematikan pemuatan
`.env` bawaan Bun. `demo-env-guard.ts` dipasang sebagai `--preload` dan
menghentikan proses bila DB bukan `localhost/amwal_video_demo` atau bila ada
kunci Mayar.

Jangan pakai `bun x`/`bunx` dengan `--env-file`: proses anak tidak mewarisi
env-file dan diam-diam membaca `.env` produksi. Jalankan entry file langsung
(`node_modules/drizzle-kit/bin.cjs`, `node_modules/vite/bin/vite.js`).

## Sekali saja: DB demo

```bash
cd apps/web
G=../../scripts/video/demo-env-guard.ts
# .env.video: DATABASE_URL lokal amwal_video_demo, JWT_SECRET, INTERNAL_SECRET,
# ENCRYPTION_KEY, PAYMENT_PROVIDER=MOCK_SANDBOX, PAYMENT_SERVER_KEY, PUBLIC_APP_URL
bun --env-file=.env.video --preload $G node_modules/drizzle-kit/bin.cjs migrate
bun --env-file=.env.video --preload $G src/lib/db/seed.ts
bun --env-file=.env.video --preload $G src/lib/db/seed-qurban-demo.ts
bun --env-file=.env.video --preload $G src/lib/db/seed-video-demo.ts
```

## Server untuk rekaman

Build produksi (tanpa panel devtools), runtime `development` supaya simulator
pembayaran `/api/dev/mock-webhook` aktif:

```bash
cd apps/web
NODE_ENV=production bun --env-file=.env.video --preload $G node_modules/vite/bin/vite.js build
PORT=3000 NODE_ENV=development bun --env-file=.env.video --preload $G .output/server/index.mjs
```

Lalu, sekali, isi dana terkumpul lewat alur pembayaran asli:

```bash
cd scripts/video && npm install && node warmup-donations.mjs
```

## Merekam

```bash
cd scripts/video
node record-s04-ui.mjs                 # S4: beranda, wakaf, zakat, qurban, edukasi, admin, mobile
node record-s07-checkout.mjs           # S7: checkout QRIS sandbox desktop + mobile
bash render-s06-gource.sh              # S6: animasi Gource (SHOW_NAMES=1 untuk nama author)
node capture-terminal.mjs s06-git-log && node record-terminal.mjs s06-git-log
node capture-terminal.mjs s10-tests   && node record-terminal.mjs s10-tests
bash contact-sheet.sh <out_dir> ../../video_assets/*.mp4   # QA cepat
```

Catatan teknis:

- Klip browser direkam **gerak lambat** (`VIDEO_SLOWMO`, default 3) lalu
  dipadatkan kembali: capture 1080p penuh hanya ±12 fps, hasil akhirnya ±30 fps.
  Timer JS aplikasi tidak ikut melambat, jadi hitung mundur QRIS dan autoplay
  carousel tampak 3× lebih cepat.
- Klip terminal memutar ulang output **asli** yang ditangkap
  `capture-terminal.mjs` (disimpan di `video_assets/.terminal/*.json`). Hanya
  waktunya yang dipadatkan; baris jejak tumpukan `at …` dari tes jalur error
  dan peringatan lockfile turbo dibuang.
- Gource butuh `gource.exe` (`winget install acaudwell.Gource`).

## Screenshot antarmuka (HKI, paper, laporan UAT)

`capture-screenshots.mjs` menjepret seluruh layar pada checklist
`docs/SCREENSHOT-CHECKLIST.md` dalam tiga profil perangkat (emulasi Chromium):
laptop MacBook Air 13" 1440×900, iPad Pro 11" 820×1180, iPhone 14 / Galaxy S23
390×844, semuanya skala 2×. Hasil di `screenshots/<perangkat>/` (diabaikan git)
beserta `screenshots/README.md` berisi inventaris dan spesifikasi perangkat.

```bash
# server demo di port bebas (jangan 3000 bila dipakai aplikasi lain)
cd apps/web && G=../../scripts/video/demo-env-guard.ts
NODE_ENV=production bun --env-file=.env.video --preload $G node_modules/vite/bin/vite.js build
PUBLIC_APP_URL=http://localhost:3100 PORT=3100 NODE_ENV=development \
  bun --env-file=.env.video --preload $G ./.output/server/index.mjs

# data (transaksi menunggu bayar, infaq lunas, sertifikat, BWI, kuis, notifikasi)
VIDEO_BASE_URL=http://localhost:3100 bun --env-file=.env.video --preload $G src/lib/db/seed-screenshots.ts

# jepret
cd ../../scripts/video && npm install            # sekali (playwright-core, pdfjs-dist)
VIDEO_BASE_URL=http://localhost:3100 node capture-screenshots.mjs
node capture-screenshots.mjs --list
node capture-screenshots.mjs --only B3,D2 --viewports mobile
```

Skrip menolak server yang bukan localhost atau yang `/health`-nya bukan Amwal.
Seeder idempoten untuk data lunas (hanya dilengkapi). Pesanan menunggu bayar
dibuat baru tiap run dan berbatas bayar ±15 menit (provider mock), jadi jalankan
seeder tepat sebelum menjepret (layar B5, C3, D6, E5, H2, H7).
