import { describe, expect, test } from 'bun:test';
import { call, ORPCError } from '@orpc/server';
import type { Database } from '../../src/lib/db';
import { assertTestDatabase } from '../test-database-guard';
import { createTestCaller } from './test-utils';

/**
 * Putaran 17, Batch 0 canary — the oRPC-side twin of
 * `apps/server/tests/admin/overview.test.ts`. Same three cases (401 / 403 /
 * 200 + shape), same guard behaviour, same query. This is the test that
 * proves Gate #3 of docs/PUTARAN-17.md. Uses `createTestCaller` (Batch 5)
 * for context/JWT setup.
 */

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const { router } = await import('../../src/lib/orpc/router');

const database: Database = createDatabase(connectionUrl);

describe('oRPC canary: admin.overview.kpi', () => {
  test('rejects an unauthenticated call with 401', async () => {
    const context = await createTestCaller({ database, user: null });
    try {
      await call(router.admin.overview.kpi, {}, { context });
      throw new Error('expected call to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(ORPCError);
      expect((error as ORPCError<string, unknown>).status).toBe(401);
    }
  });

  test('rejects a non-ADMIN role with 403', async () => {
    const context = await createTestCaller({
      database,
      user: { userId: 'p17-wakif', role: 'WAKIF' },
    });
    try {
      await call(router.admin.overview.kpi, {}, { context });
      throw new Error('expected call to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(ORPCError);
      expect((error as ORPCError<string, unknown>).status).toBe(403);
    }
  });

  test('returns live aggregate KPI shape for ADMIN', async () => {
    const context = await createTestCaller({
      database,
      user: { userId: 'p17-admin', role: 'ADMIN' },
    });
    const result = await call(router.admin.overview.kpi, {}, { context });

    expect(typeof result.totalFundsCollected).toBe('string');
    expect(Number.isFinite(Number(result.totalFundsCollected))).toBe(true);
    expect(result.paidTransactions).toBeGreaterThanOrEqual(0);
    expect(result.totalTransactions).toBeGreaterThanOrEqual(
      result.paidTransactions
    );
    expect(result.activePrograms).toBeGreaterThanOrEqual(0);
  });
});
