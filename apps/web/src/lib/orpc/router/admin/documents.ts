import { verifySchema } from '@amwal/core/contracts/admin-documents';
import { ORPCError } from '@orpc/server';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { nadzirDocuments, nadzirProfiles } from '@/lib/db/schema';
import { adminProcedure } from '../../procedures';

/**
 * oRPC admin.documents router (Putaran 17, Batch 4) — a 1:1 port of
 * `apps/server/src/routes/admin/documents.ts`. `ocr_extracted_nik` is a
 * sensitive field — it is NOT selected here (SECURITY.md §6). Reviewers see
 * only the OCR name/confidence and the file link; raw KTP images are deleted
 * 30 days post-verification by a separate job (Putaran 2 #2).
 */

const list = adminProcedure.handler(async ({ context }) => {
  const rows = await context.db
    .select({
      id: nadzirDocuments.id,
      nadzirProfileId: nadzirDocuments.nadzirProfileId,
      tipeDokumen: nadzirDocuments.tipeDokumen,
      fileUrl: nadzirDocuments.fileUrl,
      fileDeletedAt: nadzirDocuments.fileDeletedAt,
      ocrExtractedNama: nadzirDocuments.ocrExtractedNama,
      ocrConfidenceScore: nadzirDocuments.ocrConfidenceScore,
      reviewedManually: nadzirDocuments.reviewedManually,
      createdAt: nadzirDocuments.createdAt,
      namaLembaga: nadzirProfiles.namaLembaga,
      nadzirStatus: nadzirProfiles.statusVerifikasi,
    })
    .from(nadzirDocuments)
    .leftJoin(
      nadzirProfiles,
      eq(nadzirProfiles.id, nadzirDocuments.nadzirProfileId)
    )
    .orderBy(desc(nadzirDocuments.createdAt));
  return { data: rows };
});

const verify = adminProcedure
  .input(z.object({ id: z.string().min(1) }).and(verifySchema))
  .handler(async ({ input, context }) => {
    const [row] = await context.db
      .update(nadzirDocuments)
      .set({ reviewedManually: input.reviewedManually })
      .where(eq(nadzirDocuments.id, input.id))
      .returning();
    if (!row) {
      throw new ORPCError('NOT_FOUND', { message: 'Dokumen tidak ditemukan' });
    }
    return { success: true, data: row };
  });

export const documents = {
  list,
  verify,
};
