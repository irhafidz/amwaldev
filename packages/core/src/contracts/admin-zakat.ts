import { z } from 'zod';

/**
 * Extracted verbatim from `apps/server/src/routes/admin/zakat.ts` (Putaran
 * 17, Batch 1) — zero change to shape, messages, or refinement logic.
 */
export const distributionSchema = z
  .object({
    mustahiqId: z.string().min(1),
    jenisZakat: z.enum([
      'FITRAH',
      'MAAL_PENGHASILAN',
      'FIDYAH',
      'KAFARAT',
      'EMAS',
      'PERUSAHAAN',
      'PERTANIAN',
    ]),
    nominal: z.number().positive().optional(),
    beratBerasKg: z.number().positive().optional(),
    buktiPenerimaanUrl: z.string().url().optional(),
    notes: z.string().trim().optional(),
  })
  .refine((v) => Boolean(v.nominal) || Boolean(v.beratBerasKg), {
    message: 'Isi salah satu: nominal (uang) atau beratBerasKg (beras)',
    path: ['nominal'],
  });

export const goldPriceSchema = z.object({
  pricePerGram: z.number().positive(),
});

export const createMustahiqSchema = z.object({
  namaMustahiq: z.string().trim().min(2, 'Nama mustahik wajib diisi'),
  nik: z.string().trim().min(16, 'NIK minimal 16 digit').optional(),
  kategoriAsnaf: z.enum([
    'FAKIR',
    'MISKIN',
    'AMIL',
    'MUALLAF',
    'RIQAB',
    'GHARIMIN',
    'FISABILILLAH',
    'IBNU_SABIL',
  ]),
  alamat: z.string().trim().optional(),
  noTelepon: z.string().trim().optional(),
  adminNotes: z.string().trim().optional(),
});

const ZAKAT_TYPES = [
  'FITRAH',
  'MAAL_PENGHASILAN',
  'FIDYAH',
  'KAFARAT',
  'EMAS',
  'PERUSAHAAN',
  'PERTANIAN',
] as const;

const zakatOrderFields = {
  namaMuzakki: z.string().trim().min(2, 'Nama muzakki wajib diisi'),
  noTelepon: z.string().trim().optional(),
  alamat: z.string().trim().optional(),
  isAnonymous: z.boolean().optional(),
  jenisZakat: z.enum(ZAKAT_TYPES),
  metodePembayaran: z.enum(['TUNAI', 'TRANSFER', 'BERAS']),
  nominal: z.number().positive().optional(),
  beratBerasKg: z.number().positive().optional(),
  jumlahJiwa: z.number().int().positive().optional(),
  notes: z.string().trim().optional(),
};

const zakatAmountRefinement = {
  check: (v: {
    metodePembayaran?: 'TUNAI' | 'TRANSFER' | 'BERAS';
    nominal?: number;
    beratBerasKg?: number;
  }) =>
    v.metodePembayaran === undefined ||
    (v.metodePembayaran === 'BERAS'
      ? Boolean(v.beratBerasKg)
      : Boolean(v.nominal)),
  message: {
    message: 'Metode BERAS wajib beratBerasKg; metode uang wajib nominal',
    path: ['nominal'],
  },
};

/** Zakat yang dicatat langsung oleh admin (kasir/transfer yang dikonfirmasi). */
export const recordZakatSchema = z
  .object(zakatOrderFields)
  .refine(zakatAmountRefinement.check, zakatAmountRefinement.message);

export const updateZakatOrderSchema = z
  .object({
    id: z.string().min(1),
    ...zakatOrderFields,
    status: z.enum(['MENUNGGU_VERIFIKASI', 'TERVERIFIKASI', 'DITOLAK']),
  })
  .partial()
  .required({ id: true })
  .refine(zakatAmountRefinement.check, zakatAmountRefinement.message);

export const fitrahConfigSchema = z.object({
  jenisBeras: z.string().trim().min(2, 'Jenis beras wajib diisi'),
  konversiHargaPerJiwa: z
    .number()
    .positive('Konversi harga per jiwa wajib lebih dari 0'),
  referensiSk: z.string().trim().optional(),
  tahunBerlaku: z.string().trim().optional(),
});
