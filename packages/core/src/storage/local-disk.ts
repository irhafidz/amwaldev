import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { signMediaUrl } from './media-url';
import type { StorageClientLike } from './types';

/**
 * Penyimpanan media di disk lokal VPS (keputusan D4): satu volume Docker
 * persisten (`MEDIA_ROOT`, di produksi `amwal_media`), tanpa layanan eksternal.
 *
 * Aturan yang ditegakkan DI SINI (bukan hanya di pemanggil), karena modul inilah
 * yang menyentuh filesystem:
 * - bucket harus terdaftar di `MEDIA_BUCKETS`;
 * - setiap segmen path hanya `[A-Za-z0-9._-]`, tidak diawali titik, sehingga
 *   `..`, `/`, `\`, byte NUL, dan nama tersembunyi tidak mungkin lolos;
 * - hasil resolve dipastikan tetap di dalam `MEDIA_ROOT`;
 * - hanya ekstensi gambar/PDF yang boleh ditulis, dan tipe konten saat dibaca
 *   diturunkan dari ekstensi — bukan dari apa pun yang tersimpan.
 */

export type MediaAccess = 'public' | 'signed';

/** Bucket yang dikenal, dan apakah bacanya publik atau butuh URL bertanda tangan. */
export const MEDIA_BUCKETS = {
  'user-avatars': 'public',
  'qurban-photos': 'public',
  'amwal-receipts': 'signed',
} as const satisfies Record<string, MediaAccess>;

export type MediaBucket = keyof typeof MEDIA_BUCKETS;

const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const MAX_SEGMENTS = 3;

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
};

export function isMediaBucket(value: string): value is MediaBucket {
  return Object.hasOwn(MEDIA_BUCKETS, value);
}

/** Tipe konten dari ekstensi nama berkas; `null` bila bukan yang diizinkan. */
export function contentTypeFor(fileName: string): string | null {
  const dot = fileName.lastIndexOf('.');
  if (dot < 0) {
    return null;
  }
  return CONTENT_TYPES[fileName.slice(dot + 1).toLowerCase()] ?? null;
}

/** Path penuh di disk, atau `null` bila bucket/path tidak aman. */
export function resolveObjectPath(
  root: string,
  bucket: string,
  path: string
): string | null {
  if (!isMediaBucket(bucket)) {
    return null;
  }
  const segments = path.split('/');
  if (
    segments.length > MAX_SEGMENTS ||
    !segments.every((segment) => SEGMENT.test(segment))
  ) {
    return null;
  }
  const last = segments.at(-1) ?? '';
  if (contentTypeFor(last) === null) {
    return null;
  }
  const base = resolve(root, bucket);
  const full = resolve(base, ...segments);
  return full.startsWith(`${base}${sep}`) ? full : null;
}

export async function readMediaObject(
  root: string,
  bucket: string,
  path: string
): Promise<{ body: Uint8Array<ArrayBuffer>; contentType: string } | null> {
  const full = resolveObjectPath(root, bucket, path);
  const contentType = contentTypeFor(path);
  if (!(full && contentType)) {
    return null;
  }
  try {
    const bytes = await readFile(full);
    const body = new Uint8Array(new ArrayBuffer(bytes.byteLength));
    body.set(bytes);
    return { body, contentType };
  } catch {
    return null;
  }
}

const exists = (full: string): Promise<boolean> =>
  stat(full).then(
    () => true,
    () => false
  );

const invalidPath = (path: string) => ({
  data: null,
  error: { message: `Path media tidak valid: ${path}` },
});

export function createLocalDiskStorageClient(root: string): StorageClientLike {
  return {
    storage: {
      from: (bucket) => ({
        upload: async (path, fileBody, fileOptions) => {
          const full = resolveObjectPath(root, bucket, path);
          if (!full) {
            return invalidPath(path);
          }
          if (!fileOptions?.upsert && (await exists(full))) {
            return {
              data: null,
              error: { message: `Berkas sudah ada: ${path}` },
            };
          }
          await mkdir(dirname(full), { recursive: true });
          // Tulis ke berkas sementara lalu rename: pembaca tidak pernah
          // melihat berkas setengah jadi, dan kegagalan tidak merusak yang lama.
          const temp = `${full}.${crypto.randomUUID()}.tmp`;
          try {
            await writeFile(temp, fileBody);
            await rename(temp, full);
          } catch (error) {
            await rm(temp, { force: true });
            return {
              data: null,
              error: {
                message:
                  error instanceof Error ? error.message : 'Gagal menulis',
              },
            };
          }
          return { data: { path }, error: null };
        },

        createSignedUrl: (path, expiresIn) => {
          if (!resolveObjectPath(root, bucket, path)) {
            return Promise.resolve({
              data: null,
              error: { message: `Path media tidak valid: ${path}` },
            });
          }
          return Promise.resolve({
            data: {
              signedUrl: signMediaUrl({
                bucket,
                path,
                expiresInSeconds: expiresIn,
              }),
            },
            error: null,
          });
        },

        remove: async (paths) => {
          for (const path of paths) {
            const full = resolveObjectPath(root, bucket, path);
            if (full) {
              await rm(full, { force: true });
            }
          }
          return { data: paths, error: null };
        },
      }),
    },
  };
}

/** Akar penyimpanan: `MEDIA_ROOT`; di luar produksi default ke `./.media`. */
export function mediaRoot(): string {
  const configured = process.env.MEDIA_ROOT?.trim();
  if (configured) {
    return resolve(configured);
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Fail-closed: MEDIA_ROOT belum diatur (volume media persisten, mis. /app/media).'
    );
  }
  return join(process.cwd(), '.media');
}
