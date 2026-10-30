import { afterAll, describe, expect, test } from 'bun:test';
import { call, type ORPCError } from '@orpc/server';
import { eq, inArray } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Database } from '../../src/lib/db';
import { assertTestDatabase } from '../test-database-guard';
import { createTestCaller } from './test-utils';

/**
 * Wakaf, zakat, infaq, dan qurban membuat pembayaran lewat `MayarPaymentProvider`
 * yang SUNGGUHAN, berbicara HTTP ke Mayar palsu. Yang dipastikan: tiap modul
 * mengirim permintaan QRIS-only yang benar (channel, nominal, URL kembali
 * absolut, referensi pesanan) dan, begitu Mayar melaporkan `paid`, halaman
 * status menyelesaikannya tanpa webhook.
 */

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const schema = await import('../../src/lib/db/schema');
const { router } = await import('../../src/lib/orpc/router');
const { MayarPaymentProvider } = await import(
  '@amwal/core/payment/mayar.provider'
);

const database: Database = createDatabase(connectionUrl);
const runId = ulid().toLowerCase();

/** Satu per kategori Mayar: QRIS, Virtual Account, E-Wallet. */
const METHODS: ('qris' | 'va/bni' | 'ewallet/gopay')[] = [
  'qris',
  'va/bni',
  'ewallet/gopay',
];
const tagOf = (method: string) => method.replace(/[^a-z]/g, '');
const now = () => new Date().toISOString();

interface CreateRequest {
  authorization: string | null;
  body: Record<string, unknown>;
}

const created: CreateRequest[] = [];
const transactionsByRef = new Map<
  string,
  { amount: number; status: 'paid' | 'unpaid' }
>();
const INSTRUCTION_TYPE: Record<string, 'qris' | 'virtual_account' | 'ewallet'> =
  {
    qris: 'qris',
    'va/bni': 'virtual_account',
    'ewallet/gopay': 'ewallet',
  };

/** Bentuk `paymentDetail` Mayar v2 per kategori (diamati pada akun live). */
function paymentDetailFor(method: string) {
  if (method === 'qris') {
    return {
      qr_code: {
        channel_properties: {
          qr_string: '00020101021226650013CO.XENDIT.WWW0118936008480000000559',
          expires_at: '2026-10-08T05:17:38.397Z',
        },
      },
    };
  }
  if (method.startsWith('va/')) {
    return {
      virtual_account: {
        channel_code: method.slice(3).toUpperCase(),
        channel_properties: { virtual_account_number: '8808862065326583' },
      },
    };
  }
  return {
    ewallet: { channel_code: method.slice(8).toUpperCase() },
    actions: [
      {
        action: 'AUTH',
        url: 'https://gopay.co.id/app/x',
        url_type: 'DEEPLINK',
      },
    ],
  };
}

let counter = 0;
/** Bila diisi, permintaan create berikutnya ditolak Mayar dengan pesan ini. */
let failNext: string | null = null;

const fakeMayar = Bun.serve({
  port: 0,
  async fetch(request) {
    const url = new URL(request.url);

    if (
      request.method === 'POST' &&
      url.pathname === '/hl/v2/payments/create'
    ) {
      const body = (await request.json()) as Record<string, unknown>;
      if (failNext) {
        const messages = failNext;
        failNext = null;
        return Response.json({ statusCode: 400, messages }, { status: 400 });
      }
      created.push({
        authorization: request.headers.get('authorization'),
        body,
      });
      counter += 1;
      const transactionId = `tx-${runId}-${counter}`;
      transactionsByRef.set(transactionId, {
        amount: Number(body.amount),
        status: 'unpaid',
      });
      return Response.json({
        statusCode: 200,
        messages: 'success',
        data: {
          id: `pr-${runId}-${counter}`,
          transactionId,
          link: `https://amwal-its.myr.lat/pay/${transactionId}`,
          paymentDetail: paymentDetailFor(String(body.paymentMethod)),
        },
      });
    }

    const match = url.pathname.match(/^\/hl\/v2\/transactions\/(.+)$/);
    const entry = match?.[1] ? transactionsByRef.get(match[1]) : undefined;
    if (request.method === 'GET' && entry && match?.[1]) {
      return Response.json({
        statusCode: 200,
        messages: 'success',
        data: { id: match[1], amount: entry.amount, status: entry.status },
      });
    }

    return Response.json(
      { statusCode: 404, messages: 'Not Found' },
      { status: 404 }
    );
  },
});

const provider = new MayarPaymentProvider({
  apiKey: 'mayar-test-key',
  baseUrl: `http://127.0.0.1:${fakeMayar.port}/hl/v2`,
  retryDelaysMs: [],
  webhookSecret: 'webhook-secret-for-tests',
});

const publicContext = await createTestCaller({
  database,
  user: null,
  paymentProvider: provider,
});

const cleanup = {
  users: [] as string[],
  transactions: [] as string[],
  orders: {
    waqf: [] as string[],
    zakat: [] as string[],
    qurban: [] as string[],
    infaq: [] as string[],
  },
  pools: [] as string[],
  programs: [] as string[],
  nadzirProfiles: [] as string[],
  batches: [] as string[],
};

afterAll(async () => {
  fakeMayar.stop(true);
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
  for (const id of cleanup.orders.waqf) {
    await database
      .delete(schema.waqfOrders)
      .where(eq(schema.waqfOrders.id, id));
  }
  for (const id of cleanup.orders.zakat) {
    await database
      .delete(schema.zakatOrders)
      .where(eq(schema.zakatOrders.id, id));
  }
  for (const id of cleanup.orders.infaq) {
    await database
      .delete(schema.infaqOrders)
      .where(eq(schema.infaqOrders.orderId, id));
  }
  for (const id of cleanup.orders.qurban) {
    await database
      .delete(schema.qurbanAnimalSlots)
      .where(eq(schema.qurbanAnimalSlots.qurbanOrderId, id));
    await database
      .delete(schema.qurbanOrders)
      .where(eq(schema.qurbanOrders.id, id));
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

async function wakif(label: string) {
  const userId = `qm-${runId}-${label}`;
  await database.insert(schema.users).values({
    id: userId,
    name: `Donatur ${label}`,
    phone: `08${String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, '0')}`,
    updatedAt: now(),
  });
  cleanup.users.push(userId);
  return await createTestCaller({
    database,
    user: { userId, role: 'WAKIF' },
    paymentProvider: provider,
  });
}

function lastRequest(): CreateRequest {
  const request = created.at(-1);
  if (!request) {
    throw new Error('Mayar received no create request');
  }
  return request;
}

async function markPaid(transactionId: string): Promise<void> {
  const [row] = await database
    .select({ ref: schema.transactions.paymentGatewayRef })
    .from(schema.transactions)
    .where(eq(schema.transactions.id, transactionId));
  const entry = row?.ref ? transactionsByRef.get(row.ref) : undefined;
  if (!entry) {
    throw new Error('Mayar fake has no such transaction');
  }
  entry.status = 'paid';
}

/** Ringkasan permintaan; assertion-nya ada di tiap tes supaya kegagalan menunjuk modulnya. */
function sent(request: CreateRequest) {
  return {
    authorization: request.authorization,
    paymentMethod: request.body.paymentMethod,
    amount: request.body.amount,
    redirectUrl: request.body.redirectUrl,
    orderId: (request.body.extraData as { orderId?: string } | undefined)
      ?.orderId,
    hasExpiry: typeof request.body.expiredAt === 'string',
  };
}

/** Permintaan QRIS-only yang diharapkan Mayar: URL kembali absolut ke halaman status modul. */
function expectedRequest(
  method: string,
  amount: number,
  orderId: string,
  path: string
) {
  return {
    authorization: 'Bearer mayar-test-key',
    paymentMethod: method,
    amount,
    redirectUrl: `http://localhost:3000${path}?orderId=${orderId}`,
    orderId,
    hasExpiry: true,
  };
}

describe('Mayar multi-method across every donation module', () => {
  test.each(METHODS)('wakaf via %s', async (method) => {
    const tag = tagOf(method);
    const nadzirUserId = `qm-${runId}-${tag}-nadzir-user`;
    const nadzirProfileId = `qm-${runId}-${tag}-nadzir-profile`;
    const programId = `qm-${runId}-${tag}-program`;
    await database
      .insert(schema.users)
      .values({ id: nadzirUserId, name: 'Nadzir QM', updatedAt: now() });
    cleanup.users.push(nadzirUserId);
    await database.insert(schema.nadzirProfiles).values({
      id: nadzirProfileId,
      userId: nadzirUserId,
      kategori: 'ORGANISASI',
      namaLembaga: 'Badan Wakaf QM',
      updatedAt: now(),
    });
    cleanup.nadzirProfiles.push(nadzirProfileId);
    await database.insert(schema.waqfPrograms).values({
      id: programId,
      nadzirProfileId,
      judul: `Program QM ${runId} ${tag}`,
      targetDana: '100000000',
      jenisWakaf: 'PRODUKTIF_KEKAL',
      status: 'LIVE',
      updatedAt: now(),
    });
    cleanup.programs.push(programId);

    const result = await call(
      router.waqf.createOrder,
      {
        programId,
        amount: 150_000,
        paymentType: method,
        donorName: 'Wakif QM',
        donorEmail: `qm-${runId}-${tag}-wakif@example.com`,
        donorPhone: `0812345${String(Math.floor(Math.random() * 100_000)).padStart(5, '0')}`,
        isAnonymous: false,
      },
      { context: publicContext }
    );
    cleanup.orders.waqf.push(result.orderId);
    cleanup.transactions.push(result.transactionId);
    const [order] = await database
      .select({ wakifId: schema.waqfOrders.wakifId })
      .from(schema.waqfOrders)
      .where(eq(schema.waqfOrders.id, result.orderId));
    if (order?.wakifId) {
      cleanup.users.push(order.wakifId);
    }

    expect(sent(lastRequest())).toEqual(
      expectedRequest(method, 150_000, result.orderId, '/wakaf/status')
    );
    expect(result.redirectUrl).toStartWith('https://amwal-its.myr.lat/pay/');
    expect(result.payment.provider).toBe('MAYAR');
    expect(result.payment.instructions?.type).toBe(INSTRUCTION_TYPE[method]);
    expect(result.payment.paymentType).toBe(method);

    await markPaid(result.transactionId);
    const status = await call(
      router.waqf.orderStatus,
      { orderId: result.orderId },
      { context: publicContext }
    );
    expect(status.data.transaction?.statusPembayaran).toBe('LUNAS');
  });

  test.each(METHODS)('zakat via %s', async (method) => {
    const tag = tagOf(method);
    const context = await wakif(`zakat-${tag}`);
    const programId = `ZAKAT_QM_${runId}_${tag}`;
    cleanup.pools.push(programId);
    await database.insert(schema.fundPools).values({
      id: `qm-${runId}-${tag}-pool`,
      kode: programId,
      nama: programId,
      balance: '0',
      updatedAt: now(),
    });

    const result = await call(
      router.zakat.createOrder,
      { programId, amount: 85_000, paymentType: method, isAnonymous: false },
      { context }
    );
    if (typeof result.transactionId !== 'string') {
      throw new Error('expected a digital payment');
    }
    cleanup.orders.zakat.push(result.orderId);
    cleanup.transactions.push(result.transactionId);

    expect(sent(lastRequest())).toEqual(
      expectedRequest(method, 85_000, result.orderId, '/zakat/status')
    );
    expect(result.payment.provider).toBe('MAYAR');
    expect(result.payment.instructions?.type).toBe(INSTRUCTION_TYPE[method]);

    await markPaid(result.transactionId);
    const status = await call(
      router.zakat.orderStatus,
      { orderId: result.orderId },
      { context }
    );
    expect(status.data.transaction?.statusPembayaran).toBe('LUNAS');
  });

  test.each(METHODS)('infaq & sedekah via %s', async (method) => {
    const tag = tagOf(method);
    const result = await call(
      router.infaq.createOrder,
      {
        nominal: 20_000,
        jenis: 'SEDEKAH_YATIM',
        namaPenginfaq: 'Penginfaq QM',
        emailPenginfaq: `qm-${runId}-${tag}-infaq@example.com`,
        paymentType: method,
        isAnonymous: false,
      },
      { context: publicContext }
    );
    const orderId = result.data.orderId;
    cleanup.orders.infaq.push(orderId);
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

    expect(sent(lastRequest())).toEqual(
      expectedRequest(method, 20_000, orderId, '/infaq/status')
    );
    expect(result.data.payment.provider).toBe('MAYAR');
    expect(result.data.payment.instructions?.type).toBe(
      INSTRUCTION_TYPE[method]
    );

    // Channel yang benar-benar dipilih tersimpan di riwayat transaksi.
    const [stored] = await database
      .select({ paymentMethod: schema.transactions.paymentMethod })
      .from(schema.transactions)
      .where(eq(schema.transactions.id, order.transactionId));
    expect(stored?.paymentMethod).toBe(method);

    await markPaid(order.transactionId);
    const status = await call(
      router.infaq.orderStatus,
      { orderId },
      { context: publicContext }
    );
    expect(status.data.transaction?.statusPembayaran).toBe('LUNAS');
  });

  test.each(METHODS)('qurban via %s', async (method) => {
    const tag = tagOf(method);
    const context = await wakif(`qurban-${tag}`);
    const batchId = `qm-${runId}-${tag}-batch`;
    await database.insert(schema.hewanBatches).values({
      id: batchId,
      jenisHewan: 'KAMBING',
      totalSlot: 1,
      hargaPerSlot: '2500000',
      status: 'TERSEDIA',
    });
    cleanup.batches.push(batchId);
    await database.insert(schema.qurbanAnimalSlots).values({
      id: `qm-${runId}-${tag}-slot`,
      hewanBatchId: batchId,
      nomorSlot: 1,
      status: 'TERSEDIA',
    });

    const result = await call(
      router.qurban.createOrder,
      {
        hewanBatchId: batchId,
        jumlahSlotDiminta: 1,
        teleponPengqurban: `0812110${String(Math.floor(Math.random() * 100_000)).padStart(5, '0')}`,
        tipeKepemilikan: 'INDIVIDU',
        akadWakalahAccepted: true,
        paymentType: method,
        namaShohibul: ['Shohibul QM'],
      },
      { context }
    );
    cleanup.orders.qurban.push(result.orderId);
    cleanup.transactions.push(result.transactionId);

    expect(sent(lastRequest())).toEqual(
      expectedRequest(method, 2_500_000, result.orderId, '/qurban/status')
    );
    expect(result.payment.provider).toBe('MAYAR');
    expect(result.payment.instructions?.type).toBe(INSTRUCTION_TYPE[method]);

    await markPaid(result.transactionId);
    const status = await call(
      router.qurban.orderStatus,
      { orderId: result.orderId },
      { context }
    );
    expect(status.data.transaction?.statusPembayaran).toBe('LUNAS');
  });

  test.each(['virtual_account', 'bank_transfer', 'credit_card'])(
    '%s is refused by every module contract before Mayar is called',
    async (paymentType) => {
      const before = created.length;

      await expect(
        call(
          router.infaq.createOrder,
          {
            nominal: 20_000,
            jenis: 'INFAQ_UMUM',
            namaPenginfaq: 'Penginfaq QM',
            paymentType,
          } as never,
          { context: publicContext }
        )
      ).rejects.toThrow();
      await expect(
        call(
          router.waqf.createOrder,
          {
            programId: 'x',
            amount: 25_000,
            paymentType,
            donorName: 'x',
          } as never,
          { context: publicContext }
        )
      ).rejects.toThrow();

      expect(created.length).toBe(before);
    }
  );
});

describe('Mayar failures reach the donor as clear messages', () => {
  const infaqInput = (email: string | undefined) => ({
    nominal: 35_000,
    jenis: 'INFAQ_UMUM' as const,
    namaPenginfaq: 'Penginfaq Gagal',
    emailPenginfaq: email,
    paymentType: 'qris' as const,
    isAnonymous: false,
  });

  async function failureOf(email: string) {
    const error = await call(router.infaq.createOrder, infaqInput(email), {
      context: publicContext,
    }).catch((caught: unknown) => caught as ORPCError<string, unknown>);

    const orders = await database
      .select({ id: schema.infaqOrders.id })
      .from(schema.infaqOrders)
      .where(eq(schema.infaqOrders.emailPenginfaq, email));
    const [donor] = await database
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, email));
    if (donor) {
      cleanup.users.push(donor.id);
    }
    return { error: error as ORPCError<string, unknown>, orders };
  }

  test('a duplicate-request rejection becomes a 429 asking to wait a minute, and leaves no order', async () => {
    failNext =
      'Duplicate request detected. Please wait 1 minute before trying again.';

    const { error, orders } = await failureOf(`qm-${runId}-dup@example.com`);

    expect(error.status).toBe(429);
    expect(error.message).toContain('Tunggu 1 menit');
    expect(orders).toHaveLength(0);
  });

  test('a channel switched off in the Mayar dashboard becomes a 400 asking for another method', async () => {
    failNext = 'Payment method "va/bni" is not available or disabled';

    const { error, orders } = await failureOf(`qm-${runId}-off@example.com`);

    expect(error.status).toBe(400);
    expect(error.message).toContain('pilih metode lain');
    expect(orders).toHaveLength(0);
  });

  test('other Mayar failures become a 503, not a bare 500', async () => {
    failNext = 'Unauthorized';

    const { error } = await failureOf(`qm-${runId}-401@example.com`);

    expect(error.status).toBe(503);
  });

  test('a donor without an email still gets a unique placeholder (no cross-donor duplicate)', async () => {
    const results = await Promise.all(
      [1, 2].map(() =>
        call(router.infaq.createOrder, infaqInput(undefined), {
          context: publicContext,
        })
      )
    );
    const bodies = created.slice(-2);
    for (const result of results) {
      cleanup.orders.infaq.push(result.data.orderId);
    }

    const emails = bodies.map((request) => String(request.body.email));
    expect(new Set(emails).size).toBe(2);
    for (const email of emails) {
      expect(email).toMatch(/^hamba-allah\+\d{12}@amwal\.id$/);
    }
  });
});
