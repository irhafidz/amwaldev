/** biome-ignore-all lint: skrip penjepret sekali-pakai untuk dokumen HKI/paper; daftar layarnya sengaja berupa data deklaratif panjang, dan aturan kompleksitas/regex-lingkup-modul tidak memberi manfaat di sini */
/**
 * Menjepret screenshot seluruh layar Amwal untuk HKI, paper HETI, dan laporan
 * UAT, sesuai `docs/SCREENSHOT-CHECKLIST.md`, pada tiga profil perangkat.
 *
 *   # 1. server demo (port bebas, bukan 3000) + data
 *   cd apps/web
 *   PUBLIC_APP_URL=http://localhost:3100 PORT=3100 NODE_ENV=development \
 *     bun --env-file=.env.video --preload ../../scripts/video/demo-env-guard.ts ./.output/server/index.mjs
 *   VIDEO_BASE_URL=http://localhost:3100 bun --env-file=.env.video \
 *     --preload ../../scripts/video/demo-env-guard.ts src/lib/db/seed-screenshots.ts
 *
 *   # 2. jepret
 *   cd scripts/video
 *   VIDEO_BASE_URL=http://localhost:3100 node capture-screenshots.mjs
 *   node capture-screenshots.mjs --only B3,D2 --viewports mobile
 *   node capture-screenshots.mjs --list
 *
 * Hasil: `screenshots/<perangkat>/<ID>-<nama>.png`, `screenshots/manifest.json`
 * dan `screenshots/README.md` (inventaris + spesifikasi perangkat).
 *
 * Perangkat adalah EMULASI di Chromium (viewport, skala piksel, sentuhan,
 * user-agent), bukan perangkat fisik atau mesin render WebKit/Safari.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE, launch, ROOT } from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(ROOT, 'screenshots');
const STATE_FILE = join(OUT, '.state.json');
const MAX_FULL_HEIGHT = 7000;
const PASSWORD = 'Amwal123!';

// ------------------------------------------------------------------ perangkat

const DEVICES = {
  laptop: {
    dir: 'laptop_macbook_air',
    name: 'Apple MacBook Air 13"',
    kind: 'Laptop',
    viewport: { width: 1440, height: 900 },
    scale: 2,
    isMobile: false,
    hasTouch: false,
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  },
  pad: {
    dir: 'pad_ipad_pro',
    name: 'Apple iPad Pro 11" (Portrait)',
    kind: 'Tablet',
    viewport: { width: 820, height: 1180 },
    scale: 2,
    isMobile: false,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  },
  mobile: {
    dir: 'mobile_phone',
    name: 'Apple iPhone 14 / Samsung Galaxy S23',
    kind: 'Smartphone',
    viewport: { width: 390, height: 844 },
    scale: 2,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  },
};

const ACCOUNTS = {
  wakif: 'wakif@amwal.local',
  admin: 'admin@amwal.local',
  nadzir: 'nadzir@amwal.local',
};

// ----------------------------------------------------------------------- CLI

const csv = (value) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
const FLAGS = {
  '--only': (args, value) => {
    args.only = csv(value).map((item) => item.toUpperCase());
  },
  '--viewports': (args, value) => {
    args.viewports = csv(value).map((item) => item.toLowerCase());
  },
  '--retries': (args, value) => {
    args.retries = Number(value);
  },
};

function parseArgs(argv) {
  const args = {
    only: null,
    viewports: Object.keys(DEVICES),
    list: false,
    retries: 1,
    base: BASE,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const [flag, inline] = argv[i].split('=');
    if (flag === '--list') {
      args.list = true;
    } else if (flag === '--help' || flag === '-h') {
      args.help = true;
    } else if (FLAGS[flag]) {
      FLAGS[flag](args, inline ?? argv[++i]);
    } else {
      throw new Error(`Flag tidak dikenal: ${flag}`);
    }
  }
  for (const vp of args.viewports) {
    if (!DEVICES[vp]) {
      throw new Error(
        `Viewport tidak dikenal: ${vp} (pilih: ${Object.keys(DEVICES).join(', ')})`
      );
    }
  }
  return args;
}

// ----------------------------------------------------------- daftar screenshot

/**
 * vp: 'all' = laptop+pad+mobile (★), 'lm' = laptop+mobile (◐), 'l' = laptop saja (○).
 * mode: 'full' = seluruh halaman, 'viewport' = layar pertama saja.
 * route: teks rute untuk README (fungsi bila bergantung data seed).
 */
const SHOTS = [
  // ---- A. Beranda & navigasi publik
  {
    id: 'A1',
    module: 'Beranda & Navigasi Publik',
    slug: 'beranda-tamu',
    title: 'Beranda (tamu)',
    route: '/',
    desc: 'Hero, kartu statistik dampak (total dana, donatur, program aktif), program wakaf pilihan',
    vp: 'all',
    auth: 'guest',
    mode: 'full',
    async run(h) {
      await h.goto('/');
      await h.page.getByLabel('Dampak kebaikan bersama Amwal').waitFor();
    },
  },
  {
    id: 'A2',
    module: 'Beranda & Navigasi Publik',
    slug: 'beranda-donatur',
    title: 'Beranda (donatur login)',
    route: '/',
    desc: 'Kartu poin Berkah dan statistik pribadi donatur',
    vp: 'lm',
    auth: 'wakif',
    mode: 'full',
    async run(h) {
      await h.goto('/');
    },
  },
  {
    id: 'A3',
    module: 'Beranda & Navigasi Publik',
    slug: 'navigasi',
    title: 'Navigasi utama',
    route: '/',
    desc: 'Sidebar kiri (laptop, pad) dan bottom navigation + top app bar (mobile)',
    vp: 'all',
    auth: 'guest',
    mode: 'viewport',
    async run(h) {
      await h.goto('/');
    },
  },
  {
    id: 'A4',
    module: 'Beranda & Navigasi Publik',
    slug: 'masuk',
    title: 'Halaman Masuk',
    route: '/masuk',
    desc: 'Formulir masuk dengan email atau nomor HP',
    vp: 'lm',
    auth: 'guest',
    mode: 'viewport',
    async run(h) {
      await h.goto('/masuk');
    },
  },
  {
    id: 'A5',
    module: 'Beranda & Navigasi Publik',
    slug: 'daftar-validasi',
    title: 'Halaman Daftar (validasi)',
    route: '/daftar',
    desc: 'Formulir daftar dengan penanda wajib (*) dan pesan galat setelah kirim kosong',
    vp: 'lm',
    auth: 'guest',
    mode: 'viewport',
    async run(h) {
      await h.goto('/daftar');
      await h.page.locator('form button[type=submit]').first().click();
      await h.page.waitForTimeout(500);
    },
  },
  {
    id: 'A6',
    module: 'Beranda & Navigasi Publik',
    slug: 'info-publik',
    title: 'Syarat & Ketentuan, Pusat Bantuan',
    route: '/syarat-ketentuan, /bantuan',
    desc: 'Halaman informasi publik',
    vp: 'l',
    auth: 'guest',
    mode: 'full',
    async run(h) {
      await h.goto('/syarat-ketentuan');
      await h.snap({ suffix: 'syarat' });
      await h.goto('/bantuan');
      await h.snap({ suffix: 'bantuan' });
      h.skipFinalSnap();
    },
  },

  // ---- B. Wakaf
  {
    id: 'B1',
    module: 'Modul Wakaf',
    slug: 'katalog',
    title: 'Katalog program wakaf',
    route: '/wakaf',
    desc: 'Daftar program wakaf aktif dengan progres dana',
    vp: 'all',
    auth: 'guest',
    mode: 'full',
    async run(h) {
      await h.goto('/wakaf');
    },
  },
  {
    id: 'B2',
    module: 'Modul Wakaf',
    slug: 'detail-program',
    title: 'Detail program wakaf',
    route: '/wakaf/DEMO-WQF-MASJID',
    desc: 'Progres, deskripsi, kartu nazhir yang dapat diklik, transparansi dan legalitas',
    vp: 'all',
    auth: 'guest',
    mode: 'full',
    async run(h) {
      await h.goto('/wakaf/DEMO-WQF-MASJID');
    },
  },
  {
    id: 'B3',
    module: 'Modul Wakaf',
    slug: 'form-donasi',
    title: 'Formulir donasi wakaf',
    route: '/wakaf/DEMO-WQF-MASJID/donate',
    desc: 'Stepper, nominal, identitas, Doa & Harapan, metode bayar, ringkasan donasi sticky',
    vp: 'all',
    auth: 'wakif',
    mode: 'full',
    async run(h) {
      await h.goto('/wakaf/DEMO-WQF-MASJID/donate');
      const preset = h.page.getByRole('button', { name: /250\.000/ }).first();
      if (await preset.count()) {
        await preset.click();
      } else {
        await h.page.locator('#wakaf-custom-amount').fill('250000');
      }
      await h.page
        .locator('#wakaf-doa-message')
        .fill(
          'Semoga menjadi amal jariyah yang pahalanya mengalir untuk kedua orang tua.'
        );
    },
  },
  {
    id: 'B4',
    module: 'Modul Wakaf',
    slug: 'form-galat',
    title: 'Formulir donasi wakaf (validasi)',
    route: '/wakaf/DEMO-WQF-MASJID/donate',
    desc: 'Pesan galat dan fokus ke isian yang belum valid',
    vp: 'lm',
    auth: 'wakif',
    mode: 'viewport',
    async run(h) {
      await h.goto('/wakaf/DEMO-WQF-MASJID/donate');
      await h.page
        .locator('#wakaf-custom-amount')
        .fill('100')
        .catch(() => {});
      await h.page.locator('form button[type=submit]:visible').first().click();
      await h.page.waitForTimeout(600);
    },
  },
  {
    id: 'B5',
    module: 'Modul Wakaf',
    slug: 'status-menunggu-bayar',
    title: 'Status pesanan wakaf (menunggu bayar)',
    route: (S) => `/wakaf/status?orderId=${S.wakafPending.orderId}`,
    desc: 'Instruksi pembayaran QRIS dan hitung mundur batas bayar',
    vp: 'all',
    auth: 'wakif',
    mode: 'full',
    async run(h) {
      await h.goto(`/wakaf/status?orderId=${h.S.wakafPending.orderId}`);
    },
  },
  {
    id: 'B6',
    module: 'Modul Wakaf',
    slug: 'status-sukses',
    title: 'Status pesanan wakaf (berhasil)',
    route: (S) => `/wakaf/status?orderId=${S.wakafSettled.orderId}`,
    desc: 'Ringkasan donasi lunas, sertifikat dan kuitansi',
    vp: 'lm',
    auth: 'wakif',
    mode: 'full',
    async run(h) {
      await h.goto(`/wakaf/status?orderId=${h.S.wakafSettled.orderId}`);
    },
  },
  {
    id: 'B7',
    module: 'Modul Wakaf',
    slug: 'daftar-donatur',
    title: 'Daftar donatur program wakaf',
    route: '/wakaf/DEMO-WQF-MASJID/donatur',
    desc: 'Donatur lunas dengan penyamaran nama anonim',
    vp: 'lm',
    auth: 'guest',
    mode: 'full',
    async run(h) {
      await h.goto('/wakaf/DEMO-WQF-MASJID/donatur');
    },
  },

  // ---- C. Infaq
  {
    id: 'C1',
    module: 'Modul Infaq',
    slug: 'form-infaq',
    title: 'Formulir infaq & sedekah',
    route: '/infaq',
    desc: 'Alokasi program, nominal, data donatur, opsi anonim, ringkasan sticky',
    vp: 'all',
    auth: 'guest',
    mode: 'full',
    async run(h) {
      await h.goto('/infaq');
    },
  },
  {
    id: 'C2',
    module: 'Modul Infaq',
    slug: 'tabel-donatur',
    title: 'Tabel donatur infaq publik',
    route: '/infaq',
    desc: 'Daftar donasi infaq lunas dengan nama anonim "Hamba Allah"',
    vp: 'all',
    auth: 'guest',
    mode: 'element',
    async run(h) {
      await h.goto('/infaq');
      h.element('section[aria-labelledby="infaq-donors-heading"]');
    },
  },
  {
    id: 'C3',
    module: 'Modul Infaq',
    slug: 'status-menunggu-bayar',
    title: 'Status pesanan infaq',
    route: (S) => `/infaq/status?orderId=${S.infaqPending.orderId}`,
    desc: 'Instruksi pembayaran infaq',
    vp: 'lm',
    auth: 'guest',
    mode: 'full',
    async run(h) {
      await h.goto(`/infaq/status?orderId=${h.S.infaqPending.orderId}`);
    },
  },

  // ---- D. Zakat
  {
    id: 'D1',
    module: 'Modul Zakat',
    slug: 'kalkulator-fitrah',
    title: 'Kalkulator Zakat Fitrah',
    route: '/zakat/kalkulator',
    desc: 'Jumlah jiwa, aturan 1 jiwa = 1 kuota, daftar nama bernomor',
    vp: 'all',
    auth: 'guest',
    mode: 'full',
    async run(h) {
      await h.goto('/zakat/kalkulator');
      await h.page.getByLabel('Tambah jiwa').click();
      await h.page.getByLabel('Tambah jiwa').click();
      for (const [i, name] of [
        'Wakif Test',
        'Siti Aminah',
        'Muhammad Rizki',
      ].entries()) {
        await h.page.getByLabel(`Nama shohibul zakat ${i + 1}`).fill(name);
      }
    },
  },
  {
    id: 'D2',
    module: 'Modul Zakat',
    slug: 'maal-di-bawah-nisab',
    title: 'Zakat Maal di bawah nisab',
    route: '/zakat/kalkulator',
    desc: 'Panel status kuning, progres capaian nisab, kekurangan, ajakan infaq',
    vp: 'all',
    auth: 'guest',
    mode: 'full',
    async run(h) {
      await h.maal('3000000');
    },
  },
  {
    id: 'D3',
    module: 'Modul Zakat',
    slug: 'maal-di-atas-nisab',
    title: 'Zakat Maal di atas nisab',
    route: '/zakat/kalkulator',
    desc: 'Status wajib zakat (hijau), total zakat, perkiraan per bulan, tombol Bayar',
    vp: 'all',
    auth: 'guest',
    mode: 'full',
    async run(h) {
      await h.maal('50000000');
    },
  },
  {
    id: 'D4',
    module: 'Modul Zakat',
    slug: 'dialog-8-asnaf',
    title: 'Dialog Panduan 8 Asnaf & Syarat Zakat Mal',
    route: '/zakat/kalkulator',
    desc: 'Dialog edukasi: syarat wajib zakat mal dan delapan golongan penerima',
    vp: 'lm',
    auth: 'guest',
    mode: 'viewport',
    async run(h) {
      await h.goto('/zakat/kalkulator');
      await h.page.getByRole('button', { name: /Pelajari 8 Asnaf/ }).click();
      await h.page.getByRole('dialog').waitFor();
    },
  },
  {
    id: 'D5',
    module: 'Modul Zakat',
    slug: 'checkout',
    title: 'Checkout zakat',
    route: '/zakat/checkout',
    desc: 'Identitas muzakki (tamu), ringkasan zakat, metode pembayaran',
    vp: 'lm',
    auth: 'guest',
    mode: 'full',
    async run(h) {
      await h.goto(
        '/zakat/checkout?jenis=MAAL_PENGHASILAN&label=Zakat%20Penghasilan&amount=15000000&harta=600000000&nisab=203423445'
      );
    },
  },
  {
    id: 'D6',
    module: 'Modul Zakat',
    slug: 'status',
    title: 'Status pesanan zakat',
    route: (S) => `/zakat/status?orderId=${S.zakatPending.orderId}`,
    desc: 'Instruksi pembayaran Virtual Account',
    vp: 'l',
    auth: 'guest',
    mode: 'full',
    async run(h) {
      await h.goto(`/zakat/status?orderId=${h.S.zakatPending.orderId}`);
    },
  },

  // ---- E. Qurban
  {
    id: 'E1',
    module: 'Modul Qurban',
    slug: 'katalog',
    title: 'Katalog qurban (kambing)',
    route: '/qurban',
    desc: 'Hero, langkah qurban, paket kambing termasuk yang berstatus Penuh',
    vp: 'all',
    auth: 'guest',
    mode: 'full',
    async run(h) {
      await h.goto('/qurban');
    },
  },
  {
    id: 'E2',
    module: 'Modul Qurban',
    slug: 'katalog-sapi',
    title: 'Katalog qurban sapi (patungan dan utuh)',
    route: '/qurban',
    desc: 'Tab Sapi: Kolektif 1/7 dan Individu (1 ekor utuh) dengan jumlah paket tersedia',
    vp: 'lm',
    auth: 'guest',
    mode: 'full',
    async run(h) {
      await h.goto('/qurban');
      await h.page.getByRole('tab', { name: /Qurban Sapi/ }).click();
      await h.page.waitForTimeout(500);
      await h.snap({ suffix: 'kolektif' });
      await h.page.getByRole('tab', { name: /Individu/ }).click();
      await h.page.waitForTimeout(500);
      await h.snap({ suffix: 'utuh' });
      h.skipFinalSnap();
    },
  },
  {
    id: 'E3',
    module: 'Modul Qurban',
    slug: 'detail-batch',
    title: 'Detail paket qurban',
    route: '/qurban/DEMO-HWB-SAPI02',
    desc: 'Spesifikasi hewan dan bilah pembayaran bawah (pad/mobile)',
    vp: 'all',
    auth: 'guest',
    mode: 'full',
    async run(h) {
      await h.goto('/qurban/DEMO-HWB-SAPI02');
      if (h.device !== 'laptop') {
        await h.snap({ suffix: 'layar', full: false });
      }
    },
  },
  {
    id: 'E4',
    module: 'Modul Qurban',
    slug: 'checkout-sapi-utuh',
    title: 'Checkout sapi utuh (7 shohibul)',
    route: '/qurban/checkout?batchId=DEMO-HWB-SAPIUTUH01',
    desc: 'Satu ekor sapi dengan hingga 7 nama shohibul; bilah checkout bawah di pad/mobile',
    vp: 'all',
    auth: 'guest',
    mode: 'full',
    async run(h) {
      await h.goto('/qurban/checkout?batchId=DEMO-HWB-SAPIUTUH01');
      for (let i = 0; i < 6; i += 1) {
        await h.page
          .getByRole('button', { name: 'Tambah Nama' })
          .click()
          .catch(() => {});
      }
      const names = [
        'Abdullah bin Umar',
        'Aminah binti Hasan',
        'Muhammad Rizki bin Abdullah',
        'Siti Khadijah binti Ahmad',
        'Yusuf bin Ibrahim',
        'Fatimah binti Yusuf',
        'Ali bin Abdurrahman',
      ];
      const inputs = h.page.locator('input[id^="shohibul-"]');
      for (
        let i = 0;
        i < Math.min(names.length, await inputs.count());
        i += 1
      ) {
        await inputs.nth(i).fill(names[i]);
      }
      await h.page
        .locator('#qurban-pemesan')
        .fill('Rina Kartika')
        .catch(() => {});
      await h.page
        .locator('#qurban-whatsapp')
        .fill('081234500009')
        .catch(() => {});
      if (h.device !== 'laptop') {
        await h.snap({ suffix: 'layar', full: false });
      }
    },
  },
  {
    id: 'E5',
    module: 'Modul Qurban',
    slug: 'status',
    title: 'Status pesanan qurban',
    route: (S) => `/qurban/status?orderId=${S.qurbanPending.orderId}`,
    desc: 'Ringkasan pesanan patungan dan instruksi pembayaran',
    vp: 'lm',
    auth: 'guest',
    mode: 'full',
    async run(h) {
      await h.goto(`/qurban/status?orderId=${h.S.qurbanPending.orderId}`);
    },
  },

  // ---- F. Edukasi & AI
  {
    id: 'F1',
    module: 'Modul Edukasi & AI',
    slug: 'katalog-tamu',
    title: 'Katalog edukasi (tamu)',
    route: '/edukasi',
    desc: 'Artikel dan video tanpa badge XP untuk tamu',
    vp: 'all',
    auth: 'guest',
    mode: 'full',
    async run(h) {
      await h.goto('/edukasi');
    },
  },
  {
    id: 'F2',
    module: 'Modul Edukasi & AI',
    slug: 'katalog-donatur',
    title: 'Katalog edukasi (donatur)',
    route: '/edukasi',
    desc: 'Badge XP dan papan skor donatur',
    vp: 'lm',
    auth: 'wakif',
    mode: 'full',
    async run(h) {
      await h.goto('/edukasi');
    },
  },
  {
    id: 'F3',
    module: 'Modul Edukasi & AI',
    slug: 'artikel',
    title: 'Detail artikel',
    route: '/edukasi/demo-ilmu-faraidh-dijamin-bisa-bagi-waris',
    desc: 'Membaca artikel, kuis pemahaman di sidebar, diskusi',
    vp: 'all',
    auth: 'guest',
    mode: 'full',
    async run(h) {
      await h.goto('/edukasi/demo-ilmu-faraidh-dijamin-bisa-bagi-waris');
    },
  },
  {
    id: 'F4',
    module: 'Modul Edukasi & AI',
    slug: 'kuis-artikel',
    title: 'Kuis artikel interaktif',
    route: '/edukasi/demo-ilmu-faraidh-dijamin-bisa-bagi-waris',
    desc: 'Soal kuis, lalu hasil dengan ajakan masuk untuk mengklaim XP (tamu)',
    vp: 'lm',
    auth: 'guest',
    mode: 'full',
    async run(h) {
      await h.goto('/edukasi/demo-ilmu-faraidh-dijamin-bisa-bagi-waris');
      await h.page
        .getByRole('button', { name: /Kuis Interaktif|Mulai Kuis Sekarang/ })
        .first()
        .click();
      await h.page.locator('[data-testid="option-A"]').first().waitFor();
      await h.snap({ suffix: 'soal' });
      const options = h.page.locator('[data-testid="option-A"]');
      for (let i = 0; i < (await options.count()); i += 1) {
        await options.nth(i).click();
      }
      await h.page
        .getByRole('button', { name: 'Periksa Jawaban Kuis' })
        .click();
      await h.page.getByTestId('quiz-login-banner').waitFor();
      await h.snap({ suffix: 'hasil' });
      h.skipFinalSnap();
    },
  },
  {
    id: 'F5',
    module: 'Modul Edukasi & AI',
    slug: 'kuis-8-asnaf',
    title: 'Kuis 8 Asnaf',
    route: '/edukasi/8-asnaf',
    desc: 'Kuis interaktif 5 soal yang dinilai server, dengan hasil dan reward XP',
    vp: 'lm',
    auth: 'wakif',
    mode: 'full',
    async run(h) {
      await h.goto('/edukasi/8-asnaf');
      await h.page.getByRole('button', { name: 'Mulai Kuis' }).first().click();
      await h.page.waitForTimeout(500);
      await h.page.getByLabel('8', { exact: true }).click();
      await h.page
        .getByLabel(/Fakir tidak memiliki harta dan penghasilan cukup/)
        .click();
      await h.page.getByLabel('Gharim').click();
      await h.page.getByLabel('Ya', { exact: true }).click();
      await h.page.getByLabel('Amil').first().click();
      await h.page
        .getByRole('button', { name: 'Periksa Jawaban Kuis' })
        .click();
      await h.page.getByText(/Skor Anda/).waitFor();
    },
  },
  {
    id: 'F6',
    module: 'Modul Edukasi & AI',
    slug: 'modal-komentar',
    title: 'Modal tulis komentar',
    route: '/edukasi/demo-ilmu-faraidh-dijamin-bisa-bagi-waris',
    desc: 'Bottom sheet komentar dengan tombol Kirim yang terlihat penuh',
    vp: 'lm',
    auth: 'wakif',
    mode: 'viewport',
    async run(h) {
      await h.goto('/edukasi/demo-ilmu-faraidh-dijamin-bisa-bagi-waris');
      await h.page
        .getByRole('button', { name: /Tulis Komentar/ })
        .first()
        .click();
      await h.page
        .getByRole('dialog')
        .getByRole('textbox')
        .fill('Penjelasan yang sangat bermanfaat, jazakumullahu khairan.');
    },
  },
  {
    id: 'F7',
    module: 'Modul Edukasi & AI',
    slug: 'tanya-amwal',
    title: 'Tanya Amwal (tamu)',
    route: '/tanya-ai',
    desc: 'Asisten AI Syariah untuk tamu dengan satu pertanyaan terjawab',
    vp: 'all',
    auth: 'guest',
    mode: 'full',
    async run(h) {
      await h.goto('/tanya-ai');
      await h.page
        .getByLabel('Tulis pertanyaan')
        .fill('Berapa nisab zakat penghasilan?');
      await h.page.getByRole('button', { name: 'Kirim pertanyaan' }).click();
      await h.page.getByText(/Nisab/).first().waitFor();
      await h.page.waitForTimeout(800);
    },
  },
  {
    id: 'F8',
    module: 'Modul Edukasi & AI',
    slug: 'widget-chat',
    title: 'Widget Tanya Amwal mengambang',
    route: '/dashboard',
    desc: 'Panel chat mengambang (hanya tampil di beranda dasbor) yang terbuka di atas halaman',
    vp: 'lm',
    auth: 'guest',
    mode: 'viewport',
    async run(h) {
      await h.goto('/dashboard');
      await h.page
        .getByRole('button', { name: 'Buka asisten Tanya Amwal' })
        .click();
      await h.page.waitForTimeout(700);
    },
  },

  // ---- G. Lembaga & transparansi
  {
    id: 'G1',
    module: 'Lembaga & Transparansi',
    slug: 'profil-nazhir',
    title: 'Profil nazhir publik',
    route: '/lembaga/DEMO-NADZIR-01',
    desc: 'Nama lembaga, kategori, nomor registrasi BWI, kontak resmi, wilayah, program aktif',
    vp: 'all',
    auth: 'guest',
    mode: 'full',
    async run(h) {
      await h.goto('/lembaga/DEMO-NADZIR-01');
    },
  },
  {
    id: 'G2',
    module: 'Lembaga & Transparansi',
    slug: 'verifikasi-sertifikat',
    title: 'Verifikasi sertifikat',
    route: (S) => `/verifikasi/${S.certs.WAKAF.nomor}`,
    desc: 'Halaman tujuan QR pada sertifikat: keaslian dokumen',
    vp: 'lm',
    auth: 'guest',
    mode: 'full',
    async run(h) {
      await h.goto(`/verifikasi/${h.S.certs.WAKAF.nomor}`);
    },
  },

  // ---- H. Transaksi & dokumen
  {
    id: 'H1',
    module: 'Transaksi & Dokumen',
    slug: 'riwayat',
    title: 'Riwayat donatur',
    route: '/riwayat',
    desc: 'Transaksi berstatus Menunggu Pembayaran dan Berhasil',
    vp: 'all',
    auth: 'wakif',
    mode: 'full',
    async run(h) {
      await h.goto('/riwayat');
    },
  },
  {
    id: 'H2',
    module: 'Transaksi & Dokumen',
    slug: 'detail-pending',
    title: 'Detail transaksi menunggu pembayaran',
    route: (S) => `/riwayat/${S.wakafPending.transactionId}`,
    desc: 'Instruksi bayar, hitung mundur, tombol lanjutkan pembayaran',
    vp: 'all',
    auth: 'wakif',
    mode: 'full',
    async run(h) {
      await h.goto(`/riwayat/${h.S.wakafPending.transactionId}`);
    },
  },
  {
    id: 'H3',
    module: 'Transaksi & Dokumen',
    slug: 'detail-lunas',
    title: 'Detail transaksi berhasil',
    route: (S) => `/riwayat/${S.certs.WAKAF.transactionId}`,
    desc: 'Rincian transaksi, Unduh PDF dan Lihat Kuitansi',
    vp: 'lm',
    auth: 'wakif',
    mode: 'full',
    async run(h) {
      await h.goto(`/riwayat/${h.S.certs.WAKAF.transactionId}`);
    },
  },
  {
    id: 'H4',
    module: 'Transaksi & Dokumen',
    slug: 'modal-kuitansi',
    title: 'Modal kuitansi',
    route: (S) => `/riwayat/${S.certs.WAKAF.transactionId}`,
    desc: 'Kuitansi resmi di layar sebelum dicetak',
    vp: 'lm',
    auth: 'wakif',
    mode: 'viewport',
    async run(h) {
      await h.goto(`/riwayat/${h.S.certs.WAKAF.transactionId}`);
      await h.page.getByRole('button', { name: 'Lihat Kuitansi' }).click();
      await h.page.getByRole('dialog').waitFor();
    },
  },
  {
    id: 'H5',
    module: 'Transaksi & Dokumen',
    slug: 'kuitansi-cetak-a4',
    title: 'Kuitansi cetak A4',
    route: (S) => `/riwayat/${S.certs.WAKAF.transactionId}`,
    desc: 'Pratinjau cetak (media print) kuitansi pada kertas A4',
    vp: 'l',
    auth: 'wakif',
    mode: 'pdf',
    async run(h) {
      await h.goto(`/riwayat/${h.S.certs.WAKAF.transactionId}`);
      await h.page.getByRole('button', { name: 'Lihat Kuitansi' }).click();
      await h.page.getByRole('dialog').waitFor();
      await h.page.emulateMedia({ media: 'print' });
      const pdf = await h.page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
      });
      await h.page.emulateMedia({ media: 'screen' });
      await h.pdfToPng(pdf, '');
    },
  },
  {
    id: 'H6',
    module: 'Transaksi & Dokumen',
    slug: 'sertifikat-a4',
    title: 'Sertifikat PDF berkop A4',
    route: '/api/certificates/<transaksi>',
    desc: 'Sertifikat wakaf, zakat fitrah, dan qurban sapi utuh dengan 7 nama shohibul',
    vp: 'l',
    auth: 'wakif',
    mode: 'pdf',
    async run(h) {
      for (const [jenis, suffix] of [
        ['WAKAF', 'wakaf'],
        ['ZAKAT', 'zakat'],
        ['QURBAN', 'qurban-7-shohibul'],
      ]) {
        const response = await h.context.request.get(
          `${h.base}/api/certificates/${h.S.certs[jenis].transactionId}`
        );
        if (!response.ok()) {
          throw new Error(`sertifikat ${jenis}: HTTP ${response.status()}`);
        }
        await h.pdfToPng(await response.body(), suffix);
      }
    },
  },
  {
    id: 'H7',
    module: 'Transaksi & Dokumen',
    slug: 'lacak-pesanan-tamu',
    title: 'Lacak pesanan tamu',
    route: (S) => `/transaksi/${S.guestWakaf.orderId}`,
    desc: 'Pelacakan pesanan tamu tanpa akun lewat nomor pesanan',
    vp: 'lm',
    auth: 'guest',
    mode: 'full',
    async run(h) {
      await h.goto(`/transaksi/${h.S.guestWakaf.orderId}`);
    },
  },
  {
    id: 'H8',
    module: 'Transaksi & Dokumen',
    slug: 'notifikasi',
    title: 'Notifikasi',
    route: '/notifikasi',
    desc: 'Notifikasi pembayaran dan informasi program',
    vp: 'lm',
    auth: 'wakif',
    mode: 'full',
    async run(h) {
      await h.goto('/notifikasi');
    },
  },
  {
    id: 'H9',
    module: 'Transaksi & Dokumen',
    slug: 'profil',
    title: 'Profil, ubah profil, keamanan',
    route: '/profil, /profil/edit, /profil/keamanan',
    desc: 'Profil donatur dengan foto, formulir ubah profil, ganti kata sandi',
    vp: 'lm',
    auth: 'wakif',
    mode: 'full',
    async run(h) {
      for (const [path, suffix] of [
        ['/profil', 'ringkas'],
        ['/profil/edit', 'ubah'],
        ['/profil/keamanan', 'keamanan'],
      ]) {
        await h.goto(path);
        await h.snap({ suffix });
      }
      h.skipFinalSnap();
    },
  },
  {
    id: 'H10',
    module: 'Transaksi & Dokumen',
    slug: 'poin-berkah',
    title: 'Poin Berkah',
    route: '/dashboard/poin-berkah',
    desc: 'Saldo XP, level, dan riwayat poin',
    vp: 'lm',
    auth: 'wakif',
    mode: 'full',
    async run(h) {
      await h.goto('/dashboard/poin-berkah');
    },
  },

  // ---- I. Admin / Amil (laptop saja)
  {
    id: 'I1',
    module: 'Admin / Amil',
    slug: 'dasbor',
    title: 'Dasbor admin',
    route: '/admin',
    desc: 'KPI dan grafik ringkasan platform',
    vp: 'l',
    auth: 'admin',
    mode: 'full',
    async run(h) {
      await h.goto('/admin');
    },
  },
  {
    id: 'I2',
    module: 'Admin / Amil',
    slug: 'workbench-wakaf',
    title: 'Workbench program wakaf',
    route: '/admin/wakaf',
    desc: 'Daftar program dan dialog Kelola Progres (unggah kuitansi dan dokumentasi)',
    vp: 'l',
    auth: 'admin',
    mode: 'full',
    async run(h) {
      await h.goto('/admin/wakaf');
      await h.snap({ suffix: 'daftar' });
      await h.page
        .getByRole('button', { name: 'Kelola Progres' })
        .first()
        .click();
      await h.page.waitForTimeout(800);
      await h.snap({ suffix: 'kelola-progres', full: false });
      h.skipFinalSnap();
    },
  },
  {
    id: 'I3',
    module: 'Admin / Amil',
    slug: 'verifikasi-nazhir',
    title: 'Verifikasi nazhir dan data publik',
    route: '/admin/nadzir-verifikasi',
    desc: 'Daftar nazhir terverifikasi dan modal Ubah Data Publik (BWI, kontak)',
    vp: 'l',
    auth: 'admin',
    mode: 'full',
    async run(h) {
      await h.goto('/admin/nadzir-verifikasi');
      await h.page.getByRole('tab', { name: /Terverifikasi/ }).click();
      await h.page.waitForTimeout(600);
      await h.snap({ suffix: 'daftar' });
      await h.page
        .getByRole('button', { name: 'Ubah Data Publik' })
        .first()
        .click();
      await h.page.waitForTimeout(500);
      await h.snap({ suffix: 'modal', full: false });
      h.skipFinalSnap();
    },
  },
  {
    id: 'I4',
    module: 'Admin / Amil',
    slug: 'penyaluran-8-asnaf',
    title: 'Penyaluran zakat 8 asnaf',
    route: '/admin/ziswaf/zakat',
    desc: 'Tab Penyaluran 8 Asnaf dan formulir Catat Penyaluran',
    vp: 'l',
    auth: 'admin',
    mode: 'full',
    async run(h) {
      await h.goto('/admin/ziswaf/zakat');
      await h.page.getByRole('tab', { name: /Penyaluran 8 Asnaf/ }).click();
      await h.page.waitForTimeout(800);
      await h.snap({ suffix: 'daftar' });
      await h.page.getByRole('button', { name: 'Catat Penyaluran' }).click();
      await h.page.waitForTimeout(600);
      await h.snap({ suffix: 'modal', full: false });
      h.skipFinalSnap();
    },
  },
  {
    id: 'I5',
    module: 'Admin / Amil',
    slug: 'katalog-qurban-admin',
    title: 'Katalog qurban dan unggah foto hewan',
    route: '/admin/ziswaf/qurban',
    desc: 'Katalog dan stok hewan, formulir Tambah Hewan dengan unggah foto berkas',
    vp: 'l',
    auth: 'admin',
    mode: 'full',
    async run(h) {
      await h.goto('/admin/ziswaf/qurban');
      await h.page.getByRole('tab', { name: /Katalog & Stok Hewan/ }).click();
      await h.page.waitForTimeout(800);
      await h.snap({ suffix: 'katalog' });
      await h.page
        .getByRole('button', { name: 'Tambah Hewan' })
        .first()
        .click();
      await h.page.waitForTimeout(600);
      await h.page
        .locator('input#batch-foto[type=file]')
        .setInputFiles(await h.samplePhoto());
      await h.page.getByAltText('Pratinjau foto katalog').waitFor();
      await h.snap({ suffix: 'form-foto', full: false });
      h.skipFinalSnap();
    },
  },
  {
    id: 'I6',
    module: 'Admin / Amil',
    slug: 'infaq-admin',
    title: 'Modul infaq admin',
    route: '/admin/ziswaf/infaq',
    desc: 'Katalog program dan transaksi infaq',
    vp: 'l',
    auth: 'admin',
    mode: 'full',
    async run(h) {
      await h.goto('/admin/ziswaf/infaq');
    },
  },
  {
    id: 'I7',
    module: 'Admin / Amil',
    slug: 'matriks-hak-akses',
    title: 'Matriks hak akses',
    route: '/admin/roles',
    desc: 'Matriks role dan fitur dengan checkbox',
    vp: 'l',
    auth: 'admin',
    mode: 'full',
    async run(h) {
      await h.goto('/admin/roles');
    },
  },
  {
    id: 'I8',
    module: 'Admin / Amil',
    slug: 'pengguna',
    title: 'Manajemen pengguna',
    route: '/admin/users',
    desc: 'Daftar akun, role, dan status',
    vp: 'l',
    auth: 'admin',
    mode: 'full',
    async run(h) {
      await h.goto('/admin/users');
    },
  },
  {
    id: 'I9',
    module: 'Admin / Amil',
    slug: 'edukasi-kategori',
    title: 'Edukasi admin dan pengelola kategori',
    route: '/admin/edukasi?kategori=artikel',
    desc: 'Pengelolaan artikel/video dan modal kategori edukasi',
    vp: 'l',
    auth: 'admin',
    mode: 'viewport',
    async run(h) {
      await h.goto('/admin/edukasi?kategori=artikel');
      await h.page.waitForTimeout(800);
    },
  },
  {
    id: 'I10',
    module: 'Admin / Amil',
    slug: 'master-data',
    title: 'Master data',
    route: '/admin/master-data',
    desc: 'Picklist master data dan pintasan Kategori Edukasi',
    vp: 'l',
    auth: 'admin',
    mode: 'full',
    async run(h) {
      await h.goto('/admin/master-data');
    },
  },
  {
    id: 'I11',
    module: 'Admin / Amil',
    slug: 'admin',
    title: 'Transparansi dan dokumen',
    route: '/admin/transparansi, /admin/dokumen',
    desc: 'Buku besar transparansi dan dokumen penyaluran',
    vp: 'l',
    auth: 'admin',
    mode: 'full',
    async run(h) {
      await h.goto('/admin/transparansi');
      await h.snap({ suffix: 'transparansi' });
      await h.goto('/admin/dokumen');
      await h.snap({ suffix: 'dokumen' });
      h.skipFinalSnap();
    },
  },
  {
    id: 'I12',
    module: 'Admin / Amil',
    slug: 'dasbor-nazhir',
    title: 'Dasbor nazhir',
    route: '/nadzir/dashboard',
    desc: 'Ringkasan program milik lembaga nazhir',
    vp: 'l',
    auth: 'nadzir',
    mode: 'full',
    async run(h) {
      await h.goto('/nadzir/dashboard');
    },
  },
];

const VP_OF = {
  all: ['laptop', 'pad', 'mobile'],
  lm: ['laptop', 'mobile'],
  l: ['laptop'],
};
const routeText = (shot, S) =>
  typeof shot.route === 'function' ? safe(() => shot.route(S)) : shot.route;
const safe = (fn) => {
  try {
    return fn();
  } catch {
    return '(butuh data seed)';
  }
};

// --------------------------------------------------------------------- inti

const NO_MOTION =
  '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;caret-color:transparent!important;scroll-behavior:auto!important}';
const log = (line) => process.stdout.write(`${line}\n`);
const pad = (value, width) => String(value).padEnd(width);
const bytes = (n) =>
  n > 1_048_576
    ? `${(n / 1_048_576).toFixed(1)} MB`
    : `${Math.round(n / 1024)} KB`;

async function newContext(browser, deviceKey, auth, base) {
  const d = DEVICES[deviceKey];
  const context = await browser.newContext({
    viewport: d.viewport,
    deviceScaleFactor: d.scale,
    isMobile: d.isMobile,
    hasTouch: d.hasTouch,
    userAgent: d.userAgent,
    locale: 'id-ID',
    timezoneId: 'Asia/Jakarta',
    colorScheme: 'light',
  });
  await context.addInitScript((css) => {
    const add = () => {
      const s = document.createElement('style');
      s.textContent = css;
      (document.head || document.documentElement).appendChild(s);
    };
    if (document.head || document.documentElement) {
      add();
    } else {
      document.addEventListener('DOMContentLoaded', add);
    }
  }, NO_MOTION);
  if (auth !== 'guest') {
    const response = await context.request.post(`${base}/rpc/auth/login`, {
      data: { json: { identifier: ACCOUNTS[auth], password: PASSWORD } },
    });
    if (!response.ok()) {
      throw new Error(
        `login ${auth} gagal (HTTP ${response.status()}); jalankan seeder data demo`
      );
    }
  }
  return context;
}

/** Hasil render PDF.js: halaman PDF → PNG. */
async function renderPdfPages(browser, pdfBytes, scale) {
  const page = await browser.newPage();
  try {
    await page.setContent('<canvas id="c"></canvas>');
    await page.addScriptTag({
      path: resolve(here, 'node_modules/pdfjs-dist/build/pdf.min.js'),
    });
    const worker = readFileSync(
      resolve(here, 'node_modules/pdfjs-dist/build/pdf.worker.min.js'),
      'utf8'
    );
    const result = await page.evaluate(
      async ({ data, workerSource, renderScale }) => {
        const lib = window.pdfjsLib;
        lib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(
          new Blob([workerSource], { type: 'text/javascript' })
        );
        const doc = await lib.getDocument({
          data: Uint8Array.from(atob(data), (c) => c.charCodeAt(0)),
        }).promise;
        const out = [];
        for (let n = 1; n <= doc.numPages; n += 1) {
          const pdfPage = await doc.getPage(n);
          const viewport = pdfPage.getViewport({ scale: renderScale });
          const canvas = document.getElementById('c');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await pdfPage.render({ canvasContext: ctx, viewport }).promise;
          out.push(canvas.toDataURL('image/png').split(',')[1]);
        }
        return out;
      },
      {
        data: Buffer.from(pdfBytes).toString('base64'),
        workerSource: worker,
        renderScale: scale,
      }
    );
    return result.map((b64) => Buffer.from(b64, 'base64'));
  } finally {
    await page.close();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    log(
      'Pemakaian: node capture-screenshots.mjs [--only ID[,ID…]] [--viewports laptop,pad,mobile] [--list] [--retries N]'
    );
    return;
  }
  const selected = SHOTS.filter(
    (s) =>
      !args.only ||
      args.only.some(
        (o) =>
          s.id === o ||
          (/^[A-Z]$/.test(o) && s.id.startsWith(o) && /^\d/.test(s.id.slice(1)))
      )
  );
  const plan = selected.flatMap((shot) =>
    VP_OF[shot.vp]
      .filter((v) => args.viewports.includes(v))
      .map((device) => ({ shot, device }))
  );
  if (args.list) {
    for (const s of selected) {
      log(
        `${pad(s.id, 4)} ${pad(VP_OF[s.vp].join('+'), 18)} ${pad(s.auth, 7)} ${s.title}`
      );
    }
    log(`\n${selected.length} layar, ${plan.length} tangkapan.`);
    return;
  }
  if (plan.length === 0) {
    throw new Error(
      'Tidak ada tangkapan yang cocok dengan --only/--viewports.'
    );
  }

  const base = (process.env.VIDEO_BASE_URL ?? args.base).replace(/\/$/, '');
  const host = new URL(base).hostname;
  if (!['localhost', '127.0.0.1'].includes(host)) {
    throw new Error(`Hanya untuk server lokal (demo): ${base}`);
  }
  const health = await fetch(`${base}/health`)
    .then((r) => r.json())
    .catch(() => null);
  if (!health?.ok) {
    throw new Error(
      `${base} bukan server Amwal (GET /health tidak mengembalikan {ok:true}). Jalankan server demo di port lain dan set VIDEO_BASE_URL.`
    );
  }
  if (!existsSync(STATE_FILE)) {
    throw new Error(
      'screenshots/.state.json belum ada: jalankan seed-screenshots.ts terlebih dahulu (lihat komentar di kepala berkas ini).'
    );
  }
  const S = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  const ageMin = (Date.now() - Date.parse(S.preparedAt)) / 60000;
  if (ageMin > 10) {
    log(
      `! Data disiapkan ${Math.round(ageMin)} menit lalu: pesanan menunggu bayar (B5, C3, D6, E5, H2, H7) berbatas ±15 menit dan bisa tampil kedaluwarsa. Jalankan ulang seed-screenshots.ts sebelum menjepret.`
    );
  }

  log(`Amwal screenshot · server ${base}`);
  log(
    `${selected.length} layar → ${plan.length} tangkapan · perangkat: ${args.viewports.join(', ')}\n`
  );
  mkdirSync(OUT, { recursive: true });
  const browser = await launch();
  const contexts = new Map();
  const results = [];
  let done = 0;
  const started = Date.now();
  const assetDir = join(OUT, '.assets');
  mkdirSync(assetDir, { recursive: true });

  const getContext = async (device, auth) => {
    const key = `${device}:${auth}`;
    if (!contexts.has(key)) {
      contexts.set(key, await newContext(browser, device, auth, base));
    }
    return contexts.get(key);
  };

  async function samplePhoto() {
    const file = join(assetDir, 'foto-sapi.jpg');
    if (!existsSync(file)) {
      try {
        const res = await fetch(
          'https://images.unsplash.com/photo-1546445317-29f4545e9d53?w=800&auto=format&fit=crop&q=80'
        );
        if (!res.ok) {
          throw new Error(String(res.status));
        }
        writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      } catch {
        return resolve(
          ROOT,
          'apps/web/public/assets/images/wakaf/wakaf-air-bersih-desa-nurul-amanah.png'
        );
      }
    }
    return file;
  }

  for (const { shot, device } of plan) {
    const dev = DEVICES[device];
    const dir = join(OUT, dev.dir);
    mkdirSync(dir, { recursive: true });
    const label = `[${pad(`${done + 1}/${plan.length}`, 7)}] ${pad(device, 6)} ${pad(shot.id, 4)} ${pad(shot.title, 44)}`;
    let lastError = null;
    for (let attempt = 0; attempt <= args.retries; attempt += 1) {
      const files = [];
      let page = null;
      const t0 = Date.now();
      try {
        const context = await getContext(device, shot.auth);
        page = await context.newPage();
        page.setDefaultTimeout(20_000);
        let elementSelector = null;
        let finalSnap = true;
        const h = {
          page,
          context,
          S,
          device,
          base,
          samplePhoto,
          async goto(path) {
            await page.goto(`${base}${path}`, {
              waitUntil: 'domcontentloaded',
            });
            await page
              .waitForLoadState('networkidle', { timeout: 10_000 })
              .catch(() => {});
            await page.evaluate(() => document.fonts?.ready).catch(() => {});
            await page.waitForTimeout(900);
          },
          async maal(gaji) {
            await h.goto('/zakat/kalkulator');
            await page.getByRole('tab', { name: /Maal|Mal/i }).click();
            await page.waitForTimeout(800);
            await page
              .getByLabel(/Gaji per bulan/)
              .first()
              .fill(gaji);
            await page.waitForTimeout(700);
          },
          element(selector) {
            elementSelector = selector;
          },
          skipFinalSnap() {
            finalSnap = false;
          },
          async snap({ suffix = '', full } = {}) {
            const name = `${shot.id}${suffix ? `-${suffix}` : ''}-${shot.slug}.png`;
            const path = join(dir, name);
            await page.waitForTimeout(300);
            const asFull = full ?? shot.mode === 'full';
            if (elementSelector && full === undefined) {
              await page
                .locator(elementSelector)
                .first()
                .scrollIntoViewIfNeeded();
              await page.waitForTimeout(300);
              await page.locator(elementSelector).first().screenshot({ path });
            } else if (asFull) {
              const vp = dev.viewport;
              const height = await page.evaluate(() =>
                Math.max(
                  document.documentElement.scrollHeight,
                  document.body.scrollHeight
                )
              );
              const target = Math.min(
                Math.max(height, vp.height),
                MAX_FULL_HEIGHT
              );
              await page.setViewportSize({ width: vp.width, height: target });
              await page.waitForTimeout(500);
              await page.screenshot({ path });
              await page.setViewportSize(vp);
              await page.waitForTimeout(150);
            } else {
              await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
              await page.screenshot({ path });
            }
            files.push(name);
          },
          async pdfToPng(pdfBytes, suffix) {
            const pages = await renderPdfPages(browser, pdfBytes, 3);
            for (const [i, png] of pages.entries()) {
              const part = [suffix, pages.length > 1 ? `h${i + 1}` : '']
                .filter(Boolean)
                .join('-');
              const name = `${shot.id}${part ? `-${part}` : ''}-${shot.slug}.png`;
              writeFileSync(join(dir, name), png);
              files.push(name);
            }
          },
        };
        await shot.run(h);
        if (finalSnap && shot.mode !== 'pdf') {
          await h.snap();
        }
        if (files.length === 0) {
          throw new Error('tidak ada berkas yang dihasilkan');
        }
        const sizes = files.map((f) => statSync(join(dir, f)).size);
        results.push(
          ...files.map((file, i) => ({
            id: shot.id,
            device,
            file: `${dev.dir}/${file}`,
            bytes: sizes[i],
          }))
        );
        done += 1;
        log(
          `${label} ✓ ${files.length} berkas (${bytes(sizes.reduce((a, b) => a + b, 0))}, ${((Date.now() - t0) / 1000).toFixed(1)} dtk)`
        );
        lastError = null;
        await page.close().catch(() => {});
        break;
      } catch (error) {
        lastError = error;
        await page?.close().catch(() => {});
        if (attempt < args.retries) {
          log(
            `${label} … ulang (${String(error.message).split('\n')[0].slice(0, 90)})`
          );
        }
      }
    }
    if (lastError) {
      done += 1;
      results.push({
        id: shot.id,
        device,
        error: String(lastError.message).split('\n')[0],
      });
      log(
        `${label} ✗ ${String(lastError.message).split('\n')[0].slice(0, 110)}`
      );
    }
  }
  await browser.close();

  writeReadme(S, base);
  const failed = results.filter((r) => r.error);
  log(
    `\nSelesai dalam ${((Date.now() - started) / 1000).toFixed(0)} dtk · ${results.length - failed.length} berkas, ${failed.length} gagal.`
  );
  for (const f of failed) {
    log(`  ✗ ${f.device} ${f.id}: ${f.error}`);
  }
  log(`Hasil: ${OUT}${'\n'}Inventaris: ${join(OUT, 'README.md')}`);
  if (failed.length) {
    process.exitCode = 1;
  }
}

// ------------------------------------------------------------------ README

function listFiles(deviceKey) {
  const dir = join(OUT, DEVICES[deviceKey].dir);
  return existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith('.png'))
        .sort()
    : [];
}

function writeReadme(S, base) {
  const files = Object.fromEntries(
    Object.keys(DEVICES).map((k) => [k, listFiles(k)])
  );
  const _dims = (deviceKey) => {
    const d = DEVICES[deviceKey];
    return `${d.viewport.width} × ${d.viewport.height} CSS px @${d.scale}× = ${d.viewport.width * d.scale} × ${d.viewport.height * d.scale} px`;
  };
  const lines = [];
  lines.push('# Inventaris Screenshot Antarmuka Amwal', '');
  lines.push(
    `Dibuat otomatis oleh \`scripts/video/capture-screenshots.mjs\` pada ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB.`
  );
  lines.push(
    `Sumber: aplikasi Amwal versi pengembangan \`bara\`, build produksi lokal dengan data demo (DB \`amwal_video_demo\`, pembayaran simulasi \`MOCK_SANDBOX\`), alamat ${base}.`,
    ''
  );
  lines.push('## Spesifikasi perangkat', '');
  lines.push(
    '| Kategori | Perangkat (profil emulasi) | Viewport & skala | Sentuh / Mobile | Folder |',
    '|---|---|---|---|---|'
  );
  for (const d of Object.values(DEVICES)) {
    lines.push(
      `| ${d.kind} | ${d.name} | ${d.viewport.width} × ${d.viewport.height} CSS px, skala ${d.scale}× (${d.viewport.width * d.scale} × ${d.viewport.height * d.scale} px) | ${d.hasTouch ? 'ya' : 'tidak'} / ${d.isMobile ? 'ya' : 'tidak'} | \`${d.dir}/\` |`
    );
  }
  lines.push(
    '',
    '**Catatan metodologi.** Perangkat diemulasikan pada Chromium (Playwright): ukuran viewport, rasio piksel, dukungan sentuh, dan user-agent mengikuti profil di atas. Hasil bukan tangkapan dari perangkat fisik maupun mesin render WebKit/Safari, sehingga rincian rendering font dapat sedikit berbeda dari perangkat aslinya. Animasi CSS dimatikan dan halaman panjang diambil utuh (full page).',
    ''
  );
  lines.push(
    'Prioritas viewport: **★** laptop + pad + mobile, **◐** laptop + mobile, **○** laptop saja (admin dan dokumen A4).',
    ''
  );
  lines.push('## Inventaris', '');
  lines.push(
    '| ID | Modul | Layar | Rute | Fitur yang ditampilkan | Vp | Laptop | Pad | Mobile |',
    '|---|---|---|---|---|---|---|---|---|'
  );
  const cell = (shot, deviceKey) => {
    if (!VP_OF[shot.vp].includes(deviceKey)) {
      return '—';
    }
    const hits = files[deviceKey].filter(
      (f) => f.startsWith(`${shot.id}-`) && f.endsWith(`${shot.slug}.png`)
    );
    return hits.length
      ? hits.map((f) => `\`${f}\``).join('<br>')
      : '_belum dijepret_';
  };
  const mark = { all: '★', lm: '◐', l: '○' };
  for (const shot of SHOTS) {
    lines.push(
      `| ${shot.id} | ${shot.module} | ${shot.title} | \`${routeText(shot, S)}\` | ${shot.desc} | ${mark[shot.vp]} | ${cell(shot, 'laptop')} | ${cell(shot, 'pad')} | ${cell(shot, 'mobile')} |`
    );
  }
  lines.push('', '## Catatan', '');
  lines.push(
    '- E6 (paket penuh) tercakup oleh E1: kartu kambing berstatus "Penuh" tampil pada katalog.'
  );
  lines.push(
    '- Berkas ber-akhiran sufiks (mis. `-soal`, `-hasil`, `-modal`, `-layar`) adalah beberapa kondisi dari satu layar yang sama.'
  );
  lines.push(
    '- `H5` dan `H6` dirender dari PDF A4 ke PNG (3× → 1785 × 2526 px); `-h1`, `-h2` menandai nomor halaman.'
  );
  lines.push(
    '- Pada layar pad dan mobile, `-layar` memperlihatkan bilah pembayaran bawah pada posisi sebenarnya di dasar layar.'
  );
  lines.push(
    '- Data bersifat demo; nama, nominal, dan nomor pesanan bukan data nyata.',
    ''
  );
  const counts = Object.fromEntries(
    Object.keys(DEVICES).map((k) => [k, files[k].length])
  );
  lines.push(
    `Jumlah berkas: laptop ${counts.laptop}, pad ${counts.pad}, mobile ${counts.mobile}, total ${counts.laptop + counts.pad + counts.mobile}.`,
    ''
  );
  writeFileSync(join(OUT, 'README.md'), lines.join('\n'));
  writeFileSync(
    join(OUT, 'manifest.json'),
    JSON.stringify(
      { generatedAt: new Date().toISOString(), base, devices: DEVICES, files },
      null,
      2
    )
  );
}

main().catch((error) => {
  log(`\n✗ ${error.message}`);
  process.exit(1);
});
