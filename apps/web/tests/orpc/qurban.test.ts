import { describe, expect, test } from 'bun:test';
import { SlotUnavailableError } from '@amwal/core/qurban/slots';
import { call, ORPCError } from '@orpc/server';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Database } from '../../src/lib/db';
import { assertTestDatabase } from '../test-database-guard';
import { createTestCaller } from './test-utils';

/**
 * Putaran 17, Batch 3 — the oRPC-side twin of
 * `apps/server/tests/qurban/qurban-order.test.ts` and
 * `apps/server/tests/qurban/slot-lock.test.ts`. Slot locking happens inside
 * `@amwal/core/qurban/slots`'s `reserveSlots`, called from
 * `@amwal/core/payment/service`'s `createPayment` in the same DB
 * transaction as the order/transaction anchor — the row lock + unique
 * constraint invariant is proven both directly and through the full oRPC
 * `createOrder` procedure. Uses `createTestCaller` (Batch 5) for
 * context/JWT setup.
 */

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const schema = await import('../../src/lib/db/schema');
const { router } = await import('../../src/lib/orpc/router');
const { reserveSlots } = await import('@amwal/core/qurban/slots');
const { MockPaymentProvider } = await import(
  '@amwal/core/payment/mock.provider'
);

const database: Database = createDatabase(connectionUrl);
const mockProvider = new MockPaymentProvider(
  'SB-Mid-server-P17-B3-qurban-key-123456'
);

function wakifContext(userId: string) {
  return createTestCaller({
    database,
    user: { userId, role: 'WAKIF' },
    paymentProvider: mockProvider,
  });
}

async function createBatchFixture(totalSlot: number): Promise<string> {
  const runId = ulid().toLowerCase();
  const batchId = `p17b3-${runId}-batch`;

  await database.insert(schema.hewanBatches).values({
    id: batchId,
    jenisHewan: 'KAMBING',
    totalSlot,
    hargaPerSlot: '2500000',
    status: 'TERSEDIA',
  });

  for (let i = 1; i <= totalSlot; i++) {
    await database.insert(schema.qurbanAnimalSlots).values({
      id: `p17b3-${runId}-slot-${i}`,
      hewanBatchId: batchId,
      nomorSlot: i,
      status: 'TERSEDIA',
    });
  }

  return batchId;
}

async function deleteBatchFixture(batchId: string): Promise<void> {
  await database
    .delete(schema.qurbanAnimalSlots)
    .where(eq(schema.qurbanAnimalSlots.hewanBatchId, batchId));
  await database
    .delete(schema.hewanBatches)
    .where(eq(schema.hewanBatches.id, batchId));
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

describe('oRPC qurban: orders + wakalah contract', () => {
  test('a guest without a name is rejected (400) before anything is created', async () => {
    const batchId = await createBatchFixture(1);
    try {
      await expect(
        call(
          router.qurban.createOrder,
          {
            hewanBatchId: batchId,
            jumlahSlotDiminta: 1,
            teleponPengqurban: '081211004001',
            tipeKepemilikan: 'INDIVIDU',
            akadWakalahAccepted: true,
          },
          {
            context: await createTestCaller({
              database,
              user: null,
              paymentProvider: mockProvider,
              headers: { 'x-forwarded-for': '203.0.113.20' },
            }),
          }
        )
      ).rejects.toMatchObject({ status: 400 });

      const [slot] = await database
        .select({ status: schema.qurbanAnimalSlots.status })
        .from(schema.qurbanAnimalSlots)
        .where(eq(schema.qurbanAnimalSlots.hewanBatchId, batchId));
      expect(slot?.status).toBe('TERSEDIA');
    } finally {
      await deleteBatchFixture(batchId);
    }
  });

  test('rejects order when akadWakalahAccepted is not true', async () => {
    const batchId = await createBatchFixture(1);
    // Random, not hardcoded — apps/server/tests/qurban/qurban-order.test.ts
    // uses the exact same literal, and `users.phone` is unique, so a
    // simultaneous dual-run of both suites would otherwise collide.
    const phone = `08${String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, '0')}`;
    const userId = await createWakifUser('Shohibul Test', phone);
    const context = await wakifContext(userId);

    try {
      await call(
        router.qurban.createOrder,
        {
          hewanBatchId: batchId,
          jumlahSlotDiminta: 1,
          teleponPengqurban: '081211004002',
          tipeKepemilikan: 'INDIVIDU',
          akadWakalahAccepted: false,
        },
        { context }
      );
      throw new Error('expected call to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(ORPCError);
      expect((error as ORPCError<string, unknown>).status).toBe(400);
      expect((error as ORPCError<string, unknown>).message).toContain(
        'Akad wakalah'
      );
    } finally {
      await deleteBatchFixture(batchId);
      await database.delete(schema.users).where(eq(schema.users.id, userId));
    }
  });

  test('rejects a shohibul WhatsApp number that is not a valid Indonesian mobile', async () => {
    const batchId = await createBatchFixture(1);
    const phone = `08${String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, '0')}`;
    const userId = await createWakifUser('Shohibul Nomor Salah', phone);
    const context = await wakifContext(userId);

    try {
      await call(
        router.qurban.createOrder,
        {
          hewanBatchId: batchId,
          jumlahSlotDiminta: 1,
          teleponPengqurban: '021-1234567',
          tipeKepemilikan: 'INDIVIDU',
          akadWakalahAccepted: true,
        },
        { context }
      );
      throw new Error('expected call to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(ORPCError);
      expect((error as ORPCError<string, unknown>).status).toBe(400);
    } finally {
      await deleteBatchFixture(batchId);
      await database.delete(schema.users).where(eq(schema.users.id, userId));
    }
  });

  test('creates order + Transaction + reserves slot, persisting akad as legal evidence', async () => {
    const batchId = await createBatchFixture(2);
    const phone = `08${String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, '0')}`;
    const userId = await createWakifUser('Shohibul Qurban Test', phone);
    const context = await wakifContext(userId);

    let orderId: string | undefined;
    let transactionId: string | undefined;

    try {
      const result = await call(
        router.qurban.createOrder,
        {
          hewanBatchId: batchId,
          jumlahSlotDiminta: 1,
          // Sengaja ditulis dengan awalan 0 + pemisah — kontrak harus
          // menormalkannya ke bentuk kanonik 62… sebelum disimpan.
          teleponPengqurban: '0812-1100-4003',
          tipeKepemilikan: 'INDIVIDU',
          akadWakalahAccepted: true,
        },
        { context }
      );
      orderId = result.orderId;
      transactionId = result.transactionId;
      expect(result.redirectUrl).toContain('/riwayat');

      const [transaction] = await database
        .select({
          jenisTransaksi: schema.transactions.jenisTransaksi,
          statusPembayaran: schema.transactions.statusPembayaran,
        })
        .from(schema.transactions)
        .where(eq(schema.transactions.id, transactionId));
      expect(transaction?.jenisTransaksi).toBe('QURBAN');
      expect(transaction?.statusPembayaran).toBe('PENDING');

      const [order] = await database
        .select({
          akadWakalahText: schema.qurbanOrders.akadWakalahText,
          akadWakalahAcceptedAt: schema.qurbanOrders.akadWakalahAcceptedAt,
          totalHarga: schema.qurbanOrders.totalHarga,
          teleponPengqurban: schema.qurbanOrders.teleponPengqurban,
        })
        .from(schema.qurbanOrders)
        .where(eq(schema.qurbanOrders.id, orderId));
      expect(order?.akadWakalahText).toContain('Shohibul Qurban Test');
      expect(order?.akadWakalahAcceptedAt).toBeTruthy();
      expect(Number(order?.totalHarga)).toBe(2_500_000);
      // Acceptance criteria #2 + #3: nomor tersimpan di record shohibul dalam
      // bentuk yang langsung bisa dipakai blast, tanpa input ulang.
      expect(order?.teleponPengqurban).toBe('6281211004003');

      const slots = await database
        .select()
        .from(schema.qurbanAnimalSlots)
        .where(eq(schema.qurbanAnimalSlots.hewanBatchId, batchId));
      const reserved = slots.filter((slot) => slot.status === 'TERISI');
      expect(reserved.length).toBe(1);
      expect(reserved[0]?.qurbanOrderId).toBe(orderId);
    } finally {
      await deleteBatchFixture(batchId);
      if (orderId) {
        await database
          .delete(schema.qurbanOrders)
          .where(eq(schema.qurbanOrders.id, orderId));
      }
      if (transactionId) {
        await database
          .delete(schema.transactions)
          .where(eq(schema.transactions.id, transactionId));
      }
      await database.delete(schema.users).where(eq(schema.users.id, userId));
    }
  });
});

describe('oRPC qurban: collective checkout + orderStatus', () => {
  const randomPhone = () =>
    `08${String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, '0')}`;

  test('stores shohibul names per slot, reports availableSlots, scopes orderStatus to the owner', async () => {
    const batchId = await createBatchFixture(3);
    const ownerId = await createWakifUser('Pemesan Kolektif', randomPhone());
    const strangerId = await createWakifUser('Orang Lain', randomPhone());
    const owner = await wakifContext(ownerId);
    const stranger = await wakifContext(strangerId);
    const base = {
      hewanBatchId: batchId,
      teleponPengqurban: '081211004010',
      tipeKepemilikan: 'KOLEKTIF' as const,
      akadWakalahAccepted: true,
    };
    let orderId: string | undefined;
    let transactionId: string | undefined;

    try {
      // More names than slots is rejected before anything is reserved.
      await expect(
        call(
          router.qurban.createOrder,
          {
            ...base,
            jumlahSlotDiminta: 1,
            namaShohibul: ['Ahmad bin Abdullah', 'Fatimah binti Umar'],
          },
          { context: owner }
        )
      ).rejects.toMatchObject({ status: 400 });

      const result = await call(
        router.qurban.createOrder,
        {
          ...base,
          jumlahSlotDiminta: 2,
          opsiPesan: 'AMBIL_SENDIRI',
          namaShohibul: ['Ahmad bin Abdullah', 'Fatimah binti Umar'],
        },
        { context: owner }
      );
      orderId = result.orderId;
      transactionId = result.transactionId;

      const [order] = await database
        .select()
        .from(schema.qurbanOrders)
        .where(eq(schema.qurbanOrders.id, orderId));
      expect(order?.namaShohibul).toBe(
        'Ahmad bin Abdullah, Fatimah binti Umar'
      );
      expect(order?.opsiPesan).toBe('AMBIL_SENDIRI');
      expect(Number(order?.totalHarga)).toBe(5_000_000);

      const listed = await call(router.qurban.list, {}, { context: owner });
      expect(listed.data.find((b) => b.id === batchId)?.availableSlots).toBe(1);

      const status = await call(
        router.qurban.orderStatus,
        { orderId },
        { context: owner }
      );
      expect(status.data.order.id).toBe(orderId);
      expect(status.data.transaction?.id).toBe(transactionId);

      // A stranger (or guest) may open the status page but sees no personal data.
      for (const viewer of [
        stranger,
        await createTestCaller({
          database,
          user: null,
          paymentProvider: mockProvider,
        }),
      ]) {
        const redacted = await call(
          router.qurban.orderStatus,
          { orderId },
          { context: viewer }
        );
        expect(redacted.data.order.namaPengqurban).toBe('Hamba Allah');
        expect(redacted.data.order.namaShohibul).toBeNull();
        expect(redacted.data.transaction?.id).toBeNull();
        const json = JSON.stringify(redacted.data);
        expect(json).not.toContain('Ahmad bin Abdullah');
        expect(json).not.toContain('Pemesan Kolektif');
        expect(json).not.toContain('081211004010');
        expect(json).not.toContain('6281211004010');
      }
    } finally {
      await deleteBatchFixture(batchId);
      if (orderId) {
        await database
          .delete(schema.qurbanOrders)
          .where(eq(schema.qurbanOrders.id, orderId));
      }
      if (transactionId) {
        await database
          .delete(schema.transactions)
          .where(eq(schema.transactions.id, transactionId));
      }
      for (const id of [ownerId, strangerId]) {
        await database.delete(schema.users).where(eq(schema.users.id, id));
      }
    }
  });
});

describe('oRPC qurban: slot reservation (row lock)', () => {
  async function createQurbanOrder(orderId: string): Promise<void> {
    await database.insert(schema.qurbanOrders).values({
      id: orderId,
      namaPengqurban: 'Shohibul Qurban',
      jenisHewan: 'KAMBING',
      tipeKepemilikan: 'INDIVIDU',
      metodePembayaran: 'TRANSFER',
      totalHarga: '2500000',
    });
  }

  test('10 buyers race for 1 remaining slot -> exactly 1 wins, 9 rejected cleanly', async () => {
    const batchId = await createBatchFixture(1);
    const orderIds = Array.from(
      { length: 10 },
      () => `p17b3-${ulid().toLowerCase()}-order`
    );

    try {
      for (const orderId of orderIds) {
        await createQurbanOrder(orderId);
      }

      const results = await Promise.allSettled(
        orderIds.map((orderId) =>
          database.transaction(async (tx) =>
            reserveSlots(tx, batchId, 1, orderId)
          )
        )
      );

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(9);
      for (const r of rejected) {
        expect((r as PromiseRejectedResult).reason).toBeInstanceOf(
          SlotUnavailableError
        );
      }

      const [slot] = await database
        .select({ status: schema.qurbanAnimalSlots.status })
        .from(schema.qurbanAnimalSlots)
        .where(eq(schema.qurbanAnimalSlots.hewanBatchId, batchId));
      expect(slot?.status).toBe('TERISI');

      const [batch] = await database
        .select({ status: schema.hewanBatches.status })
        .from(schema.hewanBatches)
        .where(eq(schema.hewanBatches.id, batchId));
      expect(batch?.status).toBe('PENUH');
    } finally {
      await deleteBatchFixture(batchId);
      for (const orderId of orderIds) {
        await database
          .delete(schema.qurbanOrders)
          .where(eq(schema.qurbanOrders.id, orderId));
      }
    }
  });

  test('requesting more slots than available rejects without reserving anything', async () => {
    const batchId = await createBatchFixture(2);

    try {
      const over = database.transaction(async (tx) =>
        reserveSlots(tx, batchId, 3, `p17b3-${ulid().toLowerCase()}-order`)
      );
      await expect(over).rejects.toBeInstanceOf(SlotUnavailableError);

      const slots = await database
        .select({ status: schema.qurbanAnimalSlots.status })
        .from(schema.qurbanAnimalSlots)
        .where(eq(schema.qurbanAnimalSlots.hewanBatchId, batchId));
      expect(slots.every((slot) => slot.status === 'TERSEDIA')).toBe(true);
    } finally {
      await deleteBatchFixture(batchId);
    }
  });
});
