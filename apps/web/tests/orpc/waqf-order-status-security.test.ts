import { afterAll, describe, expect, test } from 'bun:test';
import { call } from '@orpc/server';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Database } from '../../src/lib/db';
import { assertTestDatabase } from '../test-database-guard';
import { createTestCaller } from './test-utils';

/**
 * Audit C1/C2: `waqf.orderStatus` is public, so (C1) a client-supplied
 * `status=success` must never settle an order and (C2) anyone who is not the
 * order's owner must only get a redacted view.
 */

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const schema = await import('../../src/lib/db/schema');
const { router } = await import('../../src/lib/orpc/router');
const { MockPaymentProvider } = await import(
  '@amwal/core/payment/mock.provider'
);

const database: Database = createDatabase(connectionUrl);
const provider = new MockPaymentProvider('SB-Mid-server-security-key-123456');
const now = () => new Date().toISOString();
const DONOR_NAME = 'Rahasia Donatur Uji';
const DONOR_PHONE = '081234567890';

const runId = ulid().toLowerCase();
const nadzirUserId = `c1c2-${runId}-nadzir-user`;
const nadzirProfileId = `c1c2-${runId}-nadzir-profile`;
const programId = `c1c2-${runId}-program`;

const publicContext = await createTestCaller({
  database,
  user: null,
  paymentProvider: provider,
});

async function createPendingOrder() {
  await database.insert(schema.users).values({
    id: nadzirUserId,
    name: 'Nadzir C1C2',
    updatedAt: now(),
  });
  await database.insert(schema.nadzirProfiles).values({
    id: nadzirProfileId,
    userId: nadzirUserId,
    kategori: 'ORGANISASI',
    namaLembaga: 'Badan Wakaf Uji C1C2',
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

  const created = await call(
    router.waqf.createOrder,
    {
      programId,
      amount: 100_000,
      paymentType: 'qris',
      donorName: DONOR_NAME,
      donorEmail: `c1c2-${runId}@example.com`,
      donorPhone: DONOR_PHONE,
      isAnonymous: false,
    },
    { context: publicContext }
  );
  const [order] = await database
    .select({ wakifId: schema.waqfOrders.wakifId })
    .from(schema.waqfOrders)
    .where(eq(schema.waqfOrders.id, created.orderId));

  return { ...created, wakifId: order?.wakifId ?? null };
}

describe('waqf.orderStatus security (audit C1/C2)', () => {
  let orderId = '';
  let transactionId = '';
  let wakifId: string | null = null;

  afterAll(async () => {
    await database
      .delete(schema.waqfOrders)
      .where(eq(schema.waqfOrders.id, orderId));
    await database
      .delete(schema.transactions)
      .where(eq(schema.transactions.id, transactionId));
    await database
      .delete(schema.waqfPrincipalLedgers)
      .where(eq(schema.waqfPrincipalLedgers.waqfProgramId, programId));
    await database
      .delete(schema.waqfPrograms)
      .where(eq(schema.waqfPrograms.id, programId));
    await database
      .delete(schema.nadzirProfiles)
      .where(eq(schema.nadzirProfiles.id, nadzirProfileId));
    await database
      .delete(schema.notifications)
      .where(eq(schema.notifications.userId, nadzirUserId));
    await database
      .delete(schema.users)
      .where(eq(schema.users.id, nadzirUserId));
    if (wakifId) {
      await database
        .delete(schema.notifications)
        .where(eq(schema.notifications.userId, wakifId));
      await database.delete(schema.users).where(eq(schema.users.id, wakifId));
    }
  });

  test('a forged status=success cannot settle a pending order', async () => {
    const created = await createPendingOrder();
    orderId = created.orderId;
    transactionId = created.transactionId;
    wakifId = created.wakifId;

    // The contract no longer has a `status` field; extra keys are ignored.
    const forged = { orderId, status: 'success' } as { orderId: string };
    const result = await call(router.waqf.orderStatus, forged, {
      context: publicContext,
    });

    expect(result.data.order.status).not.toBe('TERVERIFIKASI');
    expect(result.data.transaction?.statusPembayaran).toBe('PENDING');

    const [transaction] = await database
      .select({ status: schema.transactions.statusPembayaran })
      .from(schema.transactions)
      .where(eq(schema.transactions.id, transactionId));
    expect(transaction?.status).toBe('PENDING');

    const [ledger] = await database
      .select({ pokok: schema.waqfPrincipalLedgers.pokokDanaTerkumpul })
      .from(schema.waqfPrincipalLedgers)
      .where(eq(schema.waqfPrincipalLedgers.waqfProgramId, programId));
    expect(Number(ledger?.pokok ?? 0)).toBe(0);
  });

  test('guests only receive a redacted view', async () => {
    const result = await call(
      router.waqf.orderStatus,
      { orderId },
      { context: publicContext }
    );
    const body = JSON.stringify(result);

    expect(result.data.access).toBe('public');
    expect(body).not.toContain(DONOR_NAME);
    expect(body).not.toContain(DONOR_PHONE);
    expect(body).not.toContain(`c1c2-${runId}@example.com`);
    expect(result.data.order.namaWakif).toBe('Hamba Allah');
    expect(result.data.order.nomorKwitansi).toBeNull();
    expect(result.data.transaction?.id).toBeNull();
    expect(result.data.transaction?.paymentGatewayRef).toBeNull();
    expect(result.data.order.nominal).toBeDefined();
    expect(result.data.program?.judul).toContain(runId);
  });

  test('another logged-in user is treated as a guest', async () => {
    const stranger = await createTestCaller({
      database,
      user: { userId: `stranger-${runId}`, role: 'WAKIF' },
      paymentProvider: provider,
    });
    const result = await call(
      router.waqf.orderStatus,
      { orderId },
      { context: stranger }
    );

    expect(result.data.access).toBe('public');
    expect(JSON.stringify(result)).not.toContain(DONOR_NAME);
  });

  test('the owner sees their own receipt data', async () => {
    expect(wakifId).not.toBeNull();
    const owner = await createTestCaller({
      database,
      user: { userId: wakifId as string, role: 'WAKIF' },
      paymentProvider: provider,
    });
    const result = await call(
      router.waqf.orderStatus,
      { orderId },
      { context: owner }
    );

    expect(result.data.access).toBe('owner');
    expect(result.data.order.namaWakif).toBe(DONOR_NAME);
    expect(result.data.transaction?.id).toBe(transactionId);
    // Gateway internals stay server-side even for the owner.
    expect(result.data.transaction?.paymentGatewayRef).toBeNull();
  });

  test('an anonymous donation stays anonymous even for the owner', async () => {
    await database
      .update(schema.waqfOrders)
      .set({ isAnonymous: true })
      .where(eq(schema.waqfOrders.id, orderId));
    const owner = await createTestCaller({
      database,
      user: { userId: wakifId as string, role: 'WAKIF' },
      paymentProvider: provider,
    });
    const result = await call(
      router.waqf.orderStatus,
      { orderId },
      { context: owner }
    );

    expect(result.data.order.namaWakif).toBe('Hamba Allah');
  });
});
