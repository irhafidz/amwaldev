import { afterAll, describe, expect, test } from 'bun:test';
import { call, ORPCError } from '@orpc/server';
import { eq, like } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Database } from '../../src/lib/db';
import { assertTestDatabase } from '../test-database-guard';
import { createTestCaller } from './test-utils';

/**
 * QA Test#1 Fase 2 — batas QRIS (QA-05), status & total Riwayat (QA-01),
 * instruksi bayar tersimpan untuk "Lanjutkan Pembayaran" (QA-02, QA-03).
 * Alur nyata: `waqf.createOrder` → MockPaymentProvider (instruksi QRIS
 * simulasi) → webhook settlement bertanda tangan.
 */

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const schema = await import('../../src/lib/db/schema');
const { router } = await import('../../src/lib/orpc/router');
const { handlePaymentWebhook } = await import('@amwal/core/payment/webhook');
const { MockPaymentProvider } = await import(
  '@amwal/core/payment/mock.provider'
);
const { createMidtransSignatureKey } = await import(
  '@amwal/core/payment/signature'
);

const database: Database = createDatabase(connectionUrl);
const serverKey = 'SB-Mid-server-phase2-key-123456';
const mockProvider = new MockPaymentProvider(serverKey);
const runId = ulid().toLowerCase();
const prefix = `p2-${runId}`;
const now = () => new Date().toISOString();
const publicContext = await createTestCaller({
  database,
  user: null,
  paymentProvider: mockProvider,
});

const nadzirUserId = `${prefix}-nadzir`;
const profileId = `${prefix}-profile`;
const programId = `${prefix}-program`;
const donorId = `${prefix}-donor`;

await database.insert(schema.users).values([
  { id: nadzirUserId, name: 'Nadzir Fase 2', updatedAt: now() },
  { id: donorId, name: 'Donatur Fase 2', updatedAt: now() },
]);
await database.insert(schema.nadzirProfiles).values({
  id: profileId,
  userId: nadzirUserId,
  kategori: 'ORGANISASI',
  namaLembaga: 'Lembaga Fase 2',
  updatedAt: now(),
});
await database.insert(schema.waqfPrograms).values({
  id: programId,
  nadzirProfileId: profileId,
  judul: 'Program Uji Fase 2',
  targetDana: '500000000',
  jenisWakaf: 'HABIS_PAKAI',
  status: 'LIVE',
  updatedAt: now(),
});

const createdOrders: { orderId: string; transactionId: string }[] = [];

afterAll(async () => {
  for (const { orderId, transactionId } of createdOrders) {
    await database
      .delete(schema.waqfOrders)
      .where(eq(schema.waqfOrders.id, orderId));
    await database
      .delete(schema.transactions)
      .where(eq(schema.transactions.id, transactionId));
  }
  await database
    .delete(schema.transactions)
    .where(like(schema.transactions.id, `${prefix}%`));
  await database
    .delete(schema.waqfPrincipalLedgers)
    .where(eq(schema.waqfPrincipalLedgers.waqfProgramId, programId));
  await database
    .delete(schema.waqfPrograms)
    .where(eq(schema.waqfPrograms.id, programId));
  await database
    .delete(schema.nadzirProfiles)
    .where(eq(schema.nadzirProfiles.id, profileId));
  await database
    .delete(schema.notifications)
    .where(eq(schema.notifications.userId, nadzirUserId));
  for (const id of [nadzirUserId, donorId]) {
    await database.delete(schema.users).where(eq(schema.users.id, id));
  }
});

function order(amount: number, paymentType: 'qris' | 'va/bni') {
  return call(
    router.waqf.createOrder,
    {
      programId,
      amount,
      paymentType,
      donorName: 'Hamba Allah',
      donorEmail: '',
      isAnonymous: true,
    },
    { context: publicContext }
  );
}

async function transactionsForProgram() {
  return await database
    .select({ id: schema.waqfOrders.id })
    .from(schema.waqfOrders)
    .where(eq(schema.waqfOrders.waqfProgramId, programId));
}

describe('QA-05 batas QRIS Rp 10 juta', () => {
  test('QRIS di atas Rp 10 juta ditolak sebelum pesanan dibuat', async () => {
    const before = (await transactionsForProgram()).length;
    let error: unknown;
    try {
      await order(15_000_000, 'qris');
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ORPCError);
    expect((error as ORPCError<string, unknown>).code).toBe('BAD_REQUEST');
    expect((error as Error).message).toContain('Virtual Account');
    // Tidak ada jangkar PENDING yatim.
    expect((await transactionsForProgram()).length).toBe(before);
  });

  test('nominal yang sama lewat Virtual Account tetap bisa', async () => {
    const created = await order(15_000_000, 'va/bni');
    createdOrders.push(created);
    expect(created.payment.instructions?.type).toBe('virtual_account');
  });
});

describe('QA-02 instruksi bayar tersimpan', () => {
  test('createOrder menyimpan instruksi (tanpa gambar QR), tautan, dan batas waktu', async () => {
    const created = await order(100_000, 'qris');
    createdOrders.push(created);

    const [row] = await database
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.id, created.transactionId));

    expect(row?.paymentInstructions?.type).toBe('qris');
    expect(
      row?.paymentInstructions?.type === 'qris' &&
        row.paymentInstructions.qrImage
    ).toBeFalsy();
    expect(row?.paymentUrl).toContain('/riwayat');
    expect(Date.parse(row?.paymentExpiresAt ?? '')).toBeGreaterThan(Date.now());
  });

  test('status pesanan mengirim instruksi (QR dibuat ulang) selama menunggu, lalu null setelah lunas', async () => {
    const created = await order(120_000, 'qris');
    createdOrders.push(created);

    const pending = await call(
      router.waqf.orderStatus,
      { orderId: created.orderId },
      { context: publicContext }
    );
    expect(pending.data.payment?.instructions?.type).toBe('qris');
    expect(
      pending.data.payment?.instructions?.type === 'qris'
        ? pending.data.payment.instructions.qrImage
        : ''
    ).toStartWith('data:image/png;base64,');

    const payload = {
      order_id: created.orderId,
      status_code: '200',
      gross_amount: '120000.00' as const,
      transaction_status: 'settlement',
      payment_type: 'qris',
      fraud_status: 'accept',
    };
    const settle = await handlePaymentWebhook(
      new Request('http://localhost/api/webhooks/payment', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          signature_key: createMidtransSignatureKey(payload, serverKey),
        }),
      }),
      { database, paymentProvider: mockProvider }
    );
    expect(settle.status).toBe(200);

    const settled = await call(
      router.waqf.orderStatus,
      { orderId: created.orderId },
      { context: publicContext }
    );
    expect(settled.data.payment).toBeNull();
  });
});

describe('QA-01/QA-02 Riwayat: pending terpisah, bisa dilanjutkan, kedaluwarsa', () => {
  const qris = { type: 'qris' as const, qrString: 'AMWAL-SIMULASI-QRIS|x|1' };
  const ids = {
    active: `${prefix}-tx-active`,
    expired: `${prefix}-tx-expired`,
    paid: `${prefix}-tx-paid`,
  };

  test('list menandai mana yang bisa dilanjutkan; detail hanya mengirim instruksi untuk yang masih berlaku', async () => {
    const inMinutes = (minutes: number) =>
      new Date(Date.now() + minutes * 60_000).toISOString();
    const base = {
      wakifId: donorId,
      jenisTransaksi: 'WAKAF' as const,
      paymentMethod: 'qris',
      disbursementDestination: 'Lembaga Fase 2',
      paymentInstructions: qris,
      paymentUrl: 'https://pay.example/resume',
    };
    await database.insert(schema.transactions).values([
      {
        ...base,
        id: ids.active,
        amount: '50000',
        statusPembayaran: 'PENDING',
        paymentExpiresAt: inMinutes(30),
      },
      {
        ...base,
        id: ids.expired,
        amount: '60000',
        statusPembayaran: 'PENDING',
        paymentExpiresAt: inMinutes(-5),
      },
      {
        ...base,
        id: ids.paid,
        amount: '70000',
        statusPembayaran: 'LUNAS',
        paymentExpiresAt: inMinutes(30),
      },
    ]);

    const context = await createTestCaller({
      database,
      user: { userId: donorId, role: 'WAKIF' },
    });
    const list = await call(router.transactions.list, undefined, { context });
    const byId = new Map(list.data.map((item) => [item.id, item]));

    expect(byId.get(ids.active)?.canResume).toBe(true);
    expect(byId.get(ids.expired)?.canResume).toBe(false);
    expect(byId.get(ids.paid)?.canResume).toBe(false);
    expect(byId.get(ids.active)?.paymentExpiresAt).toBeTruthy();
    // Daftar tidak membawa isi instruksi.
    expect(JSON.stringify(list.data)).not.toContain('AMWAL-SIMULASI');

    const active = await call(
      router.transactions.detail,
      { transactionId: ids.active },
      { context }
    );
    expect(active.data.resume?.url).toBe('https://pay.example/resume');
    expect(
      active.data.resume?.instructions?.type === 'qris'
        ? active.data.resume.instructions.qrImage
        : ''
    ).toStartWith('data:image/png;base64,');

    for (const id of [ids.expired, ids.paid]) {
      const detail = await call(
        router.transactions.detail,
        { transactionId: id },
        { context }
      );
      expect(detail.data.resume).toBeNull();
    }
  });
});

describe('donasi saat login tercatat di akun itu (QA-01)', () => {
  test('waqf.createOrder dengan sesi login memakai akun sesi, bukan baris tamu', async () => {
    const context = await createTestCaller({
      database,
      user: { userId: donorId, role: 'WAKIF' },
      paymentProvider: mockProvider,
    });
    const created = await call(
      router.waqf.createOrder,
      {
        programId,
        amount: 75_000,
        paymentType: 'qris',
        donorName: 'Donatur Fase 2',
        donorEmail: '',
        isAnonymous: false,
      },
      { context }
    );
    createdOrders.push(created);

    const [row] = await database
      .select({ wakifId: schema.transactions.wakifId })
      .from(schema.transactions)
      .where(eq(schema.transactions.id, created.transactionId));
    expect(row?.wakifId).toBe(donorId);

    const list = await call(router.transactions.list, undefined, { context });
    expect(list.data.some((item) => item.id === created.transactionId)).toBe(
      true
    );
  });
});
