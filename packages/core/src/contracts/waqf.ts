import { z } from 'zod';
import { MIN_DONATION_LABEL, MIN_DONATION_RUPIAH } from '../payment/limits';
import { paymentMethodSchema } from '../payment/methods';
import { akadAcceptanceInputSchema } from './akad';

/**
 * Extracted verbatim from `apps/server/src/routes/waqf.ts` (Putaran 17,
 * Batch 1) with optional akad acceptance for dynamic contract compliance (Sprint 11, I-6).
 */
export const createOrderSchema = z.object({
  programId: z.string().min(1, 'programId wajib diisi'),
  amount: z
    .number()
    .min(MIN_DONATION_RUPIAH, `Nominal wakaf minimal ${MIN_DONATION_LABEL}`),
  // Kode `paymentMethod` Mayar (qris, va/bni, ewallet/gopay, ...).
  paymentType: paymentMethodSchema.default('qris'),
  donorName: z.string().min(1, 'Nama donatur wajib diisi'),
  donorEmail: z
    .string()
    .email('Format email tidak valid')
    .optional()
    .or(z.literal('')),
  donorPhone: z.string().optional().or(z.literal('')),
  isAnonymous: z.boolean().default(false),
  /** Doa & harapan wakif (opsional); sama batasnya dengan zakat. */
  doa: z.string().trim().max(500, 'Doa maksimal 500 karakter').optional(),
  akadAcceptance: akadAcceptanceInputSchema.optional(),
});
