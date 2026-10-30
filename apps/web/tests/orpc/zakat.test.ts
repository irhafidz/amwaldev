import { describe, expect, test } from 'bun:test';
import { call } from '@orpc/server';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Database } from '../../src/lib/db';
import { assertTestDatabase } from '../test-database-guard';
import { createTestCaller } from './test-utils';

/**
 * Putaran 17, Batch 3 — the oRPC-side twin of
 * `apps/server/tests/zakat/zakat-order.test.ts`. Same digital-vs-offline
 * branching and settlement webhook proof, exercised through
 * `router.zakat.*` via `call()`. Uses `createTestCaller` (Batch 5) for
 * context/JWT setup.
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
const serverKey = 'SB-Mid-server-P17-B3-zakat-key-123456';
const mockProvider = new MockPaymentProvider(serverKey);

function wakifContext(userId: string) {
  return createTestCaller({
    database,
    user: { userId, role: 'WAKIF' },
    paymentProvider: mockProvider,
  });
}

// Batch 5: randomized (not hardcoded) so this file's fixtures never collide
// with apps/server/tests/zakat/zakat-order.test.ts's identical phone
// literals when both suites run against the shared test DB simultaneously
// (the "dual-run" proof) — `users.phone` carries a unique constraint.
function randomPhone(): string {
  return `08${String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, '0')}`;
}

async function createWakifUser(name: string, phone: string): Promise<string> {
  const id = `p17b3-${ulid().toLowerCase()}-wakif`;
  await database.insert(schema.users).values({
    id,
    name,
    phone,
    updatedAt: new Date().toISOString(),
  });
  return id;
}

function settlementRequest(orderId: string, amount: `${number}`): Request {
  const payload = {
    order_id: orderId,
    status_code: '200',
    gross_amount: amount,
    transaction_status: 'settlement',
    payment_type: 'qris',
    fraud_status: 'accept',
  };
  const signature = createMidtransSignatureKey(payload, serverKey);

  return new Request('http://localhost/api/webhooks/payment', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...payload, signature_key: signature }),
  });
}

async function deleteUserById(userId: string): Promise<void> {
  await database.delete(schema.users).where(eq(schema.users.id, userId));
}

describe('oRPC zakat: order creation and settlement', () => {
  test('a guest must give a name (400); offline tunai/beras still needs an account (401)', async () => {
    const context = await createTestCaller({
      database,
      user: null,
      paymentProvider: mockProvider,
      headers: { 'x-forwarded-for': '203.0.113.10' },
    });
    const base = { programId: 'ZAKAT_DEST_UNAUTH', amount: 50_000 };

    await expect(
      call(
        router.zakat.createOrder,
        { ...base, paymentType: 'qris' },
        { context }
      )
    ).rejects.toMatchObject({ status: 400 });

    for (const paymentType of ['tunai', 'beras'] as const) {
      await expect(
        call(
          router.zakat.createOrder,
          { ...base, paymentType, donorName: 'Tamu Tunai' },
          { context }
        )
      ).rejects.toMatchObject({ status: 401 });
    }
  });

  test('digital zakat order always creates a matching PENDING transaction (AMW-04)', async () => {
    const runId = ulid().toLowerCase();
    const programId = `ZAKAT_DEST_${runId}`;
    const userId = await createWakifUser('Zakat Digital Donor', randomPhone());
    const context = await wakifContext(userId);

    const result = await call(
      router.zakat.createOrder,
      { programId, amount: 50_000, paymentType: 'qris', isAnonymous: false },
      { context }
    );
    if (typeof result.transactionId !== 'string') {
      throw new Error('expected digital payment result');
    }
    const transactionId = result.transactionId;

    const [order] = await database
      .select()
      .from(schema.zakatOrders)
      .where(eq(schema.zakatOrders.id, result.orderId));
    expect(order?.transactionId).toBe(transactionId);

    const [transaction] = await database
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.id, transactionId));
    expect(transaction?.statusPembayaran).toBe('PENDING');
    expect(transaction?.jenisTransaksi).toBe('ZAKAT');

    await database
      .delete(schema.zakatOrders)
      .where(eq(schema.zakatOrders.id, result.orderId));
    await database
      .delete(schema.transactions)
      .where(eq(schema.transactions.id, transactionId));
    await deleteUserById(userId);
  });

  test('persists fitrah details and scopes orderStatus to the owner', async () => {
    const programId = `ZAKAT_DEST_${ulid().toLowerCase()}`;
    const ownerId = await createWakifUser('Zakat Owner', randomPhone());
    const otherId = await createWakifUser('Zakat Other', randomPhone());

    const result = await call(
      router.zakat.createOrder,
      {
        programId,
        amount: 90_000,
        paymentType: 'qris',
        jenisZakat: 'FITRAH',
        jumlahJiwa: 2,
        namaDizakatkan: 'Ahmad, Siti',
        doa: 'Semoga berkah',
      },
      { context: await wakifContext(ownerId) }
    );
    if (typeof result.transactionId !== 'string') {
      throw new Error('expected digital payment result');
    }

    const status = await call(
      router.zakat.orderStatus,
      { orderId: result.orderId },
      { context: await wakifContext(ownerId) }
    );
    expect(status.data.order.jumlahJiwa).toBe(2);
    expect(status.data.order.namaDizakatkan).toBe('Ahmad, Siti');
    expect(status.data.transaction?.statusPembayaran).toBe('PENDING');

    // Anyone holding the order ID may open the status page, but only the
    // owner sees personal details (order IDs are sequential, so guessable).
    for (const viewer of [
      await wakifContext(otherId),
      await createTestCaller({
        database,
        user: null,
        paymentProvider: mockProvider,
      }),
    ]) {
      const redacted = await call(
        router.zakat.orderStatus,
        { orderId: result.orderId },
        { context: viewer }
      );
      expect(redacted.data.order.namaMuzakki).toBe('Hamba Allah');
      expect(redacted.data.order.jumlahJiwa).toBeNull();
      expect(redacted.data.order.namaDizakatkan).toBeNull();
      expect(redacted.data.transaction?.id).toBeNull();
      expect(redacted.data.transaction?.statusPembayaran).toBe('PENDING');
      const json = JSON.stringify(redacted.data);
      expect(json).not.toContain('Ahmad, Siti');
      expect(json).not.toContain('Zakat Owner');
      expect(json).not.toContain('Semoga berkah');
    }

    await database
      .delete(schema.zakatOrders)
      .where(eq(schema.zakatOrders.id, result.orderId));
    await database
      .delete(schema.transactions)
      .where(eq(schema.transactions.id, result.transactionId));
    await deleteUserById(ownerId);
    await deleteUserById(otherId);
  });

  test('offline tunai zakat order keeps transactionId NULL', async () => {
    const runId = ulid().toLowerCase();
    const programId = `ZAKAT_DEST_${runId}`;
    const userId = await createWakifUser('Zakat Offline Donor', randomPhone());
    const context = await wakifContext(userId);

    const result = await call(
      router.zakat.createOrder,
      { programId, amount: 45_000, paymentType: 'tunai', isAnonymous: false },
      { context }
    );
    expect(result.requiresManualVerification).toBe(true);

    const [order] = await database
      .select()
      .from(schema.zakatOrders)
      .where(eq(schema.zakatOrders.id, result.orderId));
    expect(order?.transactionId).toBeNull();
    expect(order?.metodePembayaran).toBe('TUNAI');

    await database
      .delete(schema.zakatOrders)
      .where(eq(schema.zakatOrders.id, result.orderId));
    await deleteUserById(userId);
  });

  test('zakat settlement webhook verifies order and increments destination fund pool', async () => {
    const runId = ulid().toLowerCase();
    const programId = `ZAKAT_DEST_${runId}`;
    const userId = await createWakifUser(
      'Zakat Settlement Donor',
      randomPhone()
    );
    const context = await wakifContext(userId);

    await database.insert(schema.fundPools).values({
      id: `p17b3-${runId}-pool`,
      kode: programId,
      nama: programId,
      balance: '1000',
      updatedAt: new Date().toISOString(),
    });

    const created = await call(
      router.zakat.createOrder,
      {
        programId,
        amount: 75_000,
        paymentType: 'qris',
        isAnonymous: true,
      },
      { context }
    );
    if (typeof created.transactionId !== 'string') {
      throw new Error('expected digital payment result');
    }
    const transactionId = created.transactionId;

    const webhookResponse = await handlePaymentWebhook(
      settlementRequest(created.orderId, '75000.00'),
      { database, paymentProvider: mockProvider }
    );
    expect(webhookResponse.status).toBe(200);

    const [order] = await database
      .select({ status: schema.zakatOrders.status })
      .from(schema.zakatOrders)
      .where(eq(schema.zakatOrders.id, created.orderId));
    expect(order?.status).toBe('TERVERIFIKASI');

    const [pool] = await database
      .select({ balance: schema.fundPools.balance })
      .from(schema.fundPools)
      .where(eq(schema.fundPools.kode, programId));
    expect(Number(pool?.balance ?? 0)).toBe(1000 + 75_000);

    await database
      .delete(schema.zakatOrders)
      .where(eq(schema.zakatOrders.id, created.orderId));
    await database
      .delete(schema.transactions)
      .where(eq(schema.transactions.id, transactionId));
    await database
      .delete(schema.fundPools)
      .where(eq(schema.fundPools.kode, programId));
    await deleteUserById(userId);
  });

  test('calculate: FITRAH returns a zakatAmount using the active price config', async () => {
    const [config] = await database
      .select()
      .from(schema.zakatFitrahConfig)
      .where(eq(schema.zakatFitrahConfig.isActive, true))
      .limit(1);

    if (!config) {
      // No fixture seeded for zakat fitrah config in this environment —
      // this branch is proven end-to-end in apps/server's own suite.
      return;
    }

    const context = await createTestCaller({ database, user: null });
    const result = await call(
      router.zakat.calculate,
      { jenisZakat: 'FITRAH', jumlahJiwa: 4 },
      { context }
    );
    expect(result.data.jenisZakat).toBe('FITRAH');
    expect(Number(result.data.zakatAmount)).toBeGreaterThanOrEqual(0);
  });
});
