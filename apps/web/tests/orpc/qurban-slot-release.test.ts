import { afterAll, describe, expect, test } from 'bun:test';
import { eq, inArray } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Database } from '../../src/lib/db';
import { assertTestDatabase } from '../test-database-guard';

/**
 * Pelepasan otomatis slot qurban yang tertahan pesanan tak terbayar (Fase 4,
 * butir 4). Slot `TERISI` sejak pesanan dibuat; tanpa pelepasan, tamu yang
 * tidak membayar menahan stok selamanya.
 */

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const schema = await import('../../src/lib/db/schema');
const { releaseExpiredSlotHolds, SLOT_HOLD_GRACE_MINUTES } = await import(
  '@amwal/core/qurban/slots'
);
const { releaseStaleQurbanSlots } = await import(
  '../../src/lib/qurban-slot-release'
);

const database: Database = createDatabase(connectionUrl);
const runId = ulid().toLowerCase();
const prefix = `p4-${runId}`;
const userId = `${prefix}-donor`;
const minutesFromNow = (minutes: number) =>
  new Date(Date.now() + minutes * 60_000).toISOString();

const created = {
  batches: [] as string[],
  orders: [] as string[],
  tx: [] as string[],
};

await database.insert(schema.users).values({
  id: userId,
  name: 'Donor Slot',
  updatedAt: new Date().toISOString(),
});

afterAll(async () => {
  for (const batchId of created.batches) {
    await database
      .delete(schema.qurbanAnimalSlots)
      .where(eq(schema.qurbanAnimalSlots.hewanBatchId, batchId));
    await database
      .delete(schema.hewanBatches)
      .where(eq(schema.hewanBatches.id, batchId));
  }
  await database
    .delete(schema.qurbanOrders)
    .where(inArray(schema.qurbanOrders.id, created.orders));
  await database
    .delete(schema.transactions)
    .where(inArray(schema.transactions.id, created.tx));
  await database.delete(schema.users).where(eq(schema.users.id, userId));
});

/** Satu batch dengan satu slot `TERISI` yang ditahan satu pesanan. */
async function heldSlot(
  name: string,
  tx: {
    status: 'PENDING' | 'GAGAL' | 'LUNAS';
    expiresInMinutes?: number | null;
    createdMinutesAgo?: number;
  },
  batchStatus: 'PENUH' | 'TERSEDIA' = 'PENUH'
) {
  const batchId = `${prefix}-${name}-batch`;
  const orderId = `${prefix}-${name}-order`;
  const transactionId = `${prefix}-${name}-tx`;
  await database.insert(schema.hewanBatches).values({
    id: batchId,
    jenisHewan: 'KAMBING',
    totalSlot: 1,
    hargaPerSlot: '2500000',
    status: batchStatus,
  });
  created.batches.push(batchId);
  await database.insert(schema.transactions).values({
    id: transactionId,
    wakifId: userId,
    jenisTransaksi: 'QURBAN',
    amount: '2500000',
    statusPembayaran: tx.status,
    disbursementDestination: 'Panitia Qurban Amwal',
    paymentExpiresAt:
      tx.expiresInMinutes === null || tx.expiresInMinutes === undefined
        ? null
        : minutesFromNow(tx.expiresInMinutes),
    createdAt: minutesFromNow(-(tx.createdMinutesAgo ?? 5)),
  });
  created.tx.push(transactionId);
  await database.insert(schema.qurbanOrders).values({
    id: orderId,
    namaPengqurban: 'Penahan Slot',
    jenisHewan: 'KAMBING',
    tipeKepemilikan: 'INDIVIDU',
    metodePembayaran: 'QRIS',
    totalHarga: '2500000',
    transactionId,
  });
  created.orders.push(orderId);
  await database.insert(schema.qurbanAnimalSlots).values({
    id: `${batchId}-slot-1`,
    hewanBatchId: batchId,
    nomorSlot: 1,
    status: 'TERISI',
    qurbanOrderId: orderId,
  });
  return batchId;
}

async function state(batchId: string) {
  const [slot] = await database
    .select({
      status: schema.qurbanAnimalSlots.status,
      orderId: schema.qurbanAnimalSlots.qurbanOrderId,
    })
    .from(schema.qurbanAnimalSlots)
    .where(eq(schema.qurbanAnimalSlots.hewanBatchId, batchId));
  const [batch] = await database
    .select({ status: schema.hewanBatches.status })
    .from(schema.hewanBatches)
    .where(eq(schema.hewanBatches.id, batchId));
  return { slot: slot?.status, orderId: slot?.orderId, batch: batch?.status };
}

describe('releaseExpiredSlotHolds', () => {
  test('releases the slot of an unpaid order past its deadline + grace, and reopens the batch', async () => {
    const batchId = await heldSlot('stale', {
      status: 'PENDING',
      expiresInMinutes: -(SLOT_HOLD_GRACE_MINUTES + 30),
    });
    expect(await state(batchId)).toMatchObject({
      slot: 'TERISI',
      batch: 'PENUH',
    });

    expect(await releaseExpiredSlotHolds(database)).toBeGreaterThanOrEqual(1);

    expect(await state(batchId)).toEqual({
      slot: 'TERSEDIA',
      orderId: null,
      batch: 'TERSEDIA',
    });
  });

  test('releases a failed payment immediately', async () => {
    const batchId = await heldSlot('failed', {
      status: 'GAGAL',
      expiresInMinutes: 600,
    });
    await releaseExpiredSlotHolds(database);
    expect(await state(batchId)).toMatchObject({
      slot: 'TERSEDIA',
      batch: 'TERSEDIA',
    });
  });

  test('keeps slots that can still be paid or are paid', async () => {
    const live = await heldSlot('live', {
      status: 'PENDING',
      expiresInMinutes: 30,
    });
    // Lewat batas, tetapi masih dalam jeda: pembayaran "di detik terakhir" aman.
    const grace = await heldSlot('grace', {
      status: 'PENDING',
      expiresInMinutes: -10,
    });
    const paid = await heldSlot('paid', {
      status: 'LUNAS',
      expiresInMinutes: -600,
    });
    await releaseExpiredSlotHolds(database);

    for (const batchId of [live, grace, paid]) {
      expect(await state(batchId)).toMatchObject({
        slot: 'TERISI',
        batch: 'PENUH',
      });
    }
  });

  test('without a stored deadline it falls back to created_at + 24h (+ grace)', async () => {
    const old = await heldSlot('old', {
      status: 'PENDING',
      expiresInMinutes: null,
      createdMinutesAgo: 24 * 60 + SLOT_HOLD_GRACE_MINUTES + 30,
    });
    const recent = await heldSlot('recent', {
      status: 'PENDING',
      expiresInMinutes: null,
      createdMinutesAgo: 60,
    });
    await releaseExpiredSlotHolds(database);
    expect((await state(old)).slot).toBe('TERSEDIA');
    expect((await state(recent)).slot).toBe('TERISI');
  });

  test('a batch an admin closed is not reopened unless its slots were released', async () => {
    const batchId = await heldSlot(
      'admin-closed',
      { status: 'LUNAS', expiresInMinutes: -600 },
      'PENUH'
    );
    await releaseExpiredSlotHolds(database);
    expect((await state(batchId)).batch).toBe('PENUH');
  });

  test('is idempotent', async () => {
    const batchId = await heldSlot('twice', {
      status: 'GAGAL',
      expiresInMinutes: 5,
    });
    await releaseExpiredSlotHolds(database);
    await releaseExpiredSlotHolds(database);
    expect(await state(batchId)).toMatchObject({ slot: 'TERSEDIA' });
  });
});

describe('releaseStaleQurbanSlots (web helper)', () => {
  test('is throttled per process unless forced', async () => {
    const first = await heldSlot('throttle-a', {
      status: 'GAGAL',
      expiresInMinutes: 5,
    });
    await releaseStaleQurbanSlots(database, { force: true, now: Date.now() });
    expect((await state(first)).slot).toBe('TERSEDIA');

    const second = await heldSlot('throttle-b', {
      status: 'GAGAL',
      expiresInMinutes: 5,
    });
    // Dalam jendela 30 detik: tidak dijalankan lagi.
    expect(
      await releaseStaleQurbanSlots(database, { now: Date.now() + 1000 })
    ).toBe(0);
    expect((await state(second)).slot).toBe('TERISI');

    await releaseStaleQurbanSlots(database, { now: Date.now() + 60_000 });
    expect((await state(second)).slot).toBe('TERSEDIA');
  });
});
