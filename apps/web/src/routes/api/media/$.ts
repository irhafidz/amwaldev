import { getSafeStorageClient } from '@amwal/core/storage/files';
import {
  IMAGE_MIME_TYPES,
  isUploadBucket,
  UPLOAD_LIMIT_BYTES,
} from '@amwal/core/storage/image-upload';
import {
  contentTypeFor,
  isMediaBucket,
  MEDIA_BUCKETS,
  mediaRoot,
  readMediaObject,
  resolveObjectPath,
} from '@amwal/core/storage/local-disk';
import { verifyMediaSignature } from '@amwal/core/storage/media-url';
import { detectMimeTypeFromBuffer } from '@amwal/core/storage/mime';
import { createServerFileRoute } from '@tanstack/react-start/server';

/**
 * Media di volume lokal VPS (keputusan D4, QA-10): `/api/media/<bucket>/<path>`.
 *
 * - GET: `user-avatars` publik (nama objeknya acak dan unik per unggahan, jadi
 *   boleh di-cache lama); `amwal-receipts` hanya dengan URL bertanda tangan
 *   (`?exp=&sig=`, dibuat server saat admin membuka kuitansi).
 * - PUT: hanya bucket di `UPLOAD_LIMIT_BYTES` (`user-avatars`, `qurban-photos`),
 *   hanya dengan URL unggah bertanda tangan yang dibuat prosedur yang sah
 *   (`user.getAvatarUploadUrl`, `admin.qurban.photoUploadUrl`). Server-lah yang
 *   memilih nama objek; isi berkas divalidasi lewat magic bytes (bukan header
 *   Content-Type klien) dan ukurannya dibatasi saat dibaca.
 *
 * Semua path melewati `resolveObjectPath` (allowlist bucket + segmen +
 * ekstensi), dan jawaban selalu `nosniff` dengan CSP `sandbox` supaya isi
 * unggahan tidak pernah dijalankan sebagai halaman.
 */

const ROUTE_PREFIX = '/api/media/';
export const AVATAR_MAX_BYTES = UPLOAD_LIMIT_BYTES['user-avatars'];
const IMAGE_MIME_SET = new Set<string>(IMAGE_MIME_TYPES);
const ONE_YEAR_SECONDS = 31_536_000;
const SIGNED_CACHE_SECONDS = 300;

const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'none'; sandbox",
  'X-Content-Type-Options': 'nosniff',
} as const;

const json = (body: unknown, status: number, extra: HeadersInit = {}) =>
  Response.json(body, {
    status,
    headers: { ...SECURITY_HEADERS, 'Cache-Control': 'no-store', ...extra },
  });

const notFound = () => json({ error: 'Not found' }, 404);

/** Pecah `/api/media/<bucket>/<path...>` menjadi bucket + path (tanpa decode ganda). */
function parseTarget(url: URL): { bucket: string; path: string } | null {
  if (!url.pathname.startsWith(ROUTE_PREFIX)) {
    return null;
  }
  const rest = url.pathname.slice(ROUTE_PREFIX.length);
  const slash = rest.indexOf('/');
  if (slash <= 0 || slash === rest.length - 1) {
    return null;
  }
  return { bucket: rest.slice(0, slash), path: rest.slice(slash + 1) };
}

/** Baca badan permintaan, berhenti begitu melewati `max` byte (Content-Length bisa bohong). */
async function readLimited(
  request: Request,
  max: number
): Promise<Uint8Array | null> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > max || !request.body) {
    return declared > max ? null : new Uint8Array();
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

async function serve(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const target = parseTarget(url);
  if (!(target && isMediaBucket(target.bucket))) {
    return notFound();
  }
  const { bucket, path } = target;

  if (MEDIA_BUCKETS[bucket] === 'signed') {
    const valid = verifyMediaSignature({
      method: 'GET',
      bucket,
      path,
      exp: url.searchParams.get('exp'),
      sig: url.searchParams.get('sig'),
    });
    if (!valid) {
      return json({ error: 'Tautan tidak valid atau sudah kedaluwarsa' }, 403);
    }
  }

  const object = await readMediaObject(mediaRoot(), bucket, path);
  if (!object) {
    return notFound();
  }
  const isPublic = MEDIA_BUCKETS[bucket] === 'public';
  return new Response(object.body, {
    status: 200,
    headers: {
      ...SECURITY_HEADERS,
      'Content-Type': object.contentType,
      'Content-Length': String(object.body.byteLength),
      'Content-Disposition': 'inline',
      'Cache-Control': isPublic
        ? `public, max-age=${ONE_YEAR_SECONDS}, immutable`
        : `private, max-age=${SIGNED_CACHE_SECONDS}`,
    },
  });
}

async function upload(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const target = parseTarget(url);
  if (!(target && isUploadBucket(target.bucket))) {
    return notFound();
  }
  const { bucket, path } = target;

  const valid = verifyMediaSignature({
    method: 'PUT',
    bucket,
    path,
    exp: url.searchParams.get('exp'),
    sig: url.searchParams.get('sig'),
  });
  if (!valid) {
    return json(
      { error: 'Izin unggah tidak valid atau sudah kedaluwarsa' },
      403
    );
  }
  if (!resolveObjectPath(mediaRoot(), bucket, path)) {
    return notFound();
  }

  const maxBytes =
    UPLOAD_LIMIT_BYTES[bucket as keyof typeof UPLOAD_LIMIT_BYTES];
  const bytes = await readLimited(request, maxBytes);
  if (!bytes) {
    return json(
      { error: `Ukuran foto maksimal ${maxBytes / (1024 * 1024)}MB` },
      413
    );
  }
  const mime = detectMimeTypeFromBuffer(bytes);
  if (!(mime && IMAGE_MIME_SET.has(mime))) {
    return json({ error: 'Format foto harus JPG, PNG, atau WebP' }, 400);
  }
  // Nama objek dipilih server dari tipe yang dinyatakan klien; isi aslinya
  // harus cocok, supaya `.png` tidak pernah berisi hal lain.
  if (contentTypeFor(path) !== mime) {
    return json({ error: 'Isi berkas tidak sesuai tipe yang dinyatakan' }, 400);
  }

  const { error } = await getSafeStorageClient()
    .storage.from(bucket)
    .upload(path, bytes, { contentType: mime, upsert: false });
  if (error) {
    return json({ error: 'Gagal menyimpan foto' }, 409);
  }
  return json({ ok: true, url: `${ROUTE_PREFIX}${bucket}/${path}` }, 201);
}

export function handle({ request }: { request: Request }): Promise<Response> {
  if (request.method === 'PUT') {
    return upload(request);
  }
  if (request.method === 'GET' || request.method === 'HEAD') {
    return serve(request);
  }
  return Promise.resolve(
    json({ error: 'Method not allowed' }, 405, { Allow: 'GET, HEAD, PUT' })
  );
}

export const ServerRoute = createServerFileRoute('/api/media/$').methods({
  GET: handle,
  HEAD: handle,
  PUT: handle,
});
