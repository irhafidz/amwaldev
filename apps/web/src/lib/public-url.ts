import { env } from '@/env/server';

/**
 * Alamat publik aplikasi (`https://amwal.id`) untuk tautan yang dibaca ORANG
 * LAIN: tombol "Kembali ke Merchant" di Mayar, QR sertifikat, dan sebagainya.
 *
 * Sebelumnya `PUBLIC_APP_URL` punya default `http://localhost:3000`, sehingga
 * produksi yang lupa mengisinya mengirim donatur ke `localhost` setelah
 * membayar (ERR_CONNECTION_REFUSED di ponsel). Urutan sekarang:
 *
 *  1. `PUBLIC_APP_URL`, lalu `APP_URL` / `NEXT_PUBLIC_APP_URL` (nama warisan)
 *  2. header proxy `x-forwarded-host` + `x-forwarded-proto` (Traefik/Dokploy)
 *  3. hanya di luar produksi: `http://localhost:3000`
 *  4. di produksi tanpa jawaban yang valid: galat jelas, BUKAN localhost
 *
 * Nilai yang menunjuk ke host lokal diabaikan di produksi — itu salah
 * konfigurasi, bukan alamat yang bisa dijangkau donatur.
 */

const DEV_ORIGIN = 'http://localhost:3000';
const LOCAL_HOST = /^(localhost|127(\.\d+){3}|0\.0\.0\.0|\[::1\])$/i;

export interface PublicOriginInput {
  /** Nilai konfigurasi, urutan prioritas sudah diurutkan pemanggil. */
  configured: (string | undefined)[];
  /** Header permintaan masuk; hanya `x-forwarded-*` yang dipercaya. */
  headers?: Headers;
  nodeEnv: string;
}

function parseOrigin(value: string | undefined): URL | null {
  if (!value?.trim()) {
    return null;
  }
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

const isLocal = (url: URL) => LOCAL_HOST.test(url.hostname);

function fromForwardedHeaders(headers: Headers | undefined): URL | null {
  const host = headers?.get('x-forwarded-host')?.split(',')[0]?.trim();
  if (!host) {
    return null;
  }
  const proto =
    headers?.get('x-forwarded-proto')?.split(',')[0]?.trim() || 'https';
  return parseOrigin(`${proto}://${host}`);
}

export function resolvePublicOrigin(input: PublicOriginInput): string {
  const production = input.nodeEnv === 'production';
  const candidates = [
    ...input.configured.map(parseOrigin),
    fromForwardedHeaders(input.headers),
  ];

  for (const candidate of candidates) {
    if (candidate && !(production && isLocal(candidate))) {
      return candidate.origin;
    }
  }

  if (!production) {
    return DEV_ORIGIN;
  }
  throw new Error(
    'Alamat publik aplikasi tidak diketahui: isi PUBLIC_APP_URL (mis. https://amwal.id). Tautan kembali dari pembayaran tidak boleh menunjuk ke localhost.'
  );
}

/** Untuk tampilan admin: `null` bila alamat publik belum bisa ditentukan. */
export function safePublicOrigin(request?: Request): string | null {
  try {
    return publicOrigin(request);
  } catch {
    return null;
  }
}

/** Alamat publik untuk permintaan ini, memakai konfigurasi server. */
export function publicOrigin(request?: Request): string {
  return resolvePublicOrigin({
    configured: [env.PUBLIC_APP_URL, env.APP_URL, env.NEXT_PUBLIC_APP_URL],
    headers: request?.headers,
    nodeEnv: env.NODE_ENV,
  });
}
