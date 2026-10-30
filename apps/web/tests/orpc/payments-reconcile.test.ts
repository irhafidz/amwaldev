import { describe, expect, test } from 'bun:test';
import type { PaymentProvider } from '@amwal/core/payment/types';
import { toDisbursementDestination } from '@amwal/core/payment/types';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Database } from '../../src/lib/db';
import { assertTestDatabase } from '../test-database-guard';

/**
 * [I-11] `@amwal/core/payment/reconciliation` and the HTTP wrapper
 * `routes/api/cron/payments-reconcile.ts`. Same seeding style as
 * `mayar-webhook.test.ts` — a fixed `PaymentProvider` test double, no real
 * network calls.
 */

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const schema = await import('../../src/lib/db/schema');
const { createPayment } = await import('@amwal/core/payment/service');
const { reconcilePendingTransactions } = await import(
  '@amwal/core/payment/reconciliation'
);
const { handle: cronHandle } = await import(
  '../../src/routes/api/cron/payments-reconcile'
);

const database: Database = createDatabase(connectionUrl);
const STALE_MINUTES = 15;

function minutesAgoIso(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

async function seedPendingZakat(): Promise<{
  destination: string;
  orderId: string;
  providerRef: string;
  transactionId: string;
  userId: string;
}> {
  const runId = ulid().toLowerCase();
  const userId = `p11-cron-${runId}-user`;
  const destination = `FUND_CRON_${runId}`;
  const providerRef = `mayar-cron-${runId}`;
  const fixedProvider: PaymentProvider = {
    createTransaction: () =>
      Promise.resolve({
        paymentType: 'qris',
        providerRef,
        redirectUrl: 'https://amwal-its.myr.lat/invoices/cron-test',
      }),
    verifyWebhookSignature: () => true,
  };

  await database.insert(schema.users).values({
    id: userId,
    name: 'Cron Reconcile User',
    updatedAt: new Date().toISOString(),
  });

  const payment = await createPayment(
    {
      disbursementDestination: toDisbursementDestination(destination),
      grossAmount: '75000.00',
      module: 'ZAKAT',
      order: {
        jenisZakat: 'MAAL_PENGHASILAN',
        metodePembayaran: 'TRANSFER',
        namaMuzakki: 'Cron Muzakki',
        nominal: '75000.00',
        nomorKwitansi: `KW-CRON-${runId}`,
      },
      paymentType: 'qris',
      userId,
    },
    { database, paymentProvider: fixedProvider }
  );

  await database.insert(schema.fundPools).values({
    balance: '0',
    id: `p11-cron-${runId}-pool`,
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

async function backdateCreatedAt(
  transactionId: string,
  minutesAgo: number
): Promise<void> {
  await database
    .update(schema.transactions)
    .set({ createdAt: minutesAgoIso(minutesAgo) })
    .where(eq(schema.transactions.id, transactionId));
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

async function readState(seed: {
  destination: string;
  orderId: string;
  transactionId: string;
}): Promise<{ balance: number; status: string }> {
  const [transaction] = await database
    .select({ status: schema.transactions.statusPembayaran })
    .from(schema.transactions)
    .where(eq(schema.transactions.id, seed.transactionId));
  const [pool] = await database
    .select({ balance: schema.fundPools.balance })
    .from(schema.fundPools)
    .where(eq(schema.fundPools.kode, seed.destination));

  return {
    balance: Number(pool?.balance ?? 0),
    status: transaction?.status ?? '',
  };
}

function reconcilableProvider(
  handler: (
    providerRef: string
  ) => ReturnType<NonNullable<PaymentProvider['reconcileTransaction']>>
): PaymentProvider {
  return {
    createTransaction: () => {
      throw new Error('not used in this test');
    },
    verifyWebhookSignature: () => false,
    reconcileTransaction: handler,
  };
}

describe('reconcilePendingTransactions [I-11]', () => {
  test('supported: false for a provider without reconcileTransaction', async () => {
    const nonPollingProvider: PaymentProvider = {
      createTransaction: () => {
        throw new Error('not used');
      },
      verifyWebhookSignature: () => true,
    };

    const summary = await reconcilePendingTransactions({
      database,
      paymentProvider: nonPollingProvider,
    });

    expect(summary).toEqual({
      supported: false,
      scanned: 0,
      settled: 0,
      failed: 0,
      skipped: 0,
      items: [],
    });
  });

  test('settles a stale PENDING transaction via applyProviderEvent, exactly once', async () => {
    const seed = await seedPendingZakat();

    try {
      await backdateCreatedAt(seed.transactionId, STALE_MINUTES + 5);
      let calls = 0;
      const provider = reconcilableProvider((providerRef) => {
        calls += 1;
        expect(providerRef).toBe(seed.providerRef);
        return Promise.resolve({
          type: 'event',
          event: {
            expectedAmount: '75000.00',
            orderId: null,
            outcome: 'LUNAS',
            providerRef,
          },
        });
      });

      const summary = await reconcilePendingTransactions({
        database,
        paymentProvider: provider,
        onlyTransactionIds: [seed.transactionId],
      });
      const state = await readState(seed);

      expect(calls).toBe(1);
      expect(summary.supported).toBe(true);
      expect(summary.settled).toBe(1);
      expect(summary.failed).toBe(0);
      expect(state.status).toBe('LUNAS');
      expect(state.balance).toBe(75_000);

      // Second run: the transaction is no longer PENDING, so it is not even
      // scanned — idempotency comes from the query, not just the apply step.
      const secondSummary = await reconcilePendingTransactions({
        database,
        paymentProvider: provider,
        onlyTransactionIds: [seed.transactionId],
      });
      const stateAfterSecondRun = await readState(seed);

      expect(secondSummary.scanned).toBe(0);
      expect(calls).toBe(1);
      expect(stateAfterSecondRun.balance).toBe(75_000);
    } finally {
      await cleanupSeed(seed);
    }
  });

  test('onSettled fires once per newly settled transaction, with the module, order and amount', async () => {
    const seed = await seedPendingZakat();

    try {
      await backdateCreatedAt(seed.transactionId, STALE_MINUTES + 5);
      const provider = reconcilableProvider((providerRef) =>
        Promise.resolve({
          type: 'event',
          event: {
            expectedAmount: '75000.00',
            orderId: null,
            outcome: 'LUNAS',
            providerRef,
          },
        })
      );
      const settled: [string, string, string][] = [];
      const onSettled = (module: string, orderId: string, amount: string) => {
        settled.push([module, orderId, amount]);
        return Promise.resolve();
      };

      await reconcilePendingTransactions({
        database,
        paymentProvider: provider,
        onlyTransactionIds: [seed.transactionId],
        onSettled,
      });
      // Already LUNAS: not scanned again, so no second notification.
      await reconcilePendingTransactions({
        database,
        paymentProvider: provider,
        onlyTransactionIds: [seed.transactionId],
        onSettled,
      });

      expect(settled).toEqual([['ZAKAT', seed.orderId, '75000.00']]);
    } finally {
      await cleanupSeed(seed);
    }
  });

  test('onSettled is skipped for pending results and a throwing hook never undoes the settlement', async () => {
    const pending = await seedPendingZakat();
    const paid = await seedPendingZakat();

    try {
      await backdateCreatedAt(pending.transactionId, STALE_MINUTES + 5);
      await backdateCreatedAt(paid.transactionId, STALE_MINUTES + 5);
      const provider = reconcilableProvider((providerRef) =>
        Promise.resolve({
          type: 'event',
          event: {
            expectedAmount: '75000.00',
            orderId: null,
            outcome: providerRef === paid.providerRef ? 'LUNAS' : 'PENDING',
            providerRef,
          },
        })
      );
      let hookCalls = 0;

      const summary = await reconcilePendingTransactions({
        database,
        paymentProvider: provider,
        onlyTransactionIds: [pending.transactionId, paid.transactionId],
        onSettled: () => {
          hookCalls += 1;
          throw new Error('whatsapp down');
        },
      });

      expect(hookCalls).toBe(1);
      expect(summary.settled).toBe(1);
      expect((await readState(paid)).status).toBe('LUNAS');
      expect((await readState(pending)).status).toBe('PENDING');
    } finally {
      await cleanupSeed(pending);
      await cleanupSeed(paid);
    }
  });

  test('ignores a PENDING transaction younger than the stale threshold', async () => {
    const seed = await seedPendingZakat();

    try {
      // Not backdated: still fresh.
      let calls = 0;
      const provider = reconcilableProvider(() => {
        calls += 1;
        return Promise.resolve({ type: 'ignored' });
      });

      const summary = await reconcilePendingTransactions({
        database,
        paymentProvider: provider,
        onlyTransactionIds: [seed.transactionId],
      });
      const state = await readState(seed);

      expect(calls).toBe(0);
      expect(summary.scanned).toBe(0);
      expect(state.status).toBe('PENDING');
    } finally {
      await cleanupSeed(seed);
    }
  });

  test('a transient re-fetch failure is skipped, not marked failed', async () => {
    const seed = await seedPendingZakat();

    try {
      await backdateCreatedAt(seed.transactionId, STALE_MINUTES + 1);
      const provider = reconcilableProvider(() =>
        Promise.resolve({
          type: 'retry',
          status: 502,
          message: 'Mayar transaction re-fetch failed',
        })
      );

      const summary = await reconcilePendingTransactions({
        database,
        paymentProvider: provider,
        onlyTransactionIds: [seed.transactionId],
      });
      const state = await readState(seed);

      expect(summary.scanned).toBe(1);
      expect(summary.skipped).toBe(1);
      expect(summary.settled).toBe(0);
      expect(summary.failed).toBe(0);
      expect(state.status).toBe('PENDING');
    } finally {
      await cleanupSeed(seed);
    }
  });

  test('onlyTransactionIds leaves other stale PENDING rows untouched', async () => {
    const mine = await seedPendingZakat();
    const other = await seedPendingZakat();

    try {
      await backdateCreatedAt(mine.transactionId, STALE_MINUTES + 5);
      await backdateCreatedAt(other.transactionId, STALE_MINUTES + 5);
      const seen: string[] = [];
      const provider = reconcilableProvider((providerRef) => {
        seen.push(providerRef);
        return Promise.resolve({ type: 'ignored' });
      });

      const summary = await reconcilePendingTransactions({
        database,
        paymentProvider: provider,
        onlyTransactionIds: [mine.transactionId],
      });
      const none = await reconcilePendingTransactions({
        database,
        paymentProvider: provider,
        onlyTransactionIds: [],
      });

      expect(summary.scanned).toBe(1);
      expect(seen).toEqual([mine.providerRef]);
      expect(none.scanned).toBe(0);
    } finally {
      await cleanupSeed(mine);
      await cleanupSeed(other);
    }
  });

  test('an amount mismatch is caught per-item and does not throw', async () => {
    const seed = await seedPendingZakat();

    try {
      await backdateCreatedAt(seed.transactionId, STALE_MINUTES + 1);
      const provider = reconcilableProvider((providerRef) =>
        Promise.resolve({
          type: 'event',
          event: {
            expectedAmount: '1.00',
            orderId: null,
            outcome: 'LUNAS',
            providerRef,
          },
        })
      );

      const summary = await reconcilePendingTransactions({
        database,
        paymentProvider: provider,
        onlyTransactionIds: [seed.transactionId],
      });
      const state = await readState(seed);

      expect(summary.items[0]?.outcome).toBe('error');
      expect(summary.settled).toBe(0);
      expect(state.status).toBe('PENDING');
    } finally {
      await cleanupSeed(seed);
    }
  });
});

describe('POST /api/cron/payments-reconcile', () => {
  function cronRequest(authorization?: string): Request {
    const headers = new Headers();
    if (authorization) {
      headers.set('authorization', authorization);
    }
    return new Request('http://localhost/api/cron/payments-reconcile', {
      method: 'POST',
      headers,
    });
  }

  test('401s without the bearer token', async () => {
    const response = await cronHandle({ request: cronRequest() });
    expect(response.status).toBe(401);
  });

  test('401s with the wrong bearer token', async () => {
    const response = await cronHandle({
      request: cronRequest('Bearer wrong-token-entirely'),
    });
    expect(response.status).toBe(401);
  });

  test('200s with the correct bearer token (MOCK_SANDBOX reports unsupported)', async () => {
    const response = await cronHandle({
      request: cronRequest(`Bearer ${process.env.CRON_SECRET}`),
    });
    const body = (await response.json()) as { ok: boolean; supported: boolean };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    // Test env runs PAYMENT_PROVIDER=MOCK_SANDBOX, which has no
    // reconcileTransaction — this route call proves the auth gate AND the
    // "not applicable" branch, without needing a live Mayar double.
    expect(body.supported).toBe(false);
  });
});
