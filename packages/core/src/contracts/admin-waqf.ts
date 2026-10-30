import { z } from 'zod';

/**
 * Extracted verbatim from `apps/server/src/routes/admin/waqf.ts` (Putaran
 * 17, Batch 1) — zero change to shape, messages, or refinement logic. This
 * is the fiqh-adjacent approval surface (program verification, withdrawal
 * review, Nadzir verification); the actual overdraw-rejection invariant
 * itself lives in `@amwal/core/waqf/ledger`, untouched here.
 */
export const verifyProgramSchema = z
  .object({
    status: z.enum(['VERIFIED', 'REJECTED']),
    adminNotes: z.string().trim().min(5).optional(),
  })
  .refine((input) => input.status !== 'REJECTED' || Boolean(input.adminNotes), {
    message: 'adminNotes wajib diisi saat menolak program',
    path: ['adminNotes'],
  });

export const recordYieldSchema = z.object({
  nominal: z.number().positive(),
  periodDate: z.string().min(1),
  description: z.string().min(3),
});

export const progressSchema = z.object({
  persentaseFisik: z.number().min(0).max(100),
  deskripsi: z.string().trim().min(3),
  kuitansiUrls: z.array(z.string().url()).optional(),
  attachmentIds: z.array(z.string().min(1)).optional(),
});

export const receiptsSchema = z.object({
  progressReportId: z.string().min(1).optional(),
  kuitansiUrls: z.array(z.string().url()).min(1),
});

export const mauqufAlaihSchema = z.object({
  namaPenerimaManfaat: z.string().trim().min(2),
  kategoriPenerima: z.string().trim().optional(),
  nominalDisalurkan: z.number().nonnegative().optional(),
  barangDisalurkan: z.string().trim().optional(),
  tanggalPenyaluran: z.string().min(1).optional(),
  buktiPenyaluranUrl: z.string().url().optional(),
  withdrawalRequestId: z.string().min(1).optional(),
  notes: z.string().trim().optional(),
});

export const reviewWithdrawalSchema = z
  .object({
    action: z.enum(['APPROVE', 'REJECT']),
    adminNotes: z.string().trim().min(5).optional(),
  })
  .refine((input) => input.action !== 'REJECT' || Boolean(input.adminNotes), {
    message: 'adminNotes wajib diisi saat menolak pencairan',
    path: ['adminNotes'],
  });

/**
 * Kolom wilayah & dokumen ditambahkan bersamaan (Audit Remote Supabase):
 * cascading Provinsi/Kab-Kota/Kecamatan/Kelurahan dari katalog Kepmendagri
 * (`wilayah.ts`), plus RAB & dokumen legalitas — semuanya opsional karena
 * admin boleh menerbitkan program sebelum scan dokumen tersedia.
 */
/**
 * Absolute URL, `data:` URI, or root-relative asset path (`/assets/...`).
 * `.url()` alone rejected the placeholder banner the admin list falls back
 * to, so editing any program without its own banner failed to save (UAT
 * admin 2026-10-02). Loosening an input rule is not a breaking change.
 */
const assetUrl = z
  .string()
  .trim()
  .refine((value) => value.startsWith('/') || URL.canParse(value), {
    message: 'URL atau path berkas tidak valid',
  });

const wilayahAndDocumentFields = {
  bannerUrl: assetUrl.optional(),
  rabDocumentUrl: assetUrl.optional(),
  dokumenLegalitasUrl: assetUrl.optional(),
  namaBank: z.string().trim().min(1).max(100).optional(),
  nomorRekeningBank: z.string().trim().min(1).max(50).optional(),
  atasNamaRekening: z.string().trim().max(150).optional(),
  provinsi: z.string().trim().max(100).optional(),
  kabupatenKota: z.string().trim().max(100).optional(),
  kecamatan: z.string().trim().max(100).optional(),
  kelurahanDesa: z.string().trim().max(100).optional(),
  kodeWilayah: z.string().trim().max(20).optional(),
};

export const createProgramSchema = z.object({
  nadzirProfileId: z.string().min(1),
  judul: z.string().trim().min(3),
  deskripsi: z.string().trim().min(3),
  kategori: z.string().trim().min(1),
  targetDana: z.number().positive(),
  durasiHari: z.number().int().positive(),
  jenisWakaf: z.enum(['HABIS_PAKAI', 'PRODUKTIF_KEKAL']),
  ...wilayahAndDocumentFields,
});

/**
 * Program tidak pernah pindah Nadzir/akad lewat form ini (perubahan itu
 * berdampak fiqih/ledger dan sengaja tidak dibuka) — hanya metadata
 * tampilan, target dana, dan wilayah/dokumen yang boleh diubah admin.
 */
export const updateProgramSchema = z.object({
  id: z.string().min(1),
  judul: z.string().trim().min(3).optional(),
  deskripsi: z.string().trim().min(3).optional(),
  kategori: z.string().trim().min(1).optional(),
  targetDana: z.number().positive().optional(),
  durasiHari: z.number().int().positive().optional(),
  ...wilayahAndDocumentFields,
});

export const deleteProgramSchema = z.object({
  id: z.string().min(1),
});

export const verifyNadzirSchema = z
  .object({
    status: z.enum(['VERIFIED', 'REJECTED']),
    adminNotes: z.string().trim().min(5).optional(),
    /** Nomor registrasi BWI (D6); hanya disimpan saat status VERIFIED. */
    nomorRegistrasiBwi: z.string().trim().max(100).optional(),
    kontakPublik: z.string().trim().max(300).optional(),
  })
  .refine((input) => input.status !== 'REJECTED' || Boolean(input.adminNotes), {
    message: 'adminNotes wajib diisi saat menolak Nadzir',
    path: ['adminNotes'],
  });

/**
 * Data publik lembaga yang sudah terverifikasi (D6): nomor BWI dan narahubung
 * resmi. Isian kosong menghapus nilainya; field yang tidak dikirim tidak diubah.
 */
export const updateNadzirPublicProfileSchema = z.object({
  id: z.string().min(1),
  nomorRegistrasiBwi: z.string().trim().max(100).optional(),
  kontakPublik: z.string().trim().max(300).optional(),
});
