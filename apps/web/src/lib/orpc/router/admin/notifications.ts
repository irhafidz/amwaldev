import {
  adminListNotificationsSchema,
  createNotificationSchema,
  deleteNotificationSchema,
  searchNotificationUsersSchema,
  updateNotificationSchema,
} from '@amwal/core/contracts/admin-notifications';
import { ORPCError } from '@orpc/server';
import { and, desc, eq, ilike, or, type SQL, sql } from 'drizzle-orm';
import { ulid } from 'ulidx';
import { notifications as notificationsTable, users } from '@/lib/db/schema';
import { adminProcedure } from '../../procedures';

/**
 * Admin notification-management router (Sprint 12, draft "[Add] Manajemen
 * Notifikasi") — CRUD over `notifications`, guarded by `adminProcedure`.
 * Each notification targets exactly one user; `searchUsers` powers the
 * target picker in the admin UI.
 */

const list = adminProcedure
  .input(adminListNotificationsSchema)
  .handler(async ({ input, context }) => {
    const conditions: SQL[] = [];
    if (input.userId) {
      conditions.push(eq(notificationsTable.userId, input.userId));
    }
    if (input.unreadOnly) {
      conditions.push(eq(notificationsTable.isRead, false));
    }
    if (input.search) {
      const pattern = `%${input.search}%`;
      const searchFilter = or(
        ilike(notificationsTable.title, pattern),
        ilike(notificationsTable.body, pattern)
      );
      if (searchFilter) {
        conditions.push(searchFilter);
      }
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [items, [{ total }]] = await Promise.all([
      context.db
        .select({
          id: notificationsTable.id,
          userId: notificationsTable.userId,
          type: notificationsTable.type,
          title: notificationsTable.title,
          body: notificationsTable.body,
          isRead: notificationsTable.isRead,
          relatedEntityId: notificationsTable.relatedEntityId,
          createdAt: notificationsTable.createdAt,
          userName: users.name,
          userEmail: users.email,
        })
        .from(notificationsTable)
        .leftJoin(users, eq(users.id, notificationsTable.userId))
        .where(whereClause)
        .orderBy(desc(notificationsTable.createdAt))
        .limit(input.limit)
        .offset(input.offset),
      context.db
        .select({ total: sql<number>`count(*)::int` })
        .from(notificationsTable)
        .where(whereClause),
    ]);

    return { items, total, limit: input.limit, offset: input.offset };
  });

const searchUsers = adminProcedure
  .input(searchNotificationUsersSchema)
  .handler(async ({ input, context }) => {
    const conditions: SQL[] = [];
    if (input.search) {
      const pattern = `%${input.search}%`;
      const searchFilter = or(
        ilike(users.name, pattern),
        ilike(users.email, pattern)
      );
      if (searchFilter) {
        conditions.push(searchFilter);
      }
    }
    const rows = await context.db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(users.name)
      .limit(input.limit);

    return { data: rows };
  });

const create = adminProcedure
  .input(createNotificationSchema)
  .handler(async ({ input, context }) => {
    const [targetUser] = await context.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, input.userId))
      .limit(1);
    if (!targetUser) {
      throw new ORPCError('NOT_FOUND', {
        message: 'Pengguna tidak ditemukan',
      });
    }

    const [created] = await context.db
      .insert(notificationsTable)
      .values({
        id: ulid().toLowerCase(),
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body || null,
        relatedEntityId: input.relatedEntityId || null,
      })
      .returning();

    return created;
  });

const update = adminProcedure
  .input(updateNotificationSchema)
  .handler(async ({ input, context }) => {
    const [existing] = await context.db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.id, input.id))
      .limit(1);
    if (!existing) {
      throw new ORPCError('NOT_FOUND', {
        message: 'Notifikasi tidak ditemukan',
      });
    }

    const [updated] = await context.db
      .update(notificationsTable)
      .set({
        type: input.type ?? existing.type,
        title: input.title ?? existing.title,
        body: input.body !== undefined ? input.body || null : existing.body,
        isRead: input.isRead ?? existing.isRead,
      })
      .where(eq(notificationsTable.id, input.id))
      .returning();

    return updated;
  });

const deleteNotification = adminProcedure
  .input(deleteNotificationSchema)
  .handler(async ({ input, context }) => {
    const [existing] = await context.db
      .select({ id: notificationsTable.id })
      .from(notificationsTable)
      .where(eq(notificationsTable.id, input.id))
      .limit(1);
    if (!existing) {
      throw new ORPCError('NOT_FOUND', {
        message: 'Notifikasi tidak ditemukan',
      });
    }

    await context.db
      .delete(notificationsTable)
      .where(eq(notificationsTable.id, input.id));

    return { success: true, id: input.id };
  });

export const notifications = {
  list,
  searchUsers,
  create,
  update,
  delete: deleteNotification,
};
