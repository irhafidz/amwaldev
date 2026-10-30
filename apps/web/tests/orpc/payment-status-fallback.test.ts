import { afterAll, describe, expect, test } from 'bun:test';
import type {
  PaymentProvider,
  ProviderWebhookResult,
} from '@amwal/core/payment/types';
import { call } from '@orpc/server';
import { eq, inArray } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Database } from '../../src/lib/db';
import { assertTestDatabase } from '../test-database-guard';
import { createTestCaller } from './test-utils';

/**
 * Fallback cek status: Mayar tidak bisa mengirim webhook (URL belum
 * didaftarkan di dasbor), jadi halaman tujuan setelah pembayaran —
 * `orderStatus` setiap modul — menanyakan Mayar langsung dan menyelesaikan
 * pesanan. Semua modul memakai satu helper (`reconcileOrderNow`); tes ini
 * memastikan keempatnya benar-benar tersambung dan bahwa:
 *   - LUNAS dari Mayar membuat pesanan lunas, buku besar naik TEPAT sekali
 *   - kedaluwarsa dari Mayar menggagalkan pesanan (slot qurban dilepas)
 *   - Mayar yang tidak terjangkau tidak merusak halaman status
 *   - parameter URL tidak pernah menjadi sumber kebenaran
 */

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const schema = await import('../../src/lib/db/schema');
const { router } = await import('../../src/lib/orpc/router');

const database: Database = createDatabase(connectionUrl);
const runId = ulid().toLowerCase();
const now = () => new Date().toISOString();

type MayarState = 'pending' | 'paid' | 'expired' | 'down';

const OUTCOME_BY_STATE = {
  pending: 'PENDING',
  paid: 'LUNAS',
  expired: 'GAGAL',
  down: 'PENDING',
} as const;

/** Penirua Mayar: `createTransaction` + `reconcileTransaction` yang bisa diatur. */
function fakeMayar() {
  const states = new Map<string, { amount: string; state: MayarState }>();
  const checks: string[] = [];

  const provider: PaymentProvider = {
    name: 'MAYAR',
    createTransaction: (payload) => {
      const providerRef = `mayar-${ulid().toLowerCase()}`;
      states.set(providerRef, {
        amount: String(payload.grossAmount),
        state: 'pending',
      });
      return Promise.resolve({
        providerRef,
        redirectUrl: `https://amwal-its.myr.lat/invoices/${providerRef}`,
        paymentType: payload.paymentType,
      });
    },
    verifyWebhookSignature: () => false,
    reconcileTransaction: (providerRef): Promise<ProviderWebhookResult> => {
      checks.push(providerRef);
      const entry = states.get(providerRef);
      if (!entry || entry.state === 'down') {
        return Promise.resolve({
          type: 'retry',
          status: 502,
          message: 'Mayar down',
        });
      }
      const outcome = OUTCOME_BY_STATE[entry.state];
      return Promise.resolve({
        type: 'event',
        event: {
          expectedAmount: entry.amount,
          orderId: null,
          outcome,
          providerRef,
        },
      });
    },
  };

  return {
    provider,
    checks,
    set(providerRef: string, state: MayarState) {
      const entry = states.get(providerRef);
      if (entry) {
        entry.state = state;
      }
    },
  };
}

const mayar = fakeMayar();
const publicContext = await createTestCaller({
  database,
  user: null,
  paymentProvider: mayar.provider,
});

const cleanup = {
  users: [] as string[],
  transactions: [] as string[],
  zakatOrders: [] as string[],
  waqfOrders: [] as string[],
  qurbanOrders: [] as string[],
  infaqOrderIds: [] as string[],
  pools: [] as string[],
  batches: [] as string[],
  programs: [] as string[],
  nadzirProfiles: [] as string[],
};

afterAll(async () => {
  const tx = cleanup.transactions;
  if (tx.length > 0) {
    await database
      .delete(schema.certificates)
      .where(inArray(schema.certificates.transactionId, tx));
  }
  if (cleanup.users.length > 0) {
    await database
      .delete(schema.gamificationPointLedgers)
      .where(inArray(schema.gamificationPointLedgers.userId, cleanup.users));
    await database
      .delete(schema.notifications)
      .where(inArray(schema.notifications.userId, cleanup.users));
  }
  for (const id of cleanup.zakatOrders) {
    await database
      .delete(schema.zakatOrders)
      .where(eq(schema.zakatOrders.id, id));
  }
  for (const id of cleanup.waqfOrders) {
    await database
      .delete(schema.waqfOrders)
      .where(eq(schema.waqfOrders.id, id));
  }
  for (const id of cleanup.qurbanOrders) {
    await database
      .delete(schema.qurbanAnimalSlots)
      .where(eq(schema.qurbanAnimalSlots.qurbanOrderId, id));
    await database
      .delete(schema.qurbanOrders)
      .where(eq(schema.qurbanOrders.id, id));
  }
  for (const id of cleanup.infaqOrderIds) {
    await database
      .delete(schema.infaqOrders)
      .where(eq(schema.infaqOrders.orderId, id));
  }
  if (tx.length > 0) {
    await database
      .delete(schema.transactions)
      .where(inArray(schema.transactions.id, tx));
  }
  for (const id of cleanup.programs) {
    await database
      .delete(schema.waqfPrincipalLedgers)
      .where(eq(schema.waqfPrincipalLedgers.waqfProgramId, id));
    await database
      .delete(schema.waqfPrograms)
      .where(eq(schema.waqfPrograms.id, id));
  }
  for (const id of cleanup.nadzirProfiles) {
    await database
      .delete(schema.nadzirProfiles)
      .where(eq(schema.nadzirProfiles.id, id));
  }
  for (const kode of cleanup.pools) {
    await database
      .delete(schema.fundPools)
      .where(eq(schema.fundPools.kode, kode));
  }
  for (const id of cleanup.batches) {
    await database
      .delete(schema.qurbanAnimalSlots)
      .where(eq(schema.qurbanAnimalSlots.hewanBatchId, id));
    await database
      .delete(schema.hewanBatches)
      .where(eq(schema.hewanBatches.id, id));
  }
  if (cleanup.users.length > 0) {
    await database
      .delete(schema.users)
      .where(inArray(schema.users.id, cleanup.users));
  }
});

async function wakifContext(label: string) {
  const userId = `fb-${runId}-${label}`;
  await database.insert(schema.users).values({
    id: userId,
    name: `Donatur ${label}`,
    phone: `08${String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, '0')}`,
    updatedAt: now(),
  });
  cleanup.users.push(userId);
  return {
    userId,
    context: await createTestCaller({
      database,
      user: { userId, role: 'WAKIF' },
      paymentProvider: mayar.provider,
    }),
  };
}

async function transactionFor(transactionId: string) {
  const [row] = await database
    .select()
    .from(schema.transactions)
    .where(eq(schema.transactions.id, transactionId));
  return row;
}

async function providerRefOf(transactionId: string): Promise<string> {
  const row = await transactionFor(transactionId);
  if (!row?.paymentGatewayRef) {
    throw new Error('transaction has no gateway ref');
  }
  return row.paymentGatewayRef;
}

async function poolBalance(kode: string): Promise<number> {
  const [pool] = await database
    .select({ balance: schema.fundPools.balance })
    .from(schema.fundPools)
    .where(eq(schema.fundPools.kode, kode));
  return Number(pool?.balance ?? Number.NaN);
}

/** Cooldown 10 dtk per transaksi: tiap skenario memakai pesanan baru. */
describe('status fallback: zakat', () => {
  test('LUNAS dari Mayar menyelesaikan pesanan pada kunjungan pertama dan menaikkan buku besar sekali', async () => {
    const { context, userId } = await wakifContext('zakat-first');
    const programId = `ZAKAT_FB_${runId}_first`;
    cleanup.pools.push(programId);
    await database.insert(schema.fundPools).values({
      id: `fb-${runId}-pool-first`,
      kode: programId,
      nama: programId,
      balance: '1000',
      updatedAt: now(),
    });

    const created = await call(
      router.zakat.createOrder,
      { programId, amount: 50_000, paymentType: 'qris', isAnonymous: false },
      { context }
    );
    if (typeof created.transactionId !== 'string') {
      throw new Error('expected a digital payment');
    }
    cleanup.zakatOrders.push(created.orderId);
    cleanup.transactions.push(created.transactionId);
    mayar.set(await providerRefOf(created.transactionId), 'paid');

    const status = await call(
      router.zakat.orderStatus,
      { orderId: created.orderId },
      { context }
    );

    expect(status.data.transaction?.statusPembayaran).toBe('LUNAS');
    expect(await poolBalance(programId)).toBe(51_000);

    // Penyelesaian lewat cek status memicu efek samping yang sama dengan
    // webhook: donatur menerima notifikasi dan poin Berkah.
    const notifications = await database
      .select({ id: schema.notifications.id })
      .from(schema.notifications)
      .where(eq(schema.notifications.userId, userId));
    expect(notifications.length).toBeGreaterThan(0);

    // Poin Berkah: +200 tetap + ⌊nominal/1.000⌋ (Rp 50.000 → 50), sekali saja.
    const points = await database
      .select({ points: schema.gamificationPointLedgers.pointsEarned })
      .from(schema.gamificationPointLedgers)
      .where(eq(schema.gamificationPointLedgers.userId, userId));
    expect(points.reduce((sum, row) => sum + row.points, 0)).toBe(250);

    // Kunjungan berikutnya (atau webhook yang terlambat) tidak menghitung ganda.
    await call(
      router.zakat.orderStatus,
      { orderId: created.orderId },
      { context }
    );
    expect(await poolBalance(programId)).toBe(51_000);
    const pointsAfterRevisit = await database
      .select({ points: schema.gamificationPointLedgers.pointsEarned })
      .from(schema.gamificationPointLedgers)
      .where(eq(schema.gamificationPointLedgers.userId, userId));
    expect(pointsAfterRevisit.reduce((sum, row) => sum + row.points, 0)).toBe(
      250
    );
  });

  test('Mayar belum menerima pembayaran: status tetap PENDING', async () => {
    const { context } = await wakifContext('zakat-pending');
    const programId = `ZAKAT_FB_${runId}_pending`;
    cleanup.pools.push(programId);
    await database.insert(schema.fundPools).values({
      id: `fb-${runId}-pool-pending`,
      kode: programId,
      nama: programId,
      balance: '0',
      updatedAt: now(),
    });
    const created = await call(
      router.zakat.createOrder,
      { programId, amount: 25_000, paymentType: 'qris', isAnonymous: false },
      { context }
    );
    if (typeof created.transactionId !== 'string') {
      throw new Error('expected a digital payment');
    }
    cleanup.zakatOrders.push(created.orderId);
    cleanup.transactions.push(created.transactionId);

    const status = await call(
      router.zakat.orderStatus,
      { orderId: created.orderId },
      { context }
    );

    expect(status.data.transaction?.statusPembayaran).toBe('PENDING');
    expect(await poolBalance(programId)).toBe(0);
  });

  test('Mayar tidak terjangkau: halaman status tetap menjawab dan pesanan PENDING', async () => {
    const { context } = await wakifContext('zakat-down');
    const programId = `ZAKAT_FB_${runId}_down`;
    cleanup.pools.push(programId);
    await database.insert(schema.fundPools).values({
      id: `fb-${runId}-pool-down`,
      kode: programId,
      nama: programId,
      balance: '0',
      updatedAt: now(),
    });
    const created = await call(
      router.zakat.createOrder,
      { programId, amount: 25_000, paymentType: 'qris', isAnonymous: false },
      { context }
    );
    if (typeof created.transactionId !== 'string') {
      throw new Error('expected a digital payment');
    }
    cleanup.zakatOrders.push(created.orderId);
    cleanup.transactions.push(created.transactionId);
    mayar.set(await providerRefOf(created.transactionId), 'down');

    const status = await call(
      router.zakat.orderStatus,
      { orderId: created.orderId },
      { context }
    );

    expect(status.data.transaction?.statusPembayaran).toBe('PENDING');
  });

  test('pemeriksaan dibatasi satu per transaksi per jendela (cooldown)', async () => {
    const { context } = await wakifContext('zakat-cooldown');
    const programId = `ZAKAT_FB_${runId}_cooldown`;
    cleanup.pools.push(programId);
    await database.insert(schema.fundPools).values({
      id: `fb-${runId}-pool-cooldown`,
      kode: programId,
      nama: programId,
      balance: '0',
      updatedAt: now(),
    });
    const created = await call(
      router.zakat.createOrder,
      { programId, amount: 25_000, paymentType: 'qris', isAnonymous: false },
      { context }
    );
    if (typeof created.transactionId !== 'string') {
      throw new Error('expected a digital payment');
    }
    cleanup.zakatOrders.push(created.orderId);
    cleanup.transactions.push(created.transactionId);
    const ref = await providerRefOf(created.transactionId);
    const callsBefore = mayar.checks.filter((r) => r === ref).length;

    for (let i = 0; i < 5; i++) {
      await call(
        router.zakat.orderStatus,
        { orderId: created.orderId },
        { context }
      );
    }

    expect(mayar.checks.filter((r) => r === ref).length - callsBefore).toBe(1);
  });
});

describe('status fallback: infaq (publik)', () => {
  test('LUNAS dari Mayar membuat status infaq LUNAS tanpa login', async () => {
    const created = await call(
      router.infaq.createOrder,
      {
        nominal: 30_000,
        jenis: 'INFAQ_UMUM',
        namaPenginfaq: 'Penginfaq Uji',
        emailPenginfaq: `fb-${runId}-infaq@example.com`,
        paymentType: 'qris',
        isAnonymous: false,
      },
      { context: publicContext }
    );
    const orderId = created.data.orderId;
    cleanup.infaqOrderIds.push(orderId);
    const [order] = await database
      .select({
        transactionId: schema.infaqOrders.transactionId,
        userId: schema.infaqOrders.userId,
      })
      .from(schema.infaqOrders)
      .where(eq(schema.infaqOrders.orderId, orderId));
    if (!order?.transactionId) {
      throw new Error('infaq order has no transaction');
    }
    cleanup.transactions.push(order.transactionId);
    if (order.userId) {
      cleanup.users.push(order.userId);
    }
    mayar.set(await providerRefOf(order.transactionId), 'paid');

    const status = await call(
      router.infaq.orderStatus,
      { orderId },
      { context: publicContext }
    );

    expect(status.data.transaction?.statusPembayaran).toBe('LUNAS');
    expect(status.data.status).toBe('SETTLED');
  });
});

describe('status fallback: wakaf (publik)', () => {
  test('LUNAS dari Mayar memverifikasi pesanan dan menaikkan pokok wakaf', async () => {
    const nadzirUserId = `fb-${runId}-nadzir-user`;
    const nadzirProfileId = `fb-${runId}-nadzir-profile`;
    const programId = `fb-${runId}-program`;
    await database.insert(schema.users).values({
      id: nadzirUserId,
      name: 'Nadzir Fallback',
      updatedAt: now(),
    });
    cleanup.users.push(nadzirUserId);
    await database.insert(schema.nadzirProfiles).values({
      id: nadzirProfileId,
      userId: nadzirUserId,
      kategori: 'ORGANISASI',
      namaLembaga: 'Badan Wakaf Fallback',
      updatedAt: now(),
    });
    cleanup.nadzirProfiles.push(nadzirProfileId);
    await database.insert(schema.waqfPrograms).values({
      id: programId,
      nadzirProfileId,
      judul: `Program Fallback ${runId}`,
      targetDana: '100000000',
      jenisWakaf: 'PRODUKTIF_KEKAL',
      status: 'LIVE',
      updatedAt: now(),
    });
    cleanup.programs.push(programId);

    const created = await call(
      router.waqf.createOrder,
      {
        programId,
        amount: 100_000,
        paymentType: 'qris',
        donorName: 'Wakif Fallback',
        donorEmail: `fb-${runId}-wakif@example.com`,
        donorPhone: '081234567891',
        isAnonymous: false,
      },
      { context: publicContext }
    );
    cleanup.waqfOrders.push(created.orderId);
    cleanup.transactions.push(created.transactionId);
    const [order] = await database
      .select({ wakifId: schema.waqfOrders.wakifId })
      .from(schema.waqfOrders)
      .where(eq(schema.waqfOrders.id, created.orderId));
    if (order?.wakifId) {
      cleanup.users.push(order.wakifId);
    }
    mayar.set(await providerRefOf(created.transactionId), 'paid');

    const status = await call(
      router.waqf.orderStatus,
      { orderId: created.orderId },
      { context: publicContext }
    );

    expect(status.data.order.status).toBe('TERVERIFIKASI');
    expect(status.data.transaction?.statusPembayaran).toBe('LUNAS');

    const ledgers = await database
      .select()
      .from(schema.waqfPrincipalLedgers)
      .where(eq(schema.waqfPrincipalLedgers.waqfProgramId, programId));
    expect(
      ledgers.reduce((sum, row) => sum + Number(row.pokokDanaTerkumpul), 0)
    ).toBe(100_000);
  });
});

describe('status fallback: qurban', () => {
  async function createQurban(label: string) {
    const { userId, context } = await wakifContext(label);
    const batchId = `fb-${runId}-batch-${label}`;
    await database.insert(schema.hewanBatches).values({
      id: batchId,
      jenisHewan: 'KAMBING',
      totalSlot: 1,
      hargaPerSlot: '2500000',
      status: 'TERSEDIA',
    });
    cleanup.batches.push(batchId);
    await database.insert(schema.qurbanAnimalSlots).values({
      id: `fb-${runId}-slot-${label}`,
      hewanBatchId: batchId,
      nomorSlot: 1,
      status: 'TERSEDIA',
    });

    const created = await call(
      router.qurban.createOrder,
      {
        hewanBatchId: batchId,
        jumlahSlotDiminta: 1,
        teleponPengqurban: '081211004999',
        tipeKepemilikan: 'INDIVIDU',
        akadWakalahAccepted: true,
        paymentType: 'qris',
        namaShohibul: ['Shohibul Fallback'],
      },
      { context }
    );
    cleanup.qurbanOrders.push(created.orderId);
    cleanup.transactions.push(created.transactionId);
    return { userId, context, batchId, created };
  }

  async function slotStatus(batchId: string) {
    const [slot] = await database
      .select({ status: schema.qurbanAnimalSlots.status })
      .from(schema.qurbanAnimalSlots)
      .where(eq(schema.qurbanAnimalSlots.hewanBatchId, batchId));
    return slot?.status;
  }

  test('LUNAS dari Mayar membuat pesanan qurban lunas', async () => {
    const { context, created } = await createQurban('q-paid');
    mayar.set(await providerRefOf(created.transactionId), 'paid');

    const status = await call(
      router.qurban.orderStatus,
      { orderId: created.orderId },
      { context }
    );

    expect(status.data.transaction?.statusPembayaran).toBe('LUNAS');
  });

  test('kedaluwarsa di Mayar menggagalkan pesanan dan melepas slot', async () => {
    const { context, batchId, created } = await createQurban('q-expired');
    expect(await slotStatus(batchId)).not.toBe('TERSEDIA');
    mayar.set(await providerRefOf(created.transactionId), 'expired');

    const status = await call(
      router.qurban.orderStatus,
      { orderId: created.orderId },
      { context }
    );

    expect(status.data.transaction?.statusPembayaran).toBe('GAGAL');
    expect(await slotStatus(batchId)).toBe('TERSEDIA');
  });
});
