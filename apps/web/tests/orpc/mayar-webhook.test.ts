import { describe, expect, test } from 'bun:test';
import type { PaymentProvider } from '@amwal/core/payment/types';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Database } from '../../src/lib/db';
import { assertTestDatabase } from '../test-database-guard';

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const schema = await import('../../src/lib/db/schema');
const { MayarPaymentProvider } = await import(
  '@amwal/core/payment/mayar.provider'
);
const { createPayment } = await import('@amwal/core/payment/service');
const { handlePaymentWebhook } = await import('@amwal/core/payment/webhook');
const { toDisbursementDestination } = await import('@amwal/core/payment/types');

const database: Database = createDatabase(connectionUrl);
const MAYAR_TOKEN = 'm'.repeat(128);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status,
  });
}

function mayarRequest(providerRef: string, token = MAYAR_TOKEN): Request {
  return new Request('http://localhost/api/webhooks/payment', {
    body: JSON.stringify({
      data: { status: 'SUCCESS', transactionId: providerRef },
      event: 'payment.received',
    }),
    headers: {
      'content-type': 'application/json',
      'x-callback-token': token,
    },
    method: 'POST',
  });
}

async function createSeed(): Promise<{
  destination: string;
  orderId: string;
  providerRef: string;
  transactionId: string;
  userId: string;
}> {
  const runId = ulid().toLowerCase();
  const userId = `p11-mayar-${runId}-user`;
  const destination = `FUND_MAYAR_${runId}`;
  const providerRef = `mayar-tx-${runId}`;
  const fixedProvider: PaymentProvider = {
    createTransaction: () =>
      Promise.resolve({
        paymentType: 'qris',
        providerRef,
        redirectUrl: 'https://amwal-its.myr.lat/invoices/mayar-test',
      }),
    verifyWebhookSignature: () => true,
  };

  await database.insert(schema.users).values({
    id: userId,
    name: 'Mayar Webhook User',
    updatedAt: new Date().toISOString(),
  });

  const payment = await createPayment(
    {
      disbursementDestination: toDisbursementDestination(destination),
      grossAmount: '50000.00',
      module: 'ZAKAT',
      order: {
        jenisZakat: 'MAAL_PENGHASILAN',
        metodePembayaran: 'TRANSFER',
        namaMuzakki: 'Mayar Muzakki',
        nominal: '50000.00',
        nomorKwitansi: `KW-MAYAR-${runId}`,
      },
      paymentType: 'qris',
      userId,
    },
    { database, paymentProvider: fixedProvider }
  );

  await database.insert(schema.fundPools).values({
    balance: '1000',
    id: `p11-mayar-${runId}-pool`,
    kode: destination,
    nama: destination,
    updatedAt: new Date().toISOString(),
  });

  return {
    destination,
    orderId: payment.orderId,
    providerRef,
    transactionId: payment.transactionId,
    userId,
  };
}

async function cleanupSeed(seed: {
  destination: string;
  orderId: string;
  transactionId: string;
  userId: string;
}): Promise<void> {
  await database
    .delete(schema.zakatOrders)
    .where(eq(schema.zakatOrders.id, seed.orderId));
  await database
    .delete(schema.transactions)
    .where(eq(schema.transactions.id, seed.transactionId));
  await database
    .delete(schema.fundPools)
    .where(eq(schema.fundPools.kode, seed.destination));
  await database.delete(schema.users).where(eq(schema.users.id, seed.userId));
}

async function readPaymentState(
  seed: Awaited<ReturnType<typeof createSeed>>
): Promise<{
  balance: number;
  orderStatus: string;
  transactionStatus: string;
}> {
  const [transaction] = await database
    .select({ status: schema.transactions.statusPembayaran })
    .from(schema.transactions)
    .where(eq(schema.transactions.id, seed.transactionId));
  const [order] = await database
    .select({ status: schema.zakatOrders.status })
    .from(schema.zakatOrders)
    .where(eq(schema.zakatOrders.id, seed.orderId));
  const [pool] = await database
    .select({ balance: schema.fundPools.balance })
    .from(schema.fundPools)
    .where(eq(schema.fundPools.kode, seed.destination));

  return {
    balance: Number(pool?.balance ?? 0),
    orderStatus: order?.status ?? '',
    transactionStatus: transaction?.status ?? '',
  };
}

function mayarProvider(
  fetchImpl: (
    input: RequestInfo | URL,
    init?: RequestInit
  ) => Promise<Response>,
  timeoutMs = 8000
) {
  return new MayarPaymentProvider({
    apiKey: 'sandbox-key',
    fetchImpl,
    timeoutMs,
    webhookSecret: MAYAR_TOKEN,
  });
}

describe('Mayar webhook adapter', () => {
  test('settles by payment_gateway_ref and increments ledger exactly once', async () => {
    const seed = await createSeed();

    try {
      const provider = mayarProvider(() =>
        Promise.resolve(
          jsonResponse({
            data: { amount: 50_000, id: seed.providerRef, status: 'paid' },
            statusCode: 200,
          })
        )
      );
      const response = await handlePaymentWebhook(
        mayarRequest(seed.providerRef),
        { database, paymentProvider: provider }
      );
      const state = await readPaymentState(seed);

      expect(response.status).toBe(200);
      expect(state.transactionStatus).toBe('LUNAS');
      expect(state.orderStatus).toBe('TERVERIFIKASI');
      expect(state.balance).toBe(1000 + 50_000);
    } finally {
      await cleanupSeed(seed);
    }
  });

  test('rejects an amount mismatch and leaves the anchor untouched', async () => {
    const seed = await createSeed();

    try {
      const provider = mayarProvider(() =>
        Promise.resolve(
          jsonResponse({
            data: { amount: 50_001, id: seed.providerRef, status: 'paid' },
            statusCode: 200,
          })
        )
      );
      const response = await handlePaymentWebhook(
        mayarRequest(seed.providerRef),
        { database, paymentProvider: provider }
      );
      const state = await readPaymentState(seed);

      expect(response.status).toBe(409);
      expect(state.transactionStatus).toBe('PENDING');
      expect(state.orderStatus).toBe('MENUNGGU_VERIFIKASI');
      expect(state.balance).toBe(1000);
    } finally {
      await cleanupSeed(seed);
    }
  });

  test('returns 504 on re-fetch timeout and never marks GAGAL', async () => {
    const seed = await createSeed();

    try {
      const provider = mayarProvider(() => {
        const error = new Error('timeout');
        error.name = 'TimeoutError';
        return Promise.reject(error);
      });
      const response = await handlePaymentWebhook(
        mayarRequest(seed.providerRef),
        { database, paymentProvider: provider }
      );
      const state = await readPaymentState(seed);

      expect(response.status).toBe(504);
      expect(state.transactionStatus).toBe('PENDING');
      expect(state.orderStatus).toBe('MENUNGGU_VERIFIKASI');
      expect(state.balance).toBe(1000);
    } finally {
      await cleanupSeed(seed);
    }
  });

  test('rejects an invalid callback token before touching the database', async () => {
    const seed = await createSeed();
    let fetchCalls = 0;

    try {
      const provider = mayarProvider(() => {
        fetchCalls += 1;
        return Promise.resolve(jsonResponse({}));
      });
      const response = await handlePaymentWebhook(
        mayarRequest(seed.providerRef, 'wrong-token'),
        { database, paymentProvider: provider }
      );
      const state = await readPaymentState(seed);

      expect(fetchCalls).toBe(0);
      expect(response.status).toBe(403);
      expect(state.transactionStatus).toBe('PENDING');
      expect(state.balance).toBe(1000);
    } finally {
      await cleanupSeed(seed);
    }
  });
});
