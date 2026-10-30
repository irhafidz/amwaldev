import { z } from 'zod';
import { PAYMENT_METHOD_CODES } from '../payment/methods';
import { akadAcceptanceInputSchema } from './akad';

/**
 * Extracted verbatim from `apps/server/src/routes/zakat.ts` (Putaran 17,
 * Batch 1) with optional akad acceptance for dynamic contract compliance (Sprint 11, I-6).
 */
export const calculateZakatSchema = z.discriminatedUnion('jenisZakat', [
  z.object({
    jenisZakat: z.literal('FITRAH'),
    jumlahJiwa: z.number().int().positive('Jumlah jiwa harus positif'),
  }),
  z.object({
    jenisZakat: z.literal('MAAL_PENGHASILAN'),
    totalWealth: z.number().nonnegative('Total harta tidak boleh negatif'),
  }),
]);

/** Kode metode Mayar untuk bayar digital; `tunai` dan `beras` dicatat manual oleh amil. */
export const ZAKAT_PAYMENT_TYPES = [
  ...PAYMENT_METHOD_CODES,
  'tunai',
  'beras',
] as const;

export type ZakatPaymentType = (typeof ZAKAT_PAYMENT_TYPES)[number];

export const createZakatOrderSchema = z.object({
  programId: z.string().min(1, 'programId wajib diisi'),
  amount: z.number().positive('Nominal harus lebih dari 0'),
  paymentType: z.enum(ZAKAT_PAYMENT_TYPES),
  isAnonymous: z.boolean().default(false),
  jenisZakat: z
    .enum(['FITRAH', 'MAAL_PENGHASILAN', 'EMAS', 'PERUSAHAAN', 'PERTANIAN'])
    .default('MAAL_PENGHASILAN'),
  akadAcceptance: akadAcceptanceInputSchema.optional(),
  jumlahJiwa: z.number().int().positive().optional(),
  namaDizakatkan: z.string().trim().max(500).optional(),
  doa: z.string().trim().max(500).optional(),
  /**
   * Identitas muzakki untuk TAMU (QA-04, D3). Nama wajib bagi tamu — dicatat
   * untuk niat dan pencatatan amil — dan `isAnonymous` hanya menyamarkan
   * tampilan publik. Donatur yang login memakai profil akunnya; field ini
   * diabaikan. Wajib-tidaknya ditegakkan router (bergantung pada sesi).
   */
  donorName: z
    .string()
    .trim()
    .min(2, 'Nama muzakki minimal 2 karakter')
    .max(100)
    .optional(),
  donorEmail: z
    .string()
    .trim()
    .email('Format email tidak valid')
    .optional()
    .or(z.literal('')),
  donorPhone: z.string().trim().max(20).optional().or(z.literal('')),
});
