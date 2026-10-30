import { z } from 'zod';
import { paymentMethodSchema } from '../payment/methods';
import {
  isValidIndonesianPhone,
  normalizeIndonesianPhone,
} from '../whatsapp/phone';
import { akadAcceptanceInputSchema } from './akad';

/**
 * Extracted verbatim from `apps/server/src/routes/qurban.ts` (Putaran 17,
 * Batch 1) with optional akad acceptance for dynamic contract compliance (Sprint 11, I-6).
 */
export const createQurbanOrderSchema = z.object({
  hewanBatchId: z.string().min(1, 'hewanBatchId wajib diisi'),
  jumlahSlotDiminta: z.number().int().positive('Jumlah slot harus positif'),
  /**
   * Tujuan blast laporan qurban. Wajib dan tervalidasi format Indonesia —
   * sebelumnya kolom ini diisi dari `users.phone` yang boleh kosong, sehingga
   * `notifyQurban` berhenti diam-diam dan blast tidak pernah terkirim.
   * Di-transform ke bentuk kanonik `62xxxxxxxxx` sebelum disimpan.
   */
  teleponPengqurban: z
    .string()
    .trim()
    .min(1, 'Nomor WhatsApp wajib diisi')
    .refine(
      isValidIndonesianPhone,
      'Format nomor WhatsApp tidak valid. Gunakan format Indonesia, contoh 08xx atau +62xx.'
    )
    .transform((value) => normalizeIndonesianPhone(value) ?? value),
  alamatPengqurban: z.string().optional().or(z.literal('')),
  tipeKepemilikan: z.enum(['INDIVIDU', 'KOLEKTIF']),
  opsiPesan: z.enum(['PASRAH', 'AMBIL_SENDIRI']).default('PASRAH'),
  // Kode `paymentMethod` Mayar (qris, va/bni, ewallet/gopay, ...).
  paymentType: paymentMethodSchema.default('qris'),
  akadWakalahAccepted: z.boolean(),
  akadAcceptance: akadAcceptanceInputSchema.optional(),
  /** Lafazh nama shohibul, satu per slot (maks. 7 untuk sapi patungan). */
  namaShohibul: z
    .array(
      z.string().trim().min(2, 'Nama shohibul minimal 2 karakter').max(100)
    )
    .min(1)
    .max(7)
    .optional(),
  /**
   * Identitas pemesan untuk TAMU (QA-04): nama wajib bagi tamu (ditegakkan
   * router). Donatur yang login memakai profil akunnya. Nomor WhatsApp tamu
   * adalah `teleponPengqurban`.
   */
  donorName: z
    .string()
    .trim()
    .min(2, 'Nama pemesan minimal 2 karakter')
    .max(100)
    .optional(),
  donorEmail: z
    .string()
    .trim()
    .email('Format email tidak valid')
    .optional()
    .or(z.literal('')),
});
