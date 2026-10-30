/**
 * Mengambil screenshot setiap modul Amwal untuk laporan Monev.
 *
 *   MONEV_EMAIL=... MONEV_PASSWORD=... node capture-screenshots.mjs
 *
 * Kredensial hanya dibaca dari environment, tidak pernah ditulis ke berkas.
 * Opsi: MONEV_BASE_URL (default http://localhost:3000), MONEV_OUT (default
 * ../../screenshots), MONEV_ONLY (nama berkas dipisah koma, untuk mengulang
 * sebagian saja).
 */
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const here = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.MONEV_BASE_URL ?? 'http://localhost:3000';
const OUT = resolve(here, process.env.MONEV_OUT ?? '../../screenshots');
const ONLY = process.env.MONEV_ONLY?.split(',').map((s) => s.trim());
const EMAIL = process.env.MONEV_EMAIL;
const PASSWORD = process.env.MONEV_PASSWORD;

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => existsSync(p));

const DESKTOP = { width: 1280, height: 720 };
const MOBILE = { width: 390, height: 844 };

if (!(EMAIL && PASSWORD)) {
  throw new Error('Set MONEV_EMAIL dan MONEV_PASSWORD di environment.');
}
if (!CHROME) {
  throw new Error('Chrome/Edge tidak ditemukan.');
}
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Menunggu halaman tenang: tidak ada skeleton/spinner, lalu jeda singkat. */
async function settle(page, extra = 1500) {
  await page.waitForLoadState('load').catch(() => undefined);
  // Data dimuat setelah hydrate lewat RPC; tunggu sampai tidak ada request.
  await page
    .waitForLoadState('networkidle', { timeout: 20_000 })
    .catch(() => undefined);
  await page
    .waitForFunction(
      () =>
        document.querySelectorAll('.animate-pulse, [aria-busy="true"]')
          .length === 0,
      undefined,
      { timeout: 20_000 }
    )
    .catch(() => undefined);
  await page
    .waitForFunction(
      () => !/Memuat|Loading/i.test(document.body.innerText),
      undefined,
      { timeout: 30_000 }
    )
    .catch(() => undefined);
  await sleep(extra);
}

async function go(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'load', timeout: 120_000 });
  await settle(page);
}

async function firstHref(page, pattern) {
  return await page.evaluate((source) => {
    const re = new RegExp(source);
    const a = [...document.querySelectorAll('a[href]')].find((el) =>
      re.test(el.getAttribute('href') ?? '')
    );
    return a?.getAttribute('href') ?? null;
  }, pattern.source);
}

async function clickText(page, text) {
  // Tab bisa berupa role=tab, role=button, atau tombol biasa; coba semuanya.
  for (const role of ['tab', 'button', 'link']) {
    const target = page.getByRole(role, { name: text }).first();
    if ((await target.count()) > 0) {
      await target.click();
      await settle(page, 900);
      return true;
    }
  }
  const byText = page.getByText(text).first();
  if ((await byText.count()) > 0) {
    await byText.click();
    await settle(page, 900);
    return true;
  }
  return false;
}

/** Setiap entri: berkas, viewport, dan langkah menuju tampilan yang difoto. */
const SHOTS = [
  {
    file: '01-beranda-donatur',
    run: async (page) => {
      await go(page, '/dashboard');
    },
  },
  {
    file: '03-chatbot-widget-popup',
    run: async (page) => {
      await go(page, '/dashboard');
      await page.getByRole('button', { name: /Buka asisten Tanya Amwal/ }).click();
      await sleep(1200);
    },
  },
  {
    file: '04-chatbot-halaman-penuh',
    run: async (page) => {
      await go(page, '/tanya-ai');
    },
  },
  {
    file: '05-chatbot-mobile',
    viewport: MOBILE,
    run: async (page) => {
      await go(page, '/tanya-ai');
    },
  },
  {
    file: '06-wakaf-katalog',
    run: async (page) => {
      await go(page, '/wakaf');
    },
  },
  {
    file: '07-wakaf-detail',
    run: async (page) => {
      await go(page, '/wakaf');
      const href = await firstHref(page, /^\/wakaf\/[^/]+$/);
      if (!href) {
        throw new Error('tidak ada program wakaf untuk dibuka');
      }
      await go(page, href);
    },
  },
  {
    file: '08-zakat-kalkulator-fitrah',
    run: async (page) => {
      await go(page, '/zakat/kalkulator');
      await clickText(page, /fitrah/i);
    },
  },
  {
    file: '09-zakat-kalkulator-maal',
    run: async (page) => {
      await go(page, '/zakat/kalkulator');
      await clickText(page, /maal/i);
    },
  },
  {
    file: '10-infaq-sedekah',
    run: async (page) => {
      await go(page, '/infaq');
    },
  },
  {
    file: '11-qurban',
    run: async (page) => {
      await go(page, '/qurban');
    },
  },
  {
    file: '12-berita',
    run: async (page) => {
      await go(page, '/berita');
    },
  },
  {
    file: '13-edukasi',
    run: async (page) => {
      await go(page, '/edukasi');
    },
  },
  {
    file: '14-edukasi-kuis',
    run: async (page) => {
      await go(page, '/edukasi');
      const href = await firstHref(page, /^\/edukasi\/(?!tanya-ai)[^/]+$/);
      if (!href) {
        throw new Error('tidak ada artikel edukasi');
      }
      await go(page, `${href}/kuis`);
    },
  },
  {
    file: '15-admin-overview',
    run: async (page) => {
      await go(page, '/admin');
      await sleep(2500);
    },
  },
  {
    file: '16-admin-wakaf',
    run: async (page) => {
      await go(page, '/admin/wakaf');
      // Daftar program dimuat setelah hydrate; tunggu sampai terisi.
      await page
        .waitForFunction(() => !document.body.innerText.includes('0 Proyek'), undefined, {
          timeout: 20_000,
        })
        .catch(() => undefined);
      await sleep(1500);
    },
  },
  {
    file: '17-admin-ziswaf-zakat',
    run: async (page) => {
      await go(page, '/admin/ziswaf/zakat');
    },
  },
  {
    file: '18-admin-whatsapp-gateway',
    run: async (page) => {
      await go(page, '/admin/pengaturan');
      if (!(await clickText(page, /Gateway WhatsApp/i))) {
        throw new Error('tab Gateway WhatsApp tidak ditemukan');
      }
      await sleep(3000);
    },
  },
  {
    file: '19-admin-transaksi-laporan',
    run: async (page) => {
      await go(page, '/admin/transparansi');
    },
  },
  {
    file: '20-profil-keamanan',
    run: async (page) => {
      await go(page, '/profil');
    },
  },
  {
    file: '23-auth-login',
    fresh: true,
    run: async (page) => {
      await go(page, '/auth/login');
    },
  },
  {
    file: '24-admin-users-rbac',
    run: async (page) => {
      await go(page, '/admin/users');
    },
  },
  {
    file: '25-poin-berkah',
    run: async (page) => {
      await go(page, '/dashboard/poin-berkah');
    },
  },
  {
    file: '21-beranda-mobile',
    viewport: MOBILE,
    run: async (page) => {
      await go(page, '/dashboard');
    },
  },
  {
    file: '22-wakaf-mobile',
    viewport: MOBILE,
    run: async (page) => {
      await go(page, '/wakaf');
    },
  },
];

/** Overlay devtools khusus dev (TanStack Router/Query) tidak boleh ikut terfoto. */
const HIDE_DEVTOOLS = () => {
  const sweep = () => {
    for (const el of document.querySelectorAll(
      '.tsqd-open-btn-container, [class*="TanStackRouterDevtools"]'
    )) {
      el.remove();
    }
    for (const el of document.querySelectorAll('button')) {
      if (el.textContent?.trim() === 'TanStack Router') {
        el.remove();
      }
    }
  };
  setInterval(sweep, 200);
};

async function newContext(browser, viewport) {
  return await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    locale: 'id-ID',
    timezoneId: 'Asia/Jakarta',
  });
}

async function login(page) {
  await page.goto(`${BASE}/auth/login`, {
    waitUntil: 'load',
    timeout: 120_000,
  });
  // Form baru boleh diisi setelah React hydrate; sebelum itu Enter men-submit
  // form secara native (GET) dan halaman hanya memuat ulang.
  await page.waitForFunction(
    () => {
      const el = document.querySelector('#login-identifier');
      return Boolean(
        el && Object.keys(el).some((k) => k.startsWith('__reactProps'))
      );
    },
    undefined,
    { timeout: 120_000 }
  );
  await page.fill('#login-identifier', EMAIL);
  await page.fill('#login-password', PASSWORD);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/auth/login'), {
      timeout: 60_000,
    }),
    page.press('#login-password', 'Enter'),
  ]);
  await settle(page, 800);
}

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
});

// Satu login, sesi (cookie) dipakai ulang untuk viewport lain.
const desktop = await newContext(browser, DESKTOP);
await desktop.addInitScript(HIDE_DEVTOOLS);
const dpage = await desktop.newPage();
await login(dpage);
const storage = await desktop.storageState();
const mobile = await browser.newContext({
  viewport: MOBILE,
  deviceScaleFactor: 2,
  locale: 'id-ID',
  timezoneId: 'Asia/Jakarta',
  isMobile: true,
  hasTouch: true,
  storageState: storage,
});
await mobile.addInitScript(HIDE_DEVTOOLS);

const failures = [];
for (const shot of SHOTS) {
  if (ONLY && !ONLY.includes(shot.file)) {
    continue;
  }
  const context = shot.fresh
    ? await newContext(browser, DESKTOP)
    : shot.viewport
      ? mobile
      : desktop;
  const page = await context.newPage();
  if (shot.fresh) {
    await context.addInitScript(HIDE_DEVTOOLS);
  }
  try {
    await shot.run(page);
    await page.screenshot({ path: `${OUT}/${shot.file}.png` });
    console.log(`ok    ${shot.file}`);
  } catch (error) {
    failures.push(shot.file);
    console.log(`GAGAL ${shot.file}: ${error.message.split('\n')[0]}`);
    await page
      .screenshot({ path: `${OUT}/_gagal-${shot.file}.png` })
      .catch(() => undefined);
  } finally {
    await page.close();
    if (shot.fresh) {
      await context.close();
    }
  }
}

await browser.close();
console.log(
  failures.length
    ? `Selesai dengan ${failures.length} kegagalan: ${failures.join(', ')}`
    : 'Selesai tanpa kegagalan.'
);
