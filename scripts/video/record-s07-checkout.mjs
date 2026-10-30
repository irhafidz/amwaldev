/**
 * Scene 7 — alur checkout wakaf multi-metode sampai lunas (QRIS sandbox).
 *
 *   node record-s07-checkout.mjs            # desktop + mobile
 *   node record-s07-checkout.mjs desktop
 *
 * Pembayaran memakai provider MOCK_SANDBOX: layar QRIS identik dengan Mayar
 * produksi, tetapi QR-nya bertanda SIMULASI dan tidak bisa dibayar. Pelunasan
 * dipicu skrip ini lewat `/api/dev/mock-webhook` (webhook bertanda tangan),
 * lalu halaman status menangkapnya lewat polling seperti pada produksi.
 */
import {
  BASE,
  click,
  DESKTOP,
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
} from './lib.mjs';

/** Teks halaman status setelah pelunasan tertangkap polling. */
const SETTLED_TEXT = /berhasil|lunas|terima kasih/i;

async function settleOrder(orderId) {
  const lookup = await fetch(`${BASE}/api/dev/mock-webhook?orderId=${orderId}`);
  const { data } = await lookup.json();
  const res = await fetch(`${BASE}/api/dev/mock-webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      order_id: orderId,
      status_code: '200',
      gross_amount: data.amount,
      transaction_status: 'settlement',
      fraud_status: 'accept',
      payment_type: 'qris',
    }),
  });
  if (!res.ok) {
    throw new Error(`Gagal melunasi ${orderId}: ${await res.text()}`);
  }
}

async function checkout(browser, device, name) {
  const mobile = device === MOBILE;
  const page = await newPage(browser, device);
  await page.goto(`${BASE}/wakaf/DEMO-WQF-MASJID`);
  await settle(page, 1200);
  const stop = await startRecording(page, device);

  await sleep(1800);
  if (mobile) {
    // Detail mobile hanya punya tombol "Wakaf Sekarang" yang menempel;
    // nominal dipilih di halaman formulir.
    await smoothScroll(page, 420, 1800);
    await sleep(800);
  } else {
    await click(page, page.getByRole('button', { name: 'Rp 250.000' }).first());
    await sleep(900);
  }
  await click(
    page,
    page.getByRole('button', { name: 'Wakaf Sekarang' }).last()
  );
  // Tamu di mobile mendapat lembar "Lanjutkan Wakaf Sebagai" dulu.
  const guest = page.getByText('Donasi sebagai Tamu');
  await Promise.race([
    page.waitForURL('**/donate**'),
    guest.waitFor({ state: 'visible' }),
  ]);
  if (await guest.isVisible()) {
    await sleep(1500);
    await click(page, guest);
  }
  await page.waitForURL('**/donate**');
  await settle(page, 1200);
  if (mobile) {
    await click(page, page.getByRole('button', { name: 'Rp 250.000' }).first());
    await sleep(900);
  }

  await type(
    page,
    page.getByPlaceholder('Contoh: Fulan bin Fulan'),
    'Aisyah Rahma',
    90
  );
  await sleep(500);
  await type(
    page,
    page.getByPlaceholder('email@contoh.id'),
    'aisyah@contoh.id',
    55
  );
  await sleep(800);

  // Tunjukkan ketiga kategori metode, lalu kembali ke QRIS.
  for (const method of ['Virtual Account', 'E-Wallet', 'QRIS']) {
    await click(page, page.getByRole('tab', { name: method }));
    await sleep(method === 'QRIS' ? 1200 : 1800);
  }

  // Desktop: "Lanjutkan Pembayaran" di ringkasan; mobile: bilah "Bayar Sekarang".
  await click(
    page,
    page
      .getByRole('button', {
        name: mobile ? 'Bayar Sekarang' : 'Lanjutkan Pembayaran',
      })
      .filter({ visible: true })
  );
  await page.waitForURL('**/status**', { timeout: 30_000 });
  await settle(page, 1500);
  await page.getByText('AMWAL-SIMULASI', { exact: false }).count();
  await sleep(3500);
  if (mobile) {
    await smoothScroll(page, 350, 1800);
    await sleep(1500);
  }

  // TanStack Router menyimpan nilai search sebagai JSON (`"601026…"`).
  const orderId = (
    new URL(page.url()).searchParams.get('orderId') ??
    (await page.evaluate(() =>
      sessionStorage.getItem('amwal_last_order_id')
    )) ??
    ''
  ).replaceAll('"', '');
  if (!orderId) {
    throw new Error(`orderId tidak ditemukan di ${page.url()}`);
  }
  await settleOrder(orderId);
  // Tunggu halaman status menangkap pelunasan lewat polling.
  await page.getByText(SETTLED_TEXT).first().waitFor({ timeout: 60_000 });
  await sleep(1500);
  await smoothScroll(page, mobile ? 500 : 300, 2200);
  await sleep(2500);
  await stop(name);
  await page.context().close();
  return orderId;
}

const CLIPS = {
  desktop: (browser) =>
    checkout(browser, DESKTOP, 's07-01-checkout-qris-desktop'),
  mobile: (browser) => checkout(browser, MOBILE, 's07-02-checkout-qris-mobile'),
};

const wanted = process.argv.slice(2);
const names = wanted.length > 0 ? wanted : Object.keys(CLIPS);
const browser = await launch();
try {
  for (const name of names) {
    process.stdout.write(`● ${name}\n`);
    const orderId = await CLIPS[name](browser).catch(async (error) => {
      for (const context of browser.contexts()) {
        for (const p of context.pages()) {
          await p
            .screenshot({ path: `${OUT_DIR}/_gagal-s07-${name}.png` })
            .catch(ignoreError);
        }
      }
      throw error;
    });
    process.stdout.write(`  order ${orderId} lunas (simulasi)\n`);
  }
} finally {
  await browser.close();
}
