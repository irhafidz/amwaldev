import { describe, expect, test } from 'bun:test';
import { batchSchema } from '@amwal/core/contracts/admin-qurban';
import { call, ORPCError } from '@orpc/server';
import { assertTestDatabase } from '../test-database-guard';
import { createTestCaller } from './test-utils';

/** Foto katalog hewan qurban diunggah admin ke volume media, bukan lagi tautan. */

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const { router } = await import('../../src/lib/orpc/router');
const database = createDatabase(connectionUrl);

const grant = {
  fileName: 'sapi.jpg',
  contentType: 'image/jpeg' as const,
  size: 1_000_000,
};

describe('admin.qurban.photoUploadUrl', () => {
  test('an admin gets a signed PUT URL and the public path to store', async () => {
    const context = await createTestCaller({
      database,
      user: { userId: 'p8-admin', role: 'ADMIN' },
    });
    const result = await call(router.admin.qurban.photoUploadUrl, grant, {
      context,
    });
    expect(result.uploadUrl).toMatch(
      /^\/api\/media\/qurban-photos\/\d+-[a-z0-9]+\.jpg\?exp=\d+&sig=/
    );
    expect(result.publicUrl).toMatch(
      /^\/api\/media\/qurban-photos\/\d+-[a-z0-9]+\.jpg$/
    );
  });

  test('rejects bad types, oversize files and non-admins', async () => {
    const admin = await createTestCaller({
      database,
      user: { userId: 'p8-admin', role: 'ADMIN' },
    });
    for (const bad of [
      { ...grant, contentType: 'image/gif' as never },
      { ...grant, size: 6 * 1024 * 1024 },
      { ...grant, fileName: 'sapi.exe' },
    ]) {
      await expect(
        call(router.admin.qurban.photoUploadUrl, bad, { context: admin })
      ).rejects.toBeInstanceOf(ORPCError);
    }
    const donor = await createTestCaller({
      database,
      user: { userId: 'p8-donor', role: 'WAKIF' },
    });
    await expect(
      call(router.admin.qurban.photoUploadUrl, grant, { context: donor })
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe('batch fotoUrl contract', () => {
  const base = {
    jenisHewan: 'SAPI' as const,
    totalSlot: 1,
    hargaPerSlot: 21_000_000,
  };

  test('accepts an uploaded qurban-photos path or a legacy http(s) URL', () => {
    for (const fotoUrl of [
      '/api/media/qurban-photos/1790-abc.jpg',
      'https://cdn.example.com/sapi.jpg',
    ]) {
      expect(batchSchema.safeParse({ ...base, fotoUrl }).success).toBe(true);
    }
  });

  test('rejects other relative paths and traversal', () => {
    for (const fotoUrl of [
      '/api/media/amwal-receipts/x/nota.pdf',
      '/api/media/qurban-photos/../../etc/passwd',
      '/assets/images/x.png',
      'javascript:alert(1)',
    ]) {
      expect(batchSchema.safeParse({ ...base, fotoUrl }).success).toBe(false);
    }
  });
});
