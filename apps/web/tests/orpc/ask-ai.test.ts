import { describe, expect, test } from 'bun:test';
import { call, ORPCError } from '@orpc/server';
import { ulid } from 'ulidx';
import type { Database } from '../../src/lib/db';
import { assertTestDatabase } from '../test-database-guard';
import { createTestCaller } from './test-utils';

/**
 * Putaran 17, feature replay N-14 — coverage for `router.askAi` guards and
 * input validation. The DeepSeek happy path needs a real API key and is
 * exercised manually; here we prove the auth gate (AMW-06 — no anonymous LLM
 * endpoint) and the non-empty message rule.
 */

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const { router } = await import('../../src/lib/orpc/router');

const database: Database = createDatabase(connectionUrl);

describe('oRPC ask-ai', () => {
  test('rejects unauthenticated with 401', async () => {
    const context = await createTestCaller({ database, user: null });
    try {
      await call(router.askAi.send, { message: 'halo' }, { context });
      throw new Error('expected call to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(ORPCError);
      expect((error as ORPCError<string, unknown>).status).toBe(401);
    }
  });

  test('rejects an empty message', async () => {
    const context = await createTestCaller({
      database,
      user: { userId: `p17n14-${ulid().toLowerCase()}`, role: 'WAKIF' },
    });
    try {
      await call(router.askAi.send, { message: '   ' }, { context });
      throw new Error('expected call to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(ORPCError);
      expect((error as ORPCError<string, unknown>).status).toBe(400);
    }
  });
});
