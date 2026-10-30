import { describe, expect, test } from 'bun:test';
import type { PaymentProvider } from '@amwal/core/payment/types';
import { eq, inArray } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Database } from '../../src/lib/db';
import { assertTestDatabase } from '../test-database-guard';

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const schema = await import('../../src/lib/db/schema');
const { createPayment } = await import('@amwal/core/payment/service');
const { toDisbursementDestination } = await import('@amwal/core/payment/types');
const { handle } = await import('../../src/routes/api/dev/mock-webhook');

const database: Database = createDatabase(connectionUrl);
const now = () => new Date().toISOString();

async function insertUser(label: string): Promise<string> {
  const id = `p11-sim-${ulid().toLowerCase()}-${label}`;
  await database.insert(schema.users).values({
    id,
    name: `Simulator ${label}`,
    updatedAt: now(),
  });
  return id;
}

function fixedProvider(providerRef: string): PaymentProvider {
  return {
    createTransaction: () =>
      Promise.resolve({
        paymentType: 'qris',
        providerRef,
        redirectUrl: `https://amwal-its.myr.lat/invoices/${providerRef}`,
      }),
    verifyWebhookSignature: () => true,
  };
}

async function getOrder(orderId: string): Promise<{
  body: {
    data?: {
      amount: string | null;
      module: string;
      orderId: string;
      status: string;
    };
  };
  response: Response;
}> {
  const response = await handle({
    request: new Request(
      `http://localhost/api/dev/mock-webhook?orderId=${encodeURIComponent(orderId)}`
    ),
  });
  return {
    body: (await response.json()) as {
      data?: {
        amount: string | null;
        module: string;
        orderId: string;
        status: string;
      };
    },
    response,
  };
}

async function simulateMayar(orderId: string): Promise<Response> {
  return await handle({
    request: new Request('http://localhost/api/dev/mock-webhook', {
      body: JSON.stringify({ mode: 'mayar', orderId }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }),
  });
}

async function cleanup(
  userId: string,
  destination: string,
  orderId: string
): Promise<void> {
  await database
    .delete(schema.notifications)
    .where(eq(schema.notifications.userId, userId));
  await database
    .delete(schema.zakatOrders)
    .where(eq(schema.zakatOrders.id, orderId));
  await database
    .delete(schema.infaqOrders)
    .where(eq(schema.infaqOrders.orderId, orderId));
  await database
    .delete(schema.transactions)
    .where(eq(schema.transactions.wakifId, userId));
  await database
    .delete(schema.fundPools)
    .where(eq(schema.fundPools.kode, destination));
  await database.delete(schema.users).where(eq(schema.users.id, userId));
}

describe('dev payment simulator route', () => {
  test('creates a v2 zakat order, settles it through Mayar simulator, and reports LUNAS', async () => {
    const runId = ulid().toLowerCase();
    const userId = await insertUser(`zakat-${runId}`);
    const destination = `FUND_SIM_ZAKAT_${runId}`;
    const providerRef = `mayar-sim-${runId}`;
    let orderId = '';

    try {
      const payment = await createPayment(
        {
          disbursementDestination: toDisbursementDestination(destination),
          grossAmount: '50000.00',
          module: 'ZAKAT',
          order: {
            jenisZakat: 'MAAL_PENGHASILAN',
            metodePembayaran: 'TRANSFER',
            namaMuzakki: 'Simulator Muzakki',
            nominal: '50000.00',
            nomorKwitansi: `KW-SIM-${runId}`,
          },
          paymentType: 'qris',
          userId,
        },
        { database, paymentProvider: fixedProvider(providerRef) }
      );
      orderId = payment.orderId;

      const before = await getOrder(payment.orderId);
      expect(before.response.status).toBe(200);
      expect(before.body.data?.orderId).toBe(payment.orderId);
      expect(before.body.data?.module).toBe('Zakat');
      expect(before.body.data?.amount).toBe('50000.00');
      expect(before.body.data?.status).toBe('PENDING');

      const simulation = await simulateMayar(payment.orderId);
      expect(simulation.status).toBe(200);

      const after = await getOrder(payment.orderId);
      expect(after.body.data?.status).toBe('LUNAS');

      const [transaction] = await database
        .select({ status: schema.transactions.statusPembayaran })
        .from(schema.transactions)
        .where(eq(schema.transactions.id, payment.transactionId));
      const [order] = await database
        .select({ status: schema.zakatOrders.status })
        .from(schema.zakatOrders)
        .where(eq(schema.zakatOrders.id, payment.orderId));
      const [pool] = await database
        .select({ balance: schema.fundPools.balance })
        .from(schema.fundPools)
        .where(eq(schema.fundPools.kode, destination));

      expect(transaction?.status).toBe('LUNAS');
      expect(order?.status).toBe('TERVERIFIKASI');
      expect(Number(pool?.balance)).toBe(50_000);
    } finally {
      await cleanup(userId, destination, orderId);
    }
  });

  test('accepts a legacy AMW-* order ID in the lookup path', async () => {
    const runId = ulid().toLowerCase();
    const userId = await insertUser(`legacy-${runId}`);
    const transactionId = `AMW-TXN-${ulid()}`;
    const orderId = `AMW-ZAKAT-${ulid()}`;
    const destination = `FUND_SIM_LEGACY_${runId}`;

    try {
      await database.insert(schema.transactions).values({
        amount: '25000.00',
        disbursementDestination: destination,
        id: transactionId,
        jenisTransaksi: 'ZAKAT',
        paymentGatewayRef: orderId,
        paymentMethod: 'qris',
        statusPembayaran: 'PENDING',
        wakifId: userId,
      });
      await database.insert(schema.zakatOrders).values({
        id: orderId,
        jenisZakat: 'MAAL_PENGHASILAN',
        metodePembayaran: 'TRANSFER',
        namaMuzakki: 'Legacy Muzakki',
        nominal: '25000.00',
        nomorKwitansi: `KW-LEGACY-${runId}`,
        muzakkiId: userId,
        status: 'MENUNGGU_VERIFIKASI',
        transactionId,
      });

      const result = await getOrder(orderId);
      expect(result.response.status).toBe(200);
      expect(result.body.data?.orderId).toBe(orderId);
      expect(result.body.data?.module).toBe('Zakat');
    } finally {
      await database
        .delete(schema.zakatOrders)
        .where(eq(schema.zakatOrders.id, orderId));
      await database
        .delete(schema.transactions)
        .where(inArray(schema.transactions.id, [transactionId]));
      await database.delete(schema.users).where(eq(schema.users.id, userId));
    }
  });

  test('labels SEDEKAH_* Infaq orders as Sedekah, not Infaq', async () => {
    const runId = ulid().toLowerCase();
    const userId = await insertUser(`sedekah-${runId}`);
    const destination = `FUND_SIM_SEDEKAH_${runId}`;
    const providerRef = `mayar-sedekah-${runId}`;
    let orderId = '';

    try {
      const payment = await createPayment(
        {
          disbursementDestination: toDisbursementDestination(destination),
          grossAmount: '30000.00',
          module: 'INFAQ',
          order: {
            jenis: 'SEDEKAH_YATIM',
            namaPenginfaq: 'Simulator Sedekah',
            nominal: '30000.00',
          },
          paymentType: 'qris',
          userId,
        },
        { database, paymentProvider: fixedProvider(providerRef) }
      );
      orderId = payment.orderId;

      const result = await getOrder(payment.orderId);
      expect(result.response.status).toBe(200);
      expect(result.body.data?.module).toBe('Sedekah');

      const simulation = await simulateMayar(payment.orderId);
      expect(simulation.status).toBe(200);

      const after = await getOrder(payment.orderId);
      expect(after.body.data?.status).toBe('LUNAS');
    } finally {
      await cleanup(userId, destination, orderId);
    }
  });
});
