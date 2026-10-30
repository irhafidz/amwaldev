import { z } from 'zod';

/**
 * Extracted verbatim from `apps/server/src/routes/admin/qurban.ts` (Putaran
 * 17, Batch 1).
 */
/** Redaksi akad wakalah bila belum ada akad QURBAN aktif yang dipublikasikan. */
export const DEFAULT_AKAD_WAKALAH_QURBAN =
  "Saya mewakilkan dan menyerahkan sepenuhnya pembelian, penyembelihan secara syar'i, dan pendistribusian hewan qurban ini kepada Lembaga Amil Amwal lillahi ta'ala.";

/**
 * Foto katalog hewan (QA Test#1): berkas yang diunggah admin ke volume media
 * (`/api/media/qurban-photos/<nama>`), atau tautan http(s) lama yang sudah
 * tersimpan. Path relatif lain ditolak.
 */
const QURBAN_PHOTO_PATH =
  /^\/api\/media\/qurban-photos\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const HTTP_URL = /^https?:\/\//i;
export const fotoRefSchema = z
  .string()
  .trim()
  .refine(
    (value) =>
      QURBAN_PHOTO_PATH.test(value) ||
      (HTTP_URL.test(value) && z.url().safeParse(value).success),
    'Foto tidak valid'
  );

export const batchSchema = z.object({
  jenisHewan: z.enum(['SAPI', 'KAMBING']),
  totalSlot: z.number().int().positive().max(7),
  hargaPerSlot: z.number().positive(),
  ras: z.string().trim().optional(),
  kelasGrade: z.string().trim().optional(),
  estimasiBeratKg: z.number().positive().optional(),
  wilayahPenyaluran: z.string().trim().optional(),
  targetPenerimaManfaat: z.number().int().positive().optional(),
  namaBatch: z.string().trim().optional(),
  lokasiRph: z.string().trim().optional(),
  timJuleha: z.string().trim().optional(),
  fotoUrl: fotoRefSchema.optional(),
  tanggalPenyembelihanEstimasi: z.string().trim().min(1).optional(),
});

/**
 * Jenis hewan & jumlah slot tidak bisa diubah setelah batch dibuat: slot
 * sudah dibuat dan bisa jadi sudah dipesan. Harga hanya bisa diubah selama
 * belum ada slot terpakai (divalidasi di server).
 */
export const updateBatchSchema = batchSchema
  .omit({ jenisHewan: true, totalSlot: true })
  .partial()
  .extend({
    id: z.string().min(1),
    status: z.enum(['TERSEDIA', 'PENUH', 'SELESAI']).optional(),
    fotoUrl: fotoRefSchema.or(z.literal('')).optional(),
  });

export const dokumentasiMediaSchema = z.object({
  url: z.string().trim().url('URL dokumentasi tidak valid'),
  label: z.string().trim().min(1).max(120),
  type: z.enum(['image', 'video']),
});

export const batchDocumentationSchema = z.object({
  id: z.string().min(1),
  dokumentasiVideoUrl: z
    .string()
    .trim()
    .url('URL video tidak valid')
    .or(z.literal('')),
  dokumentasiMedia: z.array(dokumentasiMediaSchema).max(30),
});

const shohibulFields = {
  namaPengqurban: z.string().trim().min(2, 'Nama pemesan wajib diisi'),
  namaShohibul: z.string().trim().min(2, 'Lafazh nama shohibul wajib diisi'),
  /** Opsional untuk entri admin; bila diisi dipakai untuk laporan WhatsApp. */
  teleponPengqurban: z.string().trim().optional(),
  alamatPengqurban: z.string().trim().optional(),
  opsiPesan: z.enum(['PASRAH', 'AMBIL_SENDIRI']),
};

/** Pendaftaran shohibul oleh admin (pembayaran diterima di luar gateway). */
export const registerShohibulSchema = z.object({
  hewanBatchId: z.string().min(1),
  /** Slot tertentu yang diklik admin; kosong = slot tersedia terkecil. */
  nomorSlot: z.number().int().positive().optional(),
  ...shohibulFields,
  metodePembayaran: z.enum(['TUNAI', 'TRANSFER']),
  statusPembayaran: z.enum(['BELUM_BAYAR', 'DP', 'LUNAS']).default('LUNAS'),
  nominalDibayar: z.number().nonnegative().optional(),
  akadWakalahText: z.string().trim().min(10).optional(),
});

export const updateShohibulSchema = z
  .object({
    id: z.string().min(1),
    ...shohibulFields,
    statusPembayaran: z.enum(['BELUM_BAYAR', 'DP', 'LUNAS']),
    nominalDibayar: z.number().nonnegative(),
  })
  .partial()
  .required({ id: true });

export const sendQurbanReportSchema = z.object({
  orderIds: z.array(z.string().min(1)).min(1).max(200),
});

export const allocationSchema = z.object({
  hewanBatchId: z.string().min(1),
  qurbanOrderId: z.string().min(1).optional(),
  jumlahBagian: z.number().positive().optional(),
  tanggalSalur: z.string().min(1).optional(),
  buktiFotoUrl: z.string().url().optional(),
});
