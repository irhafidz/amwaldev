import { describe, expect, test } from 'bun:test';
import { call } from '@orpc/server';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Database } from '../../src/lib/db';
import { assertTestDatabase } from '../test-database-guard';
import { createTestCaller } from './test-utils';

/**
 * Putaran 17, Batch 3 — the oRPC-side twin of
 * `apps/server/tests/waqf/waqf-order.test.ts`. Same anonymous-checkout and
 * mock-payment-loop cases, proven through `router.waqf.*` via `call()`
 * instead of `app.request()`. Uses `createTestCaller` (Batch 5) for
 * context setup.
 */

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const schema = await import('../../src/lib/db/schema');
const { router } = await import('../../src/lib/orpc/router');
const { handlePaymentWebhook } = await import('@amwal/core/payment/webhook');
const { MockPaymentProvider } = await import(
  '@amwal/core/payment/mock.provider'
);
const { createMidtransSignatureKey } = await import(
  '@amwal/core/payment/signature'
);

const database: Database = createDatabase(connectionUrl);
const serverKey = 'SB-Mid-server-P17-B3-waqf-key-123456';
const mockProvider = new MockPaymentProvider(serverKey);
const now = () => new Date().toISOString();
// waqf procedures are all public — one shared context covers every call.
const context = await createTestCaller({
  database,
  user: null,
  paymentProvider: mockProvider,
});

async function createProgramFixture(): Promise<{
  nadzirUserId: string;
  nadzirProfileId: string;
  programId: string;
}> {
  const runId = ulid().toLowerCase();
  const nadzirUserId = `p17b3-${runId}-nadzir-user`;
  const nadzirProfileId = `p17b3-${runId}-nadzir-profile`;
  const programId = `p17b3-${runId}-program`;

  await database.insert(schema.users).values({
    id: nadzirUserId,
    name: 'Nadzir P17-B3',
    updatedAt: now(),
  });
  await database.insert(schema.nadzirProfiles).values({
    id: nadzirProfileId,
    userId: nadzirUserId,
    kategori: 'ORGANISASI',
    namaLembaga: 'Badan Wakaf Uji P17-B3',
    updatedAt: now(),
  });
  await database.insert(schema.waqfPrograms).values({
    id: programId,
    nadzirProfileId,
    judul: `Program Uji ${runId}`,
    targetDana: '100000000',
    jenisWakaf: 'PRODUKTIF_KEKAL',
    status: 'LIVE',
    updatedAt: now(),
  });

  return { nadzirUserId, nadzirProfileId, programId };
}

async function deleteProgramFixture(fixture: {
  nadzirUserId: string;
  nadzirProfileId: string;
  programId: string;
  orderId?: string;
  transactionId?: string;
  guestUserId?: string;
}) {
  if (fixture.orderId) {
    await database
      .delete(schema.waqfOrders)
      .where(eq(schema.waqfOrders.id, fixture.orderId));
  }
  await database
    .delete(schema.waqfPrincipalLedgers)
    .where(eq(schema.waqfPrincipalLedgers.waqfProgramId, fixture.programId));
  if (fixture.transactionId) {
    await database
      .delete(schema.transactions)
      .where(eq(schema.transactions.id, fixture.transactionId));
  }
  await database
    .delete(schema.waqfPrograms)
    .where(eq(schema.waqfPrograms.id, fixture.programId));
  await database
    .delete(schema.nadzirProfiles)
    .where(eq(schema.nadzirProfiles.id, fixture.nadzirProfileId));
  await database
    .delete(schema.notifications)
    .where(eq(schema.notifications.userId, fixture.nadzirUserId));
  await database
    .delete(schema.users)
    .where(eq(schema.users.id, fixture.nadzirUserId));
  if (fixture.guestUserId) {
    await database
      .delete(schema.notifications)
      .where(eq(schema.notifications.userId, fixture.guestUserId));
    await database
      .delete(schema.users)
      .where(eq(schema.users.id, fixture.guestUserId));
  }
}

function settlementRequest(orderId: string, amount: `${number}`): Request {
  const payload = {
    order_id: orderId,
    status_code: '200',
    gross_amount: amount,
    transaction_status: 'settlement',
    payment_type: 'qris',
    fraud_status: 'accept',
  };
  const signature = createMidtransSignatureKey(payload, serverKey);

  return new Request('http://localhost/api/webhooks/payment', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...payload, signature_key: signature }),
  });
}

describe('oRPC waqf: anonymous checkout and mock payment loop', () => {
  test('anonymous order keeps real identity internally and masks it publicly', async () => {
    const fixture = await createProgramFixture();
    const donorEmail = `guest-${ulid().toLowerCase()}@example.com`;
    const donorPhone = `08${String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, '0')}`;

    try {
      const result = await call(
        router.waqf.createOrder,
        {
          programId: fixture.programId,
          amount: 100_000,
          paymentType: 'qris',
          donorName: 'Real Name Test',
          donorEmail,
          donorPhone,
          isAnonymous: true,
        },
        { context }
      );

      const [order] = await database
        .select()
        .from(schema.waqfOrders)
        .where(eq(schema.waqfOrders.id, result.orderId));
      expect(order?.namaWakif).toBe('Real Name Test');
      expect(order?.noTelepon).toBe(donorPhone);
      expect(order?.isAnonymous).toBe(true);

      const [donorUser] = await database
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.email, donorEmail));
      expect(donorUser?.id === order?.wakifId).toBe(true);

      const donorList = await call(
        router.waqf.donatur,
        { id: fixture.programId },
        { context }
      );
      expect(
        donorList.data.find((donor) => donor.donorName === 'Hamba Allah')
      ).toBeDefined();
      expect(
        donorList.data.find((donor) => donor.donorName === 'Real Name Test')
      ).toBeUndefined();

      await deleteProgramFixture({
        ...fixture,
        orderId: result.orderId,
        transactionId: result.transactionId,
        guestUserId: order?.wakifId ?? undefined,
      });
    } finally {
      await database
        .delete(schema.users)
        .where(eq(schema.users.email, donorEmail));
      await database
        .delete(schema.waqfPrograms)
        .where(eq(schema.waqfPrograms.id, fixture.programId));
      await database
        .delete(schema.nadzirProfiles)
        .where(eq(schema.nadzirProfiles.id, fixture.nadzirProfileId));
      await database
        .delete(schema.users)
        .where(eq(schema.users.id, fixture.nadzirUserId));
    }
  });

  test('mock payment loop increments WaqfPrincipalLedger exactly once', async () => {
    const fixture = await createProgramFixture();

    try {
      const created = await call(
        router.waqf.createOrder,
        {
          programId: fixture.programId,
          amount: 250_000,
          paymentType: 'qris',
          donorName: 'Batch 3 Donor',
          donorEmail: `batch3-${ulid().toLowerCase()}@example.com`,
          // Random, not hardcoded — apps/server/tests/waqf/waqf-order.test.ts
          // uses the exact same literal; resolveGuestDonor() falls back to a
          // phone lookup, so a simultaneous dual-run of both suites could
          // otherwise silently reuse (and this test's cleanup then delete)
          // the other suite's in-flight guest user row.
          donorPhone: `08${String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, '0')}`,
          isAnonymous: false,
        },
        { context }
      );
      expect(created.redirectUrl).toContain('/riwayat');

      const webhookResponse = await handlePaymentWebhook(
        settlementRequest(created.orderId, '250000.00'),
        { database, paymentProvider: mockProvider }
      );
      expect(webhookResponse.status).toBe(200);

      const [ledger] = await database
        .select({
          pokokDanaTerkumpul: schema.waqfPrincipalLedgers.pokokDanaTerkumpul,
        })
        .from(schema.waqfPrincipalLedgers)
        .where(
          eq(schema.waqfPrincipalLedgers.waqfProgramId, fixture.programId)
        );
      expect(Number(ledger?.pokokDanaTerkumpul ?? 0)).toBe(250_000);

      const [transaction] = await database
        .select({ status: schema.transactions.statusPembayaran })
        .from(schema.transactions)
        .where(eq(schema.transactions.id, created.transactionId));
      expect(transaction?.status).toBe('LUNAS');

      const orderStatus = await call(
        router.waqf.orderStatus,
        { orderId: created.orderId },
        { context }
      );
      expect(orderStatus.data.order.status).toBe('TERVERIFIKASI');

      const [orderRow] = await database
        .select({ wakifId: schema.waqfOrders.wakifId })
        .from(schema.waqfOrders)
        .where(eq(schema.waqfOrders.id, created.orderId));

      await deleteProgramFixture({
        ...fixture,
        orderId: created.orderId,
        transactionId: created.transactionId,
        guestUserId: orderRow?.wakifId ?? undefined,
      });
    } finally {
      await database
        .delete(schema.waqfPrincipalLedgers)
        .where(
          eq(schema.waqfPrincipalLedgers.waqfProgramId, fixture.programId)
        );
      await database
        .delete(schema.waqfPrograms)
        .where(eq(schema.waqfPrograms.id, fixture.programId));
      await database
        .delete(schema.nadzirProfiles)
        .where(eq(schema.nadzirProfiles.id, fixture.nadzirProfileId));
      await database
        .delete(schema.users)
        .where(eq(schema.users.id, fixture.nadzirUserId));
    }
  });

  test('list returns LIVE programs enriched with ledger and nadzir profile', async () => {
    const fixture = await createProgramFixture();

    try {
      const result = await call(
        router.waqf.list,
        { active: true },
        { context }
      );
      const found = result.data.find((row) => row.id === fixture.programId);
      expect(found).toBeDefined();
      expect(found?.nadzirProfile?.namaLembaga).toBe('Badan Wakaf Uji P17-B3');

      const detail = await call(
        router.waqf.detail,
        { id: fixture.programId },
        { context }
      );
      expect(detail.data?.id).toBe(fixture.programId);
    } finally {
      await database
        .delete(schema.waqfPrograms)
        .where(eq(schema.waqfPrograms.id, fixture.programId));
      await database
        .delete(schema.nadzirProfiles)
        .where(eq(schema.nadzirProfiles.id, fixture.nadzirProfileId));
      await database
        .delete(schema.users)
        .where(eq(schema.users.id, fixture.nadzirUserId));
    }
  });
});
