import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { AKAD_CATEGORIES } from '@amwal/core/analytics/akad-category';
import { call } from '@orpc/server';
import { eq, inArray } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Database } from '../../src/lib/db';
import type { ORPCContext } from '../../src/lib/orpc/context';
import { assertTestDatabase } from '../test-database-guard';
import { createTestCaller } from './test-utils';

/**
 * admin.transparency.getLedger / getRealizationLog and
 * admin.analytics.getRFMSegments / getRetentionCohort against real rows.
 * Rows carry a per-run id so assertions are exact on a shared test database.
 */

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const schema = await import('../../src/lib/db/schema');
const { router } = await import('../../src/lib/orpc/router');

const database: Database = createDatabase(connectionUrl);
const runId = ulid().toLowerCase();
const id = (suffix: string) => `dan-${runId}-${suffix}`;
const DAY = 86_400_000;
const naive = (msAgo: number) =>
  new Date(Date.now() - msAgo).toISOString().replace('T', ' ').slice(0, 23);

const adminId = id('admin');
const donorIds = {
  loyal: id('loyal'),
  fresh: id('fresh'),
  old: id('old'),
  anon: id('anon'),
  sedekah: id('sedekah'),
};
const txIds = {
  infaq: id('tx-infaq'),
  sedekah: id('tx-sedekah'),
  zakatAnon: id('tx-zakat'),
  pending: id('tx-pending'),
  loyal2: id('tx-loyal2'),
  loyal3: id('tx-loyal3'),
  fresh: id('tx-fresh'),
  old: id('tx-old'),
};
let admin: ORPCContext;
let guest: ORPCContext;
let nadzirCaller: ORPCContext;

async function tx(
  txId: string,
  wakifId: string,
  jenis: 'WAKAF' | 'ZAKAT' | 'INFAQ' | 'QURBAN',
  amount: number,
  msAgo: number,
  status: 'LUNAS' | 'PENDING' = 'LUNAS'
) {
  await database.insert(schema.transactions).values({
    id: txId,
    wakifId,
    jenisTransaksi: jenis,
    amount: String(amount),
    paymentMethod: 'qris',
    statusPembayaran: status,
    disbursementDestination: 'TEST_DEST',
    createdAt: naive(msAgo),
  });
}

beforeAll(async () => {
  const now = new Date().toISOString();
  await database.insert(schema.users).values([
    { id: adminId, name: `Admin DAN ${runId}`, role: 'ADMIN', updatedAt: now },
    {
      id: donorIds.loyal,
      name: `Loyal ${runId}`,
      email: `loyal-${runId}@example.com`,
      updatedAt: now,
    },
    { id: donorIds.fresh, name: `Fresh ${runId}`, updatedAt: now },
    { id: donorIds.old, name: `Old ${runId}`, updatedAt: now },
    { id: donorIds.anon, name: `RealAnon ${runId}`, updatedAt: now },
    { id: donorIds.sedekah, name: `Sedekah ${runId}`, updatedAt: now },
  ]);

  // Ledger fixtures
  await tx(txIds.infaq, donorIds.loyal, 'INFAQ', 100_000, 1 * DAY);
  await tx(txIds.sedekah, donorIds.sedekah, 'INFAQ', 50_000, 2 * DAY);
  await tx(txIds.zakatAnon, donorIds.anon, 'ZAKAT', 2_000_000, 3 * DAY);
  await tx(txIds.pending, donorIds.loyal, 'INFAQ', 999_000, 1 * DAY, 'PENDING');
  await database.insert(schema.infaqOrders).values([
    {
      id: id('io-1'),
      orderId: id('io-1'),
      namaPenginfaq: `Donor Terang ${runId}`,
      nominal: '100000',
      jenis: 'INFAQ_UMUM',
      transactionId: txIds.infaq,
    },
    {
      id: id('io-2'),
      orderId: id('io-2'),
      namaPenginfaq: `Sedekah Hamba ${runId}`,
      nominal: '50000',
      jenis: 'SEDEKAH_YATIM',
      transactionId: txIds.sedekah,
    },
  ]);
  await database.insert(schema.zakatOrders).values({
    id: id('zo-1'),
    nomorKwitansi: id('zo-1'),
    namaMuzakki: `Rahasia Besar ${runId}`,
    isAnonymous: true,
    jenisZakat: 'MAAL_PENGHASILAN',
    metodePembayaran: 'TRANSFER',
    nominal: '2000000',
    transactionId: txIds.zakatAnon,
  });

  // RFM fixtures: loyal has 3 recent donations (one already above), fresh 1
  // recent, old 1 very old.
  await tx(txIds.loyal2, donorIds.loyal, 'ZAKAT', 1_000_000, 10 * DAY);
  await tx(txIds.loyal3, donorIds.loyal, 'WAKAF', 1_000_000, 20 * DAY);
  await tx(txIds.fresh, donorIds.fresh, 'QURBAN', 150_000, 3 * DAY);
  await tx(txIds.old, donorIds.old, 'INFAQ', 50_000, 300 * DAY);

  admin = await createTestCaller({
    database,
    user: { userId: adminId, role: 'ADMIN' },
  });
  guest = await createTestCaller({ database, user: null });
  nadzirCaller = await createTestCaller({
    database,
    user: { userId: id('nadzir'), role: 'NADZIR' },
  });
});

afterAll(async () => {
  await database
    .delete(schema.infaqOrders)
    .where(inArray(schema.infaqOrders.id, [id('io-1'), id('io-2')]));
  await database
    .delete(schema.zakatOrders)
    .where(eq(schema.zakatOrders.id, id('zo-1')));
  await database
    .delete(schema.transactions)
    .where(inArray(schema.transactions.id, Object.values(txIds)));
  await database
    .delete(schema.users)
    .where(inArray(schema.users.id, [adminId, ...Object.values(donorIds)]));
});

describe('guards', () => {
  test('all four procedures reject guests (401) and non-admins (403)', async () => {
    const calls = [
      (ctx: ORPCContext) =>
        call(router.admin.transparency.getLedger, {}, { context: ctx }),
      (ctx: ORPCContext) =>
        call(router.admin.transparency.getRealizationLog, {}, { context: ctx }),
      (ctx: ORPCContext) =>
        call(router.admin.analytics.getRFMSegments, {}, { context: ctx }),
      (ctx: ORPCContext) =>
        call(router.admin.analytics.getRetentionCohort, {}, { context: ctx }),
    ];
    for (const run of calls) {
      await expect(run(guest)).rejects.toMatchObject({ status: 401 });
      await expect(run(nadzirCaller)).rejects.toMatchObject({ status: 403 });
    }
  });
});

describe('admin.transparency.getLedger', () => {
  test('lists only verified rows, with akad, program label and masked anonymous donors', async () => {
    const { data } = await call(
      router.admin.transparency.getLedger,
      { search: runId, limit: 50 },
      { context: admin }
    );
    const byId = new Map(data.items.map((item) => [item.id, item]));

    expect(byId.has(txIds.pending)).toBe(false);
    expect(byId.get(txIds.infaq)).toMatchObject({
      akad: 'INFAQ',
      program: 'Infaq Umum',
      amount: 100_000,
      isAnonymous: false,
    });
    expect(byId.get(txIds.infaq)?.donorName).toContain('Donor Terang');
    expect(byId.get(txIds.sedekah)?.akad).toBe('SEDEKAH');
    expect(byId.get(txIds.zakatAnon)).toMatchObject({
      akad: 'ZAKAT',
      program: 'Zakat Maal Penghasilan',
      donorName: 'Hamba Allah',
      isAnonymous: true,
    });
  });

  test('search never matches the real name of an anonymous donor', async () => {
    const byRealName = await call(
      router.admin.transparency.getLedger,
      { search: `Rahasia Besar ${runId}` },
      { context: admin }
    );
    expect(byRealName.data.items).toHaveLength(0);

    const byTxId = await call(
      router.admin.transparency.getLedger,
      { search: txIds.zakatAnon },
      { context: admin }
    );
    expect(byTxId.data.items.map((i) => i.id)).toEqual([txIds.zakatAnon]);
  });

  test('akad filter agrees with the akad shown on every row, for every category', async () => {
    for (const akad of AKAD_CATEGORIES) {
      const { data } = await call(
        router.admin.transparency.getLedger,
        { akad, limit: 100 },
        { context: admin }
      );
      expect(data.items.every((item) => item.akad === akad)).toBe(true);
    }
    const sedekah = await call(
      router.admin.transparency.getLedger,
      { akad: 'SEDEKAH', search: runId },
      { context: admin }
    );
    expect(sedekah.data.items.map((i) => i.id)).toEqual([txIds.sedekah]);
  });

  test('summary counts verified volume only and pagination reports the filtered total', async () => {
    const all = await call(
      router.admin.transparency.getLedger,
      { search: runId, limit: 2, page: 2 },
      { context: admin }
    );
    // 8 fixture rows carry the run id; the PENDING one is not verified.
    expect(all.data.total).toBe(7);
    expect(all.data.items).toHaveLength(2);
    expect(all.data.summary.totalVolume).toBeGreaterThanOrEqual(
      100_000 + 50_000 + 2_000_000
    );
    expect(all.data.summary.totalCount).toBeGreaterThanOrEqual(7);
    expect(all.data.allocations.length).toBeGreaterThan(0);
    const shares = all.data.allocations.reduce((s, a) => s + a.share, 0);
    expect(shares).toBeLessThanOrEqual(100.5);
  });
});

describe('admin.analytics.getRFMSegments', () => {
  test('classifies donors from real transactions and skips the anonymous system user', async () => {
    const { data } = await call(
      router.admin.analytics.getRFMSegments,
      { search: runId, limit: 50 },
      { context: admin }
    );
    const byId = new Map(data.items.map((item) => [item.donorId, item]));

    const loyal = byId.get(donorIds.loyal);
    expect(loyal).toMatchObject({
      segment: 'Loyal',
      frequency: 3,
      monetary: 2_100_000,
      diversity: 3,
    });
    expect(loyal?.akads.sort()).toEqual(['Infaq', 'Wakaf', 'Zakat']);
    expect(byId.get(donorIds.fresh)?.segment).toBe('New');
    expect(byId.get(donorIds.old)?.segment).toBe('Lapsed');
    expect(byId.get(donorIds.old)?.recencyDays).toBeGreaterThanOrEqual(300);

    expect(Object.keys(data.segmentCounts).sort()).toEqual(
      ['At-Risk', 'Champion', 'Lapsed', 'Loyal', 'New', 'Situational'].sort()
    );
  });

  test('segment filter narrows the list but not the badge counts', async () => {
    const { data } = await call(
      router.admin.analytics.getRFMSegments,
      { segment: 'Lapsed', search: runId },
      { context: admin }
    );
    expect(data.items.map((i) => i.donorId)).toEqual([donorIds.old]);
    expect(data.segmentCounts.Lapsed).toBeGreaterThanOrEqual(1);
    expect(data.totalDonors).toBeGreaterThanOrEqual(4);
  });
});

describe('admin.analytics.getRetentionCohort', () => {
  test('returns well-formed cohorts (M+0 = 100, nulls only for future months)', async () => {
    const { data } = await call(
      router.admin.analytics.getRetentionCohort,
      { months: 6, cohorts: 24 },
      { context: admin }
    );
    expect(data.cohorts.length).toBeGreaterThan(0);
    for (const cohort of data.cohorts) {
      expect(cohort.retention).toHaveLength(6);
      expect(cohort.retention[0]).toBe(100);
      const firstNull = cohort.retention.indexOf(null);
      if (firstNull !== -1) {
        expect(cohort.retention.slice(firstNull).every((v) => v === null)).toBe(
          true
        );
      }
      for (const value of cohort.retention) {
        if (value !== null) {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(100);
        }
      }
    }
    expect(data.summary.totalDonors).toBeGreaterThanOrEqual(4);
  });

  test('an akad with no matching donations yields an empty, division-safe result', async () => {
    // Asserts shape only: the QURBAN rows on a shared test DB are not ours.
    const { data } = await call(
      router.admin.analytics.getRetentionCohort,
      { akad: 'QURBAN', months: 2, cohorts: 1 },
      { context: admin }
    );
    expect(data.cohorts.length).toBeLessThanOrEqual(1);
    expect(Number.isFinite(data.summary.avgLtv)).toBe(true);
    if (data.summary.avgRetentionM1 !== null) {
      expect(data.summary.avgRetentionM1).toBeLessThanOrEqual(100);
    }
  });
});

describe('admin.transparency.getRealizationLog', () => {
  test('is safe on an empty search result', async () => {
    const { data } = await call(
      router.admin.transparency.getRealizationLog,
      { search: `no-such-${runId}` },
      { context: admin }
    );
    expect(data).toMatchObject({ total: 0, totalNominal: 0, items: [] });
  });
});
