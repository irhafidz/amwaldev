import { sql } from 'drizzle-orm';
import { waqfPrograms } from '@/lib/db/schema';

/**
 * Banner, RAB dan dokumen legalitas program wakaf disimpan di database sebagai
 * data URI base64 (satu program nyata: banner 557 KB, RAB 722 KB, legalitas
 * 1 MB). Dulu daftar program ikut mengirim semuanya di dalam JSON — ±2,3 MB
 * untuk SATU program, dibaca ulang dari DB di setiap kunjungan `/wakaf`, dan
 * tidak bisa di-cache atau dimuat malas oleh browser.
 *
 * Sekarang API publik mengganti data URI dengan tautan ke
 * `/api/waqf-media/<id>/<jenis>` (lihat routes/api/waqf-media.$id.$kind.ts):
 * JSON turun jadi beberapa ratus byte, dan gambar diunduh terpisah, malas, dan
 * di-cache browser. Query pun tidak lagi menarik megabyte dari database —
 * kolomnya diganti `NULL` di SQL bila isinya data URI.
 */

export type WaqfMediaKind = 'banner' | 'rab' | 'legal';

const OWN_MEDIA_URL = /^\/api\/waqf-media\//;

/**
 * Tautan `/api/waqf-media/...` hanyalah PENUNJUK ke kolom itu sendiri. Form
 * edit admin mengirim balik nilai yang ia terima; bila tautan ini ditulis ke
 * DB, data URI aslinya hilang dan tautannya menunjuk ke dirinya sendiri.
 * Karena itu nilai seperti ini berarti "tidak diubah".
 */
export function isOwnMediaUrl(value: string | null | undefined): boolean {
  return typeof value === 'string' && OWN_MEDIA_URL.test(value.trim());
}

/** Buang field media yang tidak diubah (masih tautan ke dirinya sendiri). */
export function withoutUnchangedMedia<
  T extends {
    bannerUrl?: string | null;
    rabDocumentUrl?: string | null;
    dokumenLegalitasUrl?: string | null;
  },
>(fields: T): T {
  return {
    ...fields,
    bannerUrl: isOwnMediaUrl(fields.bannerUrl) ? undefined : fields.bannerUrl,
    rabDocumentUrl: isOwnMediaUrl(fields.rabDocumentUrl)
      ? undefined
      : fields.rabDocumentUrl,
    dokumenLegalitasUrl: isOwnMediaUrl(fields.dokumenLegalitasUrl)
      ? undefined
      : fields.dokumenLegalitasUrl,
  };
}

export const MEDIA_COLUMNS = {
  banner: waqfPrograms.bannerUrl,
  rab: waqfPrograms.rabDocumentUrl,
  legal: waqfPrograms.dokumenLegalitasUrl,
} as const;

type MediaColumn = (typeof MEDIA_COLUMNS)[WaqfMediaKind];

const withoutInline = (column: MediaColumn) =>
  sql<
    string | null
  >`case when ${column} like 'data:%' then null else ${column} end`;
const isInline = (column: MediaColumn) =>
  sql<boolean>`coalesce(${column} like 'data:%', false)`;

/** Kolom media untuk SELECT publik: tanpa isi data URI, plus penanda "ada". */
export const publicMediaColumns = {
  bannerUrl: withoutInline(waqfPrograms.bannerUrl),
  rabDocumentUrl: withoutInline(waqfPrograms.rabDocumentUrl),
  dokumenLegalitasUrl: withoutInline(waqfPrograms.dokumenLegalitasUrl),
  bannerInline: isInline(waqfPrograms.bannerUrl),
  rabInline: isInline(waqfPrograms.rabDocumentUrl),
  legalInline: isInline(waqfPrograms.dokumenLegalitasUrl),
};

export function mediaUrl(
  programId: string,
  kind: WaqfMediaKind,
  updatedAt: string
): string {
  // `v` memutus cache saat konten diubah; selebihnya URL boleh di-cache lama.
  return `/api/waqf-media/${encodeURIComponent(programId)}/${kind}?v=${encodeURIComponent(updatedAt)}`;
}

interface MediaRow {
  bannerInline: boolean;
  bannerUrl: string | null;
  dokumenLegalitasUrl: string | null;
  id: string;
  legalInline: boolean;
  rabDocumentUrl: string | null;
  rabInline: boolean;
  updatedAt: string;
}

export function withMediaUrls<T extends MediaRow>(row: T) {
  const { bannerInline, rabInline, legalInline, ...rest } = row;
  return {
    ...rest,
    bannerUrl: bannerInline
      ? mediaUrl(row.id, 'banner', row.updatedAt)
      : row.bannerUrl,
    rabDocumentUrl: rabInline
      ? mediaUrl(row.id, 'rab', row.updatedAt)
      : row.rabDocumentUrl,
    dokumenLegalitasUrl: legalInline
      ? mediaUrl(row.id, 'legal', row.updatedAt)
      : row.dokumenLegalitasUrl,
  };
}

const DATA_URI = /^data:([\w.+-]+\/[\w.+-]+)(?:;[^,;]*)*;base64,(.*)$/s;

/** Hanya tipe yang aman disajikan inline; SVG/HTML (vektor XSS) sengaja ditolak. */
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
]);

export function parseDataUri(
  value: string
): { bytes: Uint8Array<ArrayBuffer>; mime: string } | null {
  const match = DATA_URI.exec(value);
  const mime = match?.[1]?.toLowerCase();
  const payload = match?.[2];
  if (!(mime && payload && ALLOWED_MIME.has(mime))) {
    return null;
  }
  // Copy into a plain ArrayBuffer-backed array so it is a valid Blob/Response part.
  return { mime, bytes: new Uint8Array(Buffer.from(payload, 'base64')) };
}
