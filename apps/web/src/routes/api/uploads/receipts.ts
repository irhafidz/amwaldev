import path from 'node:path';
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
import { and, eq } from 'drizzle-orm';
import { ulid } from 'ulidx';
import { resolveRequestUser } from '@/lib/auth/core';
import { db } from '@/lib/db';
import {
  programProgressReports,
  programReceiptAttachments,
  waqfPrograms,
} from '@/lib/db/schema';
import { readStreamWithCutoff } from '@/lib/uploads/read-body';

/**
 * Admin Receipt Upload Route (Sprint 11, [I-2])
 * Pure HTTP route — deliberately NOT an oRPC procedure because the 5 MB file size
 * limit must be strictly enforced while streaming the request body without trusting
 * the client-supplied `Content-Length` header.
 *
 * Security Invariants:
 * 1. ADMIN-only access guard before any processing.
 * 2. Streaming Cutoff: Rejects immediately at byte (5 MB + 1) without buffering unbounded payloads.
 * 3. Authentic Magic Bytes Validation (fail-closed): Checks raw binary headers for JPEG, PNG, WebP, PDF.
 *    Strictly rejects HTML, SVG, executable binaries, and unknown types.
 * 4. Safe Object Key format: `amwal-receipts/<programId>/<ulid>.<ext>` — original filename never enters object key.
 * 5. Private Storage Only: Only the object key is stored in the database. Signed URLs are never persisted.
 * 6. Orphan File Compensation: If database insertion fails, the uploaded object in storage is immediately deleted.
 */

type PayloadResult =
  | {
      ok: true;
      fileBytes: Uint8Array;
      fileName: string;
      waqfProgramId: string;
      progressReportId: string | null;
      isPhotoEvidence: boolean;
      nominal: string | null;
      title: string | null;
      vendorName: string | null;
    }
  | { ok: false; error: string; status: number };

type UploadedFileMeta = {
  attachmentId: string;
  cleanBaseName: string;
  objectKey: string;
  detectedMime: string;
  bucket: string;
  storagePath: string;
};

type UploadMetaResult =
  | { ok: true; meta: UploadedFileMeta }
  | { ok: false; error: string; status: number };

async function parseMultipartData(
  contentType: string,
  rawBody: Uint8Array,
  url: URL
): Promise<PayloadResult> {
  try {
    const bodyBuffer = new ArrayBuffer(rawBody.byteLength);
    new Uint8Array(bodyBuffer).set(rawBody);
    const subRequest = new Request('http://localhost', {
      method: 'POST',
      headers: { 'content-type': contentType },
      body: bodyBuffer,
    });
    const formData = await subRequest.formData();
    const file = formData.get('file');

    if (!file || typeof file === 'string') {
      return {
        ok: false,
        error:
          'Bad Request: Bidang berkas (file) wajib disertakan dalam formulir',
        status: 400,
      };
    }

    const waqfProgramId =
      (formData.get('waqfProgramId') as string | null) ||
      (formData.get('programId') as string | null) ||
      url.searchParams.get('waqfProgramId') ||
      url.searchParams.get('programId');

    if (!waqfProgramId?.trim()) {
      return {
        ok: false,
        error: 'Bad Request: waqfProgramId wajib diisi',
        status: 400,
      };
    }

    const progressReportId =
      (formData.get('progressReportId') as string | null) ||
      url.searchParams.get('progressReportId');
    const isPhotoParam = formData.get('isPhotoEvidence');
    const isPhotoEvidence =
      isPhotoParam === 'true' ||
      isPhotoParam === '1' ||
      url.searchParams.get('isPhotoEvidence') === 'true';
    const nominalParam =
      (formData.get('nominal') as string | null) ||
      url.searchParams.get('nominal');
    const nominal =
      nominalParam && Number.isFinite(Number(nominalParam))
        ? nominalParam.trim()
        : null;
    const title = (formData.get('title') as string | null)?.trim() || null;
    const vendorName =
      (formData.get('vendorName') as string | null)?.trim() || null;

    return {
      ok: true,
      fileBytes: new Uint8Array(await file.arrayBuffer()),
      fileName: file.name || 'receipt',
      waqfProgramId: waqfProgramId.trim(),
      progressReportId: progressReportId?.trim() || null,
      isPhotoEvidence,
      nominal,
      title,
      vendorName,
    };
  } catch {
    return {
      ok: false,
      error: 'Bad Request: Gagal mem-parse multipart form data',
      status: 400,
    };
  }
}

function parseBinaryData(request: Request, rawBody: Uint8Array): PayloadResult {
  const url = new URL(request.url);
  const waqfProgramId =
    url.searchParams.get('waqfProgramId') ||
    url.searchParams.get('programId') ||
    request.headers.get('x-waqf-program-id');

  if (!waqfProgramId?.trim()) {
    return {
      ok: false,
      error: 'Bad Request: waqfProgramId wajib diisi',
      status: 400,
    };
  }

  const fileName =
    request.headers.get('x-file-name') ||
    url.searchParams.get('fileName') ||
    'receipt';
  const progressReportId =
    url.searchParams.get('progressReportId') ||
    request.headers.get('x-progress-report-id');
  const isPhotoEvidence =
    url.searchParams.get('isPhotoEvidence') === 'true' ||
    request.headers.get('x-is-photo-evidence') === 'true';
  const nominalParam =
    url.searchParams.get('nominal') || request.headers.get('x-nominal');
  const nominal =
    nominalParam && Number.isFinite(Number(nominalParam))
      ? nominalParam.trim()
      : null;
  const title =
    (url.searchParams.get('title') || request.headers.get('x-title'))?.trim() ||
    null;
  const vendorName =
    (
      url.searchParams.get('vendorName') || request.headers.get('x-vendor-name')
    )?.trim() || null;

  return {
    ok: true,
    fileBytes: rawBody,
    fileName,
    waqfProgramId: waqfProgramId.trim(),
    progressReportId: progressReportId?.trim() || null,
    isPhotoEvidence,
    nominal,
    title,
    vendorName,
  };
}

async function validateProgramAndReport(
  waqfProgramId: string,
  progressReportId: string | null
): Promise<{ error: string; status: number } | null> {
  const [program] = await db
    .select({ id: waqfPrograms.id })
    .from(waqfPrograms)
    .where(eq(waqfPrograms.id, waqfProgramId))
    .limit(1);

  if (!program) {
    return {
      error: 'Not Found: Program wakaf tidak ditemukan',
      status: 404,
    };
  }

  if (progressReportId) {
    const [report] = await db
      .select({ id: programProgressReports.id })
      .from(programProgressReports)
      .where(
        and(
          eq(programProgressReports.id, progressReportId),
          eq(programProgressReports.waqfProgramId, waqfProgramId)
        )
      )
      .limit(1);

    if (!report) {
      return {
        error: 'Not Found: Laporan progres tidak ditemukan untuk program ini',
        status: 404,
      };
    }
  }

  return null;
}

async function validateAndUploadReceipt(
  fileBytes: Uint8Array,
  fileName: string,
  waqfProgramId: string
): Promise<UploadMetaResult> {
  const detectedMime = detectMimeTypeFromBuffer(fileBytes);
  if (!detectedMime) {
    return {
      ok: false,
      error:
        'Format berkas tidak diizinkan. Hanya berkas JPEG, PNG, WebP, dan PDF yang didukung.',
      status: 400,
    };
  }

  const extension = getExtensionFromMimeType(detectedMime);
  if (!extension) {
    return {
      ok: false,
      error: 'Format berkas tidak valid',
      status: 400,
    };
  }

  const fileId = ulid().toLowerCase();
  const attachmentId = `PRA-${ulid().toLowerCase()}`;
  const objectKey = buildReceiptObjectKey({
    bucket: 'amwal-receipts',
    programId: waqfProgramId,
    fileId,
    extension,
  });

  const cleanBaseName =
    path.basename(fileName).slice(0, 200) || `${fileId}.${extension}`;
  const { bucket, path: storagePath } = parseReceiptObjectKey(objectKey);

  try {
    await uploadReceiptFile({
      bucket,
      path: storagePath,
      fileBody: fileBytes,
      mimeType: detectedMime,
    });
  } catch (storageError) {
    return {
      ok: false,
      error: `Gagal mengunggah berkas ke penyimpanan: ${
        storageError instanceof Error
          ? storageError.message
          : 'Unknown storage error'
      }`,
      status: 500,
    };
  }

  return {
    ok: true,
    meta: {
      attachmentId,
      cleanBaseName,
      objectKey,
      detectedMime,
      bucket,
      storagePath,
    },
  };
}

async function saveAttachmentWithCompensation(params: {
  meta: UploadedFileMeta;
  waqfProgramId: string;
  progressReportId: string | null;
  fileSize: number;
  isPhotoEvidence: boolean;
  nominal: string | null;
  title: string | null;
  vendorName: string | null;
  userId: string;
}): Promise<Response> {
  const {
    meta,
    waqfProgramId,
    progressReportId,
    fileSize,
    isPhotoEvidence,
    nominal,
    title,
    vendorName,
    userId,
  } = params;

  try {
    const [record] = await db
      .insert(programReceiptAttachments)
      .values({
        id: meta.attachmentId,
        waqfProgramId,
        progressReportId,
        objectKey: meta.objectKey,
        fileName: meta.cleanBaseName,
        title,
        vendorName,
        mimeType: meta.detectedMime,
        fileSize,
        isPhotoEvidence,
        nominal,
        uploadedById: userId,
      })
      .returning();

    return Response.json(
      {
        success: true,
        data: record,
      },
      { status: 201 }
    );
  } catch (dbError) {
    try {
      await deleteReceiptFile({
        bucket: meta.bucket,
        path: meta.storagePath,
      });
    } catch {
      // Compensate silently
    }

    return Response.json(
      {
        error: `Gagal menyimpan metadata lampiran: ${
          dbError instanceof Error ? dbError.message : 'Unknown database error'
        }`,
      },
      { status: 500 }
    );
  }
}

export async function handle({
  request,
}: {
  request: Request;
}): Promise<Response> {
  const user = await resolveRequestUser(request);
  if (!user) {
    return Response.json(
      { error: 'Unauthorized: sesi tidak valid atau sudah berakhir' },
      { status: 401 }
    );
  }

  if (user.role !== 'ADMIN') {
    return Response.json(
      { error: 'Forbidden: Insufficient privileges' },
      { status: 403 }
    );
  }

  if (!request.body) {
    return Response.json(
      { error: 'Bad Request: Permintaan tidak memiliki badan data' },
      { status: 400 }
    );
  }

  const streamResult = await readStreamWithCutoff(
    request.body,
    MAX_RECEIPT_FILE_SIZE_BYTES
  );
  if (!streamResult.ok) {
    return Response.json(
      { error: streamResult.error },
      { status: streamResult.status }
    );
  }

  const contentType = request.headers.get('content-type') ?? '';
  const url = new URL(request.url);
  const payloadResult = contentType.includes('multipart/form-data')
    ? await parseMultipartData(contentType, streamResult.rawBody, url)
    : parseBinaryData(request, streamResult.rawBody);

  if (!payloadResult.ok) {
    return Response.json(
      { error: payloadResult.error },
      { status: payloadResult.status }
    );
  }

  const {
    fileBytes,
    fileName,
    waqfProgramId,
    progressReportId,
    isPhotoEvidence,
    nominal,
    title,
    vendorName,
  } = payloadResult;

  const validationError = await validateProgramAndReport(
    waqfProgramId,
    progressReportId
  );
  if (validationError) {
    return Response.json(
      { error: validationError.error },
      { status: validationError.status }
    );
  }

  const uploadResult = await validateAndUploadReceipt(
    fileBytes,
    fileName,
    waqfProgramId
  );
  if (!uploadResult.ok) {
    return Response.json(
      { error: uploadResult.error },
      { status: uploadResult.status }
    );
  }

  return saveAttachmentWithCompensation({
    meta: uploadResult.meta,
    waqfProgramId,
    progressReportId,
    fileSize: fileBytes.byteLength,
    isPhotoEvidence,
    nominal,
    title,
    vendorName,
    userId: user.userId,
  });
}

export const ServerRoute = createServerFileRoute(
  '/api/uploads/receipts'
).methods({
  POST: handle,
});
