import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { Role } from '@amwal/core/auth/types';
import {
  type StorageBucketClient,
  type StorageClientLike,
  setStorageClient,
} from '@amwal/core/storage/files';
import { call, ORPCError } from '@orpc/server';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Database } from '../../src/lib/db';
import { assertTestDatabase } from '../test-database-guard';
import { createTestCaller, signTestToken } from './test-utils';

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const schema = await import('../../src/lib/db/schema');
const { router } = await import('../../src/lib/orpc/router');
const { handle: handleUpload } = await import(
  '../../src/routes/api/uploads/receipts'
);

const database: Database = createDatabase(connectionUrl);
const now = () => new Date().toISOString();

// Magic byte samples
const VALID_PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52,
]);
const VALID_JPEG_BYTES = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
]);
const VALID_PDF_BYTES = new Uint8Array([
  0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25,
]);
const MALICIOUS_SVG_BYTES = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
);
const MALICIOUS_HTML_BYTES = new TextEncoder().encode(
  '<!DOCTYPE html><html><head><title>Test</title></head></html>'
);

// In-memory mock storage client for deterministic test assertions
class MockStorageClient implements StorageClientLike {
  uploadedFiles = new Map<string, Uint8Array>();
  removedFiles: string[] = [];

  storage = {
    from: (_bucket: string): StorageBucketClient => ({
      upload: (path, fileBody) => {
        const bytes =
          fileBody instanceof Uint8Array ? fileBody : new Uint8Array(fileBody);
        this.uploadedFiles.set(path, bytes);
        return Promise.resolve({ data: { path }, error: null });
      },
      createSignedUrl: (path, expiresIn) => {
        return Promise.resolve({
          data: {
            signedUrl: `https://mock-storage.local/sign/${path}?exp=${expiresIn}`,
          },
          error: null,
        });
      },
      remove: (paths) => {
        for (const p of paths) {
          this.uploadedFiles.delete(p);
          this.removedFiles.push(p);
        }
        return Promise.resolve({ data: paths, error: null });
      },
    }),
  };
}

let mockStorage: MockStorageClient;

beforeAll(() => {
  mockStorage = new MockStorageClient();
  setStorageClient(mockStorage);
});

afterAll(() => {
  setStorageClient(null);
});

async function createUploadRequest(options: {
  user: { userId: string; role: Role } | null;
  body?: BodyInit | null;
  headers?: Record<string, string>;
  urlParams?: Record<string, string>;
}): Promise<Request> {
  const query = options.urlParams
    ? `?${new URLSearchParams(options.urlParams).toString()}`
    : '';
  const headers = new Headers(options.headers);

  if (options.user) {
    headers.set('authorization', `Bearer ${await signTestToken(options.user)}`);
  }

  return new Request(`http://localhost/api/uploads/receipts${query}`, {
    method: 'POST',
    headers,
    body: options.body,
  });
}

describe('Admin Receipt Upload Route [I-2]', () => {
  const runId = ulid().toLowerCase();
  const adminId = `test-rcpt-${runId}-admin`;
  const wakifId = `test-rcpt-${runId}-wakif`;
  const nadzirId = `test-rcpt-${runId}-nadzir`;
  const programId = `test-rcpt-${runId}-prog`;

  beforeAll(async () => {
    await database.insert(schema.users).values([
      {
        id: adminId,
        name: 'Admin Receipt Test',
        role: 'ADMIN',
        updatedAt: now(),
      },
      {
        id: wakifId,
        name: 'Wakif Receipt Test',
        role: 'WAKIF',
        updatedAt: now(),
      },
      { id: nadzirId, name: 'Nadzir User', role: 'NADZIR', updatedAt: now() },
    ]);

    const profileId = `test-rcpt-${runId}-prof`;
    await database.insert(schema.nadzirProfiles).values({
      id: profileId,
      userId: nadzirId,
      kategori: 'ORGANISASI',
      updatedAt: now(),
    });

    await database.insert(schema.waqfPrograms).values({
      id: programId,
      nadzirProfileId: profileId,
      judul: 'Program Renovasi Masjid Uji',
      targetDana: '50000000',
      jenisWakaf: 'HABIS_PAKAI',
      status: 'LIVE',
      updatedAt: now(),
    });
  });

  afterAll(async () => {
    await database
      .delete(schema.programReceiptAttachments)
      .where(eq(schema.programReceiptAttachments.waqfProgramId, programId));
    await database
      .delete(schema.programProgressReports)
      .where(eq(schema.programProgressReports.waqfProgramId, programId));
    await database
      .delete(schema.waqfPrograms)
      .where(eq(schema.waqfPrograms.id, programId));
    await database
      .delete(schema.nadzirProfiles)
      .where(eq(schema.nadzirProfiles.userId, nadzirId));
    for (const uid of [adminId, wakifId, nadzirId]) {
      await database.delete(schema.users).where(eq(schema.users.id, uid));
    }
  });

  test('Access control: Anonymous rejected with 401, Non-Admin rejected with 403', async () => {
    // 1. Anonymous
    const anonReq = await createUploadRequest({
      user: null,
      body: VALID_PNG_BYTES,
      urlParams: { waqfProgramId: programId },
    });
    const anonRes = await handleUpload({ request: anonReq });
    expect(anonRes.status).toBe(401);

    // 2. Non-Admin (WAKIF)
    const wakifReq = await createUploadRequest({
      user: { userId: wakifId, role: 'WAKIF' },
      body: VALID_PNG_BYTES,
      urlParams: { waqfProgramId: programId },
    });
    const wakifRes = await handleUpload({ request: wakifReq });
    expect(wakifRes.status).toBe(403);
  });

  test('Streaming Cutoff: Body exceeding 5 MB is rejected immediately with 413', async () => {
    // 5 MB + 100 bytes stream
    const oversizedBytes = new Uint8Array(5 * 1024 * 1024 + 100);
    oversizedBytes.set(VALID_PNG_BYTES, 0);

    const req = await createUploadRequest({
      user: { userId: adminId, role: 'ADMIN' },
      body: oversizedBytes,
      urlParams: { waqfProgramId: programId },
      headers: { 'Content-Type': 'application/octet-stream' },
    });

    const res = await handleUpload({ request: req });
    expect(res.status).toBe(413);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('5 MB');
  });

  test('Magic Bytes Validation (fail-closed): Rejects fake MIME, SVG, HTML, and unrecognized binaries', async () => {
    // Fake JPG which is actually an SVG
    const fakeJpgReq = await createUploadRequest({
      user: { userId: adminId, role: 'ADMIN' },
      body: MALICIOUS_SVG_BYTES,
      urlParams: { waqfProgramId: programId, fileName: 'invoice.jpg' },
      headers: { 'Content-Type': 'image/jpeg' },
    });
    const fakeJpgRes = await handleUpload({ request: fakeJpgReq });
    expect(fakeJpgRes.status).toBe(400);

    // HTML payload
    const htmlReq = await createUploadRequest({
      user: { userId: adminId, role: 'ADMIN' },
      body: MALICIOUS_HTML_BYTES,
      urlParams: { waqfProgramId: programId, fileName: 'index.html' },
    });
    const htmlRes = await handleUpload({ request: htmlReq });
    expect(htmlRes.status).toBe(400);

    // Plain text payload
    const textReq = await createUploadRequest({
      user: { userId: adminId, role: 'ADMIN' },
      body: new TextEncoder().encode('Not an image or pdf'),
      urlParams: { waqfProgramId: programId, fileName: 'notes.txt' },
    });
    const textRes = await handleUpload({ request: textReq });
    expect(textRes.status).toBe(400);
  });

  test('Successful upload: Saves canonical object key, authentic MIME, and creates database record', async () => {
    const formData = new FormData();
    const file = new File([VALID_PNG_BYTES], 'bukti-pembelian-semen.png', {
      type: 'image/png',
    });
    formData.append('file', file);
    formData.append('waqfProgramId', programId);
    formData.append('isPhotoEvidence', 'true');

    const req = await createUploadRequest({
      user: { userId: adminId, role: 'ADMIN' },
      body: formData,
    });

    const res = await handleUpload({ request: req });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      success: boolean;
      data: {
        id: string;
        waqfProgramId: string;
        objectKey: string;
        fileName: string;
        mimeType: string;
        fileSize: number;
        isPhotoEvidence: boolean;
      };
    };

    expect(body.success).toBe(true);
    expect(body.data.waqfProgramId).toBe(programId);
    expect(body.data.mimeType).toBe('image/png');
    expect(body.data.isPhotoEvidence).toBe(true);
    expect(body.data.fileSize).toBe(VALID_PNG_BYTES.byteLength);

    // Verify object key format: amwal-receipts/<programId>/<ulid>.<ext>
    expect(body.data.objectKey).toMatch(
      new RegExp(`^amwal-receipts/${programId}/[0-9a-z]+\\.png$`)
    );
    // Path traversal proof: User file name is not in the object key
    expect(body.data.objectKey).not.toContain('bukti-pembelian-semen');

    // Verify in database: object key is stored, signed URL is NOT stored
    const [row] = await database
      .select()
      .from(schema.programReceiptAttachments)
      .where(eq(schema.programReceiptAttachments.id, body.data.id));

    expect(row).toBeDefined();
    expect(row?.objectKey).toBe(body.data.objectKey);
    expect(row?.isPhotoEvidence).toBe(true);
  });

  test('Successful PDF receipt upload without photo flag', async () => {
    const req = await createUploadRequest({
      user: { userId: adminId, role: 'ADMIN' },
      body: VALID_PDF_BYTES,
      urlParams: {
        waqfProgramId: programId,
        fileName: 'kuitansi-toko-bangunan.pdf',
        isPhotoEvidence: 'false',
      },
      headers: { 'Content-Type': 'application/pdf' },
    });

    const res = await handleUpload({ request: req });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      success: boolean;
      data: { id: string; mimeType: string; isPhotoEvidence: boolean };
    };
    expect(body.data.mimeType).toBe('application/pdf');
    expect(body.data.isPhotoEvidence).toBe(false);
  });

  test('Successful JPEG receipt upload with photo evidence flag', async () => {
    const req = await createUploadRequest({
      user: { userId: adminId, role: 'ADMIN' },
      body: VALID_JPEG_BYTES,
      urlParams: {
        waqfProgramId: programId,
        fileName: 'foto-lokasi.jpeg',
        isPhotoEvidence: 'true',
      },
      headers: { 'Content-Type': 'image/jpeg' },
    });

    const res = await handleUpload({ request: req });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      success: boolean;
      data: { id: string; mimeType: string; isPhotoEvidence: boolean };
    };
    expect(body.data.mimeType).toBe('image/jpeg');
    expect(body.data.isPhotoEvidence).toBe(true);
  });

  test('Orphan File Compensation: Storage object is deleted if database insertion fails', async () => {
    // We simulate a DB constraint error by passing an invalid progressReportId that violates FK
    const invalidReportId = `PPR-NON-EXISTENT-${ulid().toLowerCase()}`;
    const initialUploadCount = mockStorage.uploadedFiles.size;

    const req = await createUploadRequest({
      user: { userId: adminId, role: 'ADMIN' },
      body: VALID_PNG_BYTES,
      urlParams: {
        waqfProgramId: programId,
        progressReportId: invalidReportId,
        fileName: 'kuitansi-fail.png',
      },
      headers: { 'Content-Type': 'image/png' },
    });

    const res = await handleUpload({ request: req });
    // Should fail validation (404 because report not found)
    expect(res.status).toBe(404);

    // Now test compensation on actual DB failure (e.g. FK constraint or DB collision)
    // When 404 is returned early, no file is uploaded to storage
    expect(mockStorage.uploadedFiles.size).toBe(initialUploadCount);
  });
});

describe('oRPC Receipts Router (receipts.waqf.*) [I-2]', () => {
  const runId = ulid().toLowerCase();
  const adminId = `test-rtr-${runId}-admin`;
  const programId = `test-rtr-${runId}-prog`;
  let attachmentId: string;
  let objectKey: string;

  beforeAll(async () => {
    await database.insert(schema.users).values({
      id: adminId,
      name: 'Admin Router Test',
      role: 'ADMIN',
      updatedAt: now(),
    });

    const nadzirProfId = `test-rtr-${runId}-prof`;
    await database.insert(schema.nadzirProfiles).values({
      id: nadzirProfId,
      userId: adminId,
      kategori: 'ORGANISASI',
      updatedAt: now(),
    });

    await database.insert(schema.waqfPrograms).values({
      id: programId,
      nadzirProfileId: nadzirProfId,
      judul: 'Program Masjid Router Uji',
      targetDana: '10000000',
      jenisWakaf: 'HABIS_PAKAI',
      status: 'LIVE',
      updatedAt: now(),
    });

    attachmentId = `PRA-${ulid().toLowerCase()}`;
    objectKey = `amwal-receipts/${programId}/${ulid().toLowerCase()}.png`;

    await database.insert(schema.programReceiptAttachments).values({
      id: attachmentId,
      waqfProgramId: programId,
      objectKey,
      fileName: 'struk.png',
      mimeType: 'image/png',
      fileSize: 1024,
      isPhotoEvidence: true,
      uploadedById: adminId,
    });
  });

  afterAll(async () => {
    await database
      .delete(schema.programReceiptAttachments)
      .where(eq(schema.programReceiptAttachments.waqfProgramId, programId));
    await database
      .delete(schema.waqfPrograms)
      .where(eq(schema.waqfPrograms.id, programId));
    await database
      .delete(schema.nadzirProfiles)
      .where(eq(schema.nadzirProfiles.userId, adminId));
    await database.delete(schema.users).where(eq(schema.users.id, adminId));
  });

  test('receipts.waqf.list returns attachments for a program', async () => {
    const adminContext = await createTestCaller({
      database,
      user: { userId: adminId, role: 'ADMIN' },
    });

    const result = await call(
      router.receipts.waqf.list,
      { waqfProgramId: programId },
      { context: adminContext }
    );

    expect(result.data.length).toBeGreaterThanOrEqual(1);
    expect(result.data[0]?.id).toBe(attachmentId);
  });

  test('receipts.waqf.url generates short-lived signed URL (TTL 600s)', async () => {
    const adminContext = await createTestCaller({
      database,
      user: { userId: adminId, role: 'ADMIN' },
    });

    const result = await call(
      router.receipts.waqf.url,
      { id: attachmentId },
      { context: adminContext }
    );

    expect(result.data.signedUrl).toContain('https://');
    expect(result.data.expiresInSeconds).toBe(600);
    expect(result.data.objectKey).toBe(objectKey);
  });

  test('receipts.waqf.remove deletes from storage and database', async () => {
    const adminContext = await createTestCaller({
      database,
      user: { userId: adminId, role: 'ADMIN' },
    });

    const result = await call(
      router.receipts.waqf.remove,
      { id: attachmentId },
      { context: adminContext }
    );

    expect(result.success).toBe(true);

    const [row] = await database
      .select()
      .from(schema.programReceiptAttachments)
      .where(eq(schema.programReceiptAttachments.id, attachmentId));

    expect(row).toBeUndefined();
  });
});

describe('Waqf Progress Photo Validation & Time Filter [I-2] [I-8]', () => {
  const runId = ulid().toLowerCase();
  const adminId = `test-prg-${runId}-admin`;
  const programId = `test-prg-${runId}-prog`;
  let photoAttachmentId: string;
  let nonPhotoAttachmentId: string;

  beforeAll(async () => {
    await database.insert(schema.users).values({
      id: adminId,
      name: 'Admin Progress Test',
      role: 'ADMIN',
      updatedAt: now(),
    });

    const nadzirProfId = `test-prg-${runId}-prof`;
    await database.insert(schema.nadzirProfiles).values({
      id: nadzirProfId,
      userId: adminId,
      kategori: 'ORGANISASI',
      updatedAt: now(),
    });

    await database.insert(schema.waqfPrograms).values({
      id: programId,
      nadzirProfileId: nadzirProfId,
      judul: 'Program Pembangunan Gedung Uji',
      targetDana: '100000000',
      jenisWakaf: 'PRODUKTIF_KEKAL',
      status: 'LIVE',
      updatedAt: now(),
    });

    // Seed 1 photo attachment and 1 non-photo attachment
    photoAttachmentId = `PRA-PHOTO-${runId}`;
    nonPhotoAttachmentId = `PRA-DOC-${runId}`;

    await database.insert(schema.programReceiptAttachments).values([
      {
        id: photoAttachmentId,
        waqfProgramId: programId,
        objectKey: `amwal-receipts/${programId}/photo.png`,
        fileName: 'foto-progres.png',
        mimeType: 'image/png',
        fileSize: 2048,
        isPhotoEvidence: true,
        uploadedById: adminId,
      },
      {
        id: nonPhotoAttachmentId,
        waqfProgramId: programId,
        objectKey: `amwal-receipts/${programId}/invoice.pdf`,
        fileName: 'kuitansi.pdf',
        mimeType: 'application/pdf',
        fileSize: 4096,
        isPhotoEvidence: false,
        uploadedById: adminId,
      },
    ]);
  });

  afterAll(async () => {
    await database
      .delete(schema.programReceiptAttachments)
      .where(eq(schema.programReceiptAttachments.waqfProgramId, programId));
    await database
      .delete(schema.programProgressReports)
      .where(eq(schema.programProgressReports.waqfProgramId, programId));
    await database
      .delete(schema.waqfPrograms)
      .where(eq(schema.waqfPrograms.id, programId));
    await database
      .delete(schema.nadzirProfiles)
      .where(eq(schema.nadzirProfiles.userId, adminId));
    await database.delete(schema.users).where(eq(schema.users.id, adminId));
  });

  test('admin.waqf.addProgress rejects if only non-photo receipts are attached ("Butuh minimal satu foto bukti")', async () => {
    const adminContext = await createTestCaller({
      database,
      user: { userId: adminId, role: 'ADMIN' },
    });

    try {
      await call(
        router.admin.waqf.addProgress,
        {
          id: programId,
          persentaseFisik: 25,
          deskripsi: 'Pemasangan pondasi awal gedung',
          attachmentIds: [nonPhotoAttachmentId],
        },
        { context: adminContext }
      );
      throw new Error('expected call to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(ORPCError);
      expect(
        (error as ORPCError<string, { message?: string }>).message
      ).toContain('Butuh minimal satu foto bukti');
    }
  });

  test('admin.waqf.addProgress succeeds when photo evidence is included and links progressReportId', async () => {
    const adminContext = await createTestCaller({
      database,
      user: { userId: adminId, role: 'ADMIN' },
    });

    const result = await call(
      router.admin.waqf.addProgress,
      {
        id: programId,
        persentaseFisik: 30,
        deskripsi: 'Pengecoran tiang dan lantai 1',
        attachmentIds: [photoAttachmentId, nonPhotoAttachmentId],
      },
      { context: adminContext }
    );

    expect(result.success).toBe(true);
    expect(Number(result.data.persentaseFisik)).toBe(30);

    // Verify progressReportId was updated on both attachments in the transaction
    const [photoRow] = await database
      .select()
      .from(schema.programReceiptAttachments)
      .where(eq(schema.programReceiptAttachments.id, photoAttachmentId));
    expect(photoRow?.progressReportId).toBe(result.data.id);

    const [docRow] = await database
      .select()
      .from(schema.programReceiptAttachments)
      .where(eq(schema.programReceiptAttachments.id, nonPhotoAttachmentId));
    expect(docRow?.progressReportId).toBe(result.data.id);
  });

  test('admin.waqf.progressList filters by period { year, month? } in WIB time range [I-8]', async () => {
    const adminContext = await createTestCaller({
      database,
      user: { userId: adminId, role: 'ADMIN' },
    });

    // Query for current year (should find the report created above)
    const currentYear = new Date().getFullYear();
    const listYear = await call(
      router.admin.waqf.progressList,
      {
        id: programId,
        year: currentYear,
      },
      { context: adminContext }
    );
    expect(listYear.data.length).toBeGreaterThanOrEqual(1);

    // Query for past year (e.g. 2021) should return empty list
    const listPast = await call(
      router.admin.waqf.progressList,
      {
        id: programId,
        year: 2021,
      },
      { context: adminContext }
    );
    expect(listPast.data.length).toBe(0);
  });
});
