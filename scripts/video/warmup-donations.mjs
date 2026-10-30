/**
 * Mengisi dana terkumpul program demo lewat alur pembayaran ASLI aplikasi:
 * `waqf.createOrder` (oRPC) → `/api/dev/mock-webhook` (settlement simulasi
 * bertanda tangan) → ledger pokok wakaf diperbarui oleh kode produksi.
 *
 *   node warmup-donations.mjs        (dev server video harus sudah jalan)
 *
 * Simulator hanya aktif saat PAYMENT_PROVIDER=MOCK_SANDBOX di luar produksi,
 * jadi skrip ini tidak bisa menggerakkan uang sungguhan.
 */
import { BASE } from './lib.mjs';

const DONATIONS = [
  ['DEMO-WQF-MASJID', 'Hj. Siti Aminah', 25_000_000],
  ['DEMO-WQF-MASJID', 'Keluarga Besar Pak Darmo', 50_000_000],
  ['DEMO-WQF-MASJID', 'Rizky Ramadhan', 1_500_000],
  ['DEMO-WQF-MASJID', null, 10_000_000],
  ['DEMO-WQF-MASJID', 'Alumni ITS Angkatan 2005', 120_000_000],
  ['DEMO-WQF-MASJID', 'Dewi Lestari', 750_000],
  ['DEMO-WQF-AIR', 'Budi Santoso', 5_000_000],
  ['DEMO-WQF-AIR', null, 2_500_000],
  ['DEMO-WQF-AIR', 'Nur Hidayah', 40_000_000],
  ['DEMO-WQF-AIR', 'Komunitas Peduli Air', 35_000_000],
  ['DEMO-WQF-PENDIDIKAN', 'Prof. Hasanuddin', 100_000_000],
  ['DEMO-WQF-PENDIDIKAN', 'Yayasan Insan Mulia', 250_000_000],
  ['DEMO-WQF-PENDIDIKAN', null, 15_000_000],
];

async function rpc(path, json) {
  const res = await fetch(`${BASE}/rpc/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ json }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(
      `${path} ${res.status}: ${JSON.stringify(body).slice(0, 300)}`
    );
  }
  return body.json;
}

async function settle(orderId) {
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
      payment_type: data.paymentMethod ?? 'qris',
    }),
  });
  if (!res.ok) {
    throw new Error(`settle ${orderId} ${res.status}: ${await res.text()}`);
  }
}

const METHODS = ['qris', 'va/bsi', 'ewallet/gopay', 'va/mandiri', 'qris'];

for (const [index, [programId, name, amount]] of DONATIONS.entries()) {
  // Berurutan supaya nomor order dan urutan "donatur terbaru" rapi.
  const order = await rpc('waqf/createOrder', {
    programId,
    amount,
    paymentType: METHODS[index % METHODS.length],
    donorName: name ?? 'Hamba Allah',
    donorEmail: '',
    isAnonymous: name === null,
  });
  await settle(order.orderId);
  process.stdout.write(
    `✓ ${programId.padEnd(20)} ${String(amount).padStart(11)}  ${name ?? '(anonim)'}\n`
  );
}
