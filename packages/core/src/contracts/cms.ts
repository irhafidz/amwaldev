import { z } from 'zod';

/**
 * CMS contracts (Sprint 11, I-9 — Zone 1).
 *
 * Status menggunakan text + CHECK constraint di database ('DRAFT', 'PUBLISHED', 'ARCHIVED')
 * untuk mencegah pelanggaran enum rule (db/MIGRATION_RULES.md Rule 6).
 */

export const CMS_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export type CmsStatus = (typeof CMS_STATUSES)[number];
export const cmsStatusSchema = z.enum(CMS_STATUSES);

export const CMS_TYPES = ['ARTIKEL', 'VIDEO'] as const;
export type CmsType = (typeof CMS_TYPES)[number];
export const cmsTypeSchema = z.enum(CMS_TYPES);

/** Regex slug: huruf kecil, angka, dipisahkan tanda minus (kebab-case). */
export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const cmsArticleSchema = z.object({
  id: z.string(),
  judul: z.string().min(1, 'Judul wajib diisi'),
  tipe: cmsTypeSchema,
  kontenUrl: z.string().nullable().optional(),
  kategori: z.string().nullable().optional(),
  slug: z.string().nullable().optional(),
  body: z.string().nullable().optional(),
  coverUrl: z.string().nullable().optional(),
  publishedAt: z.string().nullable().optional(),
  authorId: z.string().nullable().optional(),
  status: cmsStatusSchema,
  createdAt: z.string(),
});

export type CmsArticle = z.infer<typeof cmsArticleSchema>;

// --- PUBLIC SCHEMAS ---

export const listCmsSchema = z.object({
  type: cmsTypeSchema.optional(),
  kategori: z.string().trim().optional(),
  search: z.string().trim().optional(),
  limit: z.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

export const getCmsBySlugSchema = z.object({
  slug: z.string().trim().min(1, 'Slug wajib diisi'),
});

export const getCmsByIdSchema = z.object({
  id: z.string().trim().min(1, 'ID wajib diisi'),
});

// --- ADMIN SCHEMAS ---

export const adminListCmsSchema = z.object({
  type: cmsTypeSchema.optional(),
  status: cmsStatusSchema.optional(),
  kategori: z.string().trim().optional(),
  search: z.string().trim().optional(),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

export const createCmsArticleSchema = z.object({
  judul: z.string().trim().min(1, 'Judul wajib diisi'),
  slug: z
    .string()
    .trim()
    .min(1, 'Slug wajib diisi')
    .regex(
      SLUG_REGEX,
      'Format slug harus berupa huruf kecil, angka, dan tanda hubung (-)'
    )
    .optional(),
  tipe: cmsTypeSchema.default('ARTIKEL'),
  kontenUrl: z
    .string()
    .trim()
    .url('URL konten tidak valid')
    .optional()
    .or(z.literal('')),
  kategori: z.string().trim().optional().or(z.literal('')),
  body: z.string().trim().optional().or(z.literal('')),
  coverUrl: z.string().trim().optional().or(z.literal('')),
  status: cmsStatusSchema.default('DRAFT'),
});

export const updateCmsArticleSchema = z.object({
  id: z.string().trim().min(1, 'ID wajib diisi'),
  judul: z.string().trim().min(1, 'Judul wajib diisi').optional(),
  slug: z
    .string()
    .trim()
    .min(1, 'Slug wajib diisi')
    .regex(
      SLUG_REGEX,
      'Format slug harus berupa huruf kecil, angka, dan tanda hubung (-)'
    )
    .optional(),
  tipe: cmsTypeSchema.optional(),
  kontenUrl: z
    .string()
    .trim()
    .url('URL konten tidak valid')
    .optional()
    .or(z.literal('')),
  kategori: z.string().trim().optional().or(z.literal('')),
  body: z.string().trim().optional().or(z.literal('')),
  coverUrl: z.string().trim().optional().or(z.literal('')),
  status: cmsStatusSchema.optional(),
});

export const deleteCmsArticleSchema = z.object({
  id: z.string().trim().min(1, 'ID wajib diisi'),
});

export const publishCmsArticleSchema = z.object({
  id: z.string().trim().min(1, 'ID wajib diisi'),
});

export const archiveCmsArticleSchema = z.object({
  id: z.string().trim().min(1, 'ID wajib diisi'),
});
