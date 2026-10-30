import { z } from 'zod';
import { MIN_DONATION_LABEL, MIN_DONATION_RUPIAH } from '../payment/limits';
import { paymentMethodSchema } from '../payment/methods';
import { akadAcceptanceInputSchema } from './akad';

/**
 * Extracted verbatim from `apps/server/src/routes/infaq.ts` (Putaran 17,
 * Batch 1) with optional akad acceptance for dynamic contract compliance (Sprint 11, I-6).
 */
export const INFAQ_JENIS = [
  'INFAQ_SUBUH',
  'INFAQ_JUMAT',
  'INFAQ_UMUM',
  'SEDEKAH_YATIM',
  'SEDEKAH_OPERASIONAL',
] as const;

export const createInfaqSchema = z.object({
  nominal: z
    .number()
    .int()
    .min(MIN_DONATION_RUPIAH, `Nominal minimal ${MIN_DONATION_LABEL}`),
  jenis: z.enum(INFAQ_JENIS),
  namaPenginfaq: z.string().min(1, 'Nama penginfaq wajib diisi'),
  teleponPenginfaq: z.string().optional().or(z.literal('')),
  emailPenginfaq: z
    .string()
    .email('Format email tidak valid')
    .optional()
    .or(z.literal('')),
  doa: z.string().optional(),
  akadAcceptance: akadAcceptanceInputSchema.optional(),
  // Kode `paymentMethod` Mayar (qris, va/bni, ewallet/gopay, ...).
  paymentType: paymentMethodSchema.default('qris'),
  /** Tampilkan sebagai "Hamba Allah"; identitas asli tetap dipakai untuk riwayat. */
  isAnonymous: z.boolean().default(false),
});
