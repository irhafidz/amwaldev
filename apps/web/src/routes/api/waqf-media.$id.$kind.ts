import { createHash } from 'node:crypto';
import { createServerFileRoute } from '@tanstack/react-start/server';
import { eq } from 'drizzle-orm';
import { resolveRequestUser } from '@/lib/auth/core';
import { db } from '@/lib/db';
import { nadzirProfiles, waqfPrograms } from '@/lib/db/schema';
import {
  MEDIA_COLUMNS,
  parseDataUri,
  type WaqfMediaKind,
} from '@/lib/waqf-media';

/**
 * Banner dan dokumen program wakaf sebagai berkas biasa
 * (`/api/waqf-media/<id>/<banner|rab|legal>?v=<updatedAt>`).
 *
 * Pure HTTP, bukan oRPC: responsnya biner. Mengganti data URI base64 di dalam
 * JSON daftar/detail program — lihat `lib/waqf-media.ts`. Karena URL memuat
 * versi (`v`), respons boleh di-cache setahun (`immutable`) dan divalidasi
 * ulang murah lewat ETag.
 *
 * Akses sama dengan data yang sudah publik lewat `waqf.detail` (banner dan
 * dokumen program yang dipublikasikan). Program DRAFT hanya untuk admin atau
 * Nadzir pemiliknya (daftar program admin memuat DRAFT), dengan cache
 * `private, no-store` agar tidak pernah tersimpan di cache bersama.
 * Hanya gambar raster dan PDF yang dikirim, dengan `nosniff` dan CSP penuh
 * ketat, sehingga isi unggahan tidak pernah dieksekusi sebagai halaman.
 */

const KINDS = new Set<string>(['banner', 'rab', 'legal']);
const ONE_YEAR_SECONDS = 31_536_000;
const HTTP_URL = /^https?:\/\//i;

const notFound = () =>
  new Response('Not found', {
    status: 404,
    headers: { 'Cache-Control': 'no-store' },
  });

export async function handle({
  request,
  params,
}: {
  request: Request;
  params: { id: string; kind: string };
}): Promise<Response> {
  if (!KINDS.has(params.kind)) {
    return notFound();
  }
  const kind = params.kind as WaqfMediaKind;
  const column = MEDIA_COLUMNS[kind];

  const [row] = await db
    .select({
      value: column,
      status: waqfPrograms.status,
      nadzirUserId: nadzirProfiles.userId,
    })
    .from(waqfPrograms)
    .leftJoin(
      nadzirProfiles,
      eq(nadzirProfiles.id, waqfPrograms.nadzirProfileId)
    )
    .where(eq(waqfPrograms.id, params.id))
    .limit(1);

  const isDraft = row?.status === 'DRAFT';
  if (isDraft) {
    const user = await resolveRequestUser(request);
    const allowed =
      user !== null &&
      (user.role === 'ADMIN' || user.userId === row.nadzirUserId);
    if (!allowed) {
      return notFound();
    }
  }

  const value = row?.value?.trim();
  if (!value) {
    return notFound();
  }

  // Sudah berupa URL biasa (bukan data URI): arahkan saja.
  if (HTTP_URL.test(value)) {
    return Response.redirect(value, 302);
  }

  const parsed = parseDataUri(value);
  if (!parsed) {
    return notFound();
  }

  const etag = `"${createHash('sha1').update(parsed.bytes).digest('hex')}"`;
  const headers = {
    'Cache-Control': isDraft
      ? 'private, no-store'
      : `public, max-age=${ONE_YEAR_SECONDS}, immutable`,
    'Content-Security-Policy': "default-src 'none'; sandbox",
    ETag: etag,
    'X-Content-Type-Options': 'nosniff',
  };

  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers });
  }

  return new Response(new Blob([parsed.bytes], { type: parsed.mime }), {
    status: 200,
    headers: {
      ...headers,
      'Content-Type': parsed.mime,
      'Content-Length': String(parsed.bytes.byteLength),
      'Content-Disposition': 'inline',
    },
  });
}

export const ServerRoute = createServerFileRoute(
  '/api/waqf-media/$id/$kind'
).methods({
  GET: handle,
});
