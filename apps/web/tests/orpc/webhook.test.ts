import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Database } from '../../src/lib/db';
import { assertTestDatabase } from '../test-database-guard';

/**
 * Putaran 17, Batch 3 — the oRPC-side twin of
 * `apps/server/tests/payment/webhook-idempotency.test.ts` and
 * `webhook-gagal.test.ts`, plus a new fake-signature case. Exercises
 * `@amwal/core/payment/webhook`'s `handlePaymentWebhook` directly — the
 * exact function `apps/web/src/routes/api/webhooks/payment.ts` wraps with
 * zero additional logic, so testing it here proves the real HTTP route's
 * idempotency and signature behaviour.
 */

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const schema = await import('../../src/lib/db/schema');
const { createPayment } = await import('@amwal/core/payment/service');
const { handlePaymentWebhook } = await import('@amwal/core/payment/webhook');
const { MockPaymentProvider } = await import(
  '@amwal/core/payment/mock.provider'
);
const { toDisbursementDestination } = await import('@amwal/core/payment/types');
const { createMidtransSignatureKey } = await import(
  '@amwal/core/payment/signature'
);
type CreatePaymentResult = Awaited<ReturnType<typeof createPayment>>;

const database: Database = createDatabase(connectionUrl);
const serverKey = 'SB-Mid-server-P17-B3-webhook-key-123456';
const mockProvider = new MockPaymentProvider(serverKey);
const now = () => new Date().toISOString();

function webhookRequest(
  orderId: string,
  amount: `${number}`,
  transactionStatus: string,
  statusCode = '200',
  fraudStatus: string | undefined = 'accept',
  signingKey: string = serverKey
): Request {
  const payload = {
    order_id: orderId,
    status_code: statusCode,
    gross_amount: amount,
    transaction_status: transactionStatus,
    payment_type: 'qris',
    fraud_status: fraudStatus,
  };
  const signature = createMidtransSignatureKey(payload, signingKey);

  return new Request('http://localhost/api/webhooks/payment', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...payload, signature_key: signature }),
  });
}

async function createZakatSeed(): Promise<{
  userId: string;
  destination: string;
  payment: CreatePaymentResult;
}> {
  const runId = ulid().toLowerCase();
  const userId = `p17b3-${runId}-user`;
  const destination = `FUND_${runId}`;

  await database.insert(schema.users).values({
    id: userId,
    name: 'Webhook Test User',
    updatedAt: now(),
  });

  const payment = await createPayment(
    {
      module: 'ZAKAT',
      userId,
      grossAmount: '50000.00',
      paymentType: 'qris',
      disbursementDestination: toDisbursementDestination(destination),
      order: {
        nomorKwitansi: `KW-${runId}`,
        namaMuzakki: 'Webhook Muzakki',
        jenisZakat: 'MAAL_PENGHASILAN',
        metodePembayaran: 'TRANSFER',
        nominal: '50000.00',
      },
    },
    { database, paymentProvider: mockProvider }
  );

  await database.insert(schema.fundPools).values({
    id: `p17b3-${runId}-pool`,
    kode: destination,
    nama: destination,
    balance: '1000',
    updatedAt: now(),
  });

  return { userId, destination, payment };
}

async function deleteSeed(seed: Awaited<ReturnType<typeof createZakatSeed>>) {
  await database
    .delete(schema.zakatOrders)
    .where(eq(schema.zakatOrders.id, seed.payment.orderId));
  await database
    .delete(schema.transactions)
    .where(eq(schema.transactions.id, seed.payment.transactionId));
  await database
    .delete(schema.fundPools)
    .where(eq(schema.fundPools.kode, seed.destination));
  await database
    .delete(schema.notifications)
    .where(eq(schema.notifications.userId, seed.userId));
  await database.delete(schema.users).where(eq(schema.users.id, seed.userId));
}

async function fundPoolBalance(destination: string): Promise<number> {
  const [pool] = await database
    .select({ balance: schema.fundPools.balance })
    .from(schema.fundPools)
    .where(eq(schema.fundPools.kode, destination));
  return Number(pool?.balance ?? 0);
}

describe('payment webhook idempotency (oRPC twin)', () => {
  test('10 parallel identical settlement webhooks increment the ledger exactly once', async () => {
    const seed = await createZakatSeed();

    try {
      const responses = await Promise.all(
        Array.from({ length: 10 }, () =>
          handlePaymentWebhook(
            webhookRequest(seed.payment.orderId, '50000.00', 'settlement'),
            { database, paymentProvider: mockProvider }
          )
        )
      );

      for (const response of responses) {
        expect(response.status).toBe(200);
      }

      expect(await fundPoolBalance(seed.destination)).toBe(1000 + 50_000);

      const [transaction] = await database
        .select({ status: schema.transactions.statusPembayaran })
        .from(schema.transactions)
        .where(eq(schema.transactions.id, seed.payment.transactionId));
      expect(transaction?.status).toBe('LUNAS');

      const [order] = await database
        .select({ status: schema.zakatOrders.status })
        .from(schema.zakatOrders)
        .where(eq(schema.zakatOrders.id, seed.payment.orderId));
      expect(order?.status).toBe('TERVERIFIKASI');
    } finally {
      await deleteSeed(seed);
    }
  });

  test('out-of-order pending webhook cannot regress an already settled transaction', async () => {
    const seed = await createZakatSeed();

    try {
      const settlement = await handlePaymentWebhook(
        webhookRequest(seed.payment.orderId, '50000.00', 'settlement'),
        { database, paymentProvider: mockProvider }
      );
      expect(settlement.status).toBe(200);

      const pending = await handlePaymentWebhook(
        webhookRequest(seed.payment.orderId, '50000.00', 'pending', '201'),
        { database, paymentProvider: mockProvider }
      );
      expect(pending.status).toBe(200);

      expect(await fundPoolBalance(seed.destination)).toBe(1000 + 50_000);

      const [transaction] = await database
        .select({ status: schema.transactions.statusPembayaran })
        .from(schema.transactions)
        .where(eq(schema.transactions.id, seed.payment.transactionId));
      expect(transaction?.status).toBe('LUNAS');
    } finally {
      await deleteSeed(seed);
    }
  });

  test('deny webhook marks transaction GAGAL and order DITOLAK, ledger untouched', async () => {
    const seed = await createZakatSeed();

    try {
      const response = await handlePaymentWebhook(
        webhookRequest(seed.payment.orderId, '50000.00', 'deny', '202'),
        { database, paymentProvider: mockProvider }
      );

      expect(response.status).toBe(200);
      expect(await fundPoolBalance(seed.destination)).toBe(1000);

      const [transaction] = await database
        .select({ status: schema.transactions.statusPembayaran })
        .from(schema.transactions)
        .where(eq(schema.transactions.id, seed.payment.transactionId));
      expect(transaction?.status).toBe('GAGAL');

      const [order] = await database
        .select({ status: schema.zakatOrders.status })
        .from(schema.zakatOrders)
        .where(eq(schema.zakatOrders.id, seed.payment.orderId));
      expect(order?.status).toBe('DITOLAK');
    } finally {
      await deleteSeed(seed);
    }
  });

  test('out-of-order deny after settlement cannot regress a LUNAS transaction', async () => {
    const seed = await createZakatSeed();

    try {
      const settlement = await handlePaymentWebhook(
        webhookRequest(seed.payment.orderId, '50000.00', 'settlement'),
        { database, paymentProvider: mockProvider }
      );
      expect(settlement.status).toBe(200);

      const deny = await handlePaymentWebhook(
        webhookRequest(seed.payment.orderId, '50000.00', 'deny', '202'),
        { database, paymentProvider: mockProvider }
      );
      expect(deny.status).toBe(200);

      expect(await fundPoolBalance(seed.destination)).toBe(1000 + 50_000);

      const [transaction] = await database
        .select({ status: schema.transactions.statusPembayaran })
        .from(schema.transactions)
        .where(eq(schema.transactions.id, seed.payment.transactionId));
      expect(transaction?.status).toBe('LUNAS');
    } finally {
      await deleteSeed(seed);
    }
  });

  test('unknown order ID returns 404 with zero ledger mutation', async () => {
    const runId = ulid().toLowerCase();
    const destination = `FUND_UNKNOWN_${runId}`;
    const userId = `p17b3-${runId}-unknown-user`;

    await database.insert(schema.users).values({
      id: userId,
      name: 'Unknown User',
      updatedAt: now(),
    });
    await database.insert(schema.fundPools).values({
      id: `p17b3-${runId}-unknown-pool`,
      kode: destination,
      nama: destination,
      balance: '1000',
      updatedAt: now(),
    });

    try {
      const unknownOrderId = `AMW-ZAKAT-${'0'.repeat(26)}`;
      const response = await handlePaymentWebhook(
        webhookRequest(unknownOrderId, '50000.00', 'settlement'),
        { database, paymentProvider: mockProvider }
      );

      expect(response.status).toBe(404);
      expect(await fundPoolBalance(destination)).toBe(1000);
    } finally {
      await database
        .delete(schema.fundPools)
        .where(eq(schema.fundPools.kode, destination));
      await database.delete(schema.users).where(eq(schema.users.id, userId));
    }
  });

  test('a forged signature is rejected before touching the ledger', async () => {
    const seed = await createZakatSeed();

    try {
      const response = await handlePaymentWebhook(
        webhookRequest(
          seed.payment.orderId,
          '50000.00',
          'settlement',
          '200',
          'accept',
          'a-completely-wrong-server-key'
        ),
        { database, paymentProvider: mockProvider }
      );

      expect(response.status).toBe(403);
      const body = (await response.json()) as { error: string };
      expect(body.error).toContain('Invalid webhook signature');

      expect(await fundPoolBalance(seed.destination)).toBe(1000);

      const [transaction] = await database
        .select({ status: schema.transactions.statusPembayaran })
        .from(schema.transactions)
        .where(eq(schema.transactions.id, seed.payment.transactionId));
      expect(transaction?.status).toBe('PENDING');
    } finally {
      await deleteSeed(seed);
    }
  });
});
