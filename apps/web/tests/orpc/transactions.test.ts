import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { call, ORPCError } from '@orpc/server';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Database } from '../../src/lib/db';
import { assertTestDatabase } from '../test-database-guard';
import { createTestCaller } from './test-utils';

/**
 * Donor payment history (Fase 1 of the Sprint 10 parity audit, gap G2).
 *
 * The history screen shipped in S10-A-11 against `/api/transactions`, an
 * endpoint that was never implemented anywhere — so these are the first tests
 * this feature has ever had. They pin the ownership rule in both directions:
 * `list` must scope the query (another donor's row can never appear), and
 * `detail` must distinguish 404 from 403.
 */

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const schema = await import('../../src/lib/db/schema');
const { router } = await import('../../src/lib/orpc/router');

const database: Database = createDatabase(connectionUrl);
const now = () => new Date().toISOString();

const runId = ulid().toLowerCase();
const ownerId = `p17-txn-${runId}-owner`;
const strangerId = `p17-txn-${runId}-stranger`;
const adminId = `p17-txn-${runId}-admin`;
const ownerTxnId = `p17-txn-${runId}-own`;
const strangerTxnId = `p17-txn-${runId}-other`;

function ctx(userId: string, role: 'WAKIF' | 'ADMIN') {
  return createTestCaller({ database, user: { userId, role } });
}

beforeAll(async () => {
  await database.insert(schema.users).values([
    { id: ownerId, name: 'Donatur Pemilik', role: 'WAKIF', updatedAt: now() },
    { id: strangerId, name: 'Donatur Lain', role: 'WAKIF', updatedAt: now() },
    { id: adminId, name: 'Amil Admin', role: 'ADMIN', updatedAt: now() },
  ]);
  await database.insert(schema.transactions).values([
    {
      id: ownerTxnId,
      wakifId: ownerId,
      jenisTransaksi: 'WAKAF',
      amount: '250000.00',
      paymentMethod: 'qris',
      statusPembayaran: 'LUNAS',
      disbursementDestination: 'Badan Pengelola Wakaf',
    },
    {
      id: strangerTxnId,
      wakifId: strangerId,
      jenisTransaksi: 'INFAQ',
      amount: '75000.00',
      statusPembayaran: 'PENDING',
      disbursementDestination: 'Kas Infaq Umum',
    },
  ]);
});

afterAll(async () => {
  for (const id of [ownerTxnId, strangerTxnId]) {
    await database
      .delete(schema.transactions)
      .where(eq(schema.transactions.id, id));
  }
  for (const id of [ownerId, strangerId, adminId]) {
    await database.delete(schema.users).where(eq(schema.users.id, id));
  }
});

describe('oRPC transactions.list', () => {
  test('returns only the calling donor own transactions', async () => {
    const result = await call(
      router.transactions.list,
      {},
      {
        context: await ctx(ownerId, 'WAKIF'),
      }
    );

    const ids = result.data.map((row) => row.id);
    expect(ids).toContain(ownerTxnId);
    expect(ids).not.toContain(strangerTxnId);
  });

  test('rejects an unauthenticated caller with 401', async () => {
    const anonymous = await createTestCaller({ database, user: null });

    await expect(
      call(router.transactions.list, {}, { context: anonymous })
    ).rejects.toThrow(ORPCError);
  });

  test('a donor cannot widen the scope by passing another wakifId', async () => {
    // `wakifId` is an ADMIN-only affordance; for a WAKIF it must be ignored,
    // not honoured — otherwise the guard is decorative.
    const result = await call(
      router.transactions.list,
      { wakifId: strangerId },
      { context: await ctx(ownerId, 'WAKIF') }
    );

    const ids = result.data.map((row) => row.id);
    expect(ids).toContain(ownerTxnId);
    expect(ids).not.toContain(strangerTxnId);
  });

  test('an ADMIN may read another donor history', async () => {
    const result = await call(
      router.transactions.list,
      { wakifId: strangerId },
      { context: await ctx(adminId, 'ADMIN') }
    );

    expect(result.data.map((row) => row.id)).toContain(strangerTxnId);
  });
});

describe('oRPC transactions.detail', () => {
  test('the owning donor reads their own transaction', async () => {
    const result = await call(
      router.transactions.detail,
      { transactionId: ownerTxnId },
      { context: await ctx(ownerId, 'WAKIF') }
    );

    expect(result.data.id).toBe(ownerTxnId);
    expect(result.data.amount).toBe('250000.00');
    expect(result.data.statusPembayaran).toBe('LUNAS');
  });

  test('another donor gets 403, not the row', async () => {
    try {
      await call(
        router.transactions.detail,
        { transactionId: strangerTxnId },
        { context: await ctx(ownerId, 'WAKIF') }
      );
      throw new Error('expected the call to be rejected');
    } catch (error) {
      expect(error).toBeInstanceOf(ORPCError);
      expect((error as ORPCError<string, unknown>).code).toBe('FORBIDDEN');
    }
  });

  test('an unknown id is 404, distinguishable from 403', async () => {
    try {
      await call(
        router.transactions.detail,
        { transactionId: `${runId}-does-not-exist` },
        { context: await ctx(ownerId, 'WAKIF') }
      );
      throw new Error('expected the call to be rejected');
    } catch (error) {
      expect(error).toBeInstanceOf(ORPCError);
      expect((error as ORPCError<string, unknown>).code).toBe('NOT_FOUND');
    }
  });

  test('an ADMIN may read any donor transaction', async () => {
    const result = await call(
      router.transactions.detail,
      { transactionId: strangerTxnId },
      { context: await ctx(adminId, 'ADMIN') }
    );

    expect(result.data.id).toBe(strangerTxnId);
    expect(result.data.donorName).toBeUndefined();
  });
});
