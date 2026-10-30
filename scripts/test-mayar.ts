/**
 * Smoke test koneksi Mayar. Aman dijalankan kapan saja: tidak ada uang yang
 * berpindah dan tidak menyentuh database.
 *
 *   bun --env-file=.env.production run scripts/test-mayar.ts
 *   bun --env-file=.env.production run scripts/test-mayar.ts --amount 1000 --method va/bni
 *   bun --env-file=.env.production run scripts/test-mayar.ts --no-create     # hanya baca
 *   bun --env-file=.env.production run scripts/test-mayar.ts --probe-methods  # coba SEMUA kode (membuat ±12 tautan uji)
 *
 * Yang diperiksa:
 *   1. Saldo akun            GET  /hl/v2/balances         → API key aktif
 *   2. Channel merchant      GET  /hl/v2/payment-channels → metode mana yang dibuka di dasbor
 *   3. Payment request uji   POST /hl/v2/payments/create  → lewat `MayarPaymentProvider`
 *                            (kode yang sama dengan aplikasi), kedaluwarsa 15 menit
 *   4. Status transaksi      GET  /hl/v2/transactions/{id} → re-fetch yang dipakai webhook & fallback
 *
 * Membaca MAYAR_API_KEY dan MAYAR_BASE_URL (atau nama lamanya) dari env.
 * Rahasia tidak pernah dicetak. Exit code 1 bila ada langkah yang gagal.
 */

import {
  MayarPaymentProvider,
  resolveMayarBaseUrl,
} from '../packages/core/src/payment/mayar.provider';
import {
  isPaymentMethodCode,
  PAYMENT_METHODS,
  type PaymentMethodCode,
  paymentMethodLabel,
} from '../packages/core/src/payment/methods';
import { toDisbursementDestination } from '../packages/core/src/payment/types';

const TRAILING_SLASH = /\/+$/;
const VERSION_SUFFIX = /\/hl\/v2$/;
const TIMEOUT_MS = 15_000;

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}
const flag = (name: string) => process.argv.includes(`--${name}`);

const apiKey = process.env.MAYAR_API_KEY?.trim();
if (!apiKey) {
  console.error(
    'MAYAR_API_KEY belum diisi. Jalankan dengan --env-file=<berkas env>.'
  );
  process.exit(1);
}

// Sama persis dengan yang dipakai aplikasi: selalu <akar>/hl/v2, tanpa awalan ganda.
const baseUrl = resolveMayarBaseUrl(
  process.env.MAYAR_BASE_URL ?? process.env.MAYAR_API_BASE_URL
);
const root = baseUrl.replace(VERSION_SUFFIX, '');
const webhookSecret =
  process.env.MAYAR_WEBHOOK_SECRET ??
  process.env.MAYAR_WEBHOOK_TOKEN ??
  'smoke-test';
const appUrl = (process.env.PUBLIC_APP_URL ?? 'https://amwal.id').replace(
  TRAILING_SLASH,
  ''
);

const amount = Number(arg('amount') ?? 10_000);
const methodArg = arg('method') ?? 'qris';
if (!Number.isFinite(amount) || amount <= 0) {
  console.error('--amount harus angka positif.');
  process.exit(1);
}
if (!isPaymentMethodCode(methodArg)) {
  console.error(
    `--method tidak dikenal: ${methodArg}. Pilihan: ${PAYMENT_METHODS.map((m) => m.code).join(', ')}`
  );
  process.exit(1);
}
const method: PaymentMethodCode = methodArg;

let failures = 0;
const ok = (message: string) => console.log(`  ✓ ${message}`);
const fail = (message: string) => {
  failures += 1;
  console.log(`  ✗ ${message}`);
};

async function get(path: string): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await response.text();
  try {
    return { status: response.status, body: JSON.parse(text) };
  } catch {
    return { status: response.status, body: text.slice(0, 300) };
  }
}

const rupiah = (value: unknown) =>
  typeof value === 'number'
    ? `Rp ${value.toLocaleString('id-ID')}`
    : String(value);

function messageOf(body: unknown): string {
  const record = body as { messages?: string } | string;
  return typeof record === 'string'
    ? record
    : (record.messages ?? 'tanpa pesan');
}

async function checkBalance(): Promise<void> {
  console.log('\n1. Saldo akun (validasi API key)');
  const { status, body } = await get('/balances');
  const data = (body as { data?: Record<string, unknown> }).data;
  if (status === 200 && data) {
    ok(
      `API key aktif. Saldo aktif ${rupiah(data.balanceActive)}, tertahan ${rupiah(data.balancePending)}, total ${rupiah(data.balance)}`
    );
    return;
  }
  fail(
    `HTTP ${status}: ${messageOf(body)}${status === 401 ? ' (API key ditolak: salah, kedaluwarsa, atau beda lingkungan sandbox/produksi)' : ''}`
  );
}

interface Channel {
  code?: string;
  name?: string;
  status?: boolean | string;
  type?: string;
}

function findChannels(value: unknown): Channel[] {
  if (Array.isArray(value)) {
    const objects = value.filter(
      (item): item is Channel => typeof item === 'object' && item !== null
    );
    return objects.some((item) => 'code' in item || 'name' in item)
      ? objects
      : [];
  }
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) {
      const found = findChannels(child);
      if (found.length > 0) {
        return found;
      }
    }
  }
  return [];
}

const isEnabled = (channel: Channel) =>
  channel.status === true ||
  String(channel.status).toLowerCase() === 'active' ||
  String(channel.status).toLowerCase() === 'enabled';

async function checkChannels(): Promise<void> {
  console.log('\n2. Channel pembayaran merchant (dasbor Mayar)');
  const { status, body } = await get('/payment-channels');
  if (status !== 200) {
    fail(`HTTP ${status}: ${messageOf(body)}`);
    return;
  }
  const channels = findChannels(body);
  if (channels.length === 0) {
    ok('Respons diterima, tetapi bentuknya tidak dikenali; ringkasan mentah:');
    console.log(`    ${JSON.stringify(body).slice(0, 600)}`);
    return;
  }
  const enabled = channels.filter(isEnabled);
  ok(`${enabled.length} dari ${channels.length} channel aktif`);
  console.log(
    `    aktif: ${enabled.map((c) => c.code ?? c.name).join(', ') || '(tidak ada)'}`
  );
  const off = channels.filter((c) => !isEnabled(c));
  if (off.length > 0) {
    console.log(`    nonaktif: ${off.map((c) => c.code ?? c.name).join(', ')}`);
  }
}

function newProvider(): MayarPaymentProvider {
  return new MayarPaymentProvider({
    apiKey: apiKey as string,
    baseUrl,
    expiresInMinutes: 15,
    retryDelaysMs: [],
    webhookSecret,
  });
}

async function createAndCheck(code: PaymentMethodCode): Promise<boolean> {
  const provider = newProvider();
  const orderId = `SMOKE-${Date.now()}`;
  try {
    const created = await provider.createTransaction({
      // Mayar menolak (email + nominal) yang sama dalam 1 menit sebagai duplikat,
      // jadi tiap permintaan uji memakai email unik.
      customerEmail: `smoke-test+${orderId.toLowerCase()}@amwal.id`,
      customerMobile: '081234567890',
      customerName: 'Tes Koneksi Amwal',
      description: `Tes koneksi Amwal (${paymentMethodLabel(code)}) - abaikan`,
      disbursementDestination: toDisbursementDestination('SMOKE_TEST'),
      grossAmount: String(amount) as `${number}`,
      orderId,
      paymentType: code,
      redirectUrl: `${appUrl}/riwayat`,
    });
    ok(
      `${paymentMethodLabel(code)}: tautan dibuat (ref ${created.providerRef.slice(0, 8)}…)`
    );
    console.log(`    ${created.redirectUrl}`);

    const status = await provider.reconcileTransaction(created.providerRef);
    if (status.type === 'event' && status.event.outcome === 'PENDING') {
      ok(
        `status dibaca ulang: PENDING, nominal ${rupiah(Number(status.event.expectedAmount))} (belum dibayar, sesuai harapan)`
      );
      return true;
    }
    fail(`status tak terduga: ${JSON.stringify(status).slice(0, 200)}`);
  } catch (error) {
    fail(
      `${paymentMethodLabel(code)}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  return false;
}

async function main(): Promise<void> {
  console.log(`Mayar smoke test → ${root} (API v2)`);
  await checkBalance();
  await checkChannels();

  if (flag('no-create')) {
    console.log('\n(--no-create: payment request uji dilewati)');
  } else if (flag('probe-methods')) {
    console.log(
      `\n3. Payment request uji untuk SEMUA ${PAYMENT_METHODS.length} kode (Rp ${amount.toLocaleString('id-ID')}, kedaluwarsa 15 menit)`
    );
    for (const item of PAYMENT_METHODS) {
      await createAndCheck(item.code);
    }
  } else {
    console.log(
      `\n3. Payment request uji (${paymentMethodLabel(method)}, Rp ${amount.toLocaleString('id-ID')}, kedaluwarsa 15 menit)`
    );
    await createAndCheck(method);
  }

  console.log(
    failures === 0 ? '\nSEMUA LANGKAH BERHASIL' : `\n${failures} langkah GAGAL`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error(
    `\nSmoke test berhenti: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
});
