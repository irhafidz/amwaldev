import { ORPCError } from '@orpc/server';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { notifications as notificationsTable } from '@/lib/db/schema';
import { protectedProcedure } from '../procedures';

/**
 * oRPC notifications router (Putaran 17, feature replay N-12) — a 1:1 port of
 * `apps/server/src/routes/notifications.ts`. In-app notifications are
 * per-user and read-scoped to the caller; marking another user's notification
 * as read is a no-op (404).
 */

const list = protectedProcedure
  .input(z.object({ unread: z.boolean().optional() }).optional())
  .handler(async ({ input, context }) => {
    const user = context.user;
    if (!user) {
      throw new ORPCError('UNAUTHORIZED');
    }

    const conditions = [eq(notificationsTable.userId, user.userId)];
    if (input?.unread) {
      conditions.push(eq(notificationsTable.isRead, false));
    }

    const rows = await context.db
      .select()
      .from(notificationsTable)
      .where(and(...conditions))
      .orderBy(desc(notificationsTable.createdAt));

    return { data: rows };
  });

const markRead = protectedProcedure
  .input(z.object({ id: z.string() }))
  .handler(async ({ input, context }) => {
    const user = context.user;
    if (!user) {
      throw new ORPCError('UNAUTHORIZED');
    }

    const updated = await context.db
      .update(notificationsTable)
      .set({ isRead: true })
      .where(
        and(
          eq(notificationsTable.id, input.id),
          eq(notificationsTable.userId, user.userId)
        )
      )
      .returning({ id: notificationsTable.id });

    if (updated.length === 0) {
      throw new ORPCError('NOT_FOUND', {
        message: 'Notifikasi tidak ditemukan',
      });
    }

    return { data: { id: input.id } };
  });

const byId = protectedProcedure
  .input(z.object({ id: z.string() }))
  .handler(async ({ input, context }) => {
    const user = context.user;
    if (!user) {
      throw new ORPCError('UNAUTHORIZED');
    }

    const [row] = await context.db
      .select()
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.id, input.id),
          eq(notificationsTable.userId, user.userId)
        )
      );

    if (!row) {
      throw new ORPCError('NOT_FOUND', {
        message: 'Notifikasi tidak ditemukan',
      });
    }

    if (!row.isRead) {
      await context.db
        .update(notificationsTable)
        .set({ isRead: true })
        .where(eq(notificationsTable.id, input.id));
    }

    return { data: { ...row, isRead: true } };
  });

const markAllRead = protectedProcedure.handler(async ({ context }) => {
  const user = context.user;
  if (!user) {
    throw new ORPCError('UNAUTHORIZED');
  }

  await context.db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(eq(notificationsTable.userId, user.userId));

  return { data: { success: true } };
});

export const notifications = { list, byId, markRead, markAllRead };
