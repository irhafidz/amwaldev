import type { CmsStatus, CmsType } from '@amwal/core/contracts/cms';
import { orpc } from '@/lib/orpc/client';

/**
 * Data layer CMS admin (Sprint 11, I-9) untuk halaman Berita & Edukasi.
 *
 * Berita dan edukasi berbagi satu tabel `education_contents`; skema hanya
 * mengenal `tipe` ARTIKEL/VIDEO, kategori teks bebas, dan siklus
 * DRAFT → PUBLISHED → ARCHIVED. Field desain lain (tag, lokasi, suka,
 * komentar, pin) belum punya kolom sehingga tidak dikirim dari UI.
 */

export interface AdminCmsItem {
  id: string;
  judul: string;
  tipe: CmsType;
  kontenUrl: string | null;
  kategori: string | null;
  slug: string | null;
  body: string | null;
  coverUrl: string | null;
  publishedAt: string | null;
  authorId: string | null;
  status: CmsStatus;
  createdAt: string;
}

export interface CmsDraft {
  judul: string;
  tipe: CmsType;
  kategori: string;
  body: string;
  coverUrl: string;
  kontenUrl: string;
  status: CmsStatus;
}

/** Batas maksimum `adminListCmsSchema.limit`. */
const CMS_PAGE_LIMIT = 100;
const NON_SLUG_CHARS = /[^a-z0-9]+/g;
const EDGE_DASHES = /^-+|-+$/g;
const HTTP_URL = /^https?:\/\//i;
const MARKDOWN_MARKS = /[#*`_>[\]]/g;
const WHITESPACE_RUN = /\s+/g;

export function getAdminCmsItems(type?: CmsType): Promise<AdminCmsItem[]> {
  return orpc.admin.cms
    .list({ type, limit: CMS_PAGE_LIMIT, offset: 0 })
    .then((r) => r.items as AdminCmsItem[]);
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(NON_SLUG_CHARS, '-')
    .replace(EDGE_DASHES, '');
}

/** Hanya URL http(s) yang boleh dirender sebagai `src`/`href`. */
export function safeHttpUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && HTTP_URL.test(trimmed) ? trimmed : null;
}

function toPayload(draft: CmsDraft) {
  const slug = slugify(draft.judul);
  return {
    judul: draft.judul.trim(),
    slug: slug || undefined,
    tipe: draft.tipe,
    kategori: draft.kategori.trim(),
    body: draft.body.trim(),
    coverUrl: draft.coverUrl.trim(),
    kontenUrl: draft.kontenUrl.trim(),
    status: draft.status,
  };
}

export function createCmsItem(draft: CmsDraft): Promise<unknown> {
  return orpc.admin.cms.create(toPayload(draft));
}

export function updateCmsItem(id: string, draft: CmsDraft): Promise<unknown> {
  return orpc.admin.cms.update({ id, ...toPayload(draft) });
}

export function publishCmsItem(id: string): Promise<unknown> {
  return orpc.admin.cms.publish({ id });
}

export function archiveCmsItem(id: string): Promise<unknown> {
  return orpc.admin.cms.archive({ id });
}

export function deleteCmsItem(id: string): Promise<unknown> {
  return orpc.admin.cms.delete({ id });
}

export function summarize(body: string | null, max = 150): string {
  if (!body) {
    return '';
  }
  const plain = body
    .replace(MARKDOWN_MARKS, '')
    .replace(WHITESPACE_RUN, ' ')
    .trim();
  return plain.length > max ? `${plain.slice(0, max)}…` : plain;
}
