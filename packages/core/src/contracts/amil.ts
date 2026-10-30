import { z } from 'zod';

/**
 * Extracted verbatim from `apps/server/src/routes/amil.ts` (Putaran 17,
 * Batch 1) — zero change to shape, messages, or refinement logic.
 */
export const offlineZakatSchema = z
  .object({
    namaMuzakki: z.string().trim().min(2),
    noTelepon: z.string().trim().optional(),
    alamat: z.string().trim().optional(),
    isAnonymous: z.boolean().default(false),
    jenisZakat: z.enum([
      'FITRAH',
      'MAAL_PENGHASILAN',
      'FIDYAH',
      'KAFARAT',
      'EMAS',
      'PERUSAHAAN',
      'PERTANIAN',
    ]),
    metodePembayaran: z.enum(['TUNAI', 'BERAS']),
    nominal: z.number().positive().optional(),
    beratBerasKg: z.number().positive().optional(),
    jumlahJiwa: z.number().int().positive().optional(),
    notes: z.string().trim().optional(),
  })
  .refine(
    (v) =>
      v.metodePembayaran === 'BERAS'
        ? Boolean(v.beratBerasKg)
        : Boolean(v.nominal),
    {
      message: 'metode TUNAI wajib nominal; metode BERAS wajib beratBerasKg',
      path: ['nominal'],
    }
  );

export const setoranSchema = z.object({
  tanggal: z.string().min(1, 'tanggal wajib diisi'),
  jumlahSetor: z.number().positive('Jumlah setor harus positif'),
  keterangan: z.string().trim().optional(),
});

export const distributionReportSchema = z.object({
  qurbanOrderId: z.string().min(1, 'qurbanOrderId wajib diisi'),
  lokasiLat: z.number(),
  lokasiLng: z.number(),
  jumlahPenerima: z.number().int().positive('Jumlah penerima harus positif'),
  buktiFotoUrl: z.string().optional(),
  lokasiPenyaluran: z.string().optional(),
});
