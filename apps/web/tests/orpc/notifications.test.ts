import { describe, expect, test } from 'bun:test';
import { createNotification } from '@amwal/core/notification';
import { call, ORPCError } from '@orpc/server';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Database } from '../../src/lib/db';
import { assertTestDatabase } from '../test-database-guard';
import { createTestCaller } from './test-utils';

/**
 * Putaran 17, feature replay N-12 — coverage for `router.notifications`.
 * In-app notifications are per-user; marking another user's notification
 * read is a no-op (404).
 */

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const schema = await import('../../src/lib/db/schema');
const { router } = await import('../../src/lib/orpc/router');

const database: Database = createDatabase(connectionUrl);
const now = () => new Date().toISOString();

async function createUser(label: string): Promise<string> {
  const id = `p17n12-${label}-${ulid().toLowerCase()}`;
  await database.insert(schema.users).values({
    id,
    name: `User ${label}`,
    updatedAt: now(),
  });
  return id;
}

describe('oRPC notifications', () => {
  test('rejects unauthenticated with 401', async () => {
    const context = await createTestCaller({ database, user: null });
    try {
      await call(router.notifications.list, {}, { context });
      throw new Error('expected call to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(ORPCError);
      expect((error as ORPCError<string, unknown>).status).toBe(401);
    }
  });

  test('lists only the current user notifications', async () => {
    const userA = await createUser('a');
    const userB = await createUser('b');

    try {
      await createNotification(database, {
        userId: userA,
        type: 'PAYMENT_SETTLED',
        title: 'Milik A',
      });
      await createNotification(database, {
        userId: userB,
        type: 'PAYMENT_SETTLED',
        title: 'Milik B',
      });

      const context = await createTestCaller({
        database,
        user: { userId: userA, role: 'WAKIF' },
      });
      const result = await call(router.notifications.list, {}, { context });
      const rows = result.data as Array<{ title: string }>;

      expect(rows.length).toBe(1);
      expect(rows[0]?.title).toBe('Milik A');
    } finally {
      await database
        .delete(schema.notifications)
        .where(eq(schema.notifications.userId, userA));
      await database
        .delete(schema.notifications)
        .where(eq(schema.notifications.userId, userB));
      await database.delete(schema.users).where(eq(schema.users.id, userA));
      await database.delete(schema.users).where(eq(schema.users.id, userB));
    }
  });

  test('marks own read; cannot mark another user notification', async () => {
    const userA = await createUser('owner');
    const userB = await createUser('other');

    try {
      await createNotification(database, {
        userId: userA,
        type: 'DEPOSIT_VERIFIED',
        title: 'Setoran diverifikasi',
      });
      const [notif] = await database
        .select({ id: schema.notifications.id })
        .from(schema.notifications)
        .where(eq(schema.notifications.userId, userA));

      const contextB = await createTestCaller({
        database,
        user: { userId: userB, role: 'WAKIF' },
      });
      try {
        await call(
          router.notifications.markRead,
          { id: notif?.id ?? '' },
          { context: contextB }
        );
        throw new Error('expected cross-user markRead to reject');
      } catch (error) {
        expect(error).toBeInstanceOf(ORPCError);
        expect((error as ORPCError<string, unknown>).status).toBe(404);
      }

      const contextA = await createTestCaller({
        database,
        user: { userId: userA, role: 'WAKIF' },
      });
      await call(
        router.notifications.markRead,
        { id: notif?.id ?? '' },
        { context: contextA }
      );

      const [updated] = await database
        .select({ isRead: schema.notifications.isRead })
        .from(schema.notifications)
        .where(eq(schema.notifications.id, notif?.id ?? ''));
      expect(updated?.isRead).toBe(true);
    } finally {
      await database
        .delete(schema.notifications)
        .where(eq(schema.notifications.userId, userA));
      await database.delete(schema.users).where(eq(schema.users.id, userA));
      await database.delete(schema.users).where(eq(schema.users.id, userB));
    }
  });
});
