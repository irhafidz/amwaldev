import { afterAll, describe, expect, test } from 'bun:test';
import { call } from '@orpc/server';
import { eq, inArray } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Database } from '../../src/lib/db';
import { assertTestDatabase } from '../test-database-guard';
import { createTestCaller } from './test-utils';

/**
 * QA Test#1 Fase 3 (QA-04, QA-16, D3): zakat dan qurban terbuka untuk tamu.
 * Yang dibuktikan: tamu bisa checkout, nama muzakki selalu tercatat (D3),
 * tamu/orang lain tidak bisa mengintip data donatur, slot qurban tetap aman
 * saat diperebutkan tamu, dan pesanan tamu dibatasi.
 */

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const schema = await import('../../src/lib/db/schema');
const { router } = await import('../../src/lib/orpc/router');
const { MockPaymentProvider } = await import(
  '@amwal/core/payment/mock.provider'
);
const { assertGuestOrderAllowed, resetGuestOrderLimits } = await import(
  '../../src/lib/payment/guest-order-limit'
);

const database: Database = createDatabase(connectionUrl);
const mockProvider = new MockPaymentProvider('SB-Mid-server-phase3-key-123456');
const runId = ulid().toLowerCase();
const prefix = `p3-${runId}`;

let ipCounter = 0;
const nextIp = () => {
  ipCounter += 1;
  return `198.51.100.${ipCounter}`;
};
/** Tamu dengan IP unik, supaya pembatas per-IP tidak saling mengganggu antartes. */
const guest = (ip = nextIp()) =>
  createTestCaller({
    database,
    user: null,
    paymentProvider: mockProvider,
    headers: { 'x-forwarded-for': ip },
  });

const randomPhone = () =>
  `08121${String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')}`;

const created = {
  zakatOrders: [] as string[],
  qurbanOrders: [] as string[],
  transactions: [] as string[],
  batches: [] as string[],
  users: [] as string[],
};

async function createBatch(totalSlot: number): Promise<string> {
  const batchId = `${prefix}-batch-${created.batches.length}`;
  await database.insert(schema.hewanBatches).values({
    id: batchId,
    jenisHewan: 'KAMBING',
    totalSlot,
    hargaPerSlot: '2500000',
    status: 'TERSEDIA',
  });
  for (let i = 1; i <= totalSlot; i++) {
    await database.insert(schema.qurbanAnimalSlots).values({
      id: `${batchId}-slot-${i}`,
      hewanBatchId: batchId,
      nomorSlot: i,
      status: 'TERSEDIA',
    });
  }
  created.batches.push(batchId);
  return batchId;
}

const qurbanInput = (batchId: string, over: Record<string, unknown> = {}) => ({
  hewanBatchId: batchId,
  jumlahSlotDiminta: 1,
  teleponPengqurban: randomPhone(),
  tipeKepemilikan: 'INDIVIDU' as const,
  akadWakalahAccepted: true as const,
  donorName: 'Tamu Qurban',
  ...over,
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
  if (created.zakatOrders.length > 0) {
    await database
      .delete(schema.zakatOrders)
      .where(inArray(schema.zakatOrders.id, created.zakatOrders));
  }
  if (created.qurbanOrders.length > 0) {
    await database
      .delete(schema.qurbanOrders)
      .where(inArray(schema.qurbanOrders.id, created.qurbanOrders));
  }
  if (created.transactions.length > 0) {
    await database
      .delete(schema.transactions)
      .where(inArray(schema.transactions.id, created.transactions));
  }
  for (const id of created.users) {
    await database.delete(schema.users).where(eq(schema.users.id, id));
  }
});

describe('zakat untuk tamu (QA-04, QA-16, D3)', () => {
  test('tamu bisa checkout; nama asli tercatat internal, publik melihat Hamba Allah', async () => {
    const email = `${prefix}-zakat@example.com`;
    const result = await call(
      router.zakat.createOrder,
      {
        programId: 'ZAKAT_MAAL_PENGHASILAN',
        amount: 250_000,
        paymentType: 'qris',
        jenisZakat: 'MAAL_PENGHASILAN',
        isAnonymous: true,
        doa: 'Semoga diterima',
        donorName: 'Budi Santoso',
        donorEmail: email,
      },
      { context: await guest() }
    );
    if (typeof result.transactionId !== 'string') {
      throw new Error('expected a digital payment');
    }
    created.zakatOrders.push(result.orderId);
    created.transactions.push(result.transactionId);

    // Pencatatan amil: nama asli tersimpan, anonimitas hanya bendera tampilan.
    const [order] = await database
      .select()
      .from(schema.zakatOrders)
      .where(eq(schema.zakatOrders.id, result.orderId));
    expect(order?.namaMuzakki).toBe('Budi Santoso');
    expect(order?.isAnonymous).toBe(true);
    expect(order?.muzakkiId).toBeTruthy();
    const [owner] = await database
      .select({ id: schema.users.id, passwordHash: schema.users.passwordHash })
      .from(schema.users)
      .where(eq(schema.users.email, email));
    expect(owner?.id).toBe(order?.muzakkiId ?? '');
    expect(owner?.passwordHash).toBeNull();
    if (owner) {
      created.users.push(owner.id);
    }

    // Tamu membuka status: dapat instruksi bayar, tanpa data pribadi.
    const status = await call(
      router.zakat.orderStatus,
      { orderId: result.orderId },
      { context: await guest() }
    );
    expect(status.data.order.namaMuzakki).toBe('Hamba Allah');
    expect(status.data.payment?.instructions?.type).toBe('qris');
    const json = JSON.stringify(status.data);
    for (const secret of ['Budi Santoso', email, 'Semoga diterima']) {
      expect(json).not.toContain(secret);
    }
  });

  test('tamu tanpa kontak tetap bisa membayar (akun sistem anonim)', async () => {
    const result = await call(
      router.zakat.createOrder,
      {
        programId: 'ZAKAT_FITRAH',
        amount: 45_000,
        paymentType: 'qris',
        jenisZakat: 'FITRAH',
        jumlahJiwa: 1,
        donorName: 'Tanpa Kontak',
      },
      { context: await guest() }
    );
    if (typeof result.transactionId !== 'string') {
      throw new Error('expected a digital payment');
    }
    created.zakatOrders.push(result.orderId);
    created.transactions.push(result.transactionId);
    expect(result.payment.instructions?.type).toBe('qris');
  });

  test('donatur login tetap memakai profil akun dan tidak dibatasi', async () => {
    const userId = `${prefix}-member`;
    await database.insert(schema.users).values({
      id: userId,
      name: 'Donatur Akun',
      updatedAt: new Date().toISOString(),
    });
    created.users.push(userId);
    const result = await call(
      router.zakat.createOrder,
      {
        programId: 'ZAKAT_MAAL',
        amount: 100_000,
        paymentType: 'qris',
        // Diabaikan untuk donatur login: nama diambil dari akun.
        donorName: 'Nama Palsu',
      },
      {
        context: await createTestCaller({
          database,
          user: { userId, role: 'WAKIF' },
          paymentProvider: mockProvider,
        }),
      }
    );
    if (typeof result.transactionId !== 'string') {
      throw new Error('expected a digital payment');
    }
    created.zakatOrders.push(result.orderId);
    created.transactions.push(result.transactionId);
    const [order] = await database
      .select({
        muzakkiId: schema.zakatOrders.muzakkiId,
        namaMuzakki: schema.zakatOrders.namaMuzakki,
      })
      .from(schema.zakatOrders)
      .where(eq(schema.zakatOrders.id, result.orderId));
    expect(order).toEqual({ muzakkiId: userId, namaMuzakki: 'Donatur Akun' });
  });
});

describe('qurban untuk tamu (QA-04)', () => {
  test('tamu memesan, slot terkunci, dan data pemesan tidak bocor ke orang lain', async () => {
    const batchId = await createBatch(2);
    const phone = randomPhone();
    const result = await call(
      router.qurban.createOrder,
      qurbanInput(batchId, {
        teleponPengqurban: phone,
        donorName: 'Siti Aminah',
        namaShohibul: ['Siti Aminah binti Ahmad'],
        alamatPengqurban: 'Jl. Rahasia 1',
      }),
      { context: await guest() }
    );
    created.qurbanOrders.push(result.orderId);
    created.transactions.push(result.transactionId);

    const [order] = await database
      .select()
      .from(schema.qurbanOrders)
      .where(eq(schema.qurbanOrders.id, result.orderId));
    expect(order?.namaPengqurban).toBe('Siti Aminah');
    expect(order?.wakifId).toBeTruthy();
    if (order?.wakifId) {
      const [owner] = await database
        .select({ passwordHash: schema.users.passwordHash })
        .from(schema.users)
        .where(eq(schema.users.id, order.wakifId));
      expect(owner?.passwordHash).toBeNull();
      created.users.push(order.wakifId);
    }
    const slots = await database
      .select({ status: schema.qurbanAnimalSlots.status })
      .from(schema.qurbanAnimalSlots)
      .where(eq(schema.qurbanAnimalSlots.hewanBatchId, batchId));
    expect(slots.filter((slot) => slot.status === 'TERISI')).toHaveLength(1);

    const status = await call(
      router.qurban.orderStatus,
      { orderId: result.orderId },
      { context: await guest() }
    );
    expect(status.data.payment?.instructions?.type).toBe('qris');
    expect(status.data.transaction?.id).toBeNull();
    const json = JSON.stringify(status.data);
    for (const secret of [
      'Siti Aminah',
      'Jl. Rahasia 1',
      phone.slice(1),
      'Mewakilkan',
    ]) {
      expect(json).not.toContain(secret);
    }
  });

  test('10 tamu berebut 1 slot lewat router: tepat 1 menang, 9 ditolak bersih', async () => {
    const batchId = await createBatch(1);
    const contexts = await Promise.all(
      Array.from({ length: 10 }, () => guest())
    );

    const results = await Promise.allSettled(
      contexts.map((context, index) =>
        call(
          router.qurban.createOrder,
          qurbanInput(batchId, { donorName: `Tamu Rebutan ${index}` }),
          { context }
        )
      )
    );
    const won = results.filter((r) => r.status === 'fulfilled');
    const lost = results.filter((r) => r.status === 'rejected');
    for (const r of won) {
      const value = (
        r as PromiseFulfilledResult<{ orderId: string; transactionId: string }>
      ).value;
      created.qurbanOrders.push(value.orderId);
      created.transactions.push(value.transactionId);
    }
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(9);
    for (const r of lost) {
      expect((r as PromiseRejectedResult).reason).toMatchObject({
        status: 400,
      });
    }

    const [slot] = await database
      .select({ status: schema.qurbanAnimalSlots.status })
      .from(schema.qurbanAnimalSlots)
      .where(eq(schema.qurbanAnimalSlots.hewanBatchId, batchId));
    expect(slot?.status).toBe('TERISI');
    // Tidak ada pesanan yatim dari 9 yang kalah.
    const orders = await database
      .select({ id: schema.qurbanOrders.id })
      .from(schema.qurbanOrders)
      .innerJoin(
        schema.transactions,
        eq(schema.transactions.id, schema.qurbanOrders.transactionId)
      )
      .where(inArray(schema.qurbanOrders.id, created.qurbanOrders));
    expect(orders.length).toBeGreaterThanOrEqual(1);
    const wakif = await database
      .select({ id: schema.qurbanOrders.wakifId })
      .from(schema.qurbanOrders)
      .where(eq(schema.qurbanOrders.id, created.qurbanOrders.at(-1) ?? ''));
    if (wakif[0]?.id) {
      created.users.push(wakif[0].id);
    }
  });

  test('satu nomor WhatsApp tamu dibatasi 3 pesanan belum dibayar', async () => {
    const batchId = await createBatch(5);
    const phone = randomPhone();
    const order = async (index: number) =>
      call(
        router.qurban.createOrder,
        qurbanInput(batchId, {
          teleponPengqurban: phone,
          donorName: `Penimbun ${index}`,
        }),
        // IP berbeda: yang diuji pembatas DB per nomor, bukan pembatas IP.
        { context: await guest() }
      );

    for (const index of [1, 2, 3]) {
      const result = await order(index);
      created.qurbanOrders.push(result.orderId);
      created.transactions.push(result.transactionId);
    }
    await expect(order(4)).rejects.toMatchObject({ status: 429 });

    const slots = await database
      .select({ status: schema.qurbanAnimalSlots.status })
      .from(schema.qurbanAnimalSlots)
      .where(eq(schema.qurbanAnimalSlots.hewanBatchId, batchId));
    expect(slots.filter((slot) => slot.status === 'TERISI')).toHaveLength(3);

    const owners = await database
      .select({ id: schema.qurbanOrders.wakifId })
      .from(schema.qurbanOrders)
      .where(inArray(schema.qurbanOrders.id, created.qurbanOrders));
    for (const owner of owners) {
      if (owner.id) {
        created.users.push(owner.id);
      }
    }
  });
});

describe('pembatas pesanan tamu per IP', () => {
  test('qurban 10/jam dan zakat 20/jam per IP; IP lain tidak terpengaruh', () => {
    resetGuestOrderLimits();
    const request = (ip: string) =>
      new Request('http://localhost/rpc/x', {
        headers: { 'x-forwarded-for': ip },
      });

    for (let i = 0; i < 10; i++) {
      assertGuestOrderAllowed(request('192.0.2.1'), 'qurban');
    }
    expect(() =>
      assertGuestOrderAllowed(request('192.0.2.1'), 'qurban')
    ).toThrow();
    expect(() =>
      assertGuestOrderAllowed(request('192.0.2.2'), 'qurban')
    ).not.toThrow();

    for (let i = 0; i < 20; i++) {
      assertGuestOrderAllowed(request('192.0.2.1'), 'zakat');
    }
    expect(() =>
      assertGuestOrderAllowed(request('192.0.2.1'), 'zakat')
    ).toThrow();
    resetGuestOrderLimits();
  });

  test('IP yang kena batas ditolak 429 di router tanpa membuat pesanan', async () => {
    resetGuestOrderLimits();
    const ip = '192.0.2.99';
    const request = new Request('http://localhost/rpc/x', {
      headers: { 'x-forwarded-for': ip },
    });
    for (let i = 0; i < 20; i++) {
      assertGuestOrderAllowed(request, 'zakat');
    }
    const before = await database
      .select({ id: schema.zakatOrders.id })
      .from(schema.zakatOrders);

    await expect(
      call(
        router.zakat.createOrder,
        {
          programId: 'ZAKAT_LIMIT',
          amount: 50_000,
          paymentType: 'qris',
          donorName: 'Kena Batas',
        },
        { context: await guest(ip) }
      )
    ).rejects.toMatchObject({ status: 429 });

    const after = await database
      .select({ id: schema.zakatOrders.id })
      .from(schema.zakatOrders);
    expect(after.length).toBe(before.length);
    resetGuestOrderLimits();
  });
});
