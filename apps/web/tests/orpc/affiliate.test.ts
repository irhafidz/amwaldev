import { describe, expect, test } from 'bun:test';
import { generateReferralCode } from '@amwal/core/affiliate/code';
import { call } from '@orpc/server';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Database } from '../../src/lib/db';
import { assertTestDatabase } from '../test-database-guard';
import { createTestCaller } from './test-utils';

/**
 * [I-4] `router.affiliate.myCode` / `.dashboard`, and end-to-end first-touch
 * attribution wiring through `infaq.createOrder` → `createPayment` →
 * `recordAttribution` (the `amwal_ref` cookie all the way to a row in
 * `affiliate_attributions`).
 */

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const schema = await import('../../src/lib/db/schema');
const { router } = await import('../../src/lib/orpc/router');

const database: Database = createDatabase(connectionUrl);
const REFERRAL_CODE_PATTERN = /^[A-Za-z0-9_-]{16}$/;

interface SeededReferrer {
  id: string;
  email: string;
}

async function seedReferrer(): Promise<SeededReferrer> {
  const runId = ulid().toLowerCase();
  const id = `p11-aff-${runId}-referrer`;
  const email = `aff-referrer-${runId}@example.com`;
  await database.insert(schema.users).values({
    id,
    email,
    name: 'Referrer Uji',
    updatedAt: new Date().toISOString(),
  });
  return { id, email };
}

async function cleanupReferrer(referrer: SeededReferrer): Promise<void> {
  await database
    .delete(schema.affiliateAttributions)
    .where(eq(schema.affiliateAttributions.referrerUserId, referrer.id));
  await database
    .delete(schema.affiliateCodes)
    .where(eq(schema.affiliateCodes.userId, referrer.id));
  await database.delete(schema.users).where(eq(schema.users.id, referrer.id));
}

interface InfaqOrderResult {
  orderId: string;
  transactionId: string;
  donorEmail: string;
}

/** Menembak `infaq.createOrder` publik dengan cookie `amwal_ref` opsional. */
async function checkoutInfaq(
  donorEmail: string,
  refCode?: string
): Promise<InfaqOrderResult> {
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
    user: null,
    headers: refCode ? { cookie: `amwal_ref=${refCode}` } : undefined,
  });

  const result = await call(
    router.infaq.createOrder,
    {
      nominal: 20_000,
      jenis: 'INFAQ_UMUM',
      namaPenginfaq: 'Donatur Uji Afiliasi',
      emailPenginfaq: donorEmail,
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

  return {
    orderId: result.data.orderId,
    transactionId: order.transactionId,
    donorEmail,
  };
}

async function cleanupInfaqOrder(order: InfaqOrderResult): Promise<void> {
  await database
    .delete(schema.affiliateAttributions)
    .where(eq(schema.affiliateAttributions.transactionId, order.transactionId));
  await database
    .delete(schema.infaqOrders)
    .where(eq(schema.infaqOrders.orderId, order.orderId));
  await database
    .delete(schema.transactions)
    .where(eq(schema.transactions.id, order.transactionId));
  const [donor] = await database
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, order.donorEmail));
  if (donor) {
    // Defensive: in the self-referral test the "donor" IS the referrer, so
    // their `affiliate_codes` row (FK restrict) must go before the user
    // does. A no-op for the ordinary fresh-guest-donor case.
    await database
      .delete(schema.affiliateCodes)
      .where(eq(schema.affiliateCodes.userId, donor.id));
    await database.delete(schema.users).where(eq(schema.users.id, donor.id));
  }
}

async function findAttribution(transactionId: string) {
  const [row] = await database
    .select()
    .from(schema.affiliateAttributions)
    .where(eq(schema.affiliateAttributions.transactionId, transactionId));
  return row ?? null;
}

describe('router.affiliate.myCode / dashboard [I-4]', () => {
  test('myCode creates a code once and is stable across calls', async () => {
    const referrer = await seedReferrer();
    try {
      const ctx = () =>
        createTestCaller({
          database,
          user: { userId: referrer.id, role: 'WAKIF' },
        });

      const first = await call(
        router.affiliate.myCode,
        {},
        { context: await ctx() }
      );
      const second = await call(
        router.affiliate.myCode,
        {},
        { context: await ctx() }
      );

      expect(first.data.code).toMatch(REFERRAL_CODE_PATTERN);
      expect(second.data.code).toBe(first.data.code);

      const rows = await database
        .select()
        .from(schema.affiliateCodes)
        .where(eq(schema.affiliateCodes.userId, referrer.id));
      expect(rows).toHaveLength(1);
    } finally {
      await cleanupReferrer(referrer);
    }
  });

  test('dashboard reports zero clicks/attributions for a fresh referrer', async () => {
    const referrer = await seedReferrer();
    try {
      const context = await createTestCaller({
        database,
        user: { userId: referrer.id, role: 'WAKIF' },
      });

      const dashboard = await call(router.affiliate.dashboard, {}, { context });

      expect(dashboard.data).toEqual({
        code: dashboard.data.code,
        totalClicks: 0,
        totalAttributedDonations: 0,
      });
      expect(dashboard.data.code).toMatch(REFERRAL_CODE_PATTERN);
    } finally {
      await cleanupReferrer(referrer);
    }
  });

  test('unauthenticated caller gets UNAUTHORIZED', async () => {
    const context = await createTestCaller({ database, user: null });
    await expect(
      call(router.affiliate.myCode, {}, { context })
    ).rejects.toThrow();
  });
});

describe('first-touch attribution via createPayment [I-4]', () => {
  test('a valid ref cookie records one attribution row and shows in dashboard', async () => {
    const referrer = await seedReferrer();
    const myCodeCtx = await createTestCaller({
      database,
      user: { userId: referrer.id, role: 'WAKIF' },
    });
    const { data: myCode } = await call(
      router.affiliate.myCode,
      {},
      { context: myCodeCtx }
    );

    const runId = ulid().toLowerCase();
    const order = await checkoutInfaq(
      `aff-donor-${runId}@example.com`,
      myCode.code
    );

    try {
      const attribution = await findAttribution(order.transactionId);
      expect(attribution?.referrerUserId).toBe(referrer.id);
      expect(attribution?.referralCode).toBe(myCode.code);

      const dashboardCtx = await createTestCaller({
        database,
        user: { userId: referrer.id, role: 'WAKIF' },
      });
      const dashboard = await call(
        router.affiliate.dashboard,
        {},
        { context: dashboardCtx }
      );
      expect(dashboard.data.totalAttributedDonations).toBe(1);
    } finally {
      await cleanupInfaqOrder(order);
      await cleanupReferrer(referrer);
    }
  });

  test('no cookie means no attribution, and checkout still succeeds', async () => {
    const runId = ulid().toLowerCase();
    const order = await checkoutInfaq(`aff-donor-${runId}@example.com`);

    try {
      expect(order.orderId).toBeTruthy();
      expect(await findAttribution(order.transactionId)).toBeNull();
    } finally {
      await cleanupInfaqOrder(order);
    }
  });

  test('an unknown ref code is fail-open: checkout succeeds, nothing recorded', async () => {
    const runId = ulid().toLowerCase();
    const unknownCode = generateReferralCode();
    const order = await checkoutInfaq(
      `aff-donor-${runId}@example.com`,
      unknownCode
    );

    try {
      expect(order.orderId).toBeTruthy();
      expect(await findAttribution(order.transactionId)).toBeNull();
    } finally {
      await cleanupInfaqOrder(order);
    }
  });

  test('self-referral is fail-open: checkout succeeds, nothing recorded', async () => {
    const referrer = await seedReferrer();
    const myCodeCtx = await createTestCaller({
      database,
      user: { userId: referrer.id, role: 'WAKIF' },
    });
    const { data: myCode } = await call(
      router.affiliate.myCode,
      {},
      { context: myCodeCtx }
    );

    // Donor email matches the referrer's own — resolveGuestDonor() resolves
    // the SAME user id, so referrerUserId === donorUserId.
    const order = await checkoutInfaq(referrer.email, myCode.code);

    try {
      expect(order.orderId).toBeTruthy();
      expect(await findAttribution(order.transactionId)).toBeNull();
    } finally {
      await cleanupInfaqOrder(order);
      await cleanupReferrer(referrer);
    }
  });
});
