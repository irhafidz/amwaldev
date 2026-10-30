import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildReceiptObjectKey,
  createReceiptSignedUrl,
  deleteReceiptFile,
  getSafeStorageClient,
  parseReceiptObjectKey,
  setStorageClient,
  uploadReceiptFile,
} from '../src/storage/files';
import {
  contentTypeFor,
  readMediaObject,
  resolveObjectPath,
} from '../src/storage/local-disk';
import { signMediaUrl, verifyMediaSignature } from '../src/storage/media-url';

/**
 * Penyimpanan media lokal VPS (D4, QA-10): round-trip unggah → URL bertanda
 * tangan → baca → hapus di disk nyata, penjagaan path, dan tanda tangan URL.
 */

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const SECRET = 'media-test-secret-0123456789abcdef0123';
const saved = {
  root: process.env.MEDIA_ROOT,
  secret: process.env.JWT_SECRET,
};
let root = '';

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'amwal-media-test-'));
  process.env.MEDIA_ROOT = root;
  process.env.JWT_SECRET = SECRET;
  setStorageClient(null);
});

afterAll(async () => {
  setStorageClient(null);
  for (const [key, value] of [
    ['MEDIA_ROOT', saved.root],
    ['JWT_SECRET', saved.secret],
  ] as const) {
    if (value === undefined) {
      Reflect.deleteProperty(process.env, key);
    } else {
      process.env[key] = value;
    }
  }
  await rm(root, { recursive: true, force: true });
});

describe('disk round-trip (default client when MEDIA_ROOT is set)', () => {
  test('upload, signed URL, read, delete', async () => {
    const key = buildReceiptObjectKey({
      programId: 'prog-1',
      fileId: '01JG8VTESTULID000000000001',
      extension: 'png',
    });
    const { bucket, path } = parseReceiptObjectKey(key);

    await uploadReceiptFile({
      bucket,
      path,
      fileBody: PNG,
      mimeType: 'image/png',
    });
    expect(new Uint8Array(await readFile(join(root, bucket, path)))).toEqual(
      PNG
    );

    const signed = await createReceiptSignedUrl({
      bucket,
      path,
      expiresInSeconds: 600,
    });
    expect(signed).toStartWith(`/api/media/${bucket}/${path}?exp=`);
    const url = new URL(signed, 'https://amwal.id');
    expect(
      verifyMediaSignature({
        method: 'GET',
        bucket,
        path,
        exp: url.searchParams.get('exp'),
        sig: url.searchParams.get('sig'),
      })
    ).toBe(true);

    const read = await readMediaObject(root, bucket, path);
    expect(read?.contentType).toBe('image/png');

    await deleteReceiptFile({ bucket, path });
    expect(await stat(join(root, bucket, path)).catch(() => null)).toBeNull();
    expect(await readMediaObject(root, bucket, path)).toBeNull();
  });

  test('no overwrite unless upsert is requested', async () => {
    const client = getSafeStorageClient().storage.from('user-avatars');
    const first = await client.upload('a1.png', PNG, { upsert: false });
    expect(first.error).toBeNull();
    const second = await client.upload('a1.png', PNG, { upsert: false });
    expect(second.error?.message).toContain('sudah ada');
    const third = await client.upload('a1.png', PNG, { upsert: true });
    expect(third.error).toBeNull();
    await client.remove(['a1.png']);
  });
});

describe('path safety', () => {
  const resolveIn = (bucket: string, path: string) =>
    resolveObjectPath(root, bucket, path);

  test('accepts ordinary object paths', () => {
    expect(resolveIn('amwal-receipts', 'prog-1/01JG8V.pdf')).toStartWith(root);
    expect(resolveIn('user-avatars', '1790000000000-01jg8v.webp')).toStartWith(
      root
    );
  });

  test.each([
    ['parent traversal', 'amwal-receipts', '../etc/passwd.png'],
    ['nested traversal', 'amwal-receipts', 'a/../../x.png'],
    ['absolute path', 'amwal-receipts', '/etc/passwd.png'],
    ['backslash', 'amwal-receipts', 'a\\b.png'],
    ['NUL byte', 'amwal-receipts', 'a\u0000.png'],
    ['hidden file', 'amwal-receipts', '.htaccess.png'],
    ['empty segment', 'amwal-receipts', 'a//b.png'],
    ['too deep', 'amwal-receipts', 'a/b/c/d.png'],
    ['html extension', 'amwal-receipts', 'x.html'],
    ['svg extension', 'user-avatars', 'x.svg'],
    ['no extension', 'user-avatars', 'x'],
    ['unknown bucket', 'secrets', 'x.png'],
    ['bucket traversal', '..', 'x.png'],
    ['space in name', 'user-avatars', 'my photo.png'],
  ])('rejects %s', (_label, bucket, path) => {
    expect(resolveIn(bucket, path)).toBeNull();
  });

  test('upload rejects unsafe paths instead of writing', async () => {
    const result = await getSafeStorageClient()
      .storage.from('amwal-receipts')
      .upload('../../escape.png', PNG);
    expect(result.error).not.toBeNull();
    expect(result.data).toBeNull();
  });

  test('content type comes from the extension only', () => {
    expect(contentTypeFor('a.JPG')).toBe('image/jpeg');
    expect(contentTypeFor('a.pdf')).toBe('application/pdf');
    expect(contentTypeFor('a.html')).toBeNull();
    expect(contentTypeFor('noext')).toBeNull();
  });
});

describe('signed media URLs', () => {
  const NOW = Date.parse('2026-10-10T00:00:00.000Z');
  const partsOf = (signedUrl: string) => {
    const url = new URL(signedUrl, 'https://amwal.id');
    return {
      exp: url.searchParams.get('exp'),
      sig: url.searchParams.get('sig'),
    };
  };
  const signed = signMediaUrl({
    bucket: 'amwal-receipts',
    path: 'p/a.pdf',
    expiresInSeconds: 600,
    now: NOW,
  });
  const verify = (
    over: Partial<Parameters<typeof verifyMediaSignature>[0]> = {}
  ) =>
    verifyMediaSignature({
      method: 'GET',
      bucket: 'amwal-receipts',
      path: 'p/a.pdf',
      now: NOW + 1000,
      ...partsOf(signed),
      ...over,
    });

  test('valid until expiry, not after', () => {
    expect(verify()).toBe(true);
    expect(verify({ now: NOW + 601_000 })).toBe(false);
  });

  test('bound to method, bucket and path', () => {
    expect(verify({ method: 'PUT' })).toBe(false);
    expect(verify({ path: 'p/b.pdf' })).toBe(false);
    expect(verify({ bucket: 'user-avatars' })).toBe(false);
  });

  test('tampered or missing parts are rejected', () => {
    expect(verify({ sig: 'AAAA' })).toBe(false);
    expect(verify({ exp: String(Number(partsOf(signed).exp) + 3600) })).toBe(
      false
    );
    expect(verify({ exp: null })).toBe(false);
    expect(verify({ sig: null })).toBe(false);
  });

  test('a different secret invalidates old links', () => {
    process.env.JWT_SECRET = 'another-secret-0123456789abcdef012345';
    expect(verify()).toBe(false);
    process.env.JWT_SECRET = SECRET;
  });

  test('refuses to sign without a strong secret', () => {
    process.env.JWT_SECRET = 'short';
    expect(() =>
      signMediaUrl({
        bucket: 'amwal-receipts',
        path: 'a.pdf',
        expiresInSeconds: 60,
      })
    ).toThrow(/JWT_SECRET/);
    process.env.JWT_SECRET = SECRET;
  });
});
