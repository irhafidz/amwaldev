import { describe, expect, test } from 'bun:test';
import type { PaymentProvider } from '@amwal/core/payment/types';
import { eq, inArray, or } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Database } from '../../src/lib/db';
import { assertTestDatabase } from '../test-database-guard';

/**
 * Putaran 17, Batch 3 — the oRPC-side twin of
 * `apps/server/tests/payment/create-payment.test.ts`. Exercises
 * `@amwal/core/payment/service`'s `createPayment` directly (the exact
 * function every waqf/zakat/qurban/infaq order-creation procedure calls),
 * proving the anchor-before-charge transaction and its rollback are
 * byte-identical from `apps/web`.
 */

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const schema = await import('../../src/lib/db/schema');
const { createOrderId, isValidOrderId } = await import(
  '@amwal/core/payment/order-id'
);
const { createPayment } = await import('@amwal/core/payment/service');
const { MockPaymentProvider } = await import(
  '@amwal/core/payment/mock.provider'
);
const { toDisbursementDestination } = await import('@amwal/core/payment/types');

const database: Database = createDatabase(connectionUrl);
const serverKey = 'SB-Mid-server-P17-B3-test-key-123456';
const mockProvider = new MockPaymentProvider(serverKey);
const now = () => new Date().toISOString();

async function insertUser(runId: string, label: string): Promise<string> {
  const id = `p17b3-${runId}-${label}-${ulid()}`;
  await database.insert(schema.users).values({
    id,
    name: `${label} P17-B3`,
    updatedAt: now(),
  });
  return id;
}

async function createQurbanSlotFixture(runId: string): Promise<string> {
  const batchId = `p17b3-${runId}-batch-${ulid()}`;
  await database.insert(schema.hewanBatches).values({
    id: batchId,
    jenisHewan: 'KAMBING',
    totalSlot: 1,
    hargaPerSlot: '50000.00',
    status: 'TERSEDIA',
  });
  await database.insert(schema.qurbanAnimalSlots).values({
    id: `p17b3-${runId}-slot-${ulid()}`,
    hewanBatchId: batchId,
    nomorSlot: 1,
    status: 'TERSEDIA',
  });
  return batchId;
}

async function deleteQurbanSlotFixture(batchId: string): Promise<void> {
  await database
    .delete(schema.qurbanAnimalSlots)
    .where(eq(schema.qurbanAnimalSlots.hewanBatchId, batchId));
  await database
    .delete(schema.hewanBatches)
    .where(eq(schema.hewanBatches.id, batchId));
}

async function createWaqfFixture(runId: string): Promise<{
  userId: string;
  programId: string;
  nadzirProfileId: string;
  nadzirUserId: string;
}> {
  const nadzirUserId = await insertUser(runId, 'nadzir');
  const userId = await insertUser(runId, 'wakif');
  const nadzirProfileId = `p17b3-${runId}-np-${ulid()}`;
  const programId = `p17b3-${runId}-wp-${ulid()}`;

  await database.insert(schema.nadzirProfiles).values({
    id: nadzirProfileId,
    userId: nadzirUserId,
    kategori: 'ORGANISASI',
    updatedAt: now(),
  });
  await database.insert(schema.waqfPrograms).values({
    id: programId,
    nadzirProfileId,
    judul: `Program Uji ${runId}`,
    targetDana: '100000000',
    jenisWakaf: 'HABIS_PAKAI',
    updatedAt: now(),
  });

  return { userId, programId, nadzirProfileId, nadzirUserId };
}

async function deleteWaqfFixture(
  fixture: Awaited<ReturnType<typeof createWaqfFixture>>
) {
  await database
    .delete(schema.waqfOrders)
    .where(
      or(
        eq(schema.waqfOrders.wakifId, fixture.userId),
        eq(schema.waqfOrders.waqfProgramId, fixture.programId)
      )
    );
  await database
    .delete(schema.waqfPrograms)
    .where(eq(schema.waqfPrograms.id, fixture.programId));
  await database
    .delete(schema.nadzirProfiles)
    .where(eq(schema.nadzirProfiles.id, fixture.nadzirProfileId));
  await database
    .delete(schema.users)
    .where(inArray(schema.users.id, [fixture.userId, fixture.nadzirUserId]));
}

async function deleteTransactionAndUser(userId: string): Promise<void> {
  await database
    .delete(schema.transactions)
    .where(eq(schema.transactions.wakifId, userId));
  await database.delete(schema.users).where(eq(schema.users.id, userId));
}

const destination = toDisbursementDestination('BSI - Rekening Yayasan HETI');

describe('createPayment anchor-before-charge (oRPC twin)', () => {
  test('order IDs match AMW-{MODULE}-{ULID}', () => {
    for (const module of ['WAQF', 'ZAKAT', 'QURBAN'] as const) {
      const orderId = createOrderId(module);
      expect(orderId.startsWith(`AMW-${module}-`)).toBe(true);
      expect(isValidOrderId(orderId)).toBe(true);
    }
  });

  test('disbursementDestination rejects empty and whitespace-only strings', () => {
    expect(() => toDisbursementDestination('')).toThrow(
      'disbursementDestination must not be empty'
    );
    expect(() => toDisbursementDestination('   ')).toThrow(
      'disbursementDestination must not be empty'
    );
  });

  test('waqf, zakat, and qurban orders each create a PENDING Transaction row', async () => {
    const runId = ulid().toLowerCase();
    const waqfFixture = await createWaqfFixture(runId);
    const userId = await insertUser(runId, 'shared');
    const qurbanBatchId = await createQurbanSlotFixture(runId);
    const deps = { database, paymentProvider: mockProvider };

    const waqfResult = await createPayment(
      {
        module: 'WAQF',
        userId,
        grossAmount: '50000.00',
        paymentType: 'qris',
        disbursementDestination: destination,
        order: {
          nomorKwitansi: `KW-${runId}-WAQF`,
          waqfProgramId: waqfFixture.programId,
          namaWakif: 'Wakif Uji',
          bentukWakaf: 'UANG',
          nominal: '50000.00',
          metodePembayaran: 'QRIS',
        },
      },
      deps
    );

    const zakatResult = await createPayment(
      {
        module: 'ZAKAT',
        userId,
        grossAmount: '50000.00',
        paymentType: 'qris',
        disbursementDestination: destination,
        order: {
          nomorKwitansi: `KW-${runId}-ZAKAT`,
          namaMuzakki: 'Muzakki Uji',
          jenisZakat: 'MAAL_PENGHASILAN',
          metodePembayaran: 'TRANSFER',
          nominal: '50000.00',
        },
      },
      deps
    );

    const qurbanResult = await createPayment(
      {
        module: 'QURBAN',
        userId,
        grossAmount: '50000.00',
        paymentType: 'qris',
        disbursementDestination: destination,
        order: {
          namaPengqurban: 'Pengqurban Uji',
          jenisHewan: 'KAMBING',
          tipeKepemilikan: 'INDIVIDU',
          metodePembayaran: 'QRIS',
          totalHarga: '50000.00',
          nominalDibayar: '50000.00',
          sisaTagihan: '0',
        },
        slots: { hewanBatchId: qurbanBatchId, jumlahSlot: 1 },
      },
      deps
    );

    const results = [waqfResult, zakatResult, qurbanResult];
    for (const result of results) {
      expect(isValidOrderId(result.orderId)).toBe(true);
      expect(result.transaction.statusPembayaran).toBe('PENDING');
      expect(result.transaction.amount).toBe('50000.00');
      expect(result.transaction.paymentGatewayRef).toBe(result.orderId);
    }

    const waqfOrder = await database
      .select()
      .from(schema.waqfOrders)
      .where(eq(schema.waqfOrders.id, waqfResult.orderId));
    expect(waqfOrder[0]?.transactionId).toBe(waqfResult.transactionId);

    const zakatOrder = await database
      .select()
      .from(schema.zakatOrders)
      .where(eq(schema.zakatOrders.id, zakatResult.orderId));
    expect(zakatOrder[0]?.transactionId).toBe(zakatResult.transactionId);

    const qurbanOrder = await database
      .select()
      .from(schema.qurbanOrders)
      .where(eq(schema.qurbanOrders.id, qurbanResult.orderId));
    expect(qurbanOrder[0]?.transactionId).toBe(qurbanResult.transactionId);

    await database
      .delete(schema.zakatOrders)
      .where(eq(schema.zakatOrders.id, zakatResult.orderId));
    await database
      .delete(schema.qurbanOrders)
      .where(eq(schema.qurbanOrders.id, qurbanResult.orderId));
    await deleteQurbanSlotFixture(qurbanBatchId);
    await deleteTransactionAndUser(userId);
    await deleteWaqfFixture(waqfFixture);
  });

  test('provider failure rolls back every anchor row (AMW-04 proof)', async () => {
    const runId = ulid().toLowerCase();
    const userId = await insertUser(runId, 'rollback');
    const failingProvider: PaymentProvider = {
      createTransaction: () =>
        Promise.reject(new Error('payment provider unavailable')),
      verifyWebhookSignature: () => false,
    };

    await expect(
      createPayment(
        {
          module: 'ZAKAT',
          userId,
          grossAmount: '50000.00',
          paymentType: 'qris',
          disbursementDestination: destination,
          order: {
            nomorKwitansi: `KW-${runId}-ROLLBACK`,
            namaMuzakki: 'Muzakki Rollback',
            jenisZakat: 'MAAL_PENGHASILAN',
            metodePembayaran: 'TRANSFER',
            nominal: '50000.00',
          },
        },
        { database, paymentProvider: failingProvider }
      )
    ).rejects.toThrow('payment provider unavailable');

    const orphanTransactions = await database
      .select({ id: schema.transactions.id })
      .from(schema.transactions)
      .where(eq(schema.transactions.wakifId, userId));
    const orphanOrders = await database
      .select({ id: schema.zakatOrders.id })
      .from(schema.zakatOrders)
      .where(eq(schema.zakatOrders.muzakkiId, userId));

    expect(orphanTransactions).toHaveLength(0);
    expect(orphanOrders).toHaveLength(0);

    await database.delete(schema.users).where(eq(schema.users.id, userId));
  });
});
