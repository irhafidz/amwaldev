import { describe, expect, test } from 'bun:test';
import { call, ORPCError } from '@orpc/server';
import { inArray } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Database } from '../../src/lib/db';
import { assertTestDatabase } from '../test-database-guard';
import { createTestCaller } from './test-utils';

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const schema = await import('../../src/lib/db/schema');
const { router } = await import('../../src/lib/orpc/router');

const database: Database = createDatabase(connectionUrl);
const ADMIN_USER_ID = 'p11-analytics-admin';

type TransactionType = 'WAKAF' | 'ZAKAT' | 'INFAQ' | 'QURBAN';
type TransactionStatus = 'PENDING' | 'DP' | 'LUNAS' | 'GAGAL';

async function insertUser(suffix: string): Promise<string> {
  const id = `p11-analytics-${ulid().toLowerCase()}-${suffix}`;

  await database.insert(schema.users).values({
    id,
    name: `Analytics ${suffix}`,
    updatedAt: new Date().toISOString(),
  });

  return id;
}

async function insertTransaction(params: {
  amount: string;
  createdAt: string;
  jenisTransaksi: TransactionType;
  statusPembayaran: TransactionStatus;
  wakifId: string;
}): Promise<string> {
  const id = `p11-analytics-tx-${ulid().toLowerCase()}`;

  await database.insert(schema.transactions).values({
    id,
    wakifId: params.wakifId,
    jenisTransaksi: params.jenisTransaksi,
    amount: params.amount,
    statusPembayaran: params.statusPembayaran,
    disbursementDestination: 'p11-analytics',
    createdAt: params.createdAt,
  });

  return id;
}

async function insertInfaqOrder(params: {
  amount: string;
  jenis: string;
  transactionId: string;
  userId: string;
}): Promise<string> {
  const id = `p11-analytics-infaq-${ulid().toLowerCase()}`;

  await database.insert(schema.infaqOrders).values({
    id,
    orderId: `INF-${ulid().toLowerCase()}`,
    userId: params.userId,
    namaPenginfaq: 'Analytics Donor',
    nominal: params.amount,
    jenis: params.jenis,
    status: 'SETTLED',
    transactionId: params.transactionId,
  });

  return id;
}

async function cleanupFixture(ids: {
  infaqOrderIds?: string[];
  transactionIds?: string[];
  userIds?: string[];
}): Promise<void> {
  if (ids.infaqOrderIds && ids.infaqOrderIds.length > 0) {
    await database
      .delete(schema.infaqOrders)
      .where(inArray(schema.infaqOrders.id, ids.infaqOrderIds));
  }
  if (ids.transactionIds && ids.transactionIds.length > 0) {
    await database
      .delete(schema.transactions)
      .where(inArray(schema.transactions.id, ids.transactionIds));
  }
  if (ids.userIds && ids.userIds.length > 0) {
    await database
      .delete(schema.users)
      .where(inArray(schema.users.id, ids.userIds));
  }
}

function adminContext() {
  return createTestCaller({
    database,
    user: { userId: ADMIN_USER_ID, role: 'ADMIN' },
  });
}

describe('oRPC admin.analytics', () => {
  test('rejects non-ADMIN roles with 403', async () => {
    const context = await createTestCaller({
      database,
      user: { userId: `p11-analytics-wakif-${ulid()}`, role: 'WAKIF' },
    });
    const invocations = [
      () => call(router.admin.analytics.trend, { year: 2099 }, { context }),
      () =>
        call(router.admin.analytics.accumulation, { year: 2099 }, { context }),
      () =>
        call(router.admin.analytics.composition, { year: 2099 }, { context }),
    ];

    for (const invoke of invocations) {
      try {
        await invoke();
        throw new Error('expected call to reject');
      } catch (error) {
        expect(error).toBeInstanceOf(ORPCError);
        expect((error as ORPCError<string, unknown>).status).toBe(403);
      }
    }
  });

  test('zero-fills every bucket for an empty month', async () => {
    const context = await adminContext();
    const [trend, accumulation, composition] = await Promise.all([
      call(
        router.admin.analytics.trend,
        { year: 2099, month: 12 },
        { context }
      ),
      call(
        router.admin.analytics.accumulation,
        { year: 2099, month: 12 },
        { context }
      ),
      call(
        router.admin.analytics.composition,
        { year: 2099, month: 12 },
        { context }
      ),
    ]);

    expect(trend.data).toHaveLength(31);
    expect(
      trend.data.every(
        (bucket) => bucket.totalTransactions === 0 && bucket.uniqueDonors === 0
      )
    ).toBe(true);
    expect(accumulation.data).toHaveLength(31);
    expect(
      accumulation.data.every(
        (bucket) => bucket.amount === 0 && bucket.cumulativeAmount === 0
      )
    ).toBe(true);
    expect(composition.data).toHaveLength(5);
    expect(composition.data.every((item) => item.amount === 0)).toBe(true);
  });

  test('counts unique donors and total transactions per WIB bucket', async () => {
    const [donorA, donorB, donorC] = await Promise.all([
      insertUser('trend-a'),
      insertUser('trend-b'),
      insertUser('trend-c'),
    ]);
    const transactionIds: string[] = [];

    try {
      transactionIds.push(
        await insertTransaction({
          amount: '10000',
          createdAt: '2099-10-05T10:00:00.000Z',
          jenisTransaksi: 'WAKAF',
          statusPembayaran: 'LUNAS',
          wakifId: donorA,
        }),
        await insertTransaction({
          amount: '20000',
          createdAt: '2099-10-05T11:00:00.000Z',
          jenisTransaksi: 'WAKAF',
          statusPembayaran: 'PENDING',
          wakifId: donorA,
        }),
        await insertTransaction({
          amount: '30000',
          createdAt: '2099-10-05T12:00:00.000Z',
          jenisTransaksi: 'ZAKAT',
          statusPembayaran: 'LUNAS',
          wakifId: donorB,
        }),
        await insertTransaction({
          amount: '40000',
          createdAt: '2099-09-30T17:30:00.000Z',
          jenisTransaksi: 'INFAQ',
          statusPembayaran: 'LUNAS',
          wakifId: donorC,
        })
      );

      const context = await adminContext();
      const result = await call(
        router.admin.analytics.trend,
        { year: 2099, month: 10 },
        { context }
      );
      const dayFive = result.data.find(
        (bucket) => bucket.label === '2099-10-05'
      );
      const boundaryDay = result.data.find(
        (bucket) => bucket.label === '2099-10-01'
      );

      expect(dayFive?.uniqueDonors).toBe(2);
      expect(dayFive?.totalTransactions).toBe(3);
      expect(boundaryDay?.uniqueDonors).toBe(1);
      expect(boundaryDay?.totalTransactions).toBe(1);
    } finally {
      await cleanupFixture({
        transactionIds,
        userIds: [donorA, donorB, donorC],
      });
    }
  });

  test('accumulates only LUNAS transactions cumulatively', async () => {
    const [donorA, donorB, donorC] = await Promise.all([
      insertUser('accum-a'),
      insertUser('accum-b'),
      insertUser('accum-c'),
    ]);
    const transactionIds: string[] = [];

    try {
      transactionIds.push(
        await insertTransaction({
          amount: '10000',
          createdAt: '2099-09-05T10:00:00.000Z',
          jenisTransaksi: 'WAKAF',
          statusPembayaran: 'LUNAS',
          wakifId: donorA,
        }),
        await insertTransaction({
          amount: '99000',
          createdAt: '2099-09-05T11:00:00.000Z',
          jenisTransaksi: 'WAKAF',
          statusPembayaran: 'PENDING',
          wakifId: donorB,
        }),
        await insertTransaction({
          amount: '30000',
          createdAt: '2099-09-05T12:00:00.000Z',
          jenisTransaksi: 'ZAKAT',
          statusPembayaran: 'LUNAS',
          wakifId: donorB,
        }),
        await insertTransaction({
          amount: '40000',
          createdAt: '2099-08-31T17:30:00.000Z',
          jenisTransaksi: 'INFAQ',
          statusPembayaran: 'LUNAS',
          wakifId: donorC,
        })
      );

      const context = await adminContext();
      const result = await call(
        router.admin.analytics.accumulation,
        { year: 2099, month: 9 },
        { context }
      );
      const firstDay = result.data.find(
        (bucket) => bucket.label === '2099-09-01'
      );
      const fifthDay = result.data.find(
        (bucket) => bucket.label === '2099-09-05'
      );

      expect(firstDay?.amount).toBe(40_000);
      expect(firstDay?.cumulativeAmount).toBe(40_000);
      expect(fifthDay?.amount).toBe(40_000);
      expect(fifthDay?.cumulativeAmount).toBe(80_000);
    } finally {
      await cleanupFixture({
        transactionIds,
        userIds: [donorA, donorB, donorC],
      });
    }
  });

  test('splits Infaq and Sedekah from infaq_orders.jenis, not order prefixes', async () => {
    const donor = await insertUser('composition');
    const transactionIds: string[] = [];
    const infaqOrderIds: string[] = [];

    try {
      const waqfId = await insertTransaction({
        amount: '100000',
        createdAt: '2099-11-05T10:00:00.000Z',
        jenisTransaksi: 'WAKAF',
        statusPembayaran: 'LUNAS',
        wakifId: donor,
      });
      const zakatId = await insertTransaction({
        amount: '200000',
        createdAt: '2099-11-05T11:00:00.000Z',
        jenisTransaksi: 'ZAKAT',
        statusPembayaran: 'LUNAS',
        wakifId: donor,
      });
      const infaqId = await insertTransaction({
        amount: '300000',
        createdAt: '2099-11-05T12:00:00.000Z',
        jenisTransaksi: 'INFAQ',
        statusPembayaran: 'LUNAS',
        wakifId: donor,
      });
      const sedekahId = await insertTransaction({
        amount: '400000',
        createdAt: '2099-11-05T13:00:00.000Z',
        jenisTransaksi: 'INFAQ',
        statusPembayaran: 'LUNAS',
        wakifId: donor,
      });
      const pendingSedekahId = await insertTransaction({
        amount: '999000',
        createdAt: '2099-11-05T14:00:00.000Z',
        jenisTransaksi: 'INFAQ',
        statusPembayaran: 'PENDING',
        wakifId: donor,
      });
      const qurbanId = await insertTransaction({
        amount: '500000',
        createdAt: '2099-11-05T15:00:00.000Z',
        jenisTransaksi: 'QURBAN',
        statusPembayaran: 'LUNAS',
        wakifId: donor,
      });

      transactionIds.push(
        waqfId,
        zakatId,
        infaqId,
        sedekahId,
        pendingSedekahId,
        qurbanId
      );
      infaqOrderIds.push(
        await insertInfaqOrder({
          amount: '300000',
          jenis: 'INFAQ_UMUM',
          transactionId: infaqId,
          userId: donor,
        }),
        await insertInfaqOrder({
          amount: '400000',
          jenis: 'SEDEKAH_OPERASIONAL',
          transactionId: sedekahId,
          userId: donor,
        }),
        await insertInfaqOrder({
          amount: '999000',
          jenis: 'SEDEKAH_YATIM',
          transactionId: pendingSedekahId,
          userId: donor,
        })
      );

      const context = await adminContext();
      const result = await call(
        router.admin.analytics.composition,
        { year: 2099, month: 11 },
        { context }
      );
      const amounts = new Map(
        result.data.map((item) => [item.module, item.amount])
      );

      expect(amounts.get('Wakaf')).toBe(100_000);
      expect(amounts.get('Zakat')).toBe(200_000);
      expect(amounts.get('Infaq')).toBe(300_000);
      expect(amounts.get('Sedekah')).toBe(400_000);
      expect(amounts.get('Qurban')).toBe(500_000);
    } finally {
      await cleanupFixture({
        infaqOrderIds,
        transactionIds,
        userIds: [donor],
      });
    }
  });
});
