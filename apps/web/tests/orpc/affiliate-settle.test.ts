import { describe, expect, test } from 'bun:test';
import { getBalance } from '@amwal/core/gamification/ledger';
import { call } from '@orpc/server';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulidx';
import { settleAffiliateReward } from '../../src/lib/affiliate/settle-hook';
import type { Database } from '../../src/lib/db';
import { assertTestDatabase } from '../test-database-guard';
import { createTestCaller } from './test-utils';

/**
 * [I-4] Affiliate settlement hook integration tests.
 * Validates that settling an attributed donation awards Berkah points
 * idempotently and non-blockingly according to the anti-abuse rules.
 */

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const schema = await import('../../src/lib/db/schema');
const { router } = await import('../../src/lib/orpc/router');

const database: Database = createDatabase(connectionUrl);

interface SeededUser {
  id: string;
  email: string;
  phone: string;
}

async function seedUser(prefix: string): Promise<SeededUser> {
  const runId = ulid().toLowerCase();
  const id = `p11-aff-settle-${prefix}-${runId}`;
  const email = `aff-${prefix}-${runId}@example.com`;
  const phone = `0812${Math.floor(10_000_000 + Math.random() * 90_000_000)}`;
  await database.insert(schema.users).values({
    id,
    email,
    phone,
    name: `User ${prefix} Uji`,
    updatedAt: new Date().toISOString(),
  });
  return { id, email, phone };
}

async function cleanupUser(userId: string): Promise<void> {
  await database
    .delete(schema.notifications)
    .where(eq(schema.notifications.userId, userId));
  await database
    .delete(schema.gamificationPointLedgers)
    .where(eq(schema.gamificationPointLedgers.userId, userId));
  await database
    .delete(schema.affiliateAttributions)
    .where(eq(schema.affiliateAttributions.referrerUserId, userId));
  await database
    .delete(schema.affiliateCodes)
    .where(eq(schema.affiliateCodes.userId, userId));
  await database.delete(schema.users).where(eq(schema.users.id, userId));
}

interface SeededInfaqOrder {
  orderId: string;
  transactionId: string;
  donorId: string;
}

async function checkoutAndSettleInfaq(
  donor: SeededUser,
  nominal: number,
  refCode?: string
): Promise<SeededInfaqOrder> {
  const { sha256Body } = await import('@amwal/core/akad');
  const [activeAkad] = await database
    .select()
    .from(schema.akadTemplates)
    .where(eq(schema.akadTemplates.module, 'INFAQ'));

  const akadAcceptance = activeAkad?.isActive
    ? {
        templateId: activeAkad.id,
        version: activeAkad.version,
        bodySha256: await sha256Body(activeAkad.body),
      }
    : undefined;

  const context = await createTestCaller({
    database,
    user: { userId: donor.id, role: 'WAKIF' },
    headers: refCode ? { cookie: `amwal_ref=${refCode}` } : undefined,
  });

  const result = await call(
    router.infaq.createOrder,
    {
      nominal,
      jenis: 'INFAQ_UMUM',
      namaPenginfaq: 'Donatur Uji Settle',
      emailPenginfaq: donor.email,
      doa: '',
      akadAcceptance,
    },
    { context }
  );

  const [order] = await database
    .select({ transactionId: schema.infaqOrders.transactionId })
    .from(schema.infaqOrders)
    .where(eq(schema.infaqOrders.orderId, result.data.orderId));

  if (!order?.transactionId) {
    throw new Error('Seed gagal: infaq order tanpa transactionId');
  }

  // Set transaction as LUNAS for settlement
  await database
    .update(schema.transactions)
    .set({ statusPembayaran: 'LUNAS' })
    .where(eq(schema.transactions.id, order.transactionId));

  return {
    orderId: result.data.orderId,
    transactionId: order.transactionId,
    donorId: donor.id,
  };
}

async function cleanupInfaqOrder(order: SeededInfaqOrder): Promise<void> {
  await database
    .delete(schema.gamificationPointLedgers)
    .where(
      eq(
        schema.gamificationPointLedgers.idempotencyKey,
        `affiliate:${order.transactionId}`
      )
    );
  await database
    .delete(schema.affiliateAttributions)
    .where(eq(schema.affiliateAttributions.transactionId, order.transactionId));
  await database
    .delete(schema.infaqOrders)
    .where(eq(schema.infaqOrders.orderId, order.orderId));
  await database
    .delete(schema.transactions)
    .where(eq(schema.transactions.id, order.transactionId));
}

describe('settleAffiliateReward [I-4]', () => {
  test('a LUNAS attributed infaq donation awards points to referrer and is idempotent', async () => {
    const referrer = await seedUser('referrer');
    const donor = await seedUser('donor');

    const myCodeCtx = await createTestCaller({
      database,
      user: { userId: referrer.id, role: 'WAKIF' },
    });
    const { data: myCode } = await call(
      router.affiliate.myCode,
      {},
      { context: myCodeCtx }
    );

    // Rp 50.000 donation: points = min(100 + floor(50000/10000), 500) = 105 points
    const order = await checkoutAndSettleInfaq(donor, 50_000, myCode.code);

    try {
      const firstResult = await settleAffiliateReward(
        database,
        'INFAQ',
        order.orderId
      );

      expect(firstResult).toEqual({
        transactionId: order.transactionId,
        referrerUserId: referrer.id,
        donorUserId: donor.id,
        points: 105,
        awarded: true,
      });

      const referrerBalance = await getBalance(database, referrer.id);
      expect(referrerBalance).toBe(105);

      // Verify the ledger entry
      const [ledgerRow] = await database
        .select()
        .from(schema.gamificationPointLedgers)
        .where(
          eq(
            schema.gamificationPointLedgers.idempotencyKey,
            `affiliate:${order.transactionId}`
          )
        );
      expect(ledgerRow).toBeDefined();
      expect(ledgerRow?.userId).toBe(referrer.id);
      expect(ledgerRow?.activityType).toBe('AFFILIATE');
      expect(ledgerRow?.pointsEarned).toBe(105);
      expect(ledgerRow?.sourceRef).toBe(order.transactionId);

      // Idempotency: replay settlement hook
      const secondResult = await settleAffiliateReward(
        database,
        'INFAQ',
        order.orderId
      );
      expect(secondResult?.awarded).toBe(false);

      const balanceAfterReplay = await getBalance(database, referrer.id);
      expect(balanceAfterReplay).toBe(105);
    } finally {
      await cleanupInfaqOrder(order);
      await cleanupUser(donor.id);
      await cleanupUser(referrer.id);
    }
  });

  test('order with no referral attribution returns null without awarding points', async () => {
    const donor = await seedUser('donor-no-ref');
    const order = await checkoutAndSettleInfaq(donor, 50_000);

    try {
      const result = await settleAffiliateReward(
        database,
        'INFAQ',
        order.orderId
      );
      expect(result).toBeNull();
    } finally {
      await cleanupInfaqOrder(order);
      await cleanupUser(donor.id);
    }
  });

  test('non-LUNAS transaction is skipped and pays nothing', async () => {
    const referrer = await seedUser('ref-pending');
    const donor = await seedUser('donor-pending');

    const myCodeCtx = await createTestCaller({
      database,
      user: { userId: referrer.id, role: 'WAKIF' },
    });
    const { data: myCode } = await call(
      router.affiliate.myCode,
      {},
      { context: myCodeCtx }
    );

    const order = await checkoutAndSettleInfaq(donor, 50_000, myCode.code);
    // Set status back to PENDING
    await database
      .update(schema.transactions)
      .set({ statusPembayaran: 'PENDING' })
      .where(eq(schema.transactions.id, order.transactionId));

    try {
      const result = await settleAffiliateReward(
        database,
        'INFAQ',
        order.orderId
      );
      expect(result).toBeNull();
      expect(await getBalance(database, referrer.id)).toBe(0);
    } finally {
      await cleanupInfaqOrder(order);
      await cleanupUser(donor.id);
      await cleanupUser(referrer.id);
    }
  });

  test('self-referral is rejected by anti-abuse rules', async () => {
    const referrer = await seedUser('self-ref');
    const myCodeCtx = await createTestCaller({
      database,
      user: { userId: referrer.id, role: 'WAKIF' },
    });
    const { data: myCode } = await call(
      router.affiliate.myCode,
      {},
      { context: myCodeCtx }
    );

    // Self-referral checkout
    const order = await checkoutAndSettleInfaq(referrer, 50_000, myCode.code);

    try {
      const result = await settleAffiliateReward(
        database,
        'INFAQ',
        order.orderId
      );
      // Since recordAttribution rejected self-referral at checkout, attribution row was not created
      expect(result).toBeNull();
      expect(await getBalance(database, referrer.id)).toBe(0);
    } finally {
      await cleanupInfaqOrder(order);
      await cleanupUser(referrer.id);
    }
  });

  test('matching email or phone between referrer and donor is rejected', async () => {
    const referrer = await seedUser('same-contact-ref');
    const donor = await seedUser('same-contact-donor');

    const myCodeCtx = await createTestCaller({
      database,
      user: { userId: referrer.id, role: 'WAKIF' },
    });
    const { data: myCode } = await call(
      router.affiliate.myCode,
      {},
      { context: myCodeCtx }
    );

    // Create order where donor phone in order matches referrer phone
    const context = await createTestCaller({
      database,
      user: { userId: donor.id, role: 'WAKIF' },
      headers: { cookie: `amwal_ref=${myCode.code}` },
    });

    const result = await call(
      router.infaq.createOrder,
      {
        nominal: 50_000,
        jenis: 'INFAQ_UMUM',
        namaPenginfaq: 'Donatur Phone Sama',
        emailPenginfaq: donor.email,
        teleponPenginfaq: referrer.phone, // matches referrer phone!
        doa: '',
      },
      { context }
    );

    const [orderRow] = await database
      .select({ transactionId: schema.infaqOrders.transactionId })
      .from(schema.infaqOrders)
      .where(eq(schema.infaqOrders.orderId, result.data.orderId));

    if (!orderRow?.transactionId) {
      throw new Error('Missing transactionId on created infaq order');
    }

    await database
      .update(schema.transactions)
      .set({ statusPembayaran: 'LUNAS' })
      .where(eq(schema.transactions.id, orderRow.transactionId));

    const order: SeededInfaqOrder = {
      orderId: result.data.orderId,
      transactionId: orderRow.transactionId,
      donorId: donor.id,
    };

    try {
      const settleResult = await settleAffiliateReward(
        database,
        'INFAQ',
        order.orderId
      );
      expect(settleResult?.awarded).toBe(false);
      expect(settleResult?.reason).toBe('same-phone');
      expect(await getBalance(database, referrer.id)).toBe(0);
    } finally {
      await cleanupInfaqOrder(order);
      await cleanupUser(donor.id);
      await cleanupUser(referrer.id);
    }
  });

  test('below-minimum donation (< Rp 10.000) is rejected', async () => {
    const referrer = await seedUser('below-min-ref');
    const donor = await seedUser('below-min-donor');

    const myCodeCtx = await createTestCaller({
      database,
      user: { userId: referrer.id, role: 'WAKIF' },
    });
    const { data: myCode } = await call(
      router.affiliate.myCode,
      {},
      { context: myCodeCtx }
    );

    // We create an order directly with attribution and transaction below 10.000
    const order = await checkoutAndSettleInfaq(donor, 20_000, myCode.code);
    // Set transaction amount to 5000
    await database
      .update(schema.transactions)
      .set({ amount: '5000' })
      .where(eq(schema.transactions.id, order.transactionId));

    try {
      const result = await settleAffiliateReward(
        database,
        'INFAQ',
        order.orderId
      );
      expect(result?.awarded).toBe(false);
      expect(result?.reason).toBe('below-minimum');
      expect(await getBalance(database, referrer.id)).toBe(0);
    } finally {
      await cleanupInfaqOrder(order);
      await cleanupUser(donor.id);
      await cleanupUser(referrer.id);
    }
  });

  test('pair cooldown limits rewards to 1 per referrer-donor pair per 24 hours', async () => {
    const referrer = await seedUser('pair-cooldown-ref');
    const donor = await seedUser('pair-cooldown-donor');

    const myCodeCtx = await createTestCaller({
      database,
      user: { userId: referrer.id, role: 'WAKIF' },
    });
    const { data: myCode } = await call(
      router.affiliate.myCode,
      {},
      { context: myCodeCtx }
    );

    const order1 = await checkoutAndSettleInfaq(donor, 50_000, myCode.code);
    const order2 = await checkoutAndSettleInfaq(donor, 50_000, myCode.code);

    try {
      const result1 = await settleAffiliateReward(
        database,
        'INFAQ',
        order1.orderId
      );
      expect(result1?.awarded).toBe(true);

      const result2 = await settleAffiliateReward(
        database,
        'INFAQ',
        order2.orderId
      );
      expect(result2?.awarded).toBe(false);
      expect(result2?.reason).toBe('pair-cooldown');

      // Balance only received the first reward
      expect(await getBalance(database, referrer.id)).toBe(105);
    } finally {
      await cleanupInfaqOrder(order1);
      await cleanupInfaqOrder(order2);
      await cleanupUser(donor.id);
      await cleanupUser(referrer.id);
    }
  });

  test('daily cap limits rewards to 10 per referrer per WIB day', async () => {
    const referrer = await seedUser('daily-cap-ref');
    const donors: SeededUser[] = [];
    const orders: SeededInfaqOrder[] = [];

    const myCodeCtx = await createTestCaller({
      database,
      user: { userId: referrer.id, role: 'WAKIF' },
    });
    const { data: myCode } = await call(
      router.affiliate.myCode,
      {},
      { context: myCodeCtx }
    );

    try {
      // Create 11 distinct donors and orders
      for (let i = 0; i < 11; i++) {
        const d = await seedUser(`daily-donor-${i}`);
        donors.push(d);
        const o = await checkoutAndSettleInfaq(d, 50_000, myCode.code);
        orders.push(o);
      }

      // First 10 should be awarded
      for (let i = 0; i < 10; i++) {
        const res = await settleAffiliateReward(
          database,
          'INFAQ',
          orders[i].orderId
        );
        expect(res?.awarded).toBe(true);
      }

      // 11th should be rejected due to daily cap
      const eleventh = await settleAffiliateReward(
        database,
        'INFAQ',
        orders[10].orderId
      );
      expect(eleventh?.awarded).toBe(false);
      expect(eleventh?.reason).toBe('daily-limit-exceeded');

      // 10 * 105 = 1050
      expect(await getBalance(database, referrer.id)).toBe(1050);
    } finally {
      for (const order of orders) {
        await cleanupInfaqOrder(order);
      }
      for (const donor of donors) {
        await cleanupUser(donor.id);
      }
      await cleanupUser(referrer.id);
    }
  });

  test('anonymous Waqf donation is rejected by anti-abuse rules', async () => {
    const referrer = await seedUser('anon-waqf-ref');
    const donor = await seedUser('anon-waqf-donor');
    const nadzir = await seedUser('anon-waqf-nadzir');

    const myCodeCtx = await createTestCaller({
      database,
      user: { userId: referrer.id, role: 'WAKIF' },
    });
    const { data: myCode } = await call(
      router.affiliate.myCode,
      {},
      { context: myCodeCtx }
    );

    const nadzirProfileId = `NP-ANON-${ulid()}`;
    await database.insert(schema.nadzirProfiles).values({
      id: nadzirProfileId,
      userId: nadzir.id,
      kategori: 'PERSEORANGAN',
      namaLembaga: 'Nadzir Uji',
      statusVerifikasi: 'VERIFIED',
      updatedAt: new Date().toISOString(),
    });

    const programId = `PROG-ANON-${ulid()}`;
    await database.insert(schema.waqfPrograms).values({
      id: programId,
      nadzirProfileId,
      judul: 'Program Wakaf Uji',
      targetDana: '10000000',
      jenisWakaf: 'HABIS_PAKAI',
      status: 'LIVE',
      verificationStatus: 'VERIFIED',
      updatedAt: new Date().toISOString(),
    });

    const { sha256Body } = await import('@amwal/core/akad');
    const [activeAkad] = await database
      .select()
      .from(schema.akadTemplates)
      .where(eq(schema.akadTemplates.module, 'WAKAF'));

    const akadAcceptance = activeAkad?.isActive
      ? {
          templateId: activeAkad.id,
          version: activeAkad.version,
          bodySha256: await sha256Body(activeAkad.body),
        }
      : undefined;

    const context = await createTestCaller({
      database,
      user: { userId: donor.id, role: 'WAKIF' },
      headers: { cookie: `amwal_ref=${myCode.code}` },
    });

    const result = await call(
      router.waqf.createOrder,
      {
        programId,
        amount: 50_000,
        paymentType: 'qris',
        donorName: 'Hamba Allah',
        donorEmail: donor.email,
        donorPhone: donor.phone,
        isAnonymous: true,
        akadAcceptance,
      },
      { context }
    );

    const [orderRow] = await database
      .select({ transactionId: schema.waqfOrders.transactionId })
      .from(schema.waqfOrders)
      .where(eq(schema.waqfOrders.id, result.orderId));

    if (!orderRow?.transactionId) {
      throw new Error('Missing transactionId on created waqf order');
    }
    const txId = orderRow.transactionId;

    await database
      .update(schema.transactions)
      .set({ statusPembayaran: 'LUNAS' })
      .where(eq(schema.transactions.id, txId));

    try {
      const settleResult = await settleAffiliateReward(
        database,
        'WAQF',
        result.orderId
      );
      expect(settleResult?.awarded).toBe(false);
      expect(settleResult?.reason).toBe('anonymous-donor');
      expect(await getBalance(database, referrer.id)).toBe(0);
    } finally {
      await database
        .delete(schema.affiliateAttributions)
        .where(eq(schema.affiliateAttributions.transactionId, txId));
      await database
        .delete(schema.waqfOrders)
        .where(eq(schema.waqfOrders.id, result.orderId));
      await database
        .delete(schema.transactions)
        .where(eq(schema.transactions.id, txId));
      await database
        .delete(schema.waqfPrograms)
        .where(eq(schema.waqfPrograms.id, programId));
      await database
        .delete(schema.nadzirProfiles)
        .where(eq(schema.nadzirProfiles.id, nadzirProfileId));
      await cleanupUser(donor.id);
      await cleanupUser(nadzir.id);
      await cleanupUser(referrer.id);
    }
  });

  test('fiqh-excluded module (Zakat) is rejected', async () => {
    const referrer = await seedUser('zakat-ref');
    const donor = await seedUser('zakat-donor');

    const myCodeCtx = await createTestCaller({
      database,
      user: { userId: referrer.id, role: 'WAKIF' },
    });
    const { data: myCode } = await call(
      router.affiliate.myCode,
      {},
      { context: myCodeCtx }
    );

    const context = await createTestCaller({
      database,
      user: { userId: donor.id, role: 'WAKIF' },
      headers: { cookie: `amwal_ref=${myCode.code}` },
    });

    const result = await call(
      router.zakat.createOrder,
      {
        programId: `ZAKAT_DEST_${ulid()}`,
        amount: 50_000,
        paymentType: 'qris',
        isAnonymous: false,
      },
      { context }
    );

    const [orderRow] = await database
      .select({ transactionId: schema.zakatOrders.transactionId })
      .from(schema.zakatOrders)
      .where(eq(schema.zakatOrders.id, result.orderId));

    if (!orderRow?.transactionId) {
      throw new Error('Missing transactionId on created zakat order');
    }
    const txId = orderRow.transactionId;

    await database
      .update(schema.transactions)
      .set({ statusPembayaran: 'LUNAS' })
      .where(eq(schema.transactions.id, txId));

    try {
      const settleResult = await settleAffiliateReward(
        database,
        'ZAKAT',
        result.orderId
      );
      expect(settleResult?.awarded).toBe(false);
      expect(settleResult?.reason).toBe('fiqh-excluded-module');
      expect(await getBalance(database, referrer.id)).toBe(0);
    } finally {
      await database
        .delete(schema.affiliateAttributions)
        .where(eq(schema.affiliateAttributions.transactionId, txId));
      await database
        .delete(schema.zakatOrders)
        .where(eq(schema.zakatOrders.id, result.orderId));
      await database
        .delete(schema.transactions)
        .where(eq(schema.transactions.id, txId));
      await cleanupUser(donor.id);
      await cleanupUser(referrer.id);
    }
  });

  test('webhook onSettled awards points end-to-end to both donor and referrer', async () => {
    const { handle } = await import('../../src/routes/api/webhooks/payment');
    const { createMidtransSignatureKey } = await import(
      '@amwal/core/payment/signature'
    );
    const serverKey =
      process.env.PAYMENT_SERVER_KEY ?? 'mock-server-key-not-a-real-secret';

    const referrer = await seedUser('webhook-ref');
    const donor = await seedUser('webhook-donor');

    const myCodeCtx = await createTestCaller({
      database,
      user: { userId: referrer.id, role: 'WAKIF' },
    });
    const { data: myCode } = await call(
      router.affiliate.myCode,
      {},
      { context: myCodeCtx }
    );

    const context = await createTestCaller({
      database,
      user: { userId: donor.id, role: 'WAKIF' },
      headers: { cookie: `amwal_ref=${myCode.code}` },
    });

    const orderRes = await call(
      router.infaq.createOrder,
      {
        nominal: 100_000,
        jenis: 'INFAQ_UMUM',
        namaPenginfaq: 'Donatur Webhook',
        emailPenginfaq: donor.email,
        doa: '',
      },
      { context }
    );

    const [orderRow] = await database
      .select({ transactionId: schema.infaqOrders.transactionId })
      .from(schema.infaqOrders)
      .where(eq(schema.infaqOrders.orderId, orderRes.data.orderId));

    if (!orderRow?.transactionId) {
      throw new Error('Missing transactionId on created infaq order');
    }

    const payload = {
      order_id: orderRes.data.orderId,
      status_code: '200',
      gross_amount: '100000.00' as `${number}`,
      transaction_status: 'settlement',
      payment_type: 'qris',
      fraud_status: 'accept',
    };
    const signature = createMidtransSignatureKey(payload, serverKey);

    const request = new Request('http://localhost/api/webhooks/payment', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...payload, signature_key: signature }),
    });

    const response = await handle({ request });
    expect(response.status).toBe(200);

    const order: SeededInfaqOrder = {
      orderId: orderRes.data.orderId,
      transactionId: orderRow.transactionId,
      donorId: donor.id,
    };

    try {
      // 1. Donor receives D2 gamification points (+200 base + 100 amount = 300)
      const donorBalance = await getBalance(database, donor.id);
      expect(donorBalance).toBe(300);

      // 2. Referrer receives affiliate reward points (100 + 10 = 110)
      const referrerBalance = await getBalance(database, referrer.id);
      expect(referrerBalance).toBe(110);

      // 3. Replay webhook -> idempotent, balances don't change
      const replayRequest = new Request(
        'http://localhost/api/webhooks/payment',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...payload, signature_key: signature }),
        }
      );
      const replayResponse = await handle({ request: replayRequest });
      expect(replayResponse.status).toBe(200);

      expect(await getBalance(database, donor.id)).toBe(300);
      expect(await getBalance(database, referrer.id)).toBe(110);
    } finally {
      await cleanupInfaqOrder(order);
      await cleanupUser(donor.id);
      await cleanupUser(referrer.id);
    }
  });
});
