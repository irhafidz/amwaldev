import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { call, ORPCError } from '@orpc/server';
import { eq, inArray } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Database } from '../../src/lib/db';
import type { ORPCContext } from '../../src/lib/orpc/context';
import { assertTestDatabase } from '../test-database-guard';
import { createTestCaller } from './test-utils';

/**
 * Admin Qurban module on real data: batch (hewan) CRUD, shohibul
 * registration against real slots (lowest free or a specific slot),
 * cancellation releasing the slot, and the locks that protect paid/online
 * data.
 */

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const schema = await import('../../src/lib/db/schema');
const { router } = await import('../../src/lib/orpc/router');

const database: Database = createDatabase(connectionUrl);
const runId = ulid().toLowerCase();
const adminId = `qrbcrud-${runId}-admin`;
const batchIds: string[] = [];
let adminContext: ORPCContext;

// Shared helper — only ever awaited from inside a test() body below.
async function expectRejects(promise: Promise<unknown>, status: number) {
  try {
    await promise;
    throw new Error('expected call to reject');
  } catch (error) {
    // biome-ignore lint/suspicious/noMisplacedAssertion: this function is only ever awaited from inside a test()
    expect(error).toBeInstanceOf(ORPCError);
    // biome-ignore lint/suspicious/noMisplacedAssertion: this function is only ever awaited from inside a test()
    expect((error as ORPCError<string, unknown>).status).toBe(status);
  }
}

async function createPatunganBatch(totalSlot = 2) {
  const res = await call(
    router.admin.qurban.createBatch,
    {
      jenisHewan: 'SAPI',
      totalSlot,
      hargaPerSlot: 2_950_000,
      namaBatch: `Sapi Uji ${runId}`,
      lokasiRph: 'RPH Uji',
      timJuleha: 'Tim Uji',
    },
    { context: adminContext }
  );
  batchIds.push(res.data.id);
  return res.data;
}

function register(hewanBatchId: string, extra: Record<string, unknown> = {}) {
  return call(
    router.admin.qurban.createOrder,
    {
      hewanBatchId,
      namaPengqurban: 'H. Pemesan Uji',
      namaShohibul: 'Shohibul Uji bin Uji',
      opsiPesan: 'PASRAH',
      metodePembayaran: 'TUNAI',
      statusPembayaran: 'LUNAS',
      ...extra,
    },
    { context: adminContext }
  );
}

beforeAll(async () => {
  await database.insert(schema.users).values({
    id: adminId,
    name: 'Admin Qurban CRUD',
    role: 'ADMIN',
    updatedAt: new Date().toISOString(),
  });
  adminContext = await createTestCaller({
    database,
    user: { userId: adminId, role: 'ADMIN' },
  });
});

afterAll(async () => {
  if (batchIds.length > 0) {
    const slots = await database
      .select({ orderId: schema.qurbanAnimalSlots.qurbanOrderId })
      .from(schema.qurbanAnimalSlots)
      .where(inArray(schema.qurbanAnimalSlots.hewanBatchId, batchIds));
    const orderIds = slots
      .map((s) => s.orderId)
      .filter((id): id is string => Boolean(id));
    await database
      .delete(schema.qurbanAnimalSlots)
      .where(inArray(schema.qurbanAnimalSlots.hewanBatchId, batchIds));
    if (orderIds.length > 0) {
      await database
        .delete(schema.qurbanOrders)
        .where(inArray(schema.qurbanOrders.id, orderIds));
    }
    await database
      .delete(schema.hewanBatches)
      .where(inArray(schema.hewanBatches.id, batchIds));
  }
  await database.delete(schema.users).where(eq(schema.users.id, adminId));
});

describe('oRPC admin.qurban CRUD', () => {
  test('rejects non-ADMIN', async () => {
    const wakifContext = await createTestCaller({
      database,
      user: { userId: `qrbcrud-${runId}-wakif`, role: 'WAKIF' },
    });
    await expectRejects(
      call(router.admin.qurban.batchesList, {}, { context: wakifContext }),
      403
    );
  });

  test('registration reserves real slots, fills the batch, and cancel releases it', async () => {
    const batch = await createPatunganBatch(2);

    const second = await register(batch.id, {
      nomorSlot: 2,
      teleponPengqurban: '081211004001',
    });
    expect(second.data?.nomorSlot).toEqual([2]);
    expect(second.data?.teleponPengqurban).toBe('6281211004001');
    expect(second.data?.tipeKepemilikan).toBe('KOLEKTIF');
    expect(Number(second.data?.nominalDibayar)).toBe(2_950_000);

    await expectRejects(register(batch.id, { nomorSlot: 2 }), 400);

    const first = await register(batch.id, {
      statusPembayaran: 'DP',
      nominalDibayar: 1_000_000,
    });
    expect(first.data?.nomorSlot).toEqual([1]);
    expect(Number(first.data?.sisaTagihan)).toBe(1_950_000);

    const list = await call(
      router.admin.qurban.batchesList,
      {},
      { context: adminContext }
    );
    const listed = list.data.find((b) => b.id === batch.id);
    expect(listed?.status).toBe('PENUH');
    expect(listed?.slotTerpakai).toBe(2);
    expect(listed?.slots.map((s) => s.namaShohibul)).toEqual([
      'Shohibul Uji bin Uji',
      'Shohibul Uji bin Uji',
    ]);

    await expectRejects(register(batch.id), 400);

    // Price is locked once slots are taken; the batch cannot be deleted.
    await expectRejects(
      call(
        router.admin.qurban.updateBatch,
        { id: batch.id, hargaPerSlot: 1 },
        { context: adminContext }
      ),
      400
    );
    await expectRejects(
      call(
        router.admin.qurban.deleteBatch,
        { id: batch.id },
        { context: adminContext }
      ),
      400
    );

    await call(
      router.admin.qurban.deleteOrder,
      { id: first.data?.id ?? '' },
      { context: adminContext }
    );
    const [freed] = await database
      .select()
      .from(schema.qurbanAnimalSlots)
      .where(eq(schema.qurbanAnimalSlots.hewanBatchId, batch.id))
      .orderBy(schema.qurbanAnimalSlots.nomorSlot);
    expect(freed?.status).toBe('TERSEDIA');
    expect(freed?.qurbanOrderId).toBeNull();
    const [reopened] = await database
      .select({ status: schema.hewanBatches.status })
      .from(schema.hewanBatches)
      .where(eq(schema.hewanBatches.id, batch.id));
    expect(reopened?.status).toBe('TERSEDIA');
  });

  test('update edits identity + payment; documentation is saved', async () => {
    const batch = await createPatunganBatch(1);
    const order = await register(batch.id, { statusPembayaran: 'BELUM_BAYAR' });
    const id = order.data?.id ?? '';

    const updated = await call(
      router.admin.qurban.updateOrder,
      {
        id,
        namaShohibul: 'Nama Baru binti Uji',
        opsiPesan: 'AMBIL_SENDIRI',
        statusPembayaran: 'LUNAS',
      },
      { context: adminContext }
    );
    expect(updated.data?.namaShohibul).toBe('Nama Baru binti Uji');
    expect(updated.data?.opsiPesan).toBe('AMBIL_SENDIRI');
    expect(Number(updated.data?.sisaTagihan)).toBe(0);

    await call(
      router.admin.qurban.saveDocumentation,
      {
        id: batch.id,
        dokumentasiVideoUrl: 'https://example.com/video',
        dokumentasiMedia: [
          { url: 'https://example.com/foto.jpg', label: 'Foto', type: 'image' },
        ],
      },
      { context: adminContext }
    );
    const orders = await call(
      router.admin.qurban.ordersList,
      {},
      { context: adminContext }
    );
    expect(orders.data.find((o) => o.id === id)?.dokumentasiVideoUrl).toBe(
      'https://example.com/video'
    );

    // No phone number → the report is skipped, nothing is sent.
    const report = await call(
      router.admin.qurban.sendReport,
      { orderIds: [id] },
      { context: adminContext }
    );
    expect(report).toEqual({ sent: 0, skipped: 1, failed: 0 });
  });

  test('gateway orders keep payment locked and cannot be deleted', async () => {
    const batch = await createPatunganBatch(1);
    const order = await register(batch.id);
    const id = order.data?.id ?? '';
    const txId = `qrbcrud-${runId}-tx`;
    await database.insert(schema.transactions).values({
      id: txId,
      wakifId: adminId,
      jenisTransaksi: 'QURBAN',
      amount: '2950000',
      disbursementDestination: 'Panitia Qurban Amwal',
    });
    await database
      .update(schema.qurbanOrders)
      .set({ transactionId: txId })
      .where(eq(schema.qurbanOrders.id, id));
    try {
      await expectRejects(
        call(
          router.admin.qurban.updateOrder,
          { id, statusPembayaran: 'BELUM_BAYAR' },
          { context: adminContext }
        ),
        400
      );
      await expectRejects(
        call(
          router.admin.qurban.deleteOrder,
          { id },
          { context: adminContext }
        ),
        400
      );
    } finally {
      await database
        .update(schema.qurbanOrders)
        .set({ transactionId: null })
        .where(eq(schema.qurbanOrders.id, id));
      await database
        .delete(schema.transactions)
        .where(eq(schema.transactions.id, txId));
    }
  });

  test('an unused batch can be edited and deleted', async () => {
    const batch = await createPatunganBatch(7);
    const updated = await call(
      router.admin.qurban.updateBatch,
      { id: batch.id, hargaPerSlot: 3_100_000, fotoUrl: '' },
      { context: adminContext }
    );
    expect(Number(updated.data?.hargaPerSlot)).toBe(3_100_000);

    await call(
      router.admin.qurban.deleteBatch,
      { id: batch.id },
      { context: adminContext }
    );
    const gone = await database
      .select()
      .from(schema.hewanBatches)
      .where(eq(schema.hewanBatches.id, batch.id));
    expect(gone).toHaveLength(0);
  });
});
