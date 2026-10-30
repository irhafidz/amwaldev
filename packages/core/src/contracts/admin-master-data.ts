import { z } from 'zod';

/**
 * Admin Master Data contracts (Sprint 12, draft "[Add] Master Data -
 * Dashboard Admin"). Backs two picklists — Akad Waqaf and Kategori Waqaf —
 * that previously lived as hardcoded `<select>` options in
 * `wakaf-programs-view.tsx`'s create-program form. One CRUD shape, routed
 * server-side to one of two tables (`akad_waqaf_master` /
 * `kategori_waqaf_master`) by `type`.
 */

export const MASTER_DATA_TYPES = [
  'AKAD_WAQAF',
  'KATEGORI_WAQAF',
  'JENIS_ZAKAT',
  'JENIS_INFAQ',
  'METODE_INFAQ',
] as const;
export type MasterDataType = (typeof MASTER_DATA_TYPES)[number];

/**
 * Jenis zakat & infaq terikat ke enum/CHECK tabel order, jadi barisnya tidak
 * bisa ditambah/dihapus bebas — hanya lewat sinkronisasi kode (lihat
 * `CODED_MASTER_DEFAULTS`). Tipe lain adalah picklist bebas.
 */
export const CODED_MASTER_DATA_TYPES = ['JENIS_ZAKAT', 'JENIS_INFAQ'] as const;
export type CodedMasterDataType = (typeof CODED_MASTER_DATA_TYPES)[number];

export function isCodedMasterDataType(
  type: MasterDataType
): type is CodedMasterDataType {
  return (CODED_MASTER_DATA_TYPES as readonly string[]).includes(type);
}

/** Kode yang diizinkan DB + label bawaan saat pertama kali disinkronkan. */
export const CODED_MASTER_DEFAULTS: Record<
  CodedMasterDataType,
  readonly { kode: string; label: string }[]
> = {
  JENIS_ZAKAT: [
    { kode: 'FITRAH', label: 'Zakat Fitrah' },
    { kode: 'MAAL_PENGHASILAN', label: 'Zakat Maal - Penghasilan' },
    { kode: 'EMAS', label: 'Zakat Maal - Emas/Tabungan' },
    { kode: 'PERUSAHAAN', label: 'Zakat Maal - Perdagangan' },
    { kode: 'PERTANIAN', label: 'Zakat Maal - Pertanian' },
    { kode: 'FIDYAH', label: 'Fidyah' },
    { kode: 'KAFARAT', label: 'Kafarat' },
  ],
  JENIS_INFAQ: [
    { kode: 'INFAQ_SUBUH', label: 'Infaq Subuh' },
    { kode: 'INFAQ_JUMAT', label: 'Infaq Jumat' },
    { kode: 'INFAQ_UMUM', label: 'Infaq Umum' },
    { kode: 'SEDEKAH_YATIM', label: 'Sedekah Yatim' },
    { kode: 'SEDEKAH_OPERASIONAL', label: 'Sedekah Operasional' },
  ],
};

export const JENIS_WAKAF_CODES = ['HABIS_PAKAI', 'PRODUKTIF_KEKAL'] as const;
export const jenisWakafSchema = z.enum(JENIS_WAKAF_CODES);

/**
 * Akad bawaan = opsi yang sebelumnya di-hardcode di form Buat Program Wakaf,
 * plus label untuk jenis wakaf yang sudah dipakai program lama.
 */
export const DEFAULT_AKAD_WAQAF: Record<
  (typeof JENIS_WAKAF_CODES)[number],
  string
> = {
  HABIS_PAKAI: 'Wakaf Melalui Uang (Proyek Fisik)',
  PRODUKTIF_KEKAL: 'Wakaf Uang',
};

/** Kategori bawaan = opsi hardcode lama di form Buat Program Wakaf. */
export const DEFAULT_KATEGORI_WAQAF = [
  'Infrastruktur & Sosial',
  'Pendidikan & Dakwah',
  'Kesehatan',
  'Air Bersih',
  'Agrobisnis',
  'Masjid',
  'Wakaf Produktif & Agrobisnis',
] as const;

/** Kanal penerimaan bawaan untuk sinkronisasi `METODE_INFAQ` pertama kali. */
export const DEFAULT_METODE_INFAQ = [
  'Kasir Tunai / Kotak Infaq',
  'QRIS Syariah (BSI)',
  'BSI Virtual Account',
  'Transfer Bank Muamalat',
  'BCA Syariah',
] as const;
export const masterDataTypeSchema = z.enum(MASTER_DATA_TYPES);

export const listMasterDataSchema = z.object({
  type: masterDataTypeSchema,
  activeOnly: z.boolean().optional(),
});

export const createMasterDataItemSchema = z.object({
  type: masterDataTypeSchema,
  label: z.string().trim().min(1, 'Label wajib diisi'),
  description: z.string().trim().optional().or(z.literal('')),
  sortOrder: z.number().int().default(0),
  /** Wajib untuk `AKAD_WAQAF`: jenis wakaf program yang memakai akad ini. */
  jenisWakaf: jenisWakafSchema.optional(),
});

export const updateMasterDataItemSchema = z.object({
  type: masterDataTypeSchema,
  id: z.string().trim().min(1, 'ID wajib diisi'),
  label: z.string().trim().min(1, 'Label wajib diisi').optional(),
  description: z.string().trim().optional().or(z.literal('')),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  jenisWakaf: jenisWakafSchema.optional(),
});

export const syncMasterDataSchema = z.object({
  type: masterDataTypeSchema,
});

export const deleteMasterDataItemSchema = z.object({
  type: masterDataTypeSchema,
  id: z.string().trim().min(1, 'ID wajib diisi'),
});
