import {
  createReceiptSignedUrl,
  deleteReceiptFile,
  parseReceiptObjectKey,
} from '@amwal/core/storage/files';
import { ORPCError } from '@orpc/server';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { programReceiptAttachments } from '@/lib/db/schema';
import { adminProcedure } from '../procedures';

/**
 * oRPC receipts router (Sprint 11, [I-2])
 * Metadata management and signed URL generation for private receipt attachments.
 * File uploads are handled via pure HTTP route `routes/api/uploads/receipts.ts`
 * to strictly enforce the 5 MB streaming cutoff.
 *
 * Database Invariants:
 * - Only private `object_key` is stored in the database.
 * - Signed URLs have a short 600-second (10-minute) TTL and are minted on-demand.
 * - All procedures are protected by `adminProcedure`.
 */

/** Lampiran kuitansi satu program wakaf. */
const list = adminProcedure
  .input(
    z.object({
      waqfProgramId: z.string().trim().min(1, 'ID program wajib diisi'),
      progressReportId: z.string().trim().min(1).optional(),
    })
  )
  .handler(async ({ input, context }) => {
    const conditions = [
      eq(programReceiptAttachments.waqfProgramId, input.waqfProgramId),
    ];

    if (input.progressReportId) {
      conditions.push(
        eq(programReceiptAttachments.progressReportId, input.progressReportId)
      );
    }

    const rows = await context.db
      .select()
      .from(programReceiptAttachments)
      .where(and(...conditions))
      .orderBy(desc(programReceiptAttachments.createdAt));

    return { data: rows };
  });

/** Signed URL baru untuk satu lampiran (TTL 600s); tidak pernah disimpan. */
const url = adminProcedure
  .input(z.object({ id: z.string().trim().min(1, 'ID lampiran wajib diisi') }))
  .handler(async ({ input, context }) => {
    const [attachment] = await context.db
      .select()
      .from(programReceiptAttachments)
      .where(eq(programReceiptAttachments.id, input.id))
      .limit(1);

    if (!attachment) {
      throw new ORPCError('NOT_FOUND', {
        message: 'Lampiran kuitansi tidak ditemukan',
      });
    }

    try {
      const { bucket, path } = parseReceiptObjectKey(attachment.objectKey);
      const signedUrl = await createReceiptSignedUrl({
        bucket,
        path,
        expiresInSeconds: 600,
      });

      return {
        data: {
          signedUrl,
          expiresInSeconds: 600,
          objectKey: attachment.objectKey,
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          fileSize: attachment.fileSize,
        },
      };
    } catch (error) {
      throw new ORPCError('INTERNAL_SERVER_ERROR', {
        message: `Gagal membuat signed URL: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  });

/** Mengubah judul/vendor/nominal lampiran — tidak pernah menyentuh berkas fisik. */
const update = adminProcedure
  .input(
    z.object({
      id: z.string().trim().min(1, 'ID lampiran wajib diisi'),
      title: z.string().trim().min(1).optional(),
      vendorName: z.string().trim().optional(),
      nominal: z.number().nonnegative().optional(),
    })
  )
  .handler(async ({ input, context }) => {
    const { id, ...fields } = input;
    const [record] = await context.db
      .update(programReceiptAttachments)
      .set({
        ...(fields.title !== undefined && { title: fields.title }),
        ...(fields.vendorName !== undefined && {
          vendorName: fields.vendorName,
        }),
        ...(fields.nominal !== undefined && {
          nominal: fields.nominal.toString(),
        }),
      })
      .where(eq(programReceiptAttachments.id, id))
      .returning();

    if (!record) {
      throw new ORPCError('NOT_FOUND', {
        message: 'Lampiran kuitansi tidak ditemukan',
      });
    }

    return { data: record };
  });

/** Menghapus lampiran beserta objeknya di storage. */
const remove = adminProcedure
  .input(z.object({ id: z.string().trim().min(1, 'ID lampiran wajib diisi') }))
  .handler(async ({ input, context }) => {
    const [attachment] = await context.db
      .select()
      .from(programReceiptAttachments)
      .where(eq(programReceiptAttachments.id, input.id))
      .limit(1);

    if (!attachment) {
      throw new ORPCError('NOT_FOUND', {
        message: 'Lampiran kuitansi tidak ditemukan',
      });
    }

    // Delete from private storage first
    try {
      const { bucket, path } = parseReceiptObjectKey(attachment.objectKey);
      await deleteReceiptFile({ bucket, path });
    } catch (storageError) {
      throw new ORPCError('INTERNAL_SERVER_ERROR', {
        message: `Gagal menghapus berkas dari storage: ${storageError instanceof Error ? storageError.message : 'Unknown storage error'}`,
      });
    }

    // Delete record from database
    await context.db
      .delete(programReceiptAttachments)
      .where(eq(programReceiptAttachments.id, input.id));

    return { success: true };
  });

export const receipts = { waqf: { list, url, update, remove } };
