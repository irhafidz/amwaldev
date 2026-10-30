import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * URL media bertanda tangan (`/api/media/<bucket>/<path>?exp=&sig=`), D4: dasar
 * akses berkas privat (kuitansi) dan izin unggah avatar di penyimpanan lokal
 * VPS. Tanda tangan mengikat metode + kunci objek + waktu kedaluwarsa, jadi
 * tautan baca tidak bisa dipakai menulis, dan tautan satu objek tidak bisa
 * dipakai untuk objek lain.
 *
 * Kunci diturunkan dari `JWT_SECRET` (label tetap) sehingga tidak perlu rahasia
 * baru di produksi; mengganti `JWT_SECRET` otomatis mencabut semua tautan.
 */

export type MediaMethod = 'GET' | 'PUT';

const KEY_LABEL = 'amwal-media-url-v1';
const MIN_SECRET_LENGTH = 32;

function signingKey(): Buffer {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      'Fail-closed: JWT_SECRET (minimal 32 karakter) diperlukan untuk menandatangani URL media.'
    );
  }
  return createHmac('sha256', secret).update(KEY_LABEL).digest();
}

function mac(method: MediaMethod, objectKey: string, exp: number): string {
  return createHmac('sha256', signingKey())
    .update(`${method}\n${objectKey}\n${exp}`)
    .digest('base64url');
}

export function signMediaUrl(params: {
  bucket: string;
  path: string;
  expiresInSeconds: number;
  method?: MediaMethod;
  /** Disuntikkan tes; default `Date.now()`. */
  now?: number;
}): string {
  const method = params.method ?? 'GET';
  const exp =
    Math.floor((params.now ?? Date.now()) / 1000) + params.expiresInSeconds;
  const objectKey = `${params.bucket}/${params.path}`;
  return `/api/media/${objectKey}?exp=${exp}&sig=${mac(method, objectKey, exp)}`;
}

export function verifyMediaSignature(params: {
  method: MediaMethod;
  bucket: string;
  path: string;
  exp: string | null;
  sig: string | null;
  now?: number;
}): boolean {
  if (!(params.exp && params.sig)) {
    return false;
  }
  const exp = Number(params.exp);
  if (
    !Number.isSafeInteger(exp) ||
    exp < Math.floor((params.now ?? Date.now()) / 1000)
  ) {
    return false;
  }
  const expected = Buffer.from(
    mac(params.method, `${params.bucket}/${params.path}`, exp)
  );
  const given = Buffer.from(params.sig);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
