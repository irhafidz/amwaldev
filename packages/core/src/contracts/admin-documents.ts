import { z } from 'zod';

/**
 * Extracted verbatim from `apps/server/src/routes/admin/documents.ts`
 * (Putaran 17, Batch 1).
 */
export const verifySchema = z.object({
  reviewedManually: z.boolean(),
});
