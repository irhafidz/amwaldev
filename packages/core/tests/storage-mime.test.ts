import { describe, expect, test } from 'bun:test';
import {
  buildReceiptObjectKey,
  createReceiptSignedUrl,
  deleteReceiptFile,
  parseReceiptObjectKey,
  type StorageClientLike,
  setStorageClient,
  uploadReceiptFile,
} from '../src/storage/files';
import {
  detectMimeTypeFromBuffer,
  getExtensionFromMimeType,
  isAllowedReceiptMimeType,
} from '../src/storage/mime';

describe('storage/mime - detectMimeTypeFromBuffer', () => {
  test('detects valid JPEG magic bytes (FF D8 FF)', () => {
    const jpegBuffer = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
    ]);
    expect(detectMimeTypeFromBuffer(jpegBuffer)).toBe('image/jpeg');
    expect(getExtensionFromMimeType('image/jpeg')).toBe('jpg');
    expect(isAllowedReceiptMimeType('image/jpeg')).toBe(true);
  });

  test('detects valid PNG magic bytes (89 50 4E 47 0D 0A 1A 0A)', () => {
    const pngBuffer = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
    ]);
    expect(detectMimeTypeFromBuffer(pngBuffer)).toBe('image/png');
    expect(getExtensionFromMimeType('image/png')).toBe('png');
    expect(isAllowedReceiptMimeType('image/png')).toBe(true);
  });

  test('detects valid WebP magic bytes (RIFF....WEBP)', () => {
    const webpBuffer = new Uint8Array([
      0x52,
      0x49,
      0x46,
      0x46, // 'RIFF'
      0x24,
      0x00,
      0x00,
      0x00, // length
      0x57,
      0x45,
      0x42,
      0x50, // 'WEBP'
      0x56,
      0x50,
      0x38,
      0x20, // 'VP8 '
    ]);
    expect(detectMimeTypeFromBuffer(webpBuffer)).toBe('image/webp');
    expect(getExtensionFromMimeType('image/webp')).toBe('webp');
    expect(isAllowedReceiptMimeType('image/webp')).toBe(true);
  });

  test('detects valid PDF magic bytes (%PDF-)', () => {
    const pdfBuffer = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj');
    expect(detectMimeTypeFromBuffer(pdfBuffer)).toBe('application/pdf');
    expect(getExtensionFromMimeType('application/pdf')).toBe('pdf');
    expect(isAllowedReceiptMimeType('application/pdf')).toBe(true);
  });

  test('rejects HTML buffers (<html or <!doctype html)', () => {
    const html1 = Buffer.from('<html><head></head><body>receipt</body></html>');
    const html2 = Buffer.from(
      '<!DOCTYPE html><html><body>malicious payload</body></html>'
    );
    const leadingWhitespaceHtml = Buffer.from(
      '   \n\t <html lang="id"><body>kuitansi palsu</body></html>'
    );

    expect(detectMimeTypeFromBuffer(html1)).toBeNull();
    expect(detectMimeTypeFromBuffer(html2)).toBeNull();
    expect(detectMimeTypeFromBuffer(leadingWhitespaceHtml)).toBeNull();
  });

  test('rejects SVG buffers (<svg or <?xml)', () => {
    const svg1 = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40"/></svg>'
    );
    const svg2 = Buffer.from(
      '<?xml version="1.0" encoding="UTF-8"?><svg><text>receipt</text></svg>'
    );
    const leadingWhitespaceSvg = Buffer.from(
      '   <svg version="1.1"><rect width="300" height="100"/></svg>'
    );

    expect(detectMimeTypeFromBuffer(svg1)).toBeNull();
    expect(detectMimeTypeFromBuffer(svg2)).toBeNull();
    expect(detectMimeTypeFromBuffer(leadingWhitespaceSvg)).toBeNull();
  });

  test('rejects binary executables and scripts', () => {
    const dosExe = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03]); // MZ
    const elf = new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01]); // ELF
    const shellScript = Buffer.from('#!/bin/bash\necho "exploit"');
    const javaClass = new Uint8Array([0xca, 0xfe, 0xba, 0xbe, 0x00]);

    expect(detectMimeTypeFromBuffer(dosExe)).toBeNull();
    expect(detectMimeTypeFromBuffer(elf)).toBeNull();
    expect(detectMimeTypeFromBuffer(shellScript)).toBeNull();
    expect(detectMimeTypeFromBuffer(javaClass)).toBeNull();
  });

  test('rejects empty, short, or random buffers', () => {
    expect(detectMimeTypeFromBuffer(new Uint8Array([]))).toBeNull();
    expect(detectMimeTypeFromBuffer(new Uint8Array([0x01, 0x02]))).toBeNull();
    expect(
      detectMimeTypeFromBuffer(
        new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x01, 0x02])
      )
    ).toBeNull();
  });

  test('rejects corrupted headers', () => {
    // Corrupted JPEG (3rd byte is 0x00 instead of 0xff)
    const corruptedJpeg = new Uint8Array([0xff, 0xd8, 0x00, 0xe0]);
    expect(detectMimeTypeFromBuffer(corruptedJpeg)).toBeNull();

    // Corrupted WebP (missing WEBP marker at offset 8)
    const corruptedWebp = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x20, 0x00, 0x00, 0x00, 0x41, 0x42, 0x43, 0x44,
    ]);
    expect(detectMimeTypeFromBuffer(corruptedWebp)).toBeNull();
  });
});

describe('storage/files - helpers & fail-closed operations', () => {
  test('builds and parses canonical receipt object keys', () => {
    const key = buildReceiptObjectKey({
      programId: 101,
      fileId: '01JG8VTESTULID000000000001',
      extension: '.pdf',
    });

    expect(key).toBe('amwal-receipts/101/01JG8VTESTULID000000000001.pdf');

    const parsed = parseReceiptObjectKey(key);
    expect(parsed.bucket).toBe('amwal-receipts');
    expect(parsed.path).toBe('101/01JG8VTESTULID000000000001.pdf');
  });

  test('parseReceiptObjectKey throws on malformed keys', () => {
    expect(() => parseReceiptObjectKey('invalid-key-without-slash')).toThrow(
      /Invalid object key format/
    );
    expect(() => parseReceiptObjectKey('/empty-bucket')).toThrow(
      /Invalid object key components/
    );
  });

  test('uploadReceiptFile succeeds with valid client and fails closed on error', async () => {
    const mockSuccessClient: StorageClientLike = {
      storage: {
        from: (bucket: string) => ({
          upload: (path, _body, _opts) => {
            expect(bucket).toBe('amwal-receipts');
            expect(path).toBe('prog-1/sample.jpg');
            return Promise.resolve({
              data: { path },
              error: null,
            });
          },
          createSignedUrl: () =>
            Promise.resolve({
              data: { signedUrl: 'https://example.com/signed' },
              error: null,
            }),
          remove: () => Promise.resolve({ data: [], error: null }),
        }),
      },
    };

    const res = await uploadReceiptFile({
      bucket: 'amwal-receipts',
      path: 'prog-1/sample.jpg',
      fileBody: new Uint8Array([0xff, 0xd8, 0xff]),
      mimeType: 'image/jpeg',
      client: mockSuccessClient,
    });

    expect(res.path).toBe('prog-1/sample.jpg');

    // Fail-closed test: storage returns error
    const mockFailureClient: StorageClientLike = {
      storage: {
        from: () => ({
          upload: () =>
            Promise.resolve({
              data: null,
              error: { message: 'Bucket quota exceeded' },
            }),
          createSignedUrl: () => Promise.resolve({ data: null, error: null }),
          remove: () => Promise.resolve({ data: null, error: null }),
        }),
      },
    };

    await expect(
      uploadReceiptFile({
        bucket: 'amwal-receipts',
        path: 'prog-1/sample.jpg',
        fileBody: new Uint8Array([0xff, 0xd8, 0xff]),
        mimeType: 'image/jpeg',
        client: mockFailureClient,
      })
    ).rejects.toThrow(/Bucket quota exceeded/);
  });

  test('createReceiptSignedUrl respects 600s default TTL and fails closed', async () => {
    let capturedTtl = 0;
    const mockClient: StorageClientLike = {
      storage: {
        from: () => ({
          upload: () => Promise.resolve({ data: null, error: null }),
          createSignedUrl: (_path, expiresIn) => {
            capturedTtl = expiresIn;
            return Promise.resolve({
              data: {
                signedUrl:
                  'https://xyz.supabase.co/storage/v1/object/sign/receipt.pdf?token=abc',
              },
              error: null,
            });
          },
          remove: () => Promise.resolve({ data: null, error: null }),
        }),
      },
    };

    const signedUrl = await createReceiptSignedUrl({
      bucket: 'amwal-receipts',
      path: '101/receipt.pdf',
      client: mockClient,
    });

    expect(capturedTtl).toBe(600); // 10 minutes default TTL
    expect(signedUrl).toContain('https://xyz.supabase.co');

    // Failure case
    const mockFailClient: StorageClientLike = {
      storage: {
        from: () => ({
          upload: () => Promise.resolve({ data: null, error: null }),
          createSignedUrl: () =>
            Promise.resolve({
              data: null,
              error: { message: 'Object not found' },
            }),
          remove: () => Promise.resolve({ data: null, error: null }),
        }),
      },
    };

    await expect(
      createReceiptSignedUrl({
        bucket: 'amwal-receipts',
        path: '101/nonexistent.pdf',
        client: mockFailClient,
      })
    ).rejects.toThrow(/Object not found/);
  });

  test('deleteReceiptFile fails closed if removal fails', async () => {
    let deletedPath = '';
    const mockClient: StorageClientLike = {
      storage: {
        from: () => ({
          upload: () => Promise.resolve({ data: null, error: null }),
          createSignedUrl: () => Promise.resolve({ data: null, error: null }),
          remove: (paths) => {
            deletedPath = paths[0] ?? '';
            return Promise.resolve({ data: paths, error: null });
          },
        }),
      },
    };

    await deleteReceiptFile({
      bucket: 'amwal-receipts',
      path: '101/temp.pdf',
      client: mockClient,
    });

    expect(deletedPath).toBe('101/temp.pdf');

    const mockFailClient: StorageClientLike = {
      storage: {
        from: () => ({
          upload: () => Promise.resolve({ data: null, error: null }),
          createSignedUrl: () => Promise.resolve({ data: null, error: null }),
          remove: () =>
            Promise.resolve({
              data: null,
              error: { message: 'Network timeout during deletion' },
            }),
        }),
      },
    };

    await expect(
      deleteReceiptFile({
        bucket: 'amwal-receipts',
        path: '101/temp.pdf',
        client: mockFailClient,
      })
    ).rejects.toThrow(/Network timeout during deletion/);
  });

  test('fails closed in production when MEDIA_ROOT is not configured', async () => {
    setStorageClient(null);
    const oldEnv = process.env.NODE_ENV;
    const oldRoot = process.env.MEDIA_ROOT;

    try {
      process.env.NODE_ENV = 'production';
      Reflect.deleteProperty(process.env, 'MEDIA_ROOT');

      await expect(
        uploadReceiptFile({
          bucket: 'amwal-receipts',
          path: 'sample.pdf',
          fileBody: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
          mimeType: 'application/pdf',
        })
      ).rejects.toThrow(/MEDIA_ROOT belum diatur/);
    } finally {
      process.env.NODE_ENV = oldEnv;
      if (oldRoot === undefined) {
        Reflect.deleteProperty(process.env, 'MEDIA_ROOT');
      } else {
        process.env.MEDIA_ROOT = oldRoot;
      }
    }
  });
});
