import { afterAll, describe, expect, test } from 'bun:test';
import { call, ORPCError } from '@orpc/server';
import { eq, inArray } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Database } from '../../src/lib/db';
import { assertTestDatabase } from '../test-database-guard';
import { createTestCaller } from './test-utils';

/** Doa & Harapan di form wakaf tersimpan di pesanan (sebelumnya hilang diam-diam). */

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const schema = await import('../../src/lib/db/schema');
const { router } = await import('../../src/lib/orpc/router');
const { MockPaymentProvider } = await import(
  '@amwal/core/payment/mock.provider'
);

const database: Database = createDatabase(connectionUrl);
const provider = new MockPaymentProvider('SB-Mid-server-p9-doa-key-123456');
const runId = ulid().toLowerCase();
const nadzirUserId = `p9-${runId}-nadzir-user`;
const nadzirProfileId = `p9-${runId}-nadzir-profile`;
const programId = `p9-${runId}-program`;
const now = () => new Date().toISOString();
const created = { orders: [] as string[], transactions: [] as string[] };

await database.insert(schema.users).values({
  id: nadzirUserId,
  name: 'Nadzir Doa',
  updatedAt: now(),
});
await database.insert(schema.nadzirProfiles).values({
  id: nadzirProfileId,
  userId: nadzirUserId,
  kategori: 'ORGANISASI',
  namaLembaga: 'Badan Wakaf Uji Doa',
  updatedAt: now(),
});
await database.insert(schema.waqfPrograms).values({
  id: programId,
  nadzirProfileId,
  judul: `Program Doa ${runId}`,
  targetDana: '100000000',
  jenisWakaf: 'PRODUKTIF_KEKAL',
  status: 'LIVE',
  updatedAt: now(),
});

afterAll(async () => {
  const orders = created.orders.length
    ? await database
        .select({ wakifId: schema.waqfOrders.wakifId })
        .from(schema.waqfOrders)
        .where(inArray(schema.waqfOrders.id, created.orders))
    : [];
  const guestIds = [
    ...new Set(orders.map((order) => order.wakifId).filter(Boolean)),
  ] as string[];
  if (created.orders.length > 0) {
    await database
      .delete(schema.waqfOrders)
      .where(inArray(schema.waqfOrders.id, created.orders));
  }
  if (created.transactions.length > 0) {
    await database
      .delete(schema.transactions)
      .where(inArray(schema.transactions.id, created.transactions));
  }
  await database
    .delete(schema.waqfPrograms)
    .where(eq(schema.waqfPrograms.id, programId));
  await database
    .delete(schema.nadzirProfiles)
    .where(eq(schema.nadzirProfiles.id, nadzirProfileId));
  await database
    .delete(schema.users)
    .where(inArray(schema.users.id, [nadzirUserId, ...guestIds]));
});

async function order(extra: { doa?: string }) {
  const phone = `08${String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, '0')}`;
  const context = await createTestCaller({
    database,
    user: null,
    paymentProvider: provider,
  });
  const result = await call(
    router.waqf.createOrder,
    {
      programId,
      amount: 100_000,
      paymentType: 'qris',
      donorName: 'Donor Doa',
      donorPhone: phone,
      isAnonymous: false,
      ...extra,
    },
    { context }
  );
  created.orders.push(result.orderId);
  created.transactions.push(result.transactionId);
  const [row] = await database
    .select({ doa: schema.waqfOrders.doa })
    .from(schema.waqfOrders)
    .where(eq(schema.waqfOrders.id, result.orderId));
  return row?.doa;
}

describe('waqf.createOrder doa', () => {
  test('stores the donor prayer, trimmed', async () => {
    expect(
      await order({ doa: '  Semoga menjadi amal jariyah untuk orang tua.  ' })
    ).toBe('Semoga menjadi amal jariyah untuk orang tua.');
  });

  test('a missing or blank prayer is NULL, not an empty string', async () => {
    expect(await order({})).toBeNull();
    expect(await order({ doa: '   ' })).toBeNull();
  });

  test('more than 500 characters is rejected before any order exists', async () => {
    const before = created.orders.length;
    await expect(order({ doa: 'a'.repeat(501) })).rejects.toBeInstanceOf(
      ORPCError
    );
    expect(created.orders.length).toBe(before);
  });
});
