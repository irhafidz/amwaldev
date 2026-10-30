import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { Role } from '@amwal/core/auth/types';
import {
  type StorageBucketClient,
  type StorageClientLike,
  setStorageClient,
} from '@amwal/core/storage/files';
import { call, ORPCError } from '@orpc/server';
import { eq, inArray } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Database } from '../../src/lib/db';
import { assertTestDatabase } from '../test-database-guard';
import { createTestCaller, signTestToken } from './test-utils';

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const schema = await import('../../src/lib/db/schema');
const { router } = await import('../../src/lib/orpc/router');
const { handle: handleUpload } = await import(
  '../../src/routes/api/uploads/infaq-proof'
);

const database: Database = createDatabase(connectionUrl);
const now = () => new Date().toISOString();

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52,
]);
const PDF = new Uint8Array([
  0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25,
]);
const SVG = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
);

class MockStorage implements StorageClientLike {
  files = new Map<string, Uint8Array>();
  removed: string[] = [];
  storage = {
    from: (_bucket: string): StorageBucketClient => ({
      upload: (path, body) => {
        this.files.set(
          path,
          body instanceof Uint8Array ? body : new Uint8Array(body)
        );
        return Promise.resolve({ data: { path }, error: null });
      },
      createSignedUrl: (path, expiresIn) =>
        Promise.resolve({
          data: {
            signedUrl: `https://mock-storage.local/sign/${path}?exp=${expiresIn}`,
          },
          error: null,
        }),
      remove: (paths) => {
        for (const path of paths) {
          this.files.delete(path);
          this.removed.push(path);
        }
        return Promise.resolve({ data: paths, error: null });
      },
    }),
  };
}

let storage: MockStorage;
beforeAll(() => {
  storage = new MockStorage();
  setStorageClient(storage);
});
afterAll(() => setStorageClient(null));

async function uploadRequest(options: {
  user: { userId: string; role: Role } | null;
  orderId?: string;
  bytes?: Uint8Array;
  fileName?: string;
  raw?: BodyInit;
  headers?: Record<string, string>;
}): Promise<Request> {
  const headers = new Headers(options.headers);
  if (options.user) {
    headers.set('authorization', `Bearer ${await signTestToken(options.user)}`);
  }
  let body: BodyInit | undefined = options.raw;
  if (!body) {
    const form = new FormData();
    form.append(
      'file',
      new File(
        [new Uint8Array(options.bytes ?? PNG)],
        options.fileName ?? 'struk.png'
      )
    );
    if (options.orderId) {
      form.append('infaqOrderId', options.orderId);
    }
    body = form;
  }
  return new Request('http://localhost/api/uploads/infaq-proof', {
    method: 'POST',
    headers,
    body,
  });
}

describe('Bukti donasi infaq manual (UAT #4)', () => {
  const run = ulid().toLowerCase();
  const adminId = `test-ifp-${run}-admin`;
  const wakifId = `test-ifp-${run}-wakif`;
  const manualId = `INFM-test-${run}-m`;
  const gatewayId = `INFM-test-${run}-g`;
  const admin = { userId: adminId, role: 'ADMIN' as const };

  const orderRow = (id: string, metodeManual: string | null) => ({
    id,
    orderId: `INF-TEST-${id}`,
    namaPenginfaq: 'Donatur Uji',
    nominal: '100000',
    jenis: 'INFAQ_UMUM',
    status: 'SETTLED',
    metodeManual,
    updatedAt: now(),
  });

  const readKey = async (id: string) =>
    (
      await database
        .select({ key: schema.infaqOrders.buktiTransaksi })
        .from(schema.infaqOrders)
        .where(eq(schema.infaqOrders.id, id))
    )[0]?.key ?? null;

  beforeAll(async () => {
    await database.insert(schema.users).values([
      { id: adminId, name: 'Admin Bukti', role: 'ADMIN', updatedAt: now() },
      { id: wakifId, name: 'Wakif Bukti', role: 'WAKIF', updatedAt: now() },
    ]);
    await database
      .insert(schema.infaqOrders)
      .values([orderRow(manualId, 'TUNAI'), orderRow(gatewayId, null)]);
  });

  afterAll(async () => {
    await database
      .delete(schema.infaqOrders)
      .where(inArray(schema.infaqOrders.id, [manualId, gatewayId]));
    await database
      .delete(schema.users)
      .where(inArray(schema.users.id, [adminId, wakifId]));
  });

  test('akses: anonim 401, non-admin 403', async () => {
    const anon = await handleUpload({
      request: await uploadRequest({ user: null, orderId: manualId }),
    });
    expect(anon.status).toBe(401);
    const wakif = await handleUpload({
      request: await uploadRequest({
        user: { userId: wakifId, role: 'WAKIF' },
        orderId: manualId,
      }),
    });
    expect(wakif.status).toBe(403);
  });

  test('menolak: tanpa orderId, order tak ada, order payment gateway, bukan multipart', async () => {
    const noId = await handleUpload({
      request: await uploadRequest({ user: admin }),
    });
    expect(noId.status).toBe(400);

    const missing = await handleUpload({
      request: await uploadRequest({ user: admin, orderId: 'INFM-tidak-ada' }),
    });
    expect(missing.status).toBe(404);

    const gateway = await handleUpload({
      request: await uploadRequest({ user: admin, orderId: gatewayId }),
    });
    expect(gateway.status).toBe(400);
    expect(((await gateway.json()) as { error: string }).error).toContain(
      'manual'
    );

    const raw = await handleUpload({
      request: await uploadRequest({
        user: admin,
        raw: PNG,
        headers: { 'content-type': 'application/octet-stream' },
      }),
    });
    expect(raw.status).toBe(400);
  });

  test('magic bytes: SVG berkedok .png ditolak dan tidak ada yang tersimpan', async () => {
    const before = storage.files.size;
    const res = await handleUpload({
      request: await uploadRequest({
        user: admin,
        orderId: manualId,
        bytes: SVG,
        fileName: 'struk.png',
      }),
    });
    expect(res.status).toBe(400);
    expect(storage.files.size).toBe(before);
    expect(await readKey(manualId)).toBeNull();
  });

  test('melebihi 5 MB: 413', async () => {
    const big = new Uint8Array(5 * 1024 * 1024 + 100);
    big.set(PNG, 0);
    const res = await handleUpload({
      request: await uploadRequest({
        user: admin,
        orderId: manualId,
        bytes: big,
      }),
    });
    expect(res.status).toBe(413);
  });

  test('unggah, lihat, ganti, hapus: berkas lama selalu dibuang', async () => {
    // unggah
    const first = await handleUpload({
      request: await uploadRequest({ user: admin, orderId: manualId }),
    });
    expect(first.status).toBe(201);
    const key1 = await readKey(manualId);
    expect(key1).toMatch(
      new RegExp(`^amwal-receipts/${manualId}/[a-z0-9]+\\.png$`)
    );
    expect(storage.files.has(key1?.replace('amwal-receipts/', '') ?? '')).toBe(
      true
    );

    // daftar menandai hasBukti, tautan unduh hanya untuk admin
    const adminCtx = await createTestCaller({ database, user: admin });
    const { data: rows } = await call(
      router.admin.infaq.ordersList,
      {},
      { context: adminCtx }
    );
    expect(rows.find((row) => row.id === manualId)?.hasBukti).toBe(true);
    expect(rows.find((row) => row.id === gatewayId)?.hasBukti).toBe(false);

    const { data: link } = await call(
      router.admin.infaq.proofUrl,
      { id: manualId },
      { context: adminCtx }
    );
    expect(link.signedUrl).toContain('mock-storage.local');
    expect(link.mimeType).toBe('image/png');

    const wakifCtx = await createTestCaller({
      database,
      user: { userId: wakifId, role: 'WAKIF' },
    });
    let denied: unknown;
    try {
      await call(
        router.admin.infaq.proofUrl,
        { id: manualId },
        { context: wakifCtx }
      );
    } catch (error) {
      denied = error;
    }
    expect(denied).toBeInstanceOf(ORPCError);

    // ganti dengan PDF: kunci baru, berkas lama dihapus
    const second = await handleUpload({
      request: await uploadRequest({
        user: admin,
        orderId: manualId,
        bytes: PDF,
        fileName: 'struk.pdf',
      }),
    });
    expect(second.status).toBe(201);
    const key2 = await readKey(manualId);
    expect(key2).toMatch(/\.pdf$/);
    expect(key2).not.toBe(key1);
    expect(storage.removed).toContain(key1?.replace('amwal-receipts/', ''));

    // hapus lampiran
    await call(
      router.admin.infaq.removeProof,
      { id: manualId },
      { context: adminCtx }
    );
    expect(await readKey(manualId)).toBeNull();
    expect(storage.removed).toContain(key2?.replace('amwal-receipts/', ''));

    let none: unknown;
    try {
      await call(
        router.admin.infaq.proofUrl,
        { id: manualId },
        { context: adminCtx }
      );
    } catch (error) {
      none = error;
    }
    expect(none).toBeInstanceOf(ORPCError);
  });

  test('menghapus donasi manual ikut membuang berkas buktinya', async () => {
    const id = `INFM-test-${run}-d`;
    await database.insert(schema.infaqOrders).values(orderRow(id, 'TUNAI'));
    const res = await handleUpload({
      request: await uploadRequest({ user: admin, orderId: id }),
    });
    expect(res.status).toBe(201);
    const key = (await readKey(id)) ?? '';
    const adminCtx = await createTestCaller({ database, user: admin });
    await call(router.admin.infaq.deleteOrder, { id }, { context: adminCtx });
    expect(storage.removed).toContain(key.replace('amwal-receipts/', ''));
    expect(await readKey(id)).toBeNull();
  });
});
