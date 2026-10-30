import { afterAll, describe, expect, test } from 'bun:test';
import { call, type ORPCError } from '@orpc/server';
import { eq, inArray } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Database } from '../../src/lib/db';
import { assertTestDatabase } from '../test-database-guard';
import { createTestCaller } from './test-utils';

/**
 * QA Test#1 (Awan): nama kategori yang sudah dipakai artikel tidak bisa dipakai
 * video, karena keunikan slug berlaku lintas tipe. Kini unik per (tipe, slug).
 */

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const schema = await import('../../src/lib/db/schema');
const { router } = await import('../../src/lib/orpc/router');

const database: Database = createDatabase(connectionUrl);
const adminId = `p7-${ulid().toLowerCase()}-admin`;
const createdIds: string[] = [];
const name = `Fikih Wakaf ${ulid().toLowerCase().slice(-8)}`;

afterAll(async () => {
  if (createdIds.length > 0) {
    await database
      .delete(schema.educationCategories)
      .where(inArray(schema.educationCategories.id, createdIds));
  }
  await database.delete(schema.users).where(eq(schema.users.id, adminId));
});

async function admin() {
  await database
    .insert(schema.users)
    .values({
      id: adminId,
      name: 'Admin Kategori',
      role: 'ADMIN',
      updatedAt: new Date().toISOString(),
    })
    .onConflictDoNothing();
  return await createTestCaller({
    database,
    user: { userId: adminId, role: 'ADMIN' },
  });
}

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error as ORPCError<string, unknown>;
  }
  throw new Error('expected rejection');
}

describe('education categories are unique per (type, slug)', () => {
  test('the same name can exist once for articles and once for videos', async () => {
    const context = await admin();
    const article = await call(
      router.admin.education.categories.create,
      { name, type: 'article' },
      { context }
    );
    const video = await call(
      router.admin.education.categories.create,
      { name, type: 'video' },
      { context }
    );
    createdIds.push(article.data.id, video.data.id);

    expect(article.data.slug).toBe(video.data.slug);
    expect(article.data.id).not.toBe(video.data.id);
  });

  test('a duplicate inside the same type is still a clean CONFLICT', async () => {
    const context = await admin();
    for (const type of ['article', 'video'] as const) {
      const error = await rejection(
        call(
          router.admin.education.categories.create,
          { name, type },
          { context }
        )
      );
      expect(error.code).toBe('CONFLICT');
    }
  });

  test('renaming checks the clash only within the same type', async () => {
    const context = await admin();
    const other = await call(
      router.admin.education.categories.create,
      { name: `${name} Lain`, type: 'video' },
      { context }
    );
    createdIds.push(other.data.id);

    // Ganti nama jadi nama kategori video lain bertipe sama → bentrok.
    const clash = await rejection(
      call(
        router.admin.education.categories.update,
        { id: other.data.id, name },
        { context }
      )
    );
    expect(clash.code).toBe('CONFLICT');

    // Nama yang hanya dipakai kategori ARTIKEL lain boleh dipakai video.
    const articleOnly = await call(
      router.admin.education.categories.create,
      { name: `${name} Khusus Artikel`, type: 'article' },
      { context }
    );
    createdIds.push(articleOnly.data.id);
    const ok = await call(
      router.admin.education.categories.update,
      { id: other.data.id, name: `${name} Khusus Artikel` },
      { context }
    );
    expect(ok.data.name).toBe(`${name} Khusus Artikel`);

    const missing = await rejection(
      call(
        router.admin.education.categories.update,
        { id: crypto.randomUUID(), name: 'Tidak Ada' },
        { context }
      )
    );
    expect(missing.code).toBe('NOT_FOUND');
  });
});
