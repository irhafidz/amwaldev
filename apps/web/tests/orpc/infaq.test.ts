import { describe, expect, test } from 'bun:test';
import type { PaymentProvider } from '@amwal/core/payment/types';
import { call } from '@orpc/server';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Database } from '../../src/lib/db';
import { assertTestDatabase } from '../test-database-guard';
import { createTestCaller } from './test-utils';

/**
 * Putaran 17, Batch 3 — the oRPC-side twin of
 * `apps/server/tests/infaq/infaq-order.test.ts`. Same full-flow, constraint,
 * and webhook-settlement cases, exercised through `router.infaq.*` via
 * `call()`. Uses `createTestCaller` (Batch 5) for context setup.
 */

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const schema = await import('../../src/lib/db/schema');
const { router } = await import('../../src/lib/orpc/router');
const { handlePaymentWebhook } = await import('@amwal/core/payment/webhook');
const { createMidtransSignatureKey } = await import(
  '@amwal/core/payment/signature'
);

const database: Database = createDatabase(connectionUrl);
const serverKey = 'SB-Mid-server-P17-B3-infaq-key-123456';

function createCapturingProvider() {
  const calls: Array<{
    orderId: string;
    grossAmount: string;
    paymentType: string;
  }> = [];
  const provider: PaymentProvider = {
    createTransaction: (payload) => {
      calls.push({
        orderId: payload.orderId,
        grossAmount: String(payload.grossAmount),
        paymentType: payload.paymentType,
      });
      return Promise.resolve({
        providerRef: `snap-${payload.orderId}`,
        redirectUrl: `https://payment.example/${payload.orderId}`,
        paymentType: payload.paymentType,
      });
    },
    verifyWebhookSignature: (payload, signature) =>
      signature === createMidtransSignatureKey(payload, serverKey),
  };
  return { provider, calls };
}

const { provider, calls } = createCapturingProvider();

function ctx() {
  return createTestCaller({ database, user: null, paymentProvider: provider });
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

async function postOrder() {
  const donorEmail = `infaq-${ulid().toLowerCase()}@example.com`;
  // Random, not hardcoded — apps/server/tests/infaq/infaq-order.test.ts uses
  // the exact same literal; resolveGuestDonor() falls back to a phone
  // lookup, so a simultaneous dual-run of both suites could otherwise
  // silently reuse (and this test's cleanup then delete) the other suite's
  // in-flight guest user row.
  const donorPhone = `08${String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, '0')}`;
  const result = await call(
    router.infaq.createOrder,
    {
      nominal: 50_000,
      jenis: 'INFAQ_UMUM',
      namaPenginfaq: 'Penginfaq Uji',
      teleponPenginfaq: donorPhone,
      emailPenginfaq: donorEmail,
      doa: 'Semoga berkah',
    },
    { context: await ctx() }
  );
  return { result, donorEmail };
}

async function cleanupOrder(
  orderId: string,
  transactionId: string,
  donorEmail: string,
  destination: string
): Promise<void> {
  await database
    .delete(schema.infaqOrders)
    .where(eq(schema.infaqOrders.orderId, orderId));
  await database
    .delete(schema.transactions)
    .where(eq(schema.transactions.id, transactionId));
  await database
    .delete(schema.fundPools)
    .where(eq(schema.fundPools.kode, destination));
  const [user] = await database
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, donorEmail));
  if (user) {
    await database.delete(schema.users).where(eq(schema.users.id, user.id));
  }
}

describe('oRPC infaq: order creation and settlement', () => {
  test('full order flow creates a pending infaq order and dispatches createPayment', async () => {
    const { result, donorEmail } = await postOrder();

    expect(calls).toHaveLength(1);
    expect(calls[0]?.orderId).toBe(result.data.orderId);
    expect(calls[0]?.grossAmount).toBe('50000');

    const [order] = await database
      .select()
      .from(schema.infaqOrders)
      .where(eq(schema.infaqOrders.orderId, result.data.orderId));
    expect(order?.status).toBe('PENDING');
    expect(order?.jenis).toBe('INFAQ_UMUM');
    expect(order?.nominal).toBe('50000.00');
    expect(order?.snapToken).toBe(result.data.snapToken);
    expect(order?.snapRedirectUrl).toBe(result.data.snapRedirectUrl);

    const [transaction] = await database
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.id, order?.transactionId ?? ''));
    expect(transaction?.statusPembayaran).toBe('PENDING');
    expect(transaction?.jenisTransaksi).toBe('INFAQ');

    await cleanupOrder(
      result.data.orderId,
      order?.transactionId ?? '',
      donorEmail,
      'INFAQ_INFAQ_UMUM'
    );
  });

  test('database check constraints reject invalid jenis and status', async () => {
    const runId = ulid().toLowerCase();
    const base = {
      id: `infaq-invalid-${runId}`,
      orderId: `INF-${runId}`,
      namaPenginfaq: 'Penginfaq Invalid',
      nominal: '10000',
      doa: null,
    };

    await expect(
      (async () => {
        await database.insert(schema.infaqOrders).values({
          ...base,
          jenis: 'INVALID_JENIS',
          status: 'PENDING',
        });
      })()
    ).rejects.toThrow();

    await expect(
      (async () => {
        await database.insert(schema.infaqOrders).values({
          ...base,
          id: `${base.id}-status`,
          orderId: `INF-${runId}-status`,
          jenis: 'INFAQ_UMUM',
          status: 'INVALID_STATUS',
        });
      })()
    ).rejects.toThrow();
  });

  test('webhook settlement transitions infaq order to SETTLED', async () => {
    const { result, donorEmail } = await postOrder();

    const [orderBefore] = await database
      .select({ transactionId: schema.infaqOrders.transactionId })
      .from(schema.infaqOrders)
      .where(eq(schema.infaqOrders.orderId, result.data.orderId));

    const webhookResponse = await handlePaymentWebhook(
      settlementRequest(result.data.orderId, '50000.00'),
      { database, paymentProvider: provider }
    );
    expect(webhookResponse.status).toBe(200);

    const [order] = await database
      .select()
      .from(schema.infaqOrders)
      .where(eq(schema.infaqOrders.orderId, result.data.orderId));
    expect(order?.status).toBe('SETTLED');

    await cleanupOrder(
      result.data.orderId,
      orderBefore?.transactionId ?? '',
      donorEmail,
      'INFAQ_INFAQ_UMUM'
    );
  });

  test('order status lookup returns the persisted order', async () => {
    const { result, donorEmail } = await postOrder();

    const status = await call(
      router.infaq.orderStatus,
      { orderId: result.data.orderId },
      { context: await ctx() }
    );
    expect(status.success).toBe(true);
    expect(status.data.orderId).toBe(result.data.orderId);
    // Contact details are masked on the public lookup...
    expect(status.data.emailPenginfaq).toMatch(/^i\*\*\*.@example\.com$/);
    expect(status.data.emailPenginfaq).not.toBe(donorEmail);
    expect(status.data.teleponPenginfaq).toMatch(/^08\d\d\*+\d{3}$/);
    // ...while the stored row stays intact.
    const [stored] = await database
      .select({ email: schema.infaqOrders.emailPenginfaq })
      .from(schema.infaqOrders)
      .where(eq(schema.infaqOrders.orderId, result.data.orderId));
    expect(stored?.email).toBe(donorEmail);

    const [order] = await database
      .select({ transactionId: schema.infaqOrders.transactionId })
      .from(schema.infaqOrders)
      .where(eq(schema.infaqOrders.orderId, result.data.orderId));

    await cleanupOrder(
      result.data.orderId,
      order?.transactionId ?? '',
      donorEmail,
      'INFAQ_INFAQ_UMUM'
    );
  });
});

describe('oRPC infaq: payment method selection', () => {
  const base = {
    nominal: 25_000,
    jenis: 'INFAQ_UMUM' as const,
    namaPenginfaq: 'Penginfaq Metode',
  };

  function uniqueContact() {
    return {
      emailPenginfaq: `infaq-${ulid().toLowerCase()}@example.com`,
      teleponPenginfaq: `08${String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, '0')}`,
    };
  }

  test.each(['virtual_account', 'bank_transfer'])(
    '%s is rejected before any payment is created (Mayar is QRIS-only)',
    async (paymentType) => {
      const before = calls.length;
      await expect(
        call(router.infaq.createOrder, { ...base, paymentType } as never, {
          context: await ctx(),
        })
      ).rejects.toThrow();
      expect(calls.length).toBe(before);
    }
  );

  test('forwards paymentType qris, masks anonymous donors, and exposes the transaction on status', async () => {
    const contact = uniqueContact();
    const result = await call(
      router.infaq.createOrder,
      {
        ...base,
        ...contact,
        paymentType: 'qris',
        isAnonymous: true,
      },
      { context: await ctx() }
    );

    const sent = calls.at(-1);
    expect(sent?.orderId).toBe(result.data.orderId);
    expect(sent?.paymentType).toBe('qris');

    const [order] = await database
      .select()
      .from(schema.infaqOrders)
      .where(eq(schema.infaqOrders.orderId, result.data.orderId));
    expect(order?.namaPenginfaq).toBe('Hamba Allah');

    const status = await call(
      router.infaq.orderStatus,
      { orderId: result.data.orderId },
      { context: await ctx() }
    );
    expect(status.data.transaction?.id).toBe(order?.transactionId ?? 'missing');
    expect(status.data.transaction?.statusPembayaran).toBe('PENDING');

    await cleanupOrder(
      result.data.orderId,
      order?.transactionId ?? '',
      contact.emailPenginfaq,
      'INFAQ_INFAQ_UMUM'
    );
  });
});
