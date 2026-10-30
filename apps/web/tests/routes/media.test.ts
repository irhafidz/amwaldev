import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { signMediaUrl } from '@amwal/core/storage/media-url';

/**
 * `/api/media/*` (D4, QA-10) — rute baca/unggah media di volume lokal VPS.
 * Tanpa DB: memakai direktori sementara sebagai MEDIA_ROOT.
 */

const SECRET = 'media-route-secret-0123456789abcdef01';
const saved = { root: process.env.MEDIA_ROOT, secret: process.env.JWT_SECRET };
let root = '';

process.env.JWT_SECRET = SECRET;
const { handle, AVATAR_MAX_BYTES } = await import(
  '../../src/routes/api/media/$'
);

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const PDF = new TextEncoder().encode('%PDF-1.4 recibo');
const HTML = new TextEncoder().encode('<html><script>alert(1)</script>');

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'amwal-media-route-'));
  process.env.MEDIA_ROOT = root;
  await mkdir(join(root, 'user-avatars'), { recursive: true });
  await mkdir(join(root, 'amwal-receipts', 'prog-1'), { recursive: true });
  await writeFile(join(root, 'user-avatars', 'public.png'), PNG);
  await writeFile(join(root, 'amwal-receipts', 'prog-1', 'nota.pdf'), PDF);
  // Berkas berbahaya yang "kebetulan" ada di disk tidak boleh disajikan.
  await writeFile(join(root, 'user-avatars', 'evil.html'), HTML);
});

afterAll(async () => {
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

const call = (path: string, init?: RequestInit) =>
  handle({ request: new Request(`http://localhost${path}`, init) });

describe('GET', () => {
  test('avatars are public, immutable and sandboxed', async () => {
    const response = await call('/api/media/user-avatars/public.png');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('cache-control')).toContain('immutable');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('content-security-policy')).toContain(
      "default-src 'none'"
    );
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG);
  });

  test('receipts need a valid signed URL', async () => {
    const plain = '/api/media/amwal-receipts/prog-1/nota.pdf';
    expect((await call(plain)).status).toBe(403);
    expect((await call(`${plain}?exp=9999999999&sig=AAAA`)).status).toBe(403);

    const signed = signMediaUrl({
      bucket: 'amwal-receipts',
      path: 'prog-1/nota.pdf',
      expiresInSeconds: 600,
    });
    const ok = await call(signed);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toBe('application/pdf');
    expect(ok.headers.get('cache-control')).toStartWith('private');

    const expired = signMediaUrl({
      bucket: 'amwal-receipts',
      path: 'prog-1/nota.pdf',
      expiresInSeconds: 600,
      now: Date.now() - 3_600_000,
    });
    expect((await call(expired)).status).toBe(403);
  });

  test('a signed URL for one object never opens another', async () => {
    const signed = signMediaUrl({
      bucket: 'amwal-receipts',
      path: 'prog-1/nota.pdf',
      expiresInSeconds: 600,
    });
    const swapped = signed.replace('nota.pdf', 'lain.pdf');
    expect((await call(swapped)).status).toBe(403);
  });

  test.each([
    ['traversal', '/api/media/user-avatars/..%2F..%2Fetc%2Fpasswd.png'],
    ['traversal (raw)', '/api/media/user-avatars/../../etc/passwd.png'],
    ['html on disk', '/api/media/user-avatars/evil.html'],
    ['unknown bucket', '/api/media/secrets/x.png'],
    ['missing file', '/api/media/user-avatars/nope.png'],
    ['bucket only', '/api/media/user-avatars'],
    ['bucket with slash only', '/api/media/user-avatars/'],
  ])('refuses %s', async (_label, path) => {
    expect((await call(path)).status).toBe(404);
  });

  test('unsupported methods get 405', async () => {
    const response = await call('/api/media/user-avatars/public.png', {
      method: 'DELETE',
    });
    expect(response.status).toBe(405);
  });
});

describe('PUT avatar upload', () => {
  const grant = (name: string, method: 'PUT' | 'GET' = 'PUT') =>
    signMediaUrl({
      method,
      bucket: 'user-avatars',
      path: name,
      expiresInSeconds: 300,
    });
  const put = (url: string, body: BodyInit) =>
    call(url, { method: 'PUT', body });

  test('a valid grant stores the image, readable at the public URL', async () => {
    const name = '1790000000000-01jtestupload0000000000001.png';
    const response = await put(grant(name), PNG);
    expect(response.status).toBe(201);
    expect((await response.json()).url).toBe(`/api/media/user-avatars/${name}`);
    expect(
      new Uint8Array(await readFile(join(root, 'user-avatars', name)))
    ).toEqual(PNG);
    expect((await call(`/api/media/user-avatars/${name}`)).status).toBe(200);
  });

  test('a grant can be used once (no overwrite)', async () => {
    const name = '1790000000001-01jtestupload0000000000002.png';
    expect((await put(grant(name), PNG)).status).toBe(201);
    expect((await put(grant(name), PNG)).status).toBe(409);
  });

  test('no grant, a read grant, a tampered grant or another bucket is refused', async () => {
    const name = '1790000000002-01jtestupload0000000000003.png';
    expect((await put(`/api/media/user-avatars/${name}`, PNG)).status).toBe(
      403
    );
    expect((await put(grant(name, 'GET'), PNG)).status).toBe(403);
    expect((await put(grant(name).replace('.png', '.jpg'), JPEG)).status).toBe(
      403
    );
    const receipts = signMediaUrl({
      method: 'PUT',
      bucket: 'amwal-receipts',
      path: 'prog-1/x.png',
      expiresInSeconds: 300,
    });
    expect((await put(receipts, PNG)).status).toBe(404);
  });

  test('the content is checked by magic bytes, not by name or header', async () => {
    const html = '1790000000003-01jtestupload0000000000004.png';
    expect((await put(grant(html), HTML)).status).toBe(400);
    const pdf = '1790000000004-01jtestupload0000000000005.png';
    expect((await put(grant(pdf), PDF)).status).toBe(400);
    // Isi JPEG di nama .png: tipe tidak sesuai, ditolak.
    const mismatch = '1790000000005-01jtestupload0000000000006.png';
    expect((await put(grant(mismatch), JPEG)).status).toBe(400);
    expect(
      await readFile(join(root, 'user-avatars', mismatch)).catch(() => null)
    ).toBeNull();
  });

  test('oversize bodies are rejected while being read, whatever Content-Length says', async () => {
    const name = '1790000000006-01jtestupload0000000000007.png';
    const big = new Uint8Array(AVATAR_MAX_BYTES + 1);
    big.set(PNG);
    expect((await put(grant(name), big)).status).toBe(413);

    // Content-Length bohong (kecil) tetapi isi besar: dihentikan saat membaca.
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(big);
        controller.close();
      },
    });
    const lying = await call(grant(name), {
      method: 'PUT',
      body: stream,
      headers: { 'content-length': '10' },
      // @ts-expect-error — opsi khusus Bun/undici untuk body stream
      duplex: 'half',
    });
    expect(lying.status).toBe(413);
  });
});

describe('PUT qurban photo upload', () => {
  const grant = (name: string) =>
    signMediaUrl({
      method: 'PUT',
      bucket: 'qurban-photos',
      path: name,
      expiresInSeconds: 300,
    });
  const put = (url: string, body: BodyInit) =>
    call(url, { method: 'PUT', body });

  test('stores a catalog photo, publicly readable and immutable', async () => {
    const name = '1790000000100-01jtestqurban00000000001.jpg';
    const response = await put(grant(name), JPEG);
    expect(response.status).toBe(201);
    expect((await response.json()).url).toBe(
      `/api/media/qurban-photos/${name}`
    );
    const read = await call(`/api/media/qurban-photos/${name}`);
    expect(read.status).toBe(200);
    expect(read.headers.get('content-type')).toBe('image/jpeg');
    expect(read.headers.get('cache-control')).toContain('immutable');
  });

  test('allows 5MB (more than an avatar) but not beyond, and checks the content', async () => {
    const ok = new Uint8Array(3 * 1024 * 1024);
    ok.set(PNG);
    expect(
      (await put(grant('1790000000101-01jtestqurban00000000002.png'), ok))
        .status
    ).toBe(201);

    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    big.set(PNG);
    expect(
      (await put(grant('1790000000102-01jtestqurban00000000003.png'), big))
        .status
    ).toBe(413);

    expect(
      (await put(grant('1790000000103-01jtestqurban00000000004.png'), PDF))
        .status
    ).toBe(400);
  });
});
