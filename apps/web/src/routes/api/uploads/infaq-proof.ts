import {
  buildReceiptObjectKey,
  deleteReceiptFile,
  parseReceiptObjectKey,
  uploadReceiptFile,
} from '@amwal/core/storage/files';
import {
  detectMimeTypeFromBuffer,
  getExtensionFromMimeType,
  MAX_RECEIPT_FILE_SIZE_BYTES,
} from '@amwal/core/storage/mime';
import { createServerFileRoute } from '@tanstack/react-start/server';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulidx';
import { resolveRequestUser } from '@/lib/auth/core';
import { db } from '@/lib/db';
import { infaqOrders } from '@/lib/db/schema';
import { readStreamWithCutoff } from '@/lib/uploads/read-body';

/**
 * Unggah bukti donasi infaq manual (UAT #4, Finance: "pencatatan infaq kurang
 * kolom untuk upload lampiran"). Rute HTTP murni, bukan oRPC, karena batas
 * 5 MB harus ditegakkan saat streaming (lihat `lib/uploads/read-body.ts`).
 *
 * Invarian (sama dengan unggah kuitansi wakaf):
 * 1. Hanya ADMIN, dan hanya untuk donasi MANUAL (`metode_manual` terisi);
 *    order payment gateway tidak punya lampiran.
 * 2. Tipe berkas dari magic bytes (JPEG, PNG, WebP, PDF), bukan dari klien;
 *    nama berkas asli tidak masuk object key.
 * 3. Penyimpanan privat: hanya object key yang masuk DB
 *    (`infaq_orders.bukti_transaksi`); tautan unduh dibuat sesaat lewat oRPC.
 * 4. Bila DB gagal, berkas baru dihapus lagi; bila berhasil, berkas lama
 *    (penggantian bukti) dihapus.
 */

async function removeStoredFile(objectKey: string): Promise<void> {
  try {
    const { bucket, path } = parseReceiptObjectKey(objectKey);
    await deleteReceiptFile({ bucket, path });
  } catch {
    // Berkas yatim tidak menggagalkan permintaan; hanya tersisa di disk.
  }
}

async function readMultipart(
  contentType: string,
  rawBody: Uint8Array
): Promise<{ file: File; orderId: string } | { error: string }> {
  try {
    const buffer = new ArrayBuffer(rawBody.byteLength);
    new Uint8Array(buffer).set(rawBody);
    const form = await new Request('http://localhost', {
      method: 'POST',
      headers: { 'content-type': contentType },
      body: buffer,
    }).formData();
    const file = form.get('file');
    const orderId = (form.get('infaqOrderId') as string | null)?.trim();
    if (!file || typeof file === 'string') {
      return { error: 'Bad Request: Bidang berkas (file) wajib disertakan' };
    }
    if (!orderId) {
      return { error: 'Bad Request: infaqOrderId wajib diisi' };
    }
    return { file, orderId };
  } catch {
    return { error: 'Bad Request: Gagal mem-parse multipart form data' };
  }
}

const fail = (error: string, status: number) =>
  Response.json({ error }, { status });

async function authorizeAdmin(request: Request): Promise<Response | null> {
  const user = await resolveRequestUser(request);
  if (!user) {
    return fail('Unauthorized: sesi tidak valid atau sudah berakhir', 401);
  }
  if (user.role !== 'ADMIN') {
    return fail('Forbidden: Insufficient privileges', 403);
  }
  return null;
}

async function readUpload(
  request: Request
): Promise<{ file: File; orderId: string } | Response> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!request.body) {
    return fail('Bad Request: Permintaan tidak memiliki badan data', 400);
  }
  const stream = await readStreamWithCutoff(
    request.body,
    MAX_RECEIPT_FILE_SIZE_BYTES
  );
  if (!stream.ok) {
    return fail(stream.error, stream.status);
  }
  if (!contentType.includes('multipart/form-data')) {
    return fail('Bad Request: Gunakan multipart/form-data', 400);
  }
  const parsed = await readMultipart(contentType, stream.rawBody);
  return 'error' in parsed ? fail(parsed.error, 400) : parsed;
}

async function findManualOrder(orderId: string) {
  const [order] = await db
    .select({
      id: infaqOrders.id,
      metodeManual: infaqOrders.metodeManual,
      buktiTransaksi: infaqOrders.buktiTransaksi,
    })
    .from(infaqOrders)
    .where(eq(infaqOrders.id, orderId))
    .limit(1);
  if (!order) {
    return fail('Not Found: Transaksi infaq tidak ditemukan', 404);
  }
  if (order.metodeManual === null) {
    return fail(
      'Bad Request: Lampiran hanya untuk donasi yang dicatat manual oleh admin',
      400
    );
  }
  return order;
}

/** Simpan berkas ke penyimpanan privat lalu tautkan ke order (dengan kompensasi). */
async function storeProof(
  order: { buktiTransaksi: string | null; id: string },
  file: File
): Promise<Response> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = detectMimeTypeFromBuffer(bytes);
  const extension = mime ? getExtensionFromMimeType(mime) : null;
  if (!(mime && extension)) {
    return fail(
      'Format berkas tidak diizinkan. Hanya berkas JPEG, PNG, WebP, dan PDF yang didukung.',
      400
    );
  }

  const objectKey = buildReceiptObjectKey({
    programId: order.id,
    fileId: ulid().toLowerCase(),
    extension,
  });
  const { bucket, path } = parseReceiptObjectKey(objectKey);
  try {
    await uploadReceiptFile({ bucket, path, fileBody: bytes, mimeType: mime });
  } catch (error) {
    return fail(
      `Gagal mengunggah berkas ke penyimpanan: ${
        error instanceof Error ? error.message : 'Unknown storage error'
      }`,
      500
    );
  }

  try {
    await db
      .update(infaqOrders)
      .set({ buktiTransaksi: objectKey, updatedAt: new Date().toISOString() })
      .where(eq(infaqOrders.id, order.id));
  } catch (error) {
    await removeStoredFile(objectKey);
    return fail(
      `Gagal menyimpan lampiran: ${
        error instanceof Error ? error.message : 'Unknown database error'
      }`,
      500
    );
  }

  if (order.buktiTransaksi) {
    await removeStoredFile(order.buktiTransaksi);
  }
  return Response.json(
    { success: true, data: { id: order.id, hasBukti: true, mimeType: mime } },
    { status: 201 }
  );
}

export async function handle({
  request,
}: {
  request: Request;
}): Promise<Response> {
  const denied = await authorizeAdmin(request);
  if (denied) {
    return denied;
  }
  const upload = await readUpload(request);
  if (upload instanceof Response) {
    return upload;
  }
  const order = await findManualOrder(upload.orderId);
  if (order instanceof Response) {
    return order;
  }
  return storeProof(order, upload.file);
}

export const ServerRoute = createServerFileRoute(
  '/api/uploads/infaq-proof'
).methods({
  POST: handle,
});
