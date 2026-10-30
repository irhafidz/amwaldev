import { afterAll, describe, expect, test } from 'bun:test';
import { call, type ORPCError } from '@orpc/server';
import { eq, inArray } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Database } from '../../src/lib/db';
import { assertTestDatabase } from '../test-database-guard';
import { createTestCaller } from './test-utils';

/**
 * QA-13: satu sapi utuh (SAPI, satu slot) boleh atas 1-7 nama shohibul, dan
 * daftarnya tersimpan sebagai larik. Kambing dan patungan tetap satu nama
 * per slot.
 */

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const schema = await import('../../src/lib/db/schema');
const { router } = await import('../../src/lib/orpc/router');
const { MockPaymentProvider } = await import(
  '@amwal/core/payment/mock.provider'
);
const { resetGuestOrderLimits } = await import(
  '../../src/lib/payment/guest-order-limit'
);

const database: Database = createDatabase(connectionUrl);
const provider = new MockPaymentProvider('SB-Mid-server-phase5-key-123456');
const prefix = `p5-${ulid().toLowerCase()}`;
const created = {
  batches: [] as string[],
  orders: [] as string[],
  tx: [] as string[],
};

let ip = 0;
const guest = () => {
  ip += 1;
  return createTestCaller({
    database,
    user: null,
    paymentProvider: provider,
    headers: { 'x-forwarded-for': `192.0.2.${ip}` },
  });
};
const phone = () =>
  `08131${String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')}`;

async function batch(jenisHewan: 'SAPI' | 'KAMBING', totalSlot: number) {
  const id = `${prefix}-b${created.batches.length}`;
  await database.insert(schema.hewanBatches).values({
    id,
    jenisHewan,
    totalSlot,
    hargaPerSlot: '21000000',
    status: 'TERSEDIA',
  });
  for (let n = 1; n <= totalSlot; n += 1) {
    await database.insert(schema.qurbanAnimalSlots).values({
      id: `${id}-s${n}`,
      hewanBatchId: id,
      nomorSlot: n,
      status: 'TERSEDIA',
    });
  }
  created.batches.push(id);
  return id;
}

const input = (hewanBatchId: string, names: string[], slots = 1) => ({
  hewanBatchId,
  jumlahSlotDiminta: slots,
  teleponPengqurban: phone(),
  tipeKepemilikan: 'INDIVIDU' as const,
  paymentType: 'va/bni' as const,
  akadWakalahAccepted: true as const,
  donorName: 'Pemesan Sapi',
  namaShohibul: names,
});

const names = (n: number) =>
  Array.from({ length: n }, (_, i) => `Shohibul ${i + 1} bin Abdullah`);

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error as ORPCError<string, unknown>;
  }
  throw new Error('expected rejection');
}

afterAll(async () => {
  resetGuestOrderLimits();
  for (const id of created.batches) {
    await database
      .delete(schema.qurbanAnimalSlots)
      .where(eq(schema.qurbanAnimalSlots.hewanBatchId, id));
    await database
      .delete(schema.hewanBatches)
      .where(eq(schema.hewanBatches.id, id));
  }
  if (created.orders.length > 0) {
    await database
      .delete(schema.qurbanOrders)
      .where(inArray(schema.qurbanOrders.id, created.orders));
    await database
      .delete(schema.transactions)
      .where(inArray(schema.transactions.id, created.tx));
  }
});

describe('qurban sapi utuh dengan banyak shohibul (QA-13)', () => {
  test('stores 7 names in one slot at the price of one cow', async () => {
    resetGuestOrderLimits();
    const id = await batch('SAPI', 1);
    const result = await call(router.qurban.createOrder, input(id, names(7)), {
      context: await guest(),
    });
    created.orders.push(result.orderId);
    created.tx.push(result.transactionId);

    const [order] = await database
      .select()
      .from(schema.qurbanOrders)
      .where(eq(schema.qurbanOrders.id, result.orderId));
    expect(order?.namaShohibulList).toEqual(names(7));
    expect(order?.namaShohibul).toBe(names(7).join(', '));
    expect(Number(order?.totalHarga)).toBe(21_000_000);

    const slots = await database
      .select({ status: schema.qurbanAnimalSlots.status })
      .from(schema.qurbanAnimalSlots)
      .where(eq(schema.qurbanAnimalSlots.hewanBatchId, id));
    expect(slots.map((slot) => slot.status)).toEqual(['TERISI']);
  });

  test('rejects an 8th name on a whole cow', async () => {
    resetGuestOrderLimits();
    const id = await batch('SAPI', 1);
    const error = await rejection(
      call(router.qurban.createOrder, input(id, names(8)), {
        context: await guest(),
      })
    );
    expect(error.status).toBe(400);
  });

  test('a goat and a shared-cow slot still take one name per slot', async () => {
    resetGuestOrderLimits();
    const goat = await batch('KAMBING', 1);
    const shared = await batch('SAPI', 7);
    for (const id of [goat, shared]) {
      const error = await rejection(
        call(router.qurban.createOrder, input(id, names(2)), {
          context: await guest(),
        })
      );
      expect(error.status).toBe(400);
      expect(error.message).toContain('melebihi jumlah slot');
    }
  });
});
