import { z } from 'zod';

/**
 * Admin notification-management contracts (Sprint 12, draft "[Add]
 * Manajemen Notifikasi"). CRUD over the existing `notifications` table
 * (`packages/core/src/db/schema.ts`) — each row targets exactly one user
 * (`userId` is NOT NULL), so there is no broadcast-to-all concept here.
 *
 * `type` has no CHECK constraint in the database (plain text column), so
 * this enum only constrains what the admin UI can create/edit — it does not
 * require a migration.
 */

export const NOTIFICATION_TYPES = [
  'INFO',
  'PENGINGAT',
  'TRANSAKSI',
  'VERIFIKASI',
  'SISTEM',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export const notificationTypeSchema = z.enum(NOTIFICATION_TYPES);

export const adminListNotificationsSchema = z.object({
  userId: z.string().trim().optional(),
  search: z.string().trim().optional(),
  unreadOnly: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

export const searchNotificationUsersSchema = z.object({
  search: z.string().trim().optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

export const createNotificationSchema = z.object({
  userId: z.string().trim().min(1, 'Pengguna wajib dipilih'),
  type: notificationTypeSchema.default('INFO'),
  title: z.string().trim().min(1, 'Judul wajib diisi'),
  body: z.string().trim().optional().or(z.literal('')),
  relatedEntityId: z.string().trim().optional().or(z.literal('')),
});

export const updateNotificationSchema = z.object({
  id: z.string().trim().min(1, 'ID wajib diisi'),
  type: notificationTypeSchema.optional(),
  title: z.string().trim().min(1, 'Judul wajib diisi').optional(),
  body: z.string().trim().optional().or(z.literal('')),
  isRead: z.boolean().optional(),
});

export const deleteNotificationSchema = z.object({
  id: z.string().trim().min(1, 'ID wajib diisi'),
});
