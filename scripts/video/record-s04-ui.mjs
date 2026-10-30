/**
 * Scene 4 — demo UI/UX Amwal (desktop 1920×1080 + mobile).
 *
 *   node record-s04-ui.mjs                 # semua klip
 *   node record-s04-ui.mjs admin mobile    # sebagian
 *
 * Butuh server video jalan di :3000 (lihat README.md di folder ini).
 */
import {
  BASE,
  click,
  glide,
  ignoreError,
  launch,
  MOBILE,
  newPage,
  OUT_DIR,
  settle,
  sleep,
  smoothScroll,
  startRecording,
  type,
  WIDE,
} from './lib.mjs';

const ALL_CHIP = /^Semua/;
const INDIVIDU_TAB = /^Individu/;
const KOLEKTIF_TAB = /^Kolektif/;
/** Urutan klik tab workbench admin: tiga tab lain, lalu kembali ke awal. */
const WORKBENCH_TABS = [
  /Pencairan Termin/,
  /Daftar Wakif/,
  /Laporan Semester BWI/,
  /Kuitansi Belanja/,
];

async function open(page, path) {
  await page.goto(`${BASE}${path}`);
  await settle(page, 1200);
}

async function login(page, email) {
  await open(page, '/auth/login');
  await page.getByPlaceholder('nama@email.com atau 0812xxxxxxxx').fill(email);
  await page.locator('input[type=password]').fill('Amwal123!');
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/auth'));
  await settle(page, 800);
}

const CLIPS = {
  async beranda(browser) {
    const page = await newPage(browser);
    await open(page, '/');
    await glide(page, 900, 380, 50);
    const stop = await startRecording(page);
    await sleep(2500);
    await glide(page, 640, 300, 1200);
    await sleep(1500);
    await click(
      page,
      page.getByRole('button', { name: 'Masjid & Sarana Ibadah' })
    );
    await sleep(1500);
    await click(page, page.getByRole('button', { name: ALL_CHIP }));
    await sleep(800);
    await smoothScroll(page, 640, 3200);
    await sleep(2500);
    await smoothScroll(page, -640, 2200);
    await sleep(1000);
    await stop('s04-01-beranda');
    await page.context().close();
  },

  async wakaf(browser) {
    const page = await newPage(browser);
    await open(page, '/wakaf');
    const stop = await startRecording(page);
    await sleep(1800);
    await type(
      page,
      page.getByPlaceholder('Cari: Pendidikan, Masjid, Produktif...'),
      'masjid',
      110
    );
    await sleep(1800);
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await sleep(1200);
    await click(page, page.locator('a[href="/wakaf/DEMO-WQF-MASJID"]'));
    await page.waitForURL('**/wakaf/DEMO-WQF-MASJID');
    await settle(page, 1500);
    await smoothScroll(page, 520, 3000);
    await sleep(1800);
    await smoothScroll(page, 420, 2600);
    await sleep(1800);
    await smoothScroll(page, -940, 2400);
    await sleep(800);
    await stop('s04-02-katalog-dan-detail-wakaf');
    await page.context().close();
  },

  async zakat(browser) {
    const page = await newPage(browser);
    await open(page, '/zakat/kalkulator');
    const stop = await startRecording(page);
    await sleep(1500);
    await click(page, page.getByRole('button', { name: 'Tambah jiwa' }));
    await sleep(500);
    await click(page, page.getByRole('button', { name: 'Tambah jiwa' }), {
      pause: 200,
    });
    await sleep(1500);
    await click(page, page.getByRole('tab', { name: 'Zakat Maal' }));
    await sleep(1200);
    await type(page, page.locator('#zakat-gaji'), '15000000', 120);
    await sleep(800);
    await type(page, page.locator('#zakat-bonus'), '30000000', 120);
    await sleep(2500);
    await click(page, page.getByRole('button', { name: 'Emas / Logam Mulia' }));
    await sleep(2000);
    await click(
      page,
      page.getByRole('button', { name: 'Penghasilan / Profesi' })
    );
    await sleep(1800);
    await stop('s04-03-kalkulator-zakat');
    await page.context().close();
  },

  async qurban(browser) {
    const page = await newPage(browser);
    await open(page, '/qurban');
    const stop = await startRecording(page);
    await sleep(1800);
    await smoothScroll(page, 260, 1800);
    await sleep(1200);
    await click(page, page.getByRole('tab', { name: 'Qurban Sapi' }));
    await sleep(2000);
    await click(page, page.getByRole('tab', { name: INDIVIDU_TAB }));
    await sleep(2000);
    await click(page, page.getByRole('tab', { name: KOLEKTIF_TAB }));
    await sleep(2200);
    await smoothScroll(page, -260, 1500);
    await sleep(600);
    await stop('s04-04-katalog-qurban');
    await page.context().close();
  },

  async edukasi(browser) {
    const page = await newPage(browser);
    await open(page, '/edukasi');
    const stop = await startRecording(page);
    await sleep(1800);
    await smoothScroll(page, 300, 2000);
    await sleep(1000);
    await click(
      page,
      page
        .locator('a[href="/edukasi/demo-ilmu-faraidh-dijamin-bisa-bagi-waris"]')
        .last()
    );
    await page.waitForURL(
      '**/edukasi/demo-ilmu-faraidh-dijamin-bisa-bagi-waris'
    );
    await settle(page, 1500);
    await smoothScroll(page, 450, 3000);
    await sleep(2000);
    await stop('s04-05-edukasi');
    await page.context().close();
  },

  async admin(browser) {
    const page = await newPage(browser, WIDE);
    await login(page, 'admin@amwal.local');
    await open(page, '/admin/wakaf');
    const stop = await startRecording(page, WIDE);
    await sleep(2200);
    await smoothScroll(page, 260, 1800);
    await sleep(1000);
    await click(
      page,
      page.getByRole('button', { name: 'Kelola Progres' }).last()
    );
    await settle(page, 1500);
    const tabs = page.getByRole('tablist', {
      name: 'Bagian detail program wakaf',
    });
    await tabs.scrollIntoViewIfNeeded();
    await smoothScroll(page, 120, 800);
    await sleep(1500);
    for (const name of WORKBENCH_TABS) {
      await click(page, tabs.getByRole('tab', { name }));
      await sleep(2200);
    }
    await stop('s04-06-admin-workbench-wakaf');
    await page.context().close();
  },

  async mobile(browser) {
    const page = await newPage(browser, MOBILE);
    await open(page, '/');
    const stop = await startRecording(page, MOBILE);
    await sleep(2000);
    await smoothScroll(page, 700, 3500);
    await sleep(1500);
    await page.goto(`${BASE}/wakaf/DEMO-WQF-AIR`);
    await settle(page, 1500);
    await smoothScroll(page, 600, 3500);
    await sleep(2000);
    await stop('s04-07-mobile');
    await page.context().close();
  },
};

const wanted = process.argv.slice(2);
const names = wanted.length > 0 ? wanted : Object.keys(CLIPS);
const browser = await launch();
try {
  for (const name of names) {
    if (!CLIPS[name]) {
      throw new Error(`Klip tidak dikenal: ${name}`);
    }
    process.stdout.write(`● ${name}\n`);
    await CLIPS[name](browser).catch(async (error) => {
      // Simpan tampilan terakhir untuk diagnosis, lalu teruskan error-nya.
      for (const context of browser.contexts()) {
        for (const p of context.pages()) {
          await p
            .screenshot({ path: `${OUT_DIR}/_gagal-${name}.png` })
            .catch(ignoreError);
        }
      }
      throw error;
    });
  }
} finally {
  await browser.close();
}
