import { describe, expect, test } from 'bun:test';
import { call, ORPCError } from '@orpc/server';
import type { Database } from '../../src/lib/db';
import { assertTestDatabase } from '../test-database-guard';
import { createTestCaller } from './test-utils';

/**
 * Putaran 17, Batch 3 — the oRPC-side twin of
 * `apps/server/tests/nadzir/nadzir.test.ts`. Same RBAC matrix
 * (401 unauthenticated / 403 WAKIF / 200 NADZIR / 200 ADMIN) and the honest
 * 501 dashboard stub, proven through `router.nadzir.*` via `call()`. Uses
 * `createTestCaller` (Batch 5) for context/JWT setup.
 */

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const { router } = await import('../../src/lib/orpc/router');

const database: Database = createDatabase(connectionUrl);

describe('oRPC nadzir: Portal Nadzir RBAC', () => {
  test('programs rejects an unauthenticated request with 401', async () => {
    const context = await createTestCaller({ database, user: null });
    try {
      await call(router.nadzir.programs, {}, { context });
      throw new Error('expected call to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(ORPCError);
      expect((error as ORPCError<string, unknown>).status).toBe(401);
    }
  });

  test('programs rejects a WAKIF with 403', async () => {
    const context = await createTestCaller({
      database,
      user: { userId: 'p17b3-wakif', role: 'WAKIF' },
    });
    try {
      await call(router.nadzir.programs, {}, { context });
      throw new Error('expected call to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(ORPCError);
      expect((error as ORPCError<string, unknown>).status).toBe(403);
    }
  });

  test('programs returns a data array for NADZIR', async () => {
    const context = await createTestCaller({
      database,
      user: { userId: 'p17b3-nadzir', role: 'NADZIR' },
    });
    const result = await call(router.nadzir.programs, {}, { context });
    expect(Array.isArray(result.data)).toBe(true);
  });

  test('programs is allowed for ADMIN as superuser', async () => {
    const context = await createTestCaller({
      database,
      user: { userId: 'p17b3-admin', role: 'ADMIN' },
    });
    const result = await call(router.nadzir.programs, {}, { context });
    expect(Array.isArray(result.data)).toBe(true);
  });

  test('dashboard is an honest 501 for a NADZIR session', async () => {
    const context = await createTestCaller({
      database,
      user: { userId: 'p17b3-nadzir', role: 'NADZIR' },
    });
    try {
      await call(router.nadzir.dashboard, {}, { context });
      throw new Error('expected call to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(ORPCError);
      const orpcError = error as ORPCError<string, { tier?: string }>;
      expect(orpcError.status).toBe(501);
      expect(orpcError.data?.tier).toBe('C');
    }
  });
});
